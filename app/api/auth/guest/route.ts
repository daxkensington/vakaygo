import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SignJWT } from "jose";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { users } from "@/drizzle/schema";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev-secret-change-in-production"
);

export async function POST(request: Request) {
  try {
    const { name, email, phone } = await request.json();

    if (!name || !email) {
      return NextResponse.json(
        { error: "Name and email are required" },
        { status: 400 }
      );
    }

    const sql = neon(process.env.DATABASE_URL!);
    const db = drizzle(sql);

    const normalizedEmail = email.toLowerCase();

    // Check if user already exists
    const [existingUser] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        avatarUrl: users.avatarUrl,
        businessName: users.businessName,
      })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    let user;

    if (existingUser) {
      user = existingUser;
    } else {
      // Generate random password for guest account
      const randomPassword = crypto.randomBytes(32).toString("hex");
      const passwordHash = await bcrypt.hash(randomPassword, 12);

      const [newUser] = await db
        .insert(users)
        .values({
          email: normalizedEmail,
          name,
          phone: phone || null,
          role: "traveler",
          passwordHash,
          emailVerified: false,
        })
        .returning({
          id: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
          avatarUrl: users.avatarUrl,
          businessName: users.businessName,
        });

      user = newUser;
    }

    // Create JWT session
    const token = await new SignJWT({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .sign(SECRET);

    const cookieStore = await cookies();
    cookieStore.set("session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });

    return NextResponse.json({ user });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Something went wrong";
    if (message.includes("unique") || message.includes("duplicate")) {
      return NextResponse.json(
        { error: "An account with this email already exists. Please sign in." },
        { status: 409 }
      );
    }
    console.error("Guest checkout error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
