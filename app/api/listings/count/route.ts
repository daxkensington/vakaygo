import { NextResponse } from "next/server";
import { parseListingFilters } from "@/lib/listing-filters";
import { countListings } from "@/server/listings-search";
import { logger } from "@/lib/logger";

// Same parser and WHERE clause as the list endpoint, so "Showing X of Y"
// can never disagree with the cards above it.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const count = await countListings(parseListingFilters(searchParams));
    return NextResponse.json(
      { count },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } },
    );
  } catch (error) {
    logger.error("Listings count error", error);
    return NextResponse.json({ count: 0 });
  }
}
