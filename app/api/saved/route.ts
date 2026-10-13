import { NextResponse } from "next/server";
import { requireUser } from "@/server/admin-auth";
import { getSavedListings, saveListing, removeSavedListing, objectBody, uuid, expectedActor, wishlistFailure } from "@/server/saved-wishlist";

export async function GET(request?: Request) {
  try {
    const auth = await requireUser(); if (!auth.ok) return auth.error;
    expectedActor(auth, request ? new URL(request.url).searchParams.get("expectedUserId") : null, false);
    return NextResponse.json({ userId: auth.userId, saved: await getSavedListings(auth) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return wishlistFailure(error); }
}
export async function POST(request: Request) {
  try {
    const auth = await requireUser(); if (!auth.ok) return auth.error;
    const body = await objectBody(request); expectedActor(auth, body.expectedUserId);
    const listingId = uuid(body.listingId, "listingId");
    await saveListing(auth, listingId);
    return NextResponse.json({ userId: auth.userId, saved: true, listingId });
  } catch (error) { return wishlistFailure(error); }
}
export async function DELETE(request: Request) {
  try {
    const auth = await requireUser(); if (!auth.ok) return auth.error;
    const body = await objectBody(request); expectedActor(auth, body.expectedUserId);
    const listingId = uuid(body.listingId, "listingId");
    await removeSavedListing(auth, listingId);
    return NextResponse.json({ userId: auth.userId, removed: true, listingId });
  } catch (error) { return wishlistFailure(error); }
}
