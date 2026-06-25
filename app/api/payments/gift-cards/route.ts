import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { giftCards } from "@/drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import Stripe from "stripe";

import { logger } from "@/lib/logger";
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET!);

let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    _stripe = new Stripe(key, { apiVersion: "2025-03-31.basil" as Stripe.LatestApiVersion });
  }
  return _stripe;
}

/**
 * Generate a unique 16-character gift card code.
 */
function generateGiftCardCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  let code = "VG-";
  for (let i = 0; i < 4; i++) {
    if (i > 0) code += "-";
    for (let j = 0; j < 4; j++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
  }
  return code; // e.g. VG-AB3K-7HNP-QR2T-WXYZ
}

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
export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Please sign in" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, SECRET);
    const userId = payload.id as string;

    const body = await request.json();
    const { amount, currency, recipientEmail, recipientName, personalMessage } = body;

    if (!amount || amount < 10 || amount > 1000) {
      return NextResponse.json(
        { error: "Amount must be between $10 and $1,000" },
        { status: 400 }
      );
    }

    const cardCurrency = (currency || "usd").toLowerCase();
    const amountCents = Math.round(amount * 100);
    const code = generateGiftCardCode();

    // Create Stripe payment intent for the gift card purchase
    const paymentIntent = await getStripe().paymentIntents.create({
      amount: amountCents,
      currency: cardCurrency,
      metadata: {
        type: "gift_card",
        giftCardCode: code,
        purchaserId: userId,
      },
      automatic_payment_methods: { enabled: true },
    });

    const db = drizzle(neon(process.env.DATABASE_URL!));

    // Set expiry to 1 year from now
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    // SECURITY: the card is created INACTIVE and carries no spendable balance
    // until Stripe confirms the payment. The webhook (payment_intent.succeeded
    // with metadata.type === "gift_card") flips it active. Otherwise anyone
    // could mint a fully-funded gift card by calling this endpoint and never
    // completing the payment.
    await db.insert(giftCards).values({
      code,
      purchaserId: userId,
      recipientEmail: recipientEmail || null,
      recipientName: recipientName || null,
      personalMessage: personalMessage || null,
      amount: amount.toFixed(2),
      balance: amount.toFixed(2),
      currency: cardCurrency,
      isActive: false,
      expiresAt,
    });

    return NextResponse.json({
      code,
      amount,
      currency: cardCurrency,
      expiresAt: expiresAt.toISOString(),
      clientSecret: paymentIntent.client_secret,
    });
  } catch (error) {
    logger.error("Gift card purchase error", error);
    return NextResponse.json({ error: "Failed to create gift card" }, { status: 500 });
  }
}

/**
 * PUT — Redeem gift card (deduct from balance).
 * Body: { code, amount }
 */
export async function PUT(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Please sign in" }, { status: 401 });
    }

    await jwtVerify(token, SECRET);

    const { code, amount } = await request.json();

    if (!code || !amount || amount <= 0) {
      return NextResponse.json({ error: "code and positive amount required" }, { status: 400 });
    }

    const db = drizzle(neon(process.env.DATABASE_URL!));
    const normalizedCode = code.trim().toUpperCase();
    const now = new Date();

    // SECURITY: deduct atomically in a single conditional UPDATE so concurrent
    // redemptions can never double-spend. The database itself enforces
    // active + not-expired + sufficient-balance; zero affected rows means the
    // redemption is not allowed (and we then disambiguate the reason).
    const deducted = await db
      .update(giftCards)
      .set({
        balance: sql`(${giftCards.balance} - ${amount})`,
        isActive: sql`(${giftCards.balance} - ${amount}) > 0`,
      })
      .where(
        and(
          eq(giftCards.code, normalizedCode),
          eq(giftCards.isActive, true),
          sql`${giftCards.balance} >= ${amount}`,
          sql`(${giftCards.expiresAt} IS NULL OR ${giftCards.expiresAt} > ${now})`
        )
      )
      .returning({ balance: giftCards.balance, currency: giftCards.currency });

    if (deducted.length === 0) {
      // Disambiguate the failure for a clear client error.
      const [card] = await db
        .select({
          isActive: giftCards.isActive,
          balance: giftCards.balance,
          expiresAt: giftCards.expiresAt,
        })
        .from(giftCards)
        .where(eq(giftCards.code, normalizedCode))
        .limit(1);

      if (!card) {
        return NextResponse.json({ error: "Gift card not found" }, { status: 404 });
      }
      if (!card.isActive) {
        return NextResponse.json(
          { error: "This gift card is not active" },
          { status: 410 }
        );
      }
      if (card.expiresAt && new Date(card.expiresAt) < now) {
        return NextResponse.json({ error: "This gift card has expired" }, { status: 410 });
      }
      return NextResponse.json(
        { error: "Insufficient balance", balance: parseFloat(card.balance || "0") },
        { status: 422 }
      );
    }

    const remaining = parseFloat(deducted[0].balance || "0");

    return NextResponse.json({
      success: true,
      deducted: amount,
      remaining,
      currency: deducted[0].currency,
    });
  } catch (error) {
    logger.error("Gift card redeem error", error);
    return NextResponse.json({ error: "Failed to redeem gift card" }, { status: 500 });
  }
}
