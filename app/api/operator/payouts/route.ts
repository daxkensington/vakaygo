import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { bookings, payouts, listings } from "@/drizzle/schema";
import { eq, and, sql, desc } from "drizzle-orm";

import { logger } from "@/lib/logger";
import { requireOperator } from "@/server/admin-auth";
import { CATEGORY_RATES } from "@/lib/pricing";
export async function GET() {
  try {
    const __auth = await requireOperator();
    if (!__auth.ok) return __auth.error;
    const userId = __auth.userId;

    const db = drizzle(neon(process.env.DATABASE_URL!));

    // Operator earnings are NET: subtotal minus the type-specific
    // commission (lib/pricing.ts) — what actually lands in their Stripe
    // account via the destination charge. The old version showed gross
    // totalAmount (which includes the traveler service fee).
    const netEarnings = (rows: { subtotal: string | null; listingType: string }[]) =>
      rows.reduce((sum, r) => {
        const rates = CATEGORY_RATES[r.listingType] || CATEGORY_RATES.tour;
        const subtotal = parseFloat(r.subtotal || "0");
        return sum + subtotal * (1 - rates.operatorFee);
      }, 0);

    const completedRows = await db
      .select({ subtotal: bookings.subtotal, listingType: listings.type })
      .from(bookings)
      .innerJoin(listings, eq(bookings.listingId, listings.id))
      .where(
        and(eq(bookings.operatorId, userId), eq(bookings.status, "completed"))
      );

    const confirmedRows = await db
      .select({ subtotal: bookings.subtotal, listingType: listings.type })
      .from(bookings)
      .innerJoin(listings, eq(bookings.listingId, listings.id))
      .where(
        and(eq(bookings.operatorId, userId), eq(bookings.status, "confirmed"))
      );

    // Total recorded on payout ledger entries
    const [paidOutResult] = await db
      .select({
        total: sql<string>`coalesce(sum(${payouts.amount}), 0)`,
      })
      .from(payouts)
      .where(
        and(
          eq(payouts.operatorId, userId),
          eq(payouts.status, "completed")
        )
      );

    const totalEarned = Math.round(netEarnings(completedRows) * 100) / 100;
    const totalPaidOut = parseFloat(paidOutResult.total) || 0;
    const availableBalance = Math.round((totalEarned - totalPaidOut) * 100) / 100;
    const pendingAmount = Math.round(netEarnings(confirmedRows) * 100) / 100;

    // Payout history
    const payoutHistory = await db
      .select({
        id: payouts.id,
        amount: payouts.amount,
        status: payouts.status,
        periodStart: payouts.periodStart,
        periodEnd: payouts.periodEnd,
        bookingCount: payouts.bookingCount,
        paidAt: payouts.paidAt,
        createdAt: payouts.createdAt,
      })
      .from(payouts)
      .where(eq(payouts.operatorId, userId))
      .orderBy(desc(payouts.createdAt))
      .limit(20);

    // Recent completed bookings (earnings detail)
    const recentEarnings = await db
      .select({
        bookingNumber: bookings.bookingNumber,
        listingTitle: listings.title,
        listingType: listings.type,
        totalAmount: bookings.totalAmount,
        serviceFee: bookings.serviceFee,
        subtotal: bookings.subtotal,
        updatedAt: bookings.updatedAt,
      })
      .from(bookings)
      .innerJoin(listings, eq(bookings.listingId, listings.id))
      .where(
        and(eq(bookings.operatorId, userId), eq(bookings.status, "completed"))
      )
      .orderBy(desc(bookings.updatedAt))
      .limit(10);

    return NextResponse.json({
      availableBalance,
      totalEarned,
      pendingAmount,
      payouts: payoutHistory.map((p) => ({
        ...p,
        amount: parseFloat(p.amount),
      })),
      recentEarnings: recentEarnings.map((e) => {
        const gross = parseFloat(e.totalAmount);
        const rates = CATEGORY_RATES[e.listingType] || CATEGORY_RATES.tour;
        const subtotal = parseFloat(e.subtotal || "0");
        return {
          bookingNumber: e.bookingNumber,
          listingTitle: e.listingTitle,
          totalAmount: gross,
          serviceFee: parseFloat(e.serviceFee || "0"),
          netAmount: Math.round(subtotal * (1 - rates.operatorFee) * 100) / 100,
          completedAt: e.updatedAt,
        };
      }),
    });
  } catch (error) {
    logger.error("Operator payouts error", error);
    return NextResponse.json(
      { error: "Failed to load payouts" },
      { status: 500 }
    );
  }
}
