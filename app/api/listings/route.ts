import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { listings } from "@/drizzle/schema";
import { requireOperator } from "@/server/admin-auth";
import { logger } from "@/lib/logger";
import { parseListingFilters } from "@/lib/listing-filters";
import { searchListings } from "@/server/listings-search";
import { isBookablePriceUnit } from "@/lib/listing-price-units";
import { sendListingSubmittedToTeam } from "@/server/email-requests";
import { createNotification } from "@/server/notifications";

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    // Full map reads use bounded keyset pages at /api/map/listings.
    const filters = parseListingFilters(searchParams);
    const data = await searchListings(filters);
    return NextResponse.json(
      { listings: data },
      // Public catalogue data, no cookies read: let the CDN serve repeats.
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    logger.error("Listings error", error);
    return NextResponse.json(
      { error: "Failed to fetch listings" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireOperator();
    if (!auth.ok) return auth.error;

    const body = await request.json();
    const {
      operatorId: requestedOperatorId,
      islandId,
      type,
      title,
      description,
      address,
      parish,
      priceAmount,
      priceCurrency,
      priceUnit,
      typeData,
      latitude,
      longitude,
      cancellationPolicy,
      minStay,
      maxStay,
      advanceNotice,
      maxGuests,
    } = body;

    // Operators can only create listings for themselves; admins may create
    // on behalf of any operator.
    const operatorId =
      auth.role === "admin" && requestedOperatorId
        ? requestedOperatorId
        : auth.userId;

    if (!title || !type) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }
    // A unit bookings cannot use would leave the listing unbookable with no explanation.
    if (priceUnit !== undefined && priceUnit !== null && priceUnit !== "" && !isBookablePriceUnit(priceUnit)) {
      return NextResponse.json({ error: "Choose what the price is per from the list." }, { status: 400 });
    }

    const db = getDb();
    const baseSlug =
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "business-listing";

    const sql = neon(process.env.DATABASE_URL!);
    let slug = baseSlug;
    const existing = await sql.query("SELECT slug FROM listings WHERE slug = $1 OR slug LIKE $2", [
      baseSlug,
      `${baseSlug}-%`,
    ]);
    if (existing.length > 0) {
      const taken = new Set(existing.map((r) => String(r.slug)));
      let suffix = 2;
      while (taken.has(slug)) {
        slug = `${baseSlug}-${suffix++}`;
      }
    }

    const [listing] = await db
      .insert(listings)
      .values({
        operatorId,
        islandId: islandId || 1,
        type,
        status: "pending_review",
        title,
        slug,
        description,
        address,
        parish,
        priceAmount: priceAmount?.toString(),
        priceCurrency: priceCurrency || "USD",
        priceUnit,
        typeData,
        latitude,
        longitude,
        cancellationPolicy: cancellationPolicy || "moderate",
        minStay: minStay || null,
        maxStay: maxStay || null,
        advanceNotice: advanceNotice || null,
        maxGuests: maxGuests || null,
      })
      .returning({ id: listings.id, slug: listings.slug });

    // Seed 90 days of default future availability so the listing satisfies vakaygo_listing_setup_valid once approved
    const defaultSpots = Math.max(1, Number(maxGuests) || (type === "stay" || type === "car" ? 1 : 10));
    await sql
      .query(
        `INSERT INTO availability (listing_id, date, spots, spots_remaining, is_blocked)
         SELECT $1::uuid, (current_date + offs * interval '1 day')::timestamp, $2::int, $2::int, false
         FROM generate_series(0, 89) AS offs`,
        [listing.id, defaultSpots]
      )
      .catch((err) => logger.error("Seed default availability error", err));

    // The listing waits on our review; tell the team now instead of when the weekly reminder finds it.
    if (auth.role !== "admin") {
      try {
        const [who] = await sql.query(
          `SELECT u.email,u.name,u.business_name,(SELECT i.name FROM islands i WHERE i.id=$2) island_name FROM users u WHERE u.id=$1::uuid`,
          [operatorId, islandId || 1]) as { email: string; name: string | null; business_name: string | null; island_name: string | null }[];
        const admins = await sql.query("SELECT id FROM users WHERE role='admin'") as { id: string }[];
        await Promise.all([
          who?.email ? sendListingSubmittedToTeam({
            listingTitle: String(title), listingType: String(type), islandName: who.island_name,
            operatorName: who.business_name || who.name, operatorEmail: who.email,
            reviewUrl: "https://vakaygo.com/admin/listings?status=pending_review",
          }) : Promise.resolve(),
          ...admins.map(admin => createNotification({
            userId: admin.id, type: "system", title: "New listing to review",
            body: `${String(title).slice(0, 120)} was submitted by ${who?.business_name || who?.name || who?.email || "an operator"}.`,
            link: "/admin/listings?status=pending_review",
          })),
        ]);
      } catch (err) {
        logger.warn("Listing submission notice skipped", { listingId: listing.id, error: err });
      }
    }

    return NextResponse.json({ listing });
  } catch (error) {
    logger.error("Create listing error", error);
    return NextResponse.json(
      { error: "Failed to create listing" },
      { status: 500 }
    );
  }
}
