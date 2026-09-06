import { NextRequest, NextResponse } from "next/server";
import { setSessionCookie } from "@/server/admin-auth";
import { consumeEmailIdentityToken, validNewPassword } from "@/server/email-identity";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  // Scanners may follow email links; only the explicit confirmation POST mutates.
  const token = new URL(request.url).searchParams.get("token");
  const destination = new URL("/auth/verify-email", request.url);
  if (token && /^[a-f0-9]{64}$/.test(token)) destination.searchParams.set("token", token);
  else destination.searchParams.set("error", "invalid_token");
  return NextResponse.redirect(destination);
}
export async function POST(request: Request) {
  try {
    const { token, password } = await request.json();
    if (password !== undefined && !validNewPassword(password)) {
      return NextResponse.json({ error: "Choose a password of at least 12 characters and no more than 72 UTF-8 bytes." }, { status: 400 });
    }
    const user = typeof token === "string" ? await consumeEmailIdentityToken(token, "verification", password) : null;
    if (!user) return NextResponse.json({ error: "This verification link is invalid or has expired." }, { status: 400 });
    if (user.requiresTwoFactor) return NextResponse.json({
      requiresPassword: true, error: "Please sign in with your password and two-factor code.",
    }, { status: 403 });
    await setSessionCookie({ id: user.id, email: user.email, name: user.name ?? undefined, role: user.role, sessionVersion: user.sessionVersion });
    return NextResponse.json({ ok: true, redirect: user.role === "operator" ? "/operator" : "/explore" });
  } catch (error) {
    logger.error("Verify email error", error);
    return NextResponse.json({ error: "Could not verify your email. Please request a new link." }, { status: 500 });
  }
}
