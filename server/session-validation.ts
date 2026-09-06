import { neon } from "@neondatabase/serverless";
import { SignJWT, jwtVerify } from "jose";
import { env, SESSION_SECRET } from "@/lib/env";

export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
export type SessionClaims = {
  id: string; email: string; name?: string; role: string; sessionVersion: number;
};
export type SessionPayload = {
  userId: string; role: string; email: string;
  sessionVersion?: number; emailVerified?: boolean;
};

/** Cryptographic encoding only. Callers must supply the epoch read with proof. */
export async function createSessionToken(claims: SessionClaims): Promise<string> {
  if (!Number.isSafeInteger(claims.sessionVersion) || claims.sessionVersion < 0) throw new Error("Session epoch required");
  return new SignJWT({ ...claims }).setProtectedHeader({ alg: "HS256" })
    .setIssuedAt().setExpirationTime(`${SESSION_TTL_SECONDS}s`).sign(SESSION_SECRET());
}
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SESSION_SECRET(), { algorithms: ["HS256"] });
    if (typeof payload.id !== "string" || typeof payload.email !== "string" ||
      !["traveler", "operator", "admin"].includes(String(payload.role)) ||
      (payload.sessionVersion !== undefined && (!Number.isSafeInteger(payload.sessionVersion) || Number(payload.sessionVersion) < 0))) return null;
    return { userId: payload.id, role: String(payload.role), email: payload.email,
      ...(payload.sessionVersion === undefined ? {} : { sessionVersion: Number(payload.sessionVersion) }) };
  } catch { return null; }
}
export function sessionMatchesUser(session: SessionPayload, user: {
  role: string; email: string; email_verified: boolean | null; session_version: number;
}): boolean {
  // Compatibility is limited to verified, never-revoked legacy sessions.
  const epochMatches = session.sessionVersion === undefined
    ? user.email_verified === true && user.session_version === 0
    : session.sessionVersion === user.session_version;
  return epochMatches && session.role === user.role && session.email === user.email &&
    (user.email_verified === true || user.role === "traveler");
}
/** Authoritative, cache-free check used by proxy AND server auth helpers. */
export async function verifyCurrentSessionToken(token: string): Promise<SessionPayload | null> {
  const session = await verifySessionToken(token);
  if (!session) return null;
  try {
    const query = neon(env.DATABASE_URL);
    const [user] = await query`SELECT role,email,email_verified,session_version FROM users WHERE id=${session.userId}::uuid`;
    if (!user || !sessionMatchesUser(session, user as Parameters<typeof sessionMatchesUser>[1])) return null;
    return { ...session, sessionVersion: user.session_version, emailVerified: user.email_verified === true };
  } catch { return null; }
}
