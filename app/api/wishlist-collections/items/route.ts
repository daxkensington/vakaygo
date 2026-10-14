import { NextResponse } from "next/server";
import { requireUser } from "@/server/admin-auth";
import { getCollectionItems, addCollectionItem, removeCollectionItem, objectBody, uuid, expectedActor, wishlistFailure } from "@/server/saved-wishlist";

export async function GET(request: Request) {
  try {
    const auth = await requireUser(); if (!auth.ok) return auth.error;
    const params = new URL(request.url).searchParams; expectedActor(auth, params.get("expectedUserId"), false);
    const collectionId = uuid(params.get("collectionId"), "collectionId");
    return NextResponse.json({ userId: auth.userId, items: await getCollectionItems(auth, collectionId) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return wishlistFailure(error); }
}
export async function POST(request: Request) {
  try {
    const auth = await requireUser(); if (!auth.ok) return auth.error;
    const body = await objectBody(request); expectedActor(auth, body.expectedUserId);
    await addCollectionItem(auth, uuid(body.collectionId, "collectionId"), uuid(body.listingId, "listingId"));
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) { return wishlistFailure(error); }
}
export async function DELETE(request: Request) {
  try {
    const auth = await requireUser(); if (!auth.ok) return auth.error;
    const params = new URL(request.url).searchParams; expectedActor(auth, params.get("expectedUserId"));
    await removeCollectionItem(auth, uuid(params.get("collectionId"), "collectionId"), uuid(params.get("listingId"), "listingId"));
    return NextResponse.json({ ok: true });
  } catch (error) { return wishlistFailure(error); }
}
