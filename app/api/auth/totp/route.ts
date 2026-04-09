import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { users } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import { TOTP } from "otpauth";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev-secret-change-in-production"
);

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

/**
 * GET — Generate TOTP secret and QR URI for setup
 */
export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, SECRET);
    const userId = payload.id as string;

    const db = getDb();

    const [user] = await db
      .select({ email: users.email, totpEnabled: users.totpEnabled })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (user.totpEnabled) {
      return NextResponse.json(
        { error: "2FA is already enabled" },
        { status: 400 }
      );
    }

    // Generate a new TOTP instance
    const totp = new TOTP({
      issuer: "VakayGo",
      label: user.email,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
    });

    const secret = totp.secret.base32;
    const uri = totp.toString();

    // Temporarily store the secret (will be committed on POST verify)
    await db
      .update(users)
      .set({ totpSecret: secret })
      .where(eq(users.id, userId));

    return NextResponse.json({ secret, uri });
  } catch (error) {
    console.error("TOTP setup error:", error);
    return NextResponse.json(
      { error: "Failed to generate TOTP" },
      { status: 500 }
    );
  }
}

/**
 * POST — Verify TOTP token and enable 2FA
 * Body: { token: string }
 */
export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, SECRET);
    const userId = payload.id as string;

    const { token: otpToken } = await request.json();
    if (!otpToken) {
      return NextResponse.json({ error: "token required" }, { status: 400 });
    }

    const db = getDb();

    const [user] = await db
      .select({
        email: users.email,
        totpSecret: users.totpSecret,
        totpEnabled: users.totpEnabled,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (user.totpEnabled) {
      return NextResponse.json(
        { error: "2FA is already enabled" },
        { status: 400 }
      );
    }

    if (!user.totpSecret) {
      return NextResponse.json(
        { error: "No TOTP secret found. Call GET first to generate one." },
        { status: 400 }
      );
    }

    // Verify the token
    const totp = new TOTP({
      issuer: "VakayGo",
      label: user.email,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: user.totpSecret,
    });

    const delta = totp.validate({ token: otpToken, window: 1 });

    if (delta === null) {
      return NextResponse.json(
        { error: "Invalid verification code" },
        { status: 400 }
      );
    }

    // Enable 2FA
    await db
      .update(users)
      .set({ totpEnabled: true })
      .where(eq(users.id, userId));

    return NextResponse.json({ enabled: true });
  } catch (error) {
    console.error("TOTP verify error:", error);
    return NextResponse.json(
      { error: "Failed to verify TOTP" },
      { status: 500 }
    );
  }
}
