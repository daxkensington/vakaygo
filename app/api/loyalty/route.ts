import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import {
  getUserLoyaltyData,
  getLoyaltyTransactions,
  redeemPoints,
  POINTS_PER_DOLLAR_CREDIT,
  MIN_REDEMPTION_POINTS,
} from "@/server/loyalty";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev-secret-change-in-production"
);

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

// GET: Returns user's points balance, tier, transaction history (paginated)
export async function GET(request: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const filter = searchParams.get("filter") || "all";
    const limit = 20;
    const offset = (page - 1) * limit;

    const [loyaltyData, transactions] = await Promise.all([
      getUserLoyaltyData(userId),
      getLoyaltyTransactions(userId, { limit, offset, filter }),
    ]);

    if (!loyaltyData) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      ...loyaltyData,
      transactions,
      page,
      hasMore: transactions.length === limit,
    });
  } catch (error) {
    console.error("Loyalty GET error:", error);
    return NextResponse.json({ error: "Failed to fetch loyalty data" }, { status: 500 });
  }
}

// POST: Redeem points
export async function POST(request: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { points, bookingId } = await request.json();

    if (!points || typeof points !== "number" || points < MIN_REDEMPTION_POINTS) {
      return NextResponse.json(
        { error: `Minimum redemption is ${MIN_REDEMPTION_POINTS} points` },
        { status: 400 }
      );
    }

    const creditAmount = points / POINTS_PER_DOLLAR_CREDIT;
    const result = await redeemPoints({
      userId,
      points,
      description: `Redeemed ${points} points for $${creditAmount.toFixed(2)} credit`,
      bookingId,
    });

    return NextResponse.json({
      success: true,
      creditAmount: result.creditAmount,
      newBalance: result.newTotal,
      newTier: result.newTier,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to redeem points";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
