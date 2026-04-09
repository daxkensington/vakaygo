import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { users } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import twilio from "twilio";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev-secret-change-in-production"
);

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

// In-memory verification codes: key = userId, value = { code, expiresAt }
const verificationCodes = new Map<
  string,
  { code: string; phone: string; expiresAt: number }
>();

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * POST — Send SMS verification code to user's phone
 * Body: { phone: string }
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

    const { phone } = await request.json();
    if (!phone) {
      return NextResponse.json({ error: "phone required" }, { status: 400 });
    }

    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
    const twilioFrom = process.env.TWILIO_PHONE_NUMBER;

    if (!twilioSid || !twilioAuth || !twilioFrom) {
      return NextResponse.json(
        { error: "SMS service unavailable" },
        { status: 503 }
      );
    }

    const code = generateCode();

    // Store code with 5-minute expiry
    verificationCodes.set(userId, {
      code,
      phone,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    // Send SMS via Twilio
    const client = twilio(twilioSid, twilioAuth);
    await client.messages.create({
      body: `Your VakayGo verification code is: ${code}. It expires in 5 minutes.`,
      from: twilioFrom,
      to: phone,
    });

    return NextResponse.json({ sent: true });
  } catch (error) {
    console.error("Phone verify POST error:", error);
    return NextResponse.json(
      { error: "Failed to send verification code" },
      { status: 500 }
    );
  }
}

/**
 * PUT — Verify the code and mark phone as verified
 * Body: { code: string }
 */
export async function PUT(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, SECRET);
    const userId = payload.id as string;

    const { code } = await request.json();
    if (!code) {
      return NextResponse.json({ error: "code required" }, { status: 400 });
    }

    const stored = verificationCodes.get(userId);
    if (!stored) {
      return NextResponse.json(
        { error: "No pending verification. Send a code first." },
        { status: 400 }
      );
    }

    if (stored.expiresAt < Date.now()) {
      verificationCodes.delete(userId);
      return NextResponse.json(
        { error: "Verification code expired" },
        { status: 400 }
      );
    }

    if (stored.code !== code) {
      return NextResponse.json(
        { error: "Invalid verification code" },
        { status: 400 }
      );
    }

    // Mark phone as verified and store the phone number
    const db = getDb();
    await db
      .update(users)
      .set({ phoneVerified: true, phone: stored.phone })
      .where(eq(users.id, userId));

    verificationCodes.delete(userId);

    return NextResponse.json({ verified: true });
  } catch (error) {
    console.error("Phone verify PUT error:", error);
    return NextResponse.json(
      { error: "Failed to verify code" },
      { status: 500 }
    );
  }
}
