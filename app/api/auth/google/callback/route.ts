import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SignJWT } from "jose";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, and } from "drizzle-orm";
import { users, accounts } from "@/drizzle/schema";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev-secret-change-in-production"
);

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");

    if (errorParam) {
      return NextResponse.redirect(
        new URL("/auth/signin?error=google_denied", url.origin)
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        new URL("/auth/signin?error=invalid_callback", url.origin)
      );
    }

    // Verify CSRF state
    const cookieStore = await cookies();
    const storedState = cookieStore.get("oauth_state")?.value;

    if (!storedState || storedState !== state) {
      return NextResponse.redirect(
        new URL("/auth/signin?error=invalid_state", url.origin)
      );
    }

    // Clear the state cookie
    cookieStore.delete("oauth_state");

    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: "https://vakaygo.com/api/auth/google/callback",
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      console.error("Google token exchange failed:", await tokenRes.text());
      return NextResponse.redirect(
        new URL("/auth/signin?error=token_exchange_failed", url.origin)
      );
    }

    const tokens = await tokenRes.json();

    // Fetch user profile from Google
    const profileRes = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      }
    );

    if (!profileRes.ok) {
      console.error("Google profile fetch failed:", await profileRes.text());
      return NextResponse.redirect(
        new URL("/auth/signin?error=profile_fetch_failed", url.origin)
      );
    }

    const profile = await profileRes.json();
    const googleEmail = (profile.email as string).toLowerCase();
    const googleName = profile.name as string;
    const googleAvatar = profile.picture as string | undefined;
    const googleId = profile.id as string;

    // Database operations
    const sql = neon(process.env.DATABASE_URL!);
    const db = drizzle(sql);

    // Check if user already exists with this email
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, googleEmail))
      .limit(1);

    let user: { id: string; email: string; name: string | null; role: string };

    if (existingUser) {
      user = {
        id: existingUser.id,
        email: existingUser.email,
        name: existingUser.name,
        role: existingUser.role,
      };

      // Update avatar if not set
      if (!existingUser.avatarUrl && googleAvatar) {
        await db
          .update(users)
          .set({ avatarUrl: googleAvatar })
          .where(eq(users.id, existingUser.id));
      }

      // Link Google account if not already linked
      const [existingAccount] = await db
        .select()
        .from(accounts)
        .where(
          and(
            eq(accounts.provider, "google"),
            eq(accounts.userId, existingUser.id)
          )
        )
        .limit(1);

      if (!existingAccount) {
        await db.insert(accounts).values({
          userId: existingUser.id,
          type: "oauth",
          provider: "google",
          providerAccountId: googleId,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token || null,
          expiresAt: tokens.expires_in
            ? Math.floor(Date.now() / 1000) + tokens.expires_in
            : null,
          tokenType: tokens.token_type || null,
          scope: tokens.scope || null,
          idToken: tokens.id_token || null,
        });
      }
    } else {
      // Create new user
      const [newUser] = await db
        .insert(users)
        .values({
          email: googleEmail,
          name: googleName,
          avatarUrl: googleAvatar || null,
          role: "traveler",
          emailVerified: true,
        })
        .returning({
          id: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
        });

      user = newUser;

      // Link Google account
      await db.insert(accounts).values({
        userId: newUser.id,
        type: "oauth",
        provider: "google",
        providerAccountId: googleId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || null,
        expiresAt: tokens.expires_in
          ? Math.floor(Date.now() / 1000) + tokens.expires_in
          : null,
        tokenType: tokens.token_type || null,
        scope: tokens.scope || null,
        idToken: tokens.id_token || null,
      });
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

    cookieStore.set("session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });

    // Redirect based on role
    const redirectPath = user.role === "operator" ? "/operator" : "/explore";
    return NextResponse.redirect(new URL(redirectPath, url.origin));
  } catch (error) {
    console.error("Google OAuth callback error:", error);
    return NextResponse.redirect(
      new URL("/auth/signin?error=callback_failed", new URL(request.url).origin)
    );
  }
}
