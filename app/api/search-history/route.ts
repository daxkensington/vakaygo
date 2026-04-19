import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { searchHistory } from "@/drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

import { logger } from "@/lib/logger";
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET!);

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

/**
 * GET — Return user's last 20 searches
 *
 * Anonymous callers get an empty list rather than a 401: /explore
 * fetches this on every mount and the 401 pollutes the console with a
 * network error for logged-out users (dinged Lighthouse Best Practices).
 */
export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) {
      return NextResponse.json({ searches: [] });
    }

    const { payload } = await jwtVerify(token, SECRET);
    const userId = payload.id as string;

    const db = getDb();

    const results = await db
      .select()
      .from(searchHistory)
      .where(eq(searchHistory.userId, userId))
      .orderBy(desc(searchHistory.createdAt))
      .limit(20);

    return NextResponse.json({ searches: results });
  } catch (error) {
    logger.error("Search history GET error", error);
    return NextResponse.json(
      { error: "Failed to fetch search history" },
      { status: 500 }
    );
  }
}

/**
 * POST — Save a search
 * Body: { query: string, filters?: Record<string, unknown> }
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

    const { query, filters } = await request.json();
    if (!query) {
      return NextResponse.json({ error: "query required" }, { status: 400 });
    }

    const db = getDb();

    const [entry] = await db
      .insert(searchHistory)
      .values({ userId, query, filters: filters || null })
      .returning();

    return NextResponse.json({ search: entry }, { status: 201 });
  } catch (error) {
    logger.error("Search history POST error", error);
    return NextResponse.json(
      { error: "Failed to save search" },
      { status: 500 }
    );
  }
}

/**
 * DELETE — Clear all search history for the user
 */
export async function DELETE() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, SECRET);
    const userId = payload.id as string;

    const db = getDb();

    await db.delete(searchHistory).where(eq(searchHistory.userId, userId));

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("Search history DELETE error", error);
    return NextResponse.json(
      { error: "Failed to clear search history" },
      { status: 500 }
    );
  }
}
