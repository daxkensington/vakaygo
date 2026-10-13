import { NextResponse } from "next/server";
import { requireUser } from "@/server/admin-auth";
import { getCollections, createCollection, updateCollection, deleteCollection, collectionName, collectionDescription, objectBody, uuid, expectedActor, wishlistFailure } from "@/server/saved-wishlist";

export async function GET(request?: Request) {
  try {
    const auth = await requireUser(); if (!auth.ok) return auth.error;
    expectedActor(auth, request ? new URL(request.url).searchParams.get("expectedUserId") : null, false);
    return NextResponse.json({ userId: auth.userId, collections: await getCollections(auth) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return wishlistFailure(error); }
}
export async function POST(request: Request) {
  try {
    const auth = await requireUser(); if (!auth.ok) return auth.error;
    const body = await objectBody(request); expectedActor(auth, body.expectedUserId);
    const collection = await createCollection(auth, collectionName(body.name), collectionDescription(body.description));
    return NextResponse.json({ userId: auth.userId, collection }, { status: 201 });
  } catch (error) { return wishlistFailure(error); }
}
export async function PUT(request: Request) {
  try {
    const auth = await requireUser(); if (!auth.ok) return auth.error;
    const body = await objectBody(request); expectedActor(auth, body.expectedUserId); const id = uuid(body.id, "id");
    if (body.name === undefined && body.description === undefined) return NextResponse.json({ error: "Provide a name or description." }, { status: 400 });
    const updates = { ...(body.name === undefined ? {} : { name: collectionName(body.name) }),
      ...(body.description === undefined ? {} : { description: collectionDescription(body.description) }) };
    return NextResponse.json({ userId: auth.userId, collection: await updateCollection(auth, id, updates) });
  } catch (error) { return wishlistFailure(error); }
}
export async function DELETE(request: Request) {
  try {
    const auth = await requireUser(); if (!auth.ok) return auth.error;
    const params = new URL(request.url).searchParams; expectedActor(auth, params.get("expectedUserId"));
    await deleteCollection(auth, uuid(params.get("id"), "id"));
    return NextResponse.json({ ok: true });
  } catch (error) { return wishlistFailure(error); }
}
