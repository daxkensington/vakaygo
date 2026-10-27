import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { bookings, payouts, listings } from "@/drizzle/schema";
import { eq, and, desc } from "drizzle-orm";

import { logger } from "@/lib/logger";
import { requireOperator } from "@/server/admin-auth";
import { getOperatorPayoutListings } from "@/server/payout-profiles";
export async function GET() {
  try {
    const __auth = await requireOperator();
    if (!__auth.ok) return __auth.error;
    const userId = __auth.userId;

    const db = drizzle(neon(process.env.DATABASE_URL!));

    // Checkout records earnings after discounts. Never reprice historical
    // bookings using today's category rates or infer missing legacy earnings.
    const recordedEarnings = (rows: { operatorEarningsCents: number | null }[]) =>
      rows.some((row) => row.operatorEarningsCents === null)
        ? null
        : rows.reduce((sum, row) => sum + row.operatorEarningsCents!, 0) / 100;

    const completedRows = await db
      .select({ operatorEarningsCents: bookings.operatorEarningsCents, currency: bookings.currency })
      .from(bookings)
      .where(
        and(eq(bookings.operatorId, userId), eq(bookings.status, "completed"))
      );

    const confirmedRows = await db
      .select({ operatorEarningsCents: bookings.operatorEarningsCents, currency: bookings.currency })
      .from(bookings)
      .where(
        and(eq(bookings.operatorId, userId), eq(bookings.status, "confirmed"))
      );

    // Total recorded on payout ledger entries
    const paidOutRows = await db
      .select({
        amount: payouts.amount,
        currency: payouts.currency,
      })
      .from(payouts)
      .where(
        and(
          eq(payouts.operatorId, userId),
          eq(payouts.status, "completed")
        )
      );

    const summaryRows = [...completedRows, ...confirmedRows, ...paidOutRows];
    const currencies = new Set(summaryRows.map((row) => row.currency?.toUpperCase()));
    const currencyReviewRequired = [...currencies].some((currency) => !currency || !/^[A-Z]{3}$/.test(currency)) || currencies.size > 1;
    // With no monetary records there is no currency to infer or convert.
    const summaryCurrency = currencyReviewRequired ? null : [...currencies][0] ?? null;
    const totalEarned = currencyReviewRequired ? null : recordedEarnings(completedRows);
    const pendingAmount = currencyReviewRequired ? null : recordedEarnings(confirmedRows);
    const totalPaidOutCents = paidOutRows.reduce((sum, row) => sum + Math.round(Number(row.amount) * 100), 0);
    const availableBalance = totalEarned === null ? null : Math.round(totalEarned * 100 - totalPaidOutCents) / 100;

    // Payout history
    const payoutHistory = await db
      .select({
        id: payouts.id,
        amount: payouts.amount,
        currency: payouts.currency,
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
        totalAmount: bookings.totalAmount,
        serviceFee: bookings.serviceFee,
        operatorEarningsCents: bookings.operatorEarningsCents,
        currency: bookings.currency,
        updatedAt: bookings.updatedAt,
      })
      .from(bookings)
      .innerJoin(listings, eq(bookings.listingId, listings.id))
      .where(
        and(eq(bookings.operatorId, userId), eq(bookings.status, "completed"))
      )
      .orderBy(desc(bookings.updatedAt))
      .limit(10);

    let operatorListings: Awaited<ReturnType<typeof getOperatorPayoutListings>> = [];
    try {
      operatorListings = await getOperatorPayoutListings(userId);
    } catch {
      operatorListings = [];
    }

    return NextResponse.json({
      availableBalance,
      totalEarned,
      pendingAmount,
      summaryCurrency,
      currencyReviewRequired,
      missingEarnings: {
        completed: completedRows.filter((row) => row.operatorEarningsCents === null).length,
        confirmed: confirmedRows.filter((row) => row.operatorEarningsCents === null).length,
      },
      listings: operatorListings,
      payouts: payoutHistory.map((p) => ({
        ...p,
        amount: parseFloat(p.amount),
      })),
      recentEarnings: recentEarnings.map((e) => {
        const gross = parseFloat(e.totalAmount);
        return {
          bookingNumber: e.bookingNumber,
          listingTitle: e.listingTitle,
          totalAmount: gross,
          serviceFee: parseFloat(e.serviceFee || "0"),
          netAmount: e.operatorEarningsCents === null ? null : e.operatorEarningsCents / 100,
          currency: e.currency,
          completedAt: e.updatedAt,
        };
      }),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    logger.error("Operator payouts error", error);
    return NextResponse.json(
      { error: "Failed to load payouts" },
      { status: 500 }
    );
  }
}
