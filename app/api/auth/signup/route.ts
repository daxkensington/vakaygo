import { NextResponse, after } from "next/server";
import { createUser } from "@/server/auth";
import { sendWelcomeEmail, sendVerificationEmail } from "@/server/email";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { users, referrals } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";

import { logger } from "@/lib/logger";
import { claimListingPath } from "@/lib/claim-return";
import { safeAuthNext } from "@/lib/auth-return";
export async function POST(request: Request) {
  try {
    const { email, password, name, role, referralCode, claimListingId, next } = await request.json();
    const claimReturn = claimListingPath(typeof claimListingId === "string" ? claimListingId : null) ? claimListingId : undefined;

    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || typeof name !== "string" || !name.trim() || name.length > 200 || typeof password !== "string") {
      return NextResponse.json(
        { error: "A valid email, full name, and password are required" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    // SECURITY: never trust a client-supplied role. Only travelers and
    // operators may self-register; admin accounts are provisioned out-of-band.
    // (createUser also coerces defensively.)
    const safeRole = role === "operator" ? "operator" : "traveler";

    const user = await createUser(email.trim().toLowerCase(), password, name.trim(), safeRole);

    // Handle referral code if provided
    if (referralCode) {
      try {
        const refDb = drizzle(neon(process.env.DATABASE_URL!));

        // Find the referrer by their referral code
        const [referrer] = await refDb
          .select({ id: users.id })
          .from(users)
          .where(eq(users.referralCode, referralCode))
          .limit(1);

        if (referrer) {
          // Set referredBy on the new user
          await refDb
            .update(users)
            .set({ referredBy: referrer.id, updatedAt: new Date() })
            .where(eq(users.id, user.id));

          // Create referral record
          await refDb.insert(referrals).values({
            referrerId: referrer.id,
            referredId: user.id,
            referredEmail: email.toLowerCase(),
            code: referralCode,
            status: "signed_up",
          });
        }
      } catch (refError) {
        // Referral failure should not break signup
        logger.error("Referral processing error", refError);
      }
    }

    // Required inbox proof must receive a provider response before claiming it was sent.
    let verificationEmailSent = false;
    try {
      const verificationToken = randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const db = drizzle(neon(process.env.DATABASE_URL!));
      await db
        .update(users)
        .set({
          emailVerificationToken: verificationToken,
          emailVerificationExpires: expires,
        })
        .where(eq(users.id, user.id));
      await sendVerificationEmail({ to: user.email, name: user.name || "Traveler", token: verificationToken, claimListingId: claimReturn, next: safeAuthNext(next) });
      verificationEmailSent = true;
    } catch (verificationError) {
      // The account already exists; report recoverable email failure without suggesting a duplicate signup.
      logger.error("Signup verification email unavailable", verificationError);
    }

    after(async () => {
      try { await sendWelcomeEmail({ to: user.email, name: user.name || "Traveler" }); }
      catch (welcomeError) { logger.error("Signup welcome email unavailable", welcomeError); }
    });
    return NextResponse.json({ user, verificationEmailSent });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Something went wrong";
    if (message.includes("unique") || message.includes("duplicate")) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }
    logger.error("Signup error", error);
    return NextResponse.json({ error: "Could not create your account. Please try again." }, { status: 500 });
  }
}
