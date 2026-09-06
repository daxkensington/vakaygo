import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { users } from "@/drizzle/schema";
import { and, eq, sql } from "drizzle-orm";
import { requireUser, setSessionCookie } from "@/server/admin-auth";
import { TOTP } from "otpauth";

import { logger } from "@/lib/logger";

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

/**
 * GET — Generate TOTP secret and QR URI for setup
 */
export async function GET() {
  try {
    const auth = await requireUser();
    if (!auth.ok) return auth.error;
    if (!auth.emailVerified) return NextResponse.json({ error: "Verify your email before enabling two-factor authentication." }, { status: 403 });
    const userId = auth.userId;

    const db = getDb();

    const [user] = await db
      .select({ email: users.email, totpEnabled: users.totpEnabled })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (user.totpEnabled) {
      return NextResponse.json(
        { error: "2FA is already enabled" },
        { status: 400 }
      );
    }

    // Generate a new TOTP instance
    const totp = new TOTP({
      issuer: "VakayGo",
      label: user.email,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
    });

    const secret = totp.secret.base32;
    const uri = totp.toString();

    // SECURITY: a GET must not mutate state (it's reachable via CSRF top-level
    // navigation). We return the freshly generated secret to the client and
    // only persist it on POST, once the user proves possession with a code.
    return NextResponse.json({ secret, uri });
  } catch (error) {
    logger.error("TOTP setup error", error);
    return NextResponse.json(
      { error: "Failed to generate TOTP" },
      { status: 500 }
    );
  }
}

/**
 * POST — Verify TOTP token and enable 2FA
 * Body: { token: string }
 */
export async function POST(request: Request) {
  try {
    const auth = await requireUser();
    if (!auth.ok) return auth.error;
    if (!auth.emailVerified) return NextResponse.json({ error: "Verify your email before enabling two-factor authentication." }, { status: 403 });
    const userId = auth.userId;

    const { token: otpToken, secret } = await request.json();
    if (!otpToken) {
      return NextResponse.json({ error: "token required" }, { status: 400 });
    }
    if (!secret || typeof secret !== "string") {
      return NextResponse.json(
        { error: "secret required — call GET first to generate one" },
        { status: 400 }
      );
    }

    const db = getDb();

    const [user] = await db
      .select({
        email: users.email,
        totpEnabled: users.totpEnabled,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (user.totpEnabled) {
      return NextResponse.json(
        { error: "2FA is already enabled" },
        { status: 400 }
      );
    }

    // Verify the token against the secret the user is enrolling (proof of
    // possession), then persist the secret AND enable 2FA together.
    const totp = new TOTP({
      issuer: "VakayGo",
      label: user.email,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret,
    });

    const delta = totp.validate({ token: otpToken, window: 1 });

    if (delta === null) {
      return NextResponse.json(
        { error: "Invalid verification code" },
        { status: 400 }
      );
    }

    // CAS prevents an in-flight older session from installing a credential
    // after ownership/revocation. Revoke older sessions on successful enrollment.
    const [updated] = await db.update(users)
      .set({ totpSecret: secret, totpEnabled: true, sessionVersion: sql`${users.sessionVersion} + 1` })
      .where(and(eq(users.id, userId), eq(users.sessionVersion, auth.sessionVersion), eq(users.emailVerified, true), eq(users.totpEnabled, false)))
      .returning({ id: users.id, email: users.email, name: users.name, role: users.role, sessionVersion: users.sessionVersion });
    if (!updated) return NextResponse.json({ error: "Account changed. Sign in again." }, { status: 409 });
    await setSessionCookie({ ...updated, name: updated.name ?? undefined });

    return NextResponse.json({ enabled: true });
  } catch (error) {
    logger.error("TOTP verify error", error);
    return NextResponse.json(
      { error: "Failed to verify TOTP" },
      { status: 500 }
    );
  }
}
