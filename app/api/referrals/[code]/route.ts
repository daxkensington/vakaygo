import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { users } from "@/drizzle/schema";

import { logger } from "@/lib/logger";
function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

// GET: Validate referral code (used during signup)
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;

    if (!code || code.length < 4) {
      return NextResponse.json({ valid: false, error: "Invalid code" }, { status: 400 });
    }

    const db = getDb();

    const [referrer] = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(eq(users.referralCode, code))
      .limit(1);

    if (!referrer) {
      return NextResponse.json({ valid: false, error: "Referral code not found" });
    }

    // Only show first name for privacy
    const firstName = referrer.name?.split(" ")[0] || "A friend";

    return NextResponse.json({
      valid: true,
      referrerName: firstName,
      reward: 500,
    });
  } catch (error) {
    logger.error("Referral validate error", error);
    return NextResponse.json({ valid: false, error: "Failed to validate code" }, { status: 500 });
  }
}
