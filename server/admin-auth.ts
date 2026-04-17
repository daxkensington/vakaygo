import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { users, listings } from "@/drizzle/schema";
import { env, SESSION_SECRET } from "@/lib/env";

export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export type SessionPayload = {
  userId: string;
  role: string;
  email: string;
};

type AuthResult =
  | { ok: true; userId: string; role: string }
  | { ok: false; error: NextResponse };

function getDb() {
  return drizzle(neon(env.DATABASE_URL));
}

export type SessionClaims = {
  id: string;
  email: string;
  name?: string;
  role: string;
};

export async function createSessionToken(claims: SessionClaims): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(SESSION_SECRET());
}

export async function setSessionCookie(claims: SessionClaims): Promise<void> {
  const token = await createSessionToken(claims);
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

export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SESSION_SECRET());
    return {
      userId: payload.id as string,
      role: payload.role as string,
      email: payload.email as string,
    };
  } catch {
    return null;
  }
}

export async function verifySession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function requireUser(): Promise<AuthResult> {
  const session = await verifySession();
  if (!session) {
    return {
      ok: false,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { ok: true, userId: session.userId, role: session.role };
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

  return { ok: true, userId: session.userId, role: user.role };
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

  return { ok: true, userId: session.userId, role: session.role };
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
