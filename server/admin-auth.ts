import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { users, listings } from "@/drizzle/schema";
import { env } from "@/lib/env";
import { createSessionToken, verifyCurrentSessionToken, SESSION_TTL_SECONDS, type SessionClaims, type SessionPayload } from "./session-validation";
export { createSessionToken, verifySessionToken, verifyCurrentSessionToken, SESSION_TTL_SECONDS } from "./session-validation";
export type { SessionClaims, SessionPayload } from "./session-validation";

type AuthResult =
  | { ok: true; userId: string; role: string; sessionVersion: number; emailVerified: boolean }
  | { ok: false; error: NextResponse };

function getDb() {
  return drizzle(neon(env.DATABASE_URL));
}

export async function setSessionCookie(claims: SessionClaims): Promise<void> {
  const token = await createSessionToken(claims);
  // Never promote a stale credential read to the latest epoch.
  if (!await verifyCurrentSessionToken(token)) throw new Error("Session identity changed; sign in again");
  const cookieStore = await cookies();
  cookieStore.set("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete("session");
}

export async function verifySession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) return null;
  return verifyCurrentSessionToken(token);
}

export async function requireUser(): Promise<AuthResult> {
  const session = await verifySession();
  if (!session) {
    return {
      ok: false,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { ok: true, userId: session.userId, role: session.role, sessionVersion: session.sessionVersion!, emailVerified: session.emailVerified === true };
}

export async function requireAdmin(): Promise<AuthResult> {
  const session = await verifySession();
  if (!session) {
    return {
      ok: false,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const db = getDb();
  const [user] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!user || user.role !== "admin") {
    return {
      ok: false,
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true, userId: session.userId, role: user.role, sessionVersion: session.sessionVersion!, emailVerified: session.emailVerified === true };
}

export async function requireOperator(): Promise<AuthResult> {
  const session = await verifySession();
  if (!session) {
    return {
      ok: false,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (session.role !== "operator" && session.role !== "admin") {
    return {
      ok: false,
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true, userId: session.userId, role: session.role, sessionVersion: session.sessionVersion!, emailVerified: session.emailVerified === true };
}

/**
 * Confirm a listing exists and belongs to the given operator
 * (admins bypass the ownership check). Returns the listing's operatorId
 * on success, or a NextResponse with the appropriate status on failure.
 */
export async function assertListingOwnership(
  listingId: string,
  operatorId: string,
  role: string
): Promise<{ ok: true } | { ok: false; error: NextResponse }> {
  const db = getDb();
  const [listing] = await db
    .select({ operatorId: listings.operatorId })
    .from(listings)
    .where(eq(listings.id, listingId))
    .limit(1);

  if (!listing) {
    return {
      ok: false,
      error: NextResponse.json({ error: "Listing not found" }, { status: 404 }),
    };
  }
  if (listing.operatorId !== operatorId && role !== "admin") {
    return {
      ok: false,
      error: NextResponse.json(
        { error: "You do not own this listing" },
        { status: 403 }
      ),
    };
  }
  return { ok: true };
}
