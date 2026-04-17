import { NextResponse } from "next/server";
import { awardBookingPoints, awardReviewPoints } from "@/server/loyalty";

import { logger } from "@/lib/logger";
// POST: Internal endpoint to award points (called from server-side code)
// Protected by internal secret — not for direct client use
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("x-internal-secret");
    const internalSecret = process.env.AUTH_SECRET!;

    if (authHeader !== internalSecret) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { type, userId, bookingId, totalAmount } = await request.json();

    if (!userId || !type) {
      return NextResponse.json({ error: "userId and type are required" }, { status: 400 });
    }

    switch (type) {
      case "booking":
        if (!bookingId || !totalAmount) {
          return NextResponse.json({ error: "bookingId and totalAmount required for booking" }, { status: 400 });
        }
        await awardBookingPoints(userId, bookingId, totalAmount);
        break;

      case "review":
        if (!bookingId) {
          return NextResponse.json({ error: "bookingId required for review" }, { status: 400 });
        }
        await awardReviewPoints(userId, bookingId);
        break;

      default:
        return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Loyalty earn error", error);
    return NextResponse.json({ error: "Failed to award points" }, { status: 500 });
  }
}
