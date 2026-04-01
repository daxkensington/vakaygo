import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { bookings, payouts, listings } from "@/drizzle/schema";
import { eq, and, sql, desc } from "drizzle-orm";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev-secret-change-in-production"
);

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, SECRET);
    const userId = payload.id as string;

    const db = drizzle(neon(process.env.DATABASE_URL!));

    // Total earned from completed bookings
    const [totalEarnedResult] = await db
      .select({
        total: sql<string>`coalesce(sum(${bookings.totalAmount}), 0)`,
      })
      .from(bookings)
      .where(
        and(eq(bookings.operatorId, userId), eq(bookings.status, "completed"))
      );

    // Pending amount from confirmed (not yet completed) bookings
    const [pendingResult] = await db
      .select({
        total: sql<string>`coalesce(sum(${bookings.totalAmount}), 0)`,
      })
      .from(bookings)
      .where(
        and(eq(bookings.operatorId, userId), eq(bookings.status, "confirmed"))
      );

    // Total paid out
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

    const totalEarned = parseFloat(totalEarnedResult.total) || 0;
    const totalPaidOut = parseFloat(paidOutResult.total) || 0;
    const availableBalance = totalEarned - totalPaidOut;
    const pendingAmount = parseFloat(pendingResult.total) || 0;

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
        const fee = parseFloat(e.serviceFee || "0");
        return {
          bookingNumber: e.bookingNumber,
          listingTitle: e.listingTitle,
          totalAmount: gross,
          serviceFee: fee,
          netAmount: gross - fee,
          completedAt: e.updatedAt,
        };
      }),
    });
  } catch (error) {
    console.error("Operator payouts error:", error);
    return NextResponse.json(
      { error: "Failed to load payouts" },
      { status: 500 }
    );
  }
}
