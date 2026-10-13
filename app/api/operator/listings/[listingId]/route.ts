import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq } from "drizzle-orm";
import { islands, listings, media } from "@/drizzle/schema";
import { assertListingId, onboardingErrorResponse, requireCurrentOperator } from "@/server/business-onboarding";
import { getImageUrl } from "@/lib/image-utils";

/** Private editing data includes the owner's draft and paused listings. */
export async function GET(_request: Request, context: { params: Promise<{ listingId: string }> }) {
  try {
    const auth = await requireCurrentOperator();
    if (!auth.ok) return auth.error;
    const { listingId } = await context.params;
    assertListingId(listingId);
    const db = drizzle(neon(process.env.DATABASE_URL!));
    const [listing] = await db.select({
      id: listings.id, title: listings.title, slug: listings.slug, type: listings.type, status: listings.status,
      headline: listings.headline, description: listings.description, address: listings.address, parish: listings.parish,
      priceAmount: listings.priceAmount, priceUnit: listings.priceUnit, typeData: listings.typeData, islandSlug: islands.slug,
      cancellationPolicy: listings.cancellationPolicy, minStay: listings.minStay, maxStay: listings.maxStay,
      advanceNotice: listings.advanceNotice, maxGuests: listings.maxGuests,
    }).from(listings).innerJoin(islands, eq(listings.islandId, islands.id))
      .where(and(eq(listings.id, listingId), eq(listings.operatorId, auth.userId))).limit(1);
    if (!listing) return NextResponse.json({ error: "Listing not found in your business account" }, { status: 404 });
    const images = await db.select({ id: media.id, url: media.url, alt: media.alt }).from(media)
      .where(eq(media.listingId, listingId)).orderBy(media.sortOrder);
    return NextResponse.json({ listing: { ...listing, images: images.map(image => ({ ...image, url: getImageUrl(image.url) || image.url })) } },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return onboardingErrorResponse(error); }
}
