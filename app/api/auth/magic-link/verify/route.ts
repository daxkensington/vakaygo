import { NextResponse } from "next/server";
import { setSessionCookie } from "@/server/admin-auth";
import { consumeEmailIdentityToken } from "@/server/email-identity";
import { logger } from "@/lib/logger";

// Human-confirmed POST; link scanners cannot consume a sign-in link by GET.
export async function POST(request: Request) {
  try {
    const { token } = await request.json();
    const user = typeof token === "string" ? await consumeEmailIdentityToken(token, "magic") : null;
    if (!user) return NextResponse.json({ error: "This sign-in link is invalid or has expired." }, { status: 400 });
    if (user.requiresTwoFactor) return NextResponse.json({
      requiresPassword: true,
      error: "This account uses two-factor authentication. Please sign in with your password and two-factor code.",
    }, { status: 403 });
    await setSessionCookie({ id: user.id, email: user.email, name: user.name ?? undefined, role: user.role, sessionVersion: user.sessionVersion });
    return NextResponse.json({ ok: true, redirect: user.role === "operator" ? "/operator" : "/explore" });
  } catch (error) {
    logger.error("Magic link verify error", error);
    return NextResponse.json({ error: "Could not complete sign-in. Please request a new link." }, { status: 500 });
  }
}
