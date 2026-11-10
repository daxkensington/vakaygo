import { NextResponse } from "next/server";
import { setSessionCookie } from "@/server/admin-auth";
import { consumeSetupLink } from "@/server/operator-setup-link";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const MESSAGES = {
  invalid: "This setup link is not valid. Sign in to continue.",
  expired: "This setup link has expired. Sign in to continue.",
  used: "This setup link has already been used. Sign in to continue.",
  use_password: "This account uses two-factor authentication. Sign in with your password and code.",
  unavailable: "Setup links are not available right now. Sign in to continue.",
} as const;

/**
 * POST — a human pressed "Continue" on /auth/setup-link. Signs the operator in
 * from the one-time link in an onboarding reminder (server/operator-setup-link.ts).
 * There is deliberately no GET: link scanners cannot use a link up or sign in.
 */
export async function POST(request: Request) {
  try {
    const body: unknown = await request.json().catch(() => null);
    const token = body && typeof body === "object" ? (body as Record<string, unknown>).token : undefined;
    const next = body && typeof body === "object" ? (body as Record<string, unknown>).next : undefined;
    const result = await consumeSetupLink(token, next);
    if (!result.ok) {
      return NextResponse.json(
        { error: MESSAGES[result.reason], reason: result.reason, requiresPassword: result.reason === "use_password" },
        { status: result.reason === "use_password" ? 403 : 400 });
    }
    const user = result.identity;
    await setSessionCookie({ id: user.id, email: user.email, name: user.name ?? undefined, role: user.role, sessionVersion: user.sessionVersion });
    logger.info("Operator signed in from a setup link", { operatorId: user.id });
    return NextResponse.json({ ok: true, redirect: result.redirect });
  } catch (error) {
    logger.error("Setup link sign-in error", error);
    return NextResponse.json({ error: "Could not complete sign-in. Please sign in to continue." }, { status: 500 });
  }
}
