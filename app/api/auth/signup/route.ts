import { NextResponse } from "next/server";
import { createUser } from "@/server/auth";
import { sendWelcomeEmail, sendVerificationEmail } from "@/server/email";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { users, referrals } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";

import { logger } from "@/lib/logger";
export async function POST(request: Request) {
  try {
    const { email, password, name, role, referralCode } = await request.json();

    if (!email || !password || !name) {
      return NextResponse.json(
        { error: "Email, password, and name are required" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const user = await createUser(email, password, name, role || "traveler");

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

    // Send welcome email (non-blocking)
    try {
      sendWelcomeEmail({ to: email, name }).catch(() => {});
    } catch (_emailErr) {
      // Email failure should not break signup
    }

    // Send verification email (non-blocking)
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
      sendVerificationEmail({ to: email, name, token: verificationToken }).catch(() => {});
    } catch (_verifyErr) {
      // Verification email failure should not break signup
    }

    return NextResponse.json({ user });
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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
