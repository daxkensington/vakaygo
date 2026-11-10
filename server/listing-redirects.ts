import { cache } from "react";
import { createDb } from "@/server/db";
import { sql } from "drizzle-orm";

/**
 * Where a listing URL that no longer shows a listing should send the visitor.
 *
 * - `permanent` to another listing: the URL is in listing_slug_redirects
 *   (migration 0024), because the listing was a paused duplicate or moved to
 *   another destination, and the target is public.
 * - `temporary` to the destination page: the listing exists but is paused or
 *   otherwise not public (it may come back).
 * - null: nothing ever lived here, so the page returns 404.
 *
 * Never throws: a database failure, or a database without the 0024 table, is
 * treated as "no redirect" so the page keeps its plain 404.
 */
export type ListingRedirect = { location: string; permanent: boolean };

type Row = { kind: string; island: string; slug: string };

function rowsOf(result: unknown): Row[] {
  if (Array.isArray(result)) return result as Row[];
  const rows = (result as { rows?: unknown })?.rows;
  return Array.isArray(rows) ? (rows as Row[]) : [];
}

export function redirectLocation(row: Row | undefined): ListingRedirect | null {
  if (!row || !/^[a-z0-9-]{1,128}$/.test(row.island)) return null;
  if (row.kind === "alias" && /^[a-z0-9-]{1,128}$/.test(row.slug)) {
    return { location: `/${row.island}/${row.slug}`, permanent: true };
  }
  if (row.kind === "inactive") return { location: `/${row.island}`, permanent: false };
  return null;
}

export const resolveListingRedirect = cache(async (islandSlug: string, slug: string): Promise<ListingRedirect | null> => {
  if (!/^[a-z0-9-]{1,128}$/.test(islandSlug) || !/^[a-z0-9-]{1,128}$/.test(slug)) return null;
  let db: ReturnType<typeof createDb>;
  try {
    db = createDb();
  } catch {
    return null;
  }
  try {
    const alias = await db.execute(sql`
      SELECT 'alias' AS kind, ti.slug AS island, t.slug
        FROM listing_slug_redirects r
        JOIN islands fi ON fi.id = r.island_id AND fi.slug = ${islandSlug}
        JOIN listings t ON t.id = r.target_listing_id AND t.status = 'active'
        JOIN islands ti ON ti.id = t.island_id AND ti.is_active = true
       WHERE r.slug = ${slug}
       LIMIT 1`);
    const hit = redirectLocation(rowsOf(alias)[0]);
    if (hit) return hit;
  } catch {
    // No 0024 table yet, or a transient failure: fall through.
  }
  try {
    const inactive = await db.execute(sql`
      SELECT 'inactive' AS kind, i.slug AS island, l.slug
        FROM listings l JOIN islands i ON i.id = l.island_id AND i.is_active = true
       WHERE i.slug = ${islandSlug} AND l.slug = ${slug} AND l.status IN ('paused', 'rejected')
       LIMIT 1`);
    return redirectLocation(rowsOf(inactive)[0]);
  } catch {
    return null;
  }
});
