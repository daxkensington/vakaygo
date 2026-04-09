import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { payouts, taxDocuments, users } from "@/drizzle/schema";
import { eq, and, gte, lt, sql } from "drizzle-orm";

/**
 * GET — Annual tax document generation cron.
 * Runs once a year on January 15 at 8 AM UTC.
 * Aggregates all payouts from the previous calendar year for each operator
 * and inserts a tax document summary row.
 *
 * Protected by CRON_SECRET.
 */
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = drizzle(neon(process.env.DATABASE_URL!));

    // Previous calendar year
    const now = new Date();
    const targetYear = now.getFullYear() - 1;
    const yearStart = new Date(Date.UTC(targetYear, 0, 1)); // Jan 1
    const yearEnd = new Date(Date.UTC(targetYear + 1, 0, 1)); // Jan 1 next year

    // Get all operators who had payouts in the target year
    const operatorPayouts = await db
      .select({
        operatorId: payouts.operatorId,
        totalEarnings: sql<string>`SUM(${payouts.amount})`,
        totalBookings: sql<number>`SUM(${payouts.bookingCount})`,
        payoutCount: sql<number>`COUNT(*)`,
      })
      .from(payouts)
      .where(
        and(
          eq(payouts.status, "completed"),
          gte(payouts.paidAt, yearStart),
          lt(payouts.paidAt, yearEnd)
        )
      )
      .groupBy(payouts.operatorId);

    const results: Array<{
      operatorId: string;
      status: string;
      totalEarnings?: number;
      totalBookings?: number;
      error?: string;
    }> = [];

    for (const op of operatorPayouts) {
      try {
        const earnings = parseFloat(op.totalEarnings || "0");
        const bookingCount = op.totalBookings || 0;

        // Check if a document already exists for this operator + year
        const [existing] = await db
          .select({ id: taxDocuments.id })
          .from(taxDocuments)
          .where(
            and(
              eq(taxDocuments.operatorId, op.operatorId),
              eq(taxDocuments.year, targetYear)
            )
          )
          .limit(1);

        if (existing) {
          results.push({
            operatorId: op.operatorId,
            status: "skipped",
            error: `Tax document already exists for ${targetYear}`,
          });
          continue;
        }

        await db.insert(taxDocuments).values({
          operatorId: op.operatorId,
          year: targetYear,
          totalEarnings: earnings.toFixed(2),
          totalBookings: bookingCount,
          totalPayouts: earnings.toFixed(2),
        });

        results.push({
          operatorId: op.operatorId,
          status: "success",
          totalEarnings: earnings,
          totalBookings: bookingCount,
        });
      } catch (err) {
        results.push({
          operatorId: op.operatorId,
          status: "error",
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    return NextResponse.json({
      year: targetYear,
      generated: results.filter((r) => r.status === "success").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      failed: results.filter((r) => r.status === "error").length,
      total: operatorPayouts.length,
      results,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error("Tax document cron error:", error);
    return NextResponse.json({ error: "Tax document generation failed" }, { status: 500 });
  }
}
