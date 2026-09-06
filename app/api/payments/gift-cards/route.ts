import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { giftCards } from "@/drizzle/schema";
import { eq } from "drizzle-orm";

import { logger } from "@/lib/logger";
/**
 * GET — Check gift card balance (public).
 * Query: ?code=VG-XXXX-XXXX-XXXX-XXXX
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code")?.trim().toUpperCase();

    if (!code) {
      return NextResponse.json({ error: "code parameter required" }, { status: 400 });
    }

    const db = drizzle(neon(process.env.DATABASE_URL!));

    const [card] = await db
      .select({
        balance: giftCards.balance,
        amount: giftCards.amount,
        currency: giftCards.currency,
        isActive: giftCards.isActive,
        expiresAt: giftCards.expiresAt,
      })
      .from(giftCards)
      .where(eq(giftCards.code, code))
      .limit(1);

    if (!card) {
      return NextResponse.json({ error: "Gift card not found" }, { status: 404 });
    }

    if (!card.isActive) {
      // Inactive covers both purchaser-deactivated and not-yet-paid cards.
      return NextResponse.json({ error: "This gift card is not active" }, { status: 410 });
    }

    if (card.expiresAt && new Date(card.expiresAt) < new Date()) {
      return NextResponse.json({ error: "This gift card has expired" }, { status: 410 });
    }

    return NextResponse.json({
      balance: parseFloat(card.balance || "0"),
      originalAmount: parseFloat(card.amount || "0"),
      currency: card.currency,
      expiresAt: card.expiresAt,
    });
  } catch (error) {
    logger.error("Gift card balance check error", error);
    return NextResponse.json({ error: "Failed to check balance" }, { status: 500 });
  }
}

/**
 * POST — Purchase a gift card (auth required).
 * Body: { amount, currency?, recipientEmail?, recipientName?, personalMessage? }
 */
export async function POST() { return NextResponse.json({ error: "Gift card purchases are currently unavailable" }, { status: 503 }); }

export async function PUT() { return NextResponse.json({ error: "Please contact bookings@vakaygo.com for gift card assistance" }, { status: 503 }); }
