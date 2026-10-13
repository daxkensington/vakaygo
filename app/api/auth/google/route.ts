import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";

import { logger } from "@/lib/logger";
import { claimListingPath, signInHref } from "@/lib/claim-return";
import { safeAuthNext } from "@/lib/auth-return";
function getRedirectUri(requestUrl: string): string {
  // Use NEXT_PUBLIC_APP_URL if set, otherwise derive from the request
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || new URL(requestUrl).origin;
  return `${baseUrl}/api/auth/google/callback`;
}

export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const source = new URL(request.url);
  const claim = source.searchParams.get("claim");
  const next = safeAuthNext(source.searchParams.get("next"));
  const cookieStore = await cookies();
  // Every new attempt replaces the previous attempt, even without a return path.
  for (const name of ["oauth_state", "oauth_claim", "oauth_next", "oauth_redirect_uri"]) cookieStore.delete(name);

  if (
    !clientId ||
    clientId === "REPLACE_WITH_YOUR_GOOGLE_CLIENT_ID" ||
    clientId.trim() === ""
  ) {
    logger.error("GOOGLE_CLIENT_ID is not configured in environment variables");
    return NextResponse.redirect(
      new URL(
        signInHref(claim, { error: "oauth_not_configured", next }),
        source.origin
      )
    );
  }

  // Generate CSRF state token
  const state = crypto.randomBytes(32).toString("hex");

  cookieStore.set("oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });
  if (claimListingPath(claim)) {
    cookieStore.set("oauth_claim", claim!, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });
  } else if (next) {
    // Bind the destination to this exact OAuth attempt, not just the browser.
    cookieStore.set("oauth_next", JSON.stringify({ state, next }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });
  }

  const redirectUri = getRedirectUri(request.url);

  // Store redirect URI in cookie so callback uses the same one
  cookieStore.set("oauth_redirect_uri", redirectUri, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
    prompt: "consent",
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  return NextResponse.redirect(authUrl);
}
