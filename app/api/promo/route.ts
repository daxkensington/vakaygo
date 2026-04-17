import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { promoCodes, promoCodeUses } from "@/drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

import { logger } from "@/lib/logger";
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET!);

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

// POST: Validate a promo code
export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) {
      return NextResponse.json({ valid: false, reason: "Please sign in to use promo codes" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, SECRET);
    const userId = payload.id as string;

    const body = await request.json();
    const { code, listingType, islandId, orderAmount } = body;

    if (!code) {
      return NextResponse.json({ valid: false, reason: "Promo code is required" });
    }

    const db = getDb();

    // Find the promo code
    const [promo] = await db
      .select()
      .from(promoCodes)
      .where(eq(promoCodes.code, code.toUpperCase().trim()))
      .limit(1);

    if (!promo) {
      return NextResponse.json({ valid: false, reason: "Invalid promo code" });
    }

    // Check if active
    if (!promo.isActive) {
      return NextResponse.json({ valid: false, reason: "This promo code is no longer active" });
    }

    // Check date range
    const now = new Date();
    if (now < promo.validFrom) {
      return NextResponse.json({ valid: false, reason: "This promo code is not yet valid" });
    }
    if (now > promo.validUntil) {
      return NextResponse.json({ valid: false, reason: "This promo code has expired" });
    }

    // Check max uses
    if (promo.maxUses !== null && (promo.currentUses || 0) >= promo.maxUses) {
      return NextResponse.json({ valid: false, reason: "This promo code has been fully redeemed" });
    }

    // Check per-user limit
    if (promo.maxUsesPerUser) {
      const [userUsage] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(promoCodeUses)
        .where(
          and(
            eq(promoCodeUses.promoCodeId, promo.id),
            eq(promoCodeUses.userId, userId)
          )
        );
      if (userUsage && userUsage.count >= promo.maxUsesPerUser) {
        return NextResponse.json({ valid: false, reason: "You have already used this promo code" });
      }
    }

    // Check applicable listing types
    if (promo.applicableTypes && promo.applicableTypes.length > 0 && listingType) {
      if (!promo.applicableTypes.includes(listingType)) {
        return NextResponse.json({ valid: false, reason: "This promo code does not apply to this type of listing" });
      }
    }

    // Check applicable islands
    if (promo.applicableIslands && promo.applicableIslands.length > 0 && islandId) {
      if (!promo.applicableIslands.includes(Number(islandId))) {
        return NextResponse.json({ valid: false, reason: "This promo code does not apply to this destination" });
      }
    }

    // Check minimum order amount
    if (promo.minOrderAmount && orderAmount) {
      if (parseFloat(String(orderAmount)) < parseFloat(promo.minOrderAmount)) {
        return NextResponse.json({
          valid: false,
          reason: `Minimum order of $${parseFloat(promo.minOrderAmount).toFixed(2)} required`,
        });
      }
    }

    return NextResponse.json({
      valid: true,
      promoId: promo.id,
      code: promo.code,
      discountType: promo.discountType,
      discountValue: promo.discountValue,
      maxDiscount: promo.maxDiscountAmount,
      currency: promo.currency,
      description: promo.description,
    });
  } catch (error) {
    logger.error("Promo validation error", error);
    return NextResponse.json({ valid: false, reason: "Failed to validate promo code" }, { status: 500 });
  }
}
