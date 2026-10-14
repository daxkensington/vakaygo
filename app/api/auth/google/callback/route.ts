import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, and } from "drizzle-orm";
import { users, accounts } from "@/drizzle/schema";

import { logger } from "@/lib/logger";
import { claimListingPath, signInHref } from "@/lib/claim-return";
import { safeAuthNext } from "@/lib/auth-return";
import { setSessionCookie } from "@/server/admin-auth";
import { establishEmailIdentity } from "@/server/email-identity";

function getRedirectUri(requestUrl: string): string {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || new URL(requestUrl).origin;
  return `${baseUrl}/api/auth/google/callback`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  let cookieStore: Awaited<ReturnType<typeof cookies>> | undefined;
  let continuationClaim: string | undefined;
  let returnPath: string | null = null;
  let newAccountRole: "operator" | "traveler" = "traveler";
  let clearAttempt = false;
  const failure = (error: string) => {
    const destination = new URL(signInHref(continuationClaim, { error, next: returnPath }), url.origin);
    if (newAccountRole === "operator") destination.searchParams.set("role", "operator");
    return NextResponse.redirect(destination);
  };

  try {
    cookieStore = await cookies();
    const storedState = cookieStore.get("oauth_state")?.value;
    // A delayed old callback must not invalidate a newer login in another tab.
    clearAttempt = !storedState || storedState === url.searchParams.get("state");
    // Guard: check required env vars before doing anything
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const databaseUrl = process.env.DATABASE_URL;

    if (
      !clientId ||
      !clientSecret ||
      clientId === "REPLACE_WITH_YOUR_GOOGLE_CLIENT_ID" ||
      clientSecret === "REPLACE_WITH_YOUR_GOOGLE_CLIENT_SECRET"
    ) {
      logger.error("Google OAuth credentials are not configured");
      return failure("oauth_not_configured");
    }

    if (!databaseUrl) {
      logger.error("DATABASE_URL is not configured");
      return failure("server_error");
    }

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");

    if (!state || (!code && !errorParam)) {
      return failure("invalid_callback");
    }

    // Verify CSRF state

    if (!storedState || storedState !== state) {
      logger.error("OAuth state mismatch", {
        hasStoredState: !!storedState,
        statesMatch: storedState === state,
      });
      return failure("invalid_state");
    }

    // Only use continuation cookies after verifying the OAuth state.
    try {
      const roleChoice = JSON.parse(cookieStore.get("oauth_role")?.value || "null");
      if (roleChoice?.state === state && roleChoice.role === "operator") newAccountRole = "operator";
    } catch { /* A missing or invalid choice retains the traveler default. */ }
    const claim = cookieStore.get("oauth_claim")?.value;
    if (claimListingPath(claim)) continuationClaim = claim;
    try {
      const continuation = JSON.parse(cookieStore.get("oauth_next")?.value || "null");
      if (continuation?.state === state) returnPath = safeAuthNext(continuation.next);
    } catch { /* Invalid or stale continuation cookies are ignored. */ }

    if (errorParam) {
      logger.error("Google OAuth error", errorParam);
      return failure("google_denied");
    }
    if (!code) return failure("invalid_callback");

    // Use the redirect URI from cookie (set during initial redirect) or derive it
    const storedRedirectUri = cookieStore.get("oauth_redirect_uri")?.value;
    const redirectUri = storedRedirectUri || getRedirectUri(request.url);

    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const errorBody = await tokenRes.text();
      logger.error("Google token exchange failed", errorBody);
      return failure("token_exchange_failed");
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
      logger.error("Google profile fetch failed", await profileRes.text());
      return failure("profile_fetch_failed");
    }

    const profile = await profileRes.json();

    if (typeof profile.email !== "string" || profile.verified_email !== true || !profile.id) {
      logger.error("Google profile missing email", profile);
      return failure("unverified_google_email");
    }

    const googleEmail = (profile.email as string).toLowerCase();
    const googleName = profile.name as string;
    const googleAvatar = profile.picture as string | undefined;
    const googleId = profile.id as string;

    // Database operations
    const sql = neon(databaseUrl);
    const db = drizzle(sql);

    // Check if user already exists with this email
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, googleEmail))
      .limit(1);

    let user: { id: string; email: string; name: string | null; role: string; sessionVersion: number };

    if (existingUser?.emailVerified && existingUser.totpEnabled) {
      return failure("two_factor_required");
    }

    if (existingUser) {
      const identity = await establishEmailIdentity(existingUser.id);
      if (!identity) throw new Error("Account no longer exists");
      if (identity.requiresTwoFactor) return failure("two_factor_required");
      user = identity;

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
      } else {
        // Update tokens on existing account
        await db
          .update(accounts)
          .set({
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token || existingAccount.refreshToken,
            expiresAt: tokens.expires_in
              ? Math.floor(Date.now() / 1000) + tokens.expires_in
              : existingAccount.expiresAt,
            idToken: tokens.id_token || existingAccount.idToken,
          })
          .where(eq(accounts.id, existingAccount.id));
      }
    } else {
      // Create new user
      const [newUser] = await db
        .insert(users)
        .values({
          email: googleEmail,
          name: googleName,
          avatarUrl: googleAvatar || null,
          role: newAccountRole,
          emailVerified: true,
        })
        .returning({
          id: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
          sessionVersion: users.sessionVersion,
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

    await setSessionCookie({
      id: user.id,
      email: user.email,
      name: user.name ?? undefined,
      role: user.role,
      sessionVersion: user.sessionVersion,
    });

    const redirectPath = claimListingPath(continuationClaim) || returnPath || (user.role === "operator" ? "/operator" : "/explore");
    return NextResponse.redirect(new URL(redirectPath, url.origin));
  } catch (error) {
    logger.error("Google OAuth callback error", error);
    return failure("callback_failed");
  } finally {
    // Clear a consumed matching attempt on every outcome; leave newer attempts intact.
    if (clearAttempt) for (const name of ["oauth_state", "oauth_claim", "oauth_next", "oauth_role", "oauth_redirect_uri"]) cookieStore?.delete(name);
  }
}
