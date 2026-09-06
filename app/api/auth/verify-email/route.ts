import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { users } from "@/drizzle/schema";
import { and, eq } from "drizzle-orm";
import { requireUser } from "@/server/admin-auth";
import { randomBytes } from "crypto";
import { sendVerificationEmail } from "@/server/email";

import { logger } from "@/lib/logger";

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

export async function POST() {
  try {
    const auth = await requireUser();
    if (!auth.ok) return auth.error;
    const userId = auth.userId;

    const db = getDb();

    // Get user
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        emailVerified: users.emailVerified,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (user.emailVerified) {
      return NextResponse.json({ error: "Email already verified" }, { status: 400 });
    }

    // Generate token
    const verificationToken = randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Store token
    const [stored] = await db
      .update(users)
      .set({
        emailVerificationToken: verificationToken,
        emailVerificationExpires: expires,
      })
      .where(and(eq(users.id, userId), eq(users.sessionVersion, auth.sessionVersion), eq(users.emailVerified, false)))
      .returning({ id: users.id });
    if (!stored) return NextResponse.json({ error: "Account changed. Sign in again." }, { status: 409 });

    // Send email
    await sendVerificationEmail({
      to: user.email,
      name: user.name || "Traveler",
      token: verificationToken,
    });

    return NextResponse.json({ sent: true });
  } catch (error) {
    logger.error("Send verification email error", error);
    return NextResponse.json(
      { error: "Failed to send verification email" },
      { status: 500 }
    );
  }
}
