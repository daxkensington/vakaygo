import { NextResponse, after } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, and, isNull } from "drizzle-orm";
import { randomBytes } from "crypto";
import { users } from "@/drizzle/schema";
import { sendMagicLinkEmail } from "@/server/email";
import { claimListingPath, magicLinkUrl } from "@/lib/claim-return";
import { safeAuthNext } from "@/lib/auth-return";

import { logger } from "@/lib/logger";

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000; // 15 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // don't re-issue within 60s of a prior link

/**
 * POST — request a passwordless sign-in link.
 * Body: { email, claimListingId?, next? }
 * claimListingId is only a return path after sign-in. It is not ownership proof.
 *
 * Anti-enumeration: the synchronous response path is SELECT-only and returns
 * the SAME 200 body whether or not the email exists. ALL writes + the email
 * send happen in after() (post-response), so neither the body nor the timing
 * reveals account existence. Rate-limited as an /api/auth route by proxy.ts.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email } = body;
    const claimReturn = claimListingPath(typeof body?.claimListingId === "string" ? body.claimListingId : null)
      ? body.claimListingId
      : undefined;
    const next = safeAuthNext(body?.next);

    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "A valid email is required" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const db = drizzle(neon(process.env.DATABASE_URL!));

    const [user] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        magicLinkExpires: users.magicLinkExpires,
        magicLinkToken: users.magicLinkToken,
        sessionVersion: users.sessionVersion,
      })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    // All side effects happen AFTER the response so the sync path (and thus
    // the response timing) is identical for existing vs non-existing emails.
    after(async () => {
      if (!user) return;

      // Per-account cooldown: if a link was issued in the last 60s, don't
      // issue another (anti email-bombing / link-thrash).
      if (
        user.magicLinkExpires &&
        new Date(user.magicLinkExpires).getTime() - Date.now() >
          MAGIC_LINK_TTL_MS - RESEND_COOLDOWN_MS
      ) {
        return;
      }

      const token = randomBytes(32).toString("hex");
      let issued = false;
      try {
        const url = magicLinkUrl(token, claimReturn, next);
        if (!url) return;
        const expires = new Date(Date.now() + MAGIC_LINK_TTL_MS);
        const [stored] = await db
          .update(users)
          .set({ magicLinkToken: token, magicLinkExpires: expires })
          .where(and(
            eq(users.id, user.id), eq(users.sessionVersion, user.sessionVersion),
            user.magicLinkToken == null ? isNull(users.magicLinkToken) : eq(users.magicLinkToken, user.magicLinkToken),
          )).returning({ id: users.id });
        if (!stored) return;
        issued = true;

        await sendMagicLinkEmail({
          to: user.email,
          name: user.name || "there",
          url,
        });
      } catch (err) {
        logger.error("Magic link issue/send failed", err);
        // Only this failed issuance may restore the prior link. A newer link or consumed proof wins.
        if (issued) {
          try {
            await db.update(users).set({ magicLinkToken: user.magicLinkToken, magicLinkExpires: user.magicLinkExpires })
              .where(and(eq(users.id, user.id), eq(users.sessionVersion, user.sessionVersion), eq(users.magicLinkToken, token)));
          } catch (restoreError) { logger.error("Magic link failed-send recovery failed", restoreError); }
        }
      }
    });

    return NextResponse.json({
      ok: true,
      message: "If an account exists for that email, a sign-in link is on its way.",
    });
  } catch (error) {
    logger.error("Magic link request error", error);
    return NextResponse.json(
      { error: "Could not send a sign-in link. Please try again." },
      { status: 500 }
    );
  }
}
