import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { wishlistCollections, wishlistItems } from "@/drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev-secret-change-in-production"
);

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

/**
 * GET — List user's wishlist collections with item counts
 */
export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, SECRET);
    const userId = payload.id as string;

    const db = getDb();

    const collections = await db
      .select({
        id: wishlistCollections.id,
        name: wishlistCollections.name,
        description: wishlistCollections.description,
        isDefault: wishlistCollections.isDefault,
        createdAt: wishlistCollections.createdAt,
        itemCount: sql<number>`(
          SELECT COUNT(*) FROM wishlist_items
          WHERE wishlist_items.collection_id = ${wishlistCollections.id}
        )`,
      })
      .from(wishlistCollections)
      .where(eq(wishlistCollections.userId, userId))
      .orderBy(wishlistCollections.createdAt);

    return NextResponse.json({ collections });
  } catch (error) {
    console.error("Wishlist collections GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch collections" },
      { status: 500 }
    );
  }
}

/**
 * POST — Create a wishlist collection
 * Body: { name, description? }
 */
export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, SECRET);
    const userId = payload.id as string;

    const { name, description } = await request.json();

    if (!name) {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }

    const db = getDb();

    const [collection] = await db
      .insert(wishlistCollections)
      .values({
        userId,
        name,
        description: description || null,
      })
      .returning();

    return NextResponse.json({ collection }, { status: 201 });
  } catch (error) {
    console.error("Wishlist collections POST error:", error);
    return NextResponse.json(
      { error: "Failed to create collection" },
      { status: 500 }
    );
  }
}

/**
 * PUT — Update a wishlist collection name/description
 * Body: { id, name?, description? }
 */
export async function PUT(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, SECRET);
    const userId = payload.id as string;

    const { id, name, description } = await request.json();
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const db = getDb();

    const setData: Record<string, unknown> = {};
    if (name !== undefined) setData.name = name;
    if (description !== undefined) setData.description = description;

    const [updated] = await db
      .update(wishlistCollections)
      .set(setData)
      .where(
        and(
          eq(wishlistCollections.id, id),
          eq(wishlistCollections.userId, userId)
        )
      )
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: "Collection not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ collection: updated });
  } catch (error) {
    console.error("Wishlist collections PUT error:", error);
    return NextResponse.json(
      { error: "Failed to update collection" },
      { status: 500 }
    );
  }
}

/**
 * DELETE — Remove a wishlist collection (cascades items)
 * Query: ?id=xxx
 */
export async function DELETE(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, SECRET);
    const userId = payload.id as string;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const db = getDb();

    const deleted = await db
      .delete(wishlistCollections)
      .where(
        and(
          eq(wishlistCollections.id, id),
          eq(wishlistCollections.userId, userId)
        )
      )
      .returning();

    if (deleted.length === 0) {
      return NextResponse.json(
        { error: "Collection not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Wishlist collections DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to delete collection" },
      { status: 500 }
    );
  }
}
