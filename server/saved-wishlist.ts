import { neon } from "@neondatabase/serverless";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

type Actor = { userId: string; sessionVersion: number; role: string };
type Result = Record<string, unknown>;
export class WishlistError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

// Fixed SQL text; values are bound separately. Acquire the mutation actor lock
// in an earlier ReadCommitted statement so the membership statement has a
// fresh snapshot after waiting for a competing move or session revocation.
async function run(actor: Actor, mutation: boolean, statement: string, values: unknown[] = []): Promise<Result> {
  const query = neon(env.DATABASE_URL);
  const actorSql = `SELECT u.id FROM users u WHERE u.id=$1::uuid AND u.session_version=$2
      AND u.role=$3 AND (u.email_verified=true OR u.role='traveler') FOR ${mutation ? "UPDATE" : "SHARE"} OF u`;
  const parameters = [actor.userId, actor.sessionVersion, actor.role];
  const statementSql = `WITH actor AS MATERIALIZED (
    SELECT u.id FROM users u WHERE u.id=$1::uuid AND u.session_version=$2
      AND u.role=$3 AND (u.email_verified=true OR u.role='traveler')
    FOR ${mutation ? "UPDATE" : "SHARE"} OF u
  ) ${statement}`;
  const rows = mutation ? (await query.transaction(tx => [tx.query(actorSql, parameters), tx.query(statementSql, [...parameters, ...values])],
    { isolationLevel: "ReadCommitted" }))[1] : await query.query(statementSql, [...parameters, ...values]);
  const result = rows[0] as Result | undefined;
  if (result?.actorExists !== true) throw new WishlistError("Your session changed. Please sign in again.", 401);
  return result;
}

export function uuid(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value.trim())) throw new WishlistError(`${label} must be a valid ID.`, 400);
  return value.trim().toLowerCase();
}
export function expectedActor(actor: Actor, value: unknown, required = true): void {
  if (!required && value == null) return;
  if (uuid(value, "expectedUserId") !== actor.userId.toLowerCase()) throw new WishlistError("Your account changed. Reload before updating saved listings.", 409);
}
export async function objectBody(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new WishlistError("Provide a valid request object.", 400);
  return body;
}
export function collectionName(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 128) throw new WishlistError("Use a collection name of 1 to 128 characters.", 400);
  return value.trim();
}
export function collectionDescription(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || value.length > 4000) throw new WishlistError("Use a description of up to 4000 characters.", 400);
  return value.trim() || null;
}
export function wishlistFailure(error: unknown): NextResponse {
  if (error instanceof WishlistError) return NextResponse.json({ error: error.message }, { status: error.status });
  logger.error("Saved/wishlist request failed", error);
  return NextResponse.json({ error: "Saved listings are temporarily unavailable. Please try again." }, { status: 500 });
}

export async function getSavedListings(actor: Actor) {
  const result = await run(actor, false, `,
    own_items AS MATERIALIZED (SELECT wi.listing_id,wi.created_at FROM wishlist_items wi
      JOIN wishlist_collections c ON c.id=wi.collection_id JOIN actor a ON a.id=c.user_id),
    all_saved AS (SELECT listing_id,min(created_at) AS saved_at FROM (
      SELECT s.listing_id,s.created_at FROM saved_listings s JOIN actor a ON a.id=s.user_id
      UNION ALL SELECT listing_id,created_at FROM own_items
    ) entries GROUP BY listing_id),
    cards AS (SELECT l.id,l.title,l.slug,l.type,l.price_amount AS "priceAmount",l.price_unit AS "priceUnit",
      l.avg_rating AS "avgRating",l.review_count AS "reviewCount",l.parish,l.is_featured AS "isFeatured",
      i.slug AS "islandSlug",i.name AS "islandName",s.saved_at AS "savedAt",
      (SELECT m.url FROM media m WHERE m.listing_id=l.id ORDER BY m.is_primary DESC,m.sort_order,m.id LIMIT 1) AS image,
      CASE WHEN l.type_data->>'unclaimed'='true' OR l.type_data->>'source'='google-places'
        THEN 'google' ELSE 'vakaygo' END AS "reviewSource",
      ARRAY(SELECT c.id FROM wishlist_items wi JOIN wishlist_collections c ON c.id=wi.collection_id
        JOIN actor a ON a.id=c.user_id WHERE wi.listing_id=l.id ORDER BY c.created_at,c.id) AS "collectionIds"
      FROM all_saved s JOIN listings l ON l.id=s.listing_id JOIN islands i ON i.id=l.island_id WHERE l.status='active')
    SELECT EXISTS(SELECT 1 FROM actor) AS "actorExists",
      COALESCE((SELECT json_agg(cards ORDER BY "savedAt",id) FROM cards),'[]'::json) AS saved`);
  return result.saved;
}

export async function saveListing(actor: Actor, listingId: string) {
  const result = await run(actor, true, `,
    available AS (SELECT l.id FROM listings l CROSS JOIN actor WHERE l.id=$4::uuid AND l.status='active' FOR SHARE OF l),
    inserted AS (INSERT INTO saved_listings(user_id,listing_id) SELECT a.id,l.id FROM actor a CROSS JOIN available l
      ON CONFLICT DO NOTHING RETURNING listing_id)
    SELECT EXISTS(SELECT 1 FROM actor) AS "actorExists",EXISTS(SELECT 1 FROM available) AS "listingExists"`, [listingId]);
  if (!result.listingExists) throw new WishlistError("Listing not found.", 404);
}
export async function removeSavedListing(actor: Actor, listingId: string) {
  await run(actor, true, `,
    removed_memberships AS (DELETE FROM wishlist_items wi USING wishlist_collections c,actor a
      WHERE wi.collection_id=c.id AND c.user_id=a.id AND wi.listing_id=$4::uuid RETURNING wi.listing_id),
    removed_saved AS (DELETE FROM saved_listings s USING actor a WHERE s.user_id=a.id AND s.listing_id=$4::uuid RETURNING s.listing_id)
    SELECT EXISTS(SELECT 1 FROM actor) AS "actorExists"`, [listingId]);
}
export async function getCollections(actor: Actor) {
  const result = await run(actor, false, `, collections AS (
    SELECT c.id,c.name,c.description,c.is_default AS "isDefault",c.created_at AS "createdAt",
      (SELECT count(*)::int FROM wishlist_items wi JOIN listings l ON l.id=wi.listing_id WHERE wi.collection_id=c.id AND l.status='active') AS "itemCount"
    FROM wishlist_collections c JOIN actor a ON a.id=c.user_id
  ) SELECT EXISTS(SELECT 1 FROM actor) AS "actorExists",
    COALESCE((SELECT json_agg(collections ORDER BY "createdAt",id) FROM collections),'[]'::json) AS collections`);
  return result.collections;
}
export async function createCollection(actor: Actor, name: string, description: string | null) {
  const result = await run(actor, true, `, inserted AS (
    INSERT INTO wishlist_collections(user_id,name,description) SELECT id,$4,$5 FROM actor
    RETURNING id,name,description,is_default AS "isDefault",created_at AS "createdAt"
  ) SELECT EXISTS(SELECT 1 FROM actor) AS "actorExists",(SELECT row_to_json(inserted) FROM inserted) AS collection`, [name, description]);
  return { ...(result.collection as Record<string, unknown>), itemCount: 0 };
}
export async function updateCollection(actor: Actor, id: string, updates: { name?: string; description?: string | null }) {
  const result = await run(actor, true, `, updated AS (
    UPDATE wishlist_collections c SET name=CASE WHEN $5::boolean THEN $6 ELSE c.name END,
      description=CASE WHEN $7::boolean THEN $8 ELSE c.description END FROM actor a WHERE c.user_id=a.id AND c.id=$4::uuid
    RETURNING c.id,c.name,c.description,c.is_default AS "isDefault",c.created_at AS "createdAt"
  ) SELECT EXISTS(SELECT 1 FROM actor) AS "actorExists",(SELECT row_to_json(updated) FROM updated) AS collection`,
  [id, updates.name !== undefined, updates.name ?? null, updates.description !== undefined, updates.description ?? null]);
  if (!result.collection) throw new WishlistError("Collection not found.", 404);
  return result.collection;
}
export async function deleteCollection(actor: Actor, id: string) {
  const result = await run(actor, true, `, removed AS (
    DELETE FROM wishlist_collections c USING actor a WHERE c.user_id=a.id AND c.id=$4::uuid RETURNING c.id
  ) SELECT EXISTS(SELECT 1 FROM actor) AS "actorExists",EXISTS(SELECT 1 FROM removed) AS "collectionExists"`, [id]);
  if (!result.collectionExists) throw new WishlistError("Collection not found.", 404);
}
export async function getCollectionItems(actor: Actor, collectionId: string) {
  const result = await run(actor, false, `,
    owned AS MATERIALIZED (SELECT c.id FROM wishlist_collections c JOIN actor a ON a.id=c.user_id WHERE c.id=$4::uuid),
    items AS (SELECT wi.listing_id AS "listingId",wi.created_at AS "addedAt",l.title AS "listingTitle",l.slug AS "listingSlug",
      l.type AS "listingType",l.price_amount AS "priceAmount",l.price_currency AS "priceCurrency",l.avg_rating AS "avgRating",l.review_count AS "reviewCount"
      FROM wishlist_items wi JOIN owned c ON c.id=wi.collection_id JOIN listings l ON l.id=wi.listing_id WHERE l.status='active')
    SELECT EXISTS(SELECT 1 FROM actor) AS "actorExists",EXISTS(SELECT 1 FROM owned) AS "collectionExists",
      COALESCE((SELECT json_agg(items ORDER BY "addedAt","listingId") FROM items),'[]'::json) AS items`, [collectionId]);
  if (!result.collectionExists) throw new WishlistError("Collection not found.", 404);
  return result.items;
}
export async function addCollectionItem(actor: Actor, collectionId: string, listingId: string) {
  const result = await run(actor, true, `,
    owned AS MATERIALIZED (SELECT c.id FROM wishlist_collections c JOIN actor a ON a.id=c.user_id WHERE c.id=$4::uuid),
    available AS MATERIALIZED (SELECT l.id FROM listings l CROSS JOIN actor WHERE l.id=$5::uuid AND l.status='active' FOR SHARE OF l),
    saved AS (INSERT INTO saved_listings(user_id,listing_id) SELECT a.id,l.id FROM actor a CROSS JOIN available l CROSS JOIN owned
      ON CONFLICT DO NOTHING RETURNING listing_id),
    added AS (INSERT INTO wishlist_items(collection_id,listing_id) SELECT c.id,l.id FROM owned c CROSS JOIN available l ON CONFLICT DO NOTHING RETURNING listing_id)
    SELECT EXISTS(SELECT 1 FROM actor) AS "actorExists",EXISTS(SELECT 1 FROM owned) AS "collectionExists",
      EXISTS(SELECT 1 FROM available) AS "listingExists"`, [collectionId, listingId]);
  if (!result.collectionExists) throw new WishlistError("Collection not found.", 404);
  if (!result.listingExists) throw new WishlistError("Listing not found.", 404);
}
export async function removeCollectionItem(actor: Actor, collectionId: string, listingId: string) {
  const result = await run(actor, true, `,
    owned AS MATERIALIZED (SELECT c.id FROM wishlist_collections c JOIN actor a ON a.id=c.user_id WHERE c.id=$4::uuid),
    removed AS (DELETE FROM wishlist_items wi USING owned c WHERE wi.collection_id=c.id AND wi.listing_id=$5::uuid RETURNING wi.listing_id)
    SELECT EXISTS(SELECT 1 FROM actor) AS "actorExists",EXISTS(SELECT 1 FROM owned) AS "collectionExists"`, [collectionId, listingId]);
  if (!result.collectionExists) throw new WishlistError("Collection not found.", 404);
}

/** Explicit Move to replaces this actor's memberships only; /items stays additive. */
export async function moveSavedListing(actor: Actor, listingId: string, collectionId: string | null) {
  const result = await run(actor, true, `,
    owned AS MATERIALIZED (SELECT c.id FROM wishlist_collections c JOIN actor a ON a.id=c.user_id),
    eligible AS MATERIALIZED (SELECT l.id FROM listings l CROSS JOIN actor a WHERE l.id=$4::uuid AND l.status='active'
      AND ($5::uuid IS NULL OR EXISTS(SELECT 1 FROM owned WHERE id=$5::uuid))
      AND (EXISTS(SELECT 1 FROM saved_listings s WHERE s.user_id=a.id AND s.listing_id=l.id)
        OR EXISTS(SELECT 1 FROM wishlist_items wi JOIN owned c ON c.id=wi.collection_id WHERE wi.listing_id=l.id)) FOR SHARE OF l),
    removed AS (DELETE FROM wishlist_items wi USING owned c,eligible l WHERE wi.collection_id=c.id AND wi.listing_id=l.id
      AND ($5::uuid IS NULL OR wi.collection_id<>$5::uuid) RETURNING wi.listing_id),
    saved AS (INSERT INTO saved_listings(user_id,listing_id) SELECT a.id,l.id FROM actor a CROSS JOIN eligible l ON CONFLICT DO NOTHING RETURNING listing_id),
    added AS (INSERT INTO wishlist_items(collection_id,listing_id) SELECT $5::uuid,id FROM eligible WHERE $5::uuid IS NOT NULL ON CONFLICT DO NOTHING RETURNING listing_id)
    SELECT EXISTS(SELECT 1 FROM actor) AS "actorExists",($5::uuid IS NULL OR EXISTS(SELECT 1 FROM owned WHERE id=$5::uuid)) AS "collectionExists",
      EXISTS(SELECT 1 FROM eligible) AS "savedExists"`, [listingId, collectionId]);
  if (!result.collectionExists) throw new WishlistError("Collection not found.", 404);
  if (!result.savedExists) throw new WishlistError("Saved listing not found. Reload your saved listings.", 404);
}
