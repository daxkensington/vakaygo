import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { users, referrals } from "@/drizzle/schema";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import { generateReferralCode, getReferralStats } from "@/server/loyalty";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev-secret-change-in-production"
);

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

async function getAuthUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload.id as string;
  } catch {
    return null;
  }
}

// GET: Returns user's referral code and referral stats
export async function GET() {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();

    const [user] = await db
      .select({ referralCode: users.referralCode })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const stats = await getReferralStats(userId);

    return NextResponse.json({
      referralCode: user.referralCode,
      referralLink: user.referralCode
        ? `https://vakaygo.com/join/${user.referralCode}`
        : null,
      stats,
    });
  } catch (error) {
    console.error("Referrals GET error:", error);
    return NextResponse.json({ error: "Failed to fetch referral data" }, { status: 500 });
  }
}

// POST: Generate referral code if user doesn't have one
export async function POST() {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();

    const [user] = await db
      .select({ referralCode: users.referralCode })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (user.referralCode) {
      return NextResponse.json({
        referralCode: user.referralCode,
        referralLink: `https://vakaygo.com/join/${user.referralCode}`,
      });
    }

    // Generate a unique code
    let code = generateReferralCode();
    let attempts = 0;
    while (attempts < 5) {
      const [existing] = await db
        .select({ id: referrals.id })
        .from(referrals)
        .where(eq(referrals.code, code))
        .limit(1);

      if (!existing) break;
      code = generateReferralCode();
      attempts++;
    }

    await db
      .update(users)
      .set({ referralCode: code, updatedAt: new Date() })
      .where(eq(users.id, userId));

    return NextResponse.json({
      referralCode: code,
      referralLink: `https://vakaygo.com/join/${code}`,
    });
  } catch (error) {
    console.error("Referrals POST error:", error);
    return NextResponse.json({ error: "Failed to generate referral code" }, { status: 500 });
  }
}
