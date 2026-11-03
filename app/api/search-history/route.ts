import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { searchHistory } from "@/drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { verifyCurrentSessionToken } from "@/server/session-validation";
import { cookies } from "next/headers";
import { sameSessionIdentity } from "@/lib/session-identity";
import { isRecord } from "@/lib/value-guards";
import { logger } from "@/lib/logger";

const headers = { "Cache-Control": "private, no-store" };
function getDb() { return drizzle(neon(process.env.DATABASE_URL!)); }
function denied(status = 401) {
  return NextResponse.json({ error: status === 409 ? "Your account changed. Please reload." : "Unauthorized" }, { status, headers });
}

/** Anonymous callers receive an empty list; private rows belong to the current actor. */
export async function GET(request?: Request) {
  try {
    const token = (await cookies()).get("session")?.value;
    if (!token) return NextResponse.json({ searches: [] }, { headers });
    const actor = await verifyCurrentSessionToken(token);
    if (!actor) return denied();
    const expected = request ? new URL(request.url).searchParams.get("expectedUserId") : null;
    if (expected !== null && expected !== actor.userId) return denied(409);
    const db = getDb();
    const results = await db.select().from(searchHistory)
      .where(eq(searchHistory.userId, actor.userId))
      .orderBy(desc(searchHistory.createdAt)).limit(20);
    if (!sameSessionIdentity(actor, await verifyCurrentSessionToken(token))) return denied();
    return NextResponse.json({ userId: actor.userId, searches: results }, { headers });
  } catch (error) {
    logger.error("Search history GET error", error);
    return NextResponse.json({ error: "Failed to fetch search history" }, { status: 500, headers });
  }
}

/** Save a bounded search for the same account that initiated the request. */
export async function POST(request: Request) {
  try {
    const token = (await cookies()).get("session")?.value;
    if (!token) return denied();
    const actor = await verifyCurrentSessionToken(token);
    if (!actor) return denied();
    const body: unknown = await request.json();
    if (!isRecord(body)) return NextResponse.json({ error: "A search object is required" }, { status: 400, headers });
    if (body.expectedUserId !== undefined && body.expectedUserId !== actor.userId) return denied(409);
    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!query || query.length > 120) return NextResponse.json({ error: "query must contain 1 to 120 characters" }, { status: 400, headers });
    if (body.filters != null && !isRecord(body.filters)) return NextResponse.json({ error: "filters must be an object" }, { status: 400, headers });
    if (!sameSessionIdentity(actor, await verifyCurrentSessionToken(token))) return denied();
    const db = getDb();
    const [entry] = await db.insert(searchHistory)
      .values({ userId: actor.userId, query, filters: body.filters ?? null }).returning();
    return NextResponse.json({ userId: actor.userId, search: entry }, { status: 201, headers });
  } catch (error) {
    logger.error("Search history POST error", error);
    return NextResponse.json({ error: "Failed to save search" }, { status: 500, headers });
  }
}

/** Clear only the current account's history. */
export async function DELETE(request?: Request) {
  try {
    const token = (await cookies()).get("session")?.value;
    if (!token) return denied();
    const actor = await verifyCurrentSessionToken(token);
    if (!actor) return denied();
    const expected = request ? new URL(request.url).searchParams.get("expectedUserId") : null;
    if (expected !== null && expected !== actor.userId) return denied(409);
    if (!sameSessionIdentity(actor, await verifyCurrentSessionToken(token))) return denied();
    const db = getDb();
    await db.delete(searchHistory).where(eq(searchHistory.userId, actor.userId));
    return NextResponse.json({ userId: actor.userId, ok: true }, { headers });
  } catch (error) {
    logger.error("Search history DELETE error", error);
    return NextResponse.json({ error: "Failed to clear search history" }, { status: 500, headers });
  }
}
