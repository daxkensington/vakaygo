import { NextResponse } from "next/server";
import { TOTP } from "otpauth";
import { verifyCredentials } from "@/server/auth";

import { logger } from "@/lib/logger";
import { setSessionCookie } from "@/server/admin-auth";

export async function POST(request: Request) {
  try {
    const { email, password, totpCode } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const user = await verifyCredentials(email, password);
    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    // SECURITY: if the account has 2FA enabled, a valid TOTP code is required
    // BEFORE a session is issued — otherwise enabling 2FA gives no protection.
    if (user.totpEnabled) {
      if (!totpCode) {
        return NextResponse.json(
          { error: "Two-factor code required", requires2fa: true },
          { status: 401 }
        );
      }
      if (!user.totpSecret) {
        // 2FA flagged on but no secret stored — fail closed.
        return NextResponse.json(
          { error: "Two-factor is misconfigured for this account" },
          { status: 401 }
        );
      }
      const totp = new TOTP({
        issuer: "VakayGo",
        label: user.email,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: user.totpSecret,
      });
      const delta = totp.validate({ token: String(totpCode), window: 1 });
      if (delta === null) {
        return NextResponse.json(
          { error: "Invalid two-factor code", requires2fa: true },
          { status: 401 }
        );
      }
    }

    await setSessionCookie({
      id: user.id,
      email: user.email,
      name: user.name ?? undefined,
      role: user.role,
    });

    // SECURITY: never echo the TOTP secret (or the 2FA flag) back to the
    // client — it is the entire second factor. Strip them before responding.
    const { totpSecret: _ts, totpEnabled: _te, ...safeUser } = user;
    void _ts;
    void _te;
    return NextResponse.json({ user: safeUser });
  } catch (error) {
    logger.error("Signin error", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
