import { NextResponse } from "next/server";
import { requireUser } from "@/server/admin-auth";
import { moveSavedListing, objectBody, uuid, expectedActor, wishlistFailure } from "@/server/saved-wishlist";

export async function POST(request: Request) {
  try {
    const auth = await requireUser(); if (!auth.ok) return auth.error;
    const body = await objectBody(request); expectedActor(auth, body.expectedUserId);
    const listingId = uuid(body.listingId, "listingId");
    const collectionId = body.collectionId === null ? null : uuid(body.collectionId, "collectionId");
    await moveSavedListing(auth, listingId, collectionId);
    return NextResponse.json({ userId: auth.userId, moved: true, listingId, collectionIds: collectionId ? [collectionId] : [] });
  } catch (error) { return wishlistFailure(error); }
}
