import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { users } from "@/drizzle/schema";
import { eq, and, sql } from "drizzle-orm";

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.redirect(
        new URL("/auth/verify-email?error=missing_token", request.url)
      );
    }

    const db = getDb();

    // Find user with this token that hasn't expired
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.emailVerificationToken, token),
          sql`${users.emailVerificationExpires} > now()`
        )
      )
      .limit(1);

    if (!user) {
      return NextResponse.redirect(
        new URL("/auth/verify-email?error=invalid_token", request.url)
      );
    }

    // Mark as verified and clear token
    await db
      .update(users)
      .set({
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpires: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    return NextResponse.redirect(
      new URL("/profile?verified=true", request.url)
    );
  } catch (error) {
    console.error("Verify email error:", error);
    return NextResponse.redirect(
      new URL("/auth/verify-email?error=server_error", request.url)
    );
  }
}
