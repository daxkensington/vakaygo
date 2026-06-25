import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq, gt } from "drizzle-orm";
import { users } from "@/drizzle/schema";
import { setSessionCookie } from "@/server/admin-auth";

import { logger } from "@/lib/logger";

/**
 * POST — consume a passwordless sign-in link.
 * Body: { token }
 *
 * Invoked by the /auth/continue confirm page (a human button click), NOT by
 * the bare email-link GET — so mail-scanner prefetchers (Outlook SafeLinks,
 * etc.) can't silently burn the token or receive a session.
 *
 * Consumption is a single ATOMIC compare-and-clear (UPDATE ... WHERE token AND
 * not-expired RETURNING), so the link is exactly-once even under concurrent
 * requests. Accounts with 2FA fail closed (must use password + TOTP).
 */
export async function POST(request: Request) {
  try {
    const { token } = await request.json();

    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { error: "This sign-in link is invalid or has expired." },
        { status: 400 }
      );
    }

    const db = drizzle(neon(process.env.DATABASE_URL!));

    // Atomic single-use: clear the token only if it's still valid, and learn
    // who it belonged to in the same statement. Zero rows = invalid/expired/
    // already-used.
    const [user] = await db
      .update(users)
      .set({ magicLinkToken: null, magicLinkExpires: null })
      .where(
        and(
          eq(users.magicLinkToken, token),
          gt(users.magicLinkExpires, new Date())
        )
      )
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        totpEnabled: users.totpEnabled,
      });

    if (!user) {
      return NextResponse.json(
        { error: "This sign-in link is invalid or has expired." },
        { status: 400 }
      );
    }

    // 2FA accounts can't be fully authenticated by email possession alone —
    // they have a password, so route them to the normal 2FA sign-in.
    if (user.totpEnabled) {
      return NextResponse.json(
        {
          requiresPassword: true,
          error:
            "This account uses two-factor authentication. Please sign in with your password.",
        },
        { status: 403 }
      );
    }

    await setSessionCookie({
      id: user.id,
      email: user.email,
      name: user.name ?? undefined,
      role: user.role,
    });

    return NextResponse.json({
      ok: true,
      redirect: user.role === "operator" ? "/operator" : "/explore",
    });
  } catch (error) {
    logger.error("Magic link verify error", error);
    return NextResponse.json(
      { error: "Could not complete sign-in. Please request a new link." },
      { status: 500 }
    );
  }
}
