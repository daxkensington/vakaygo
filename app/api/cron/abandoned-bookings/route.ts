import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { bookings, users, listings, islands } from "@/drizzle/schema";
import { eq, and, isNull, ne, sql } from "drizzle-orm";
import { sendAbandonedBookingRecovery, sendBookingExpired } from "@/server/email";
import { createNotification } from "@/server/notifications";
import { classifyPendingBooking, expiryReason, EXPIRE_AFTER_HOURS } from "@/lib/abandoned-bookings";
import { isUnclaimedOperatorEmail } from "@/lib/booking-request";
import { logger } from "@/lib/logger";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

/**
 * GET — Cron (every 2 h): chase and then close unpaid card bookings.
 *
 *   pending + unpaid, ≥ 2 h old  → one "complete your booking" email
 *                                  (bookings.recoveryEmailSentAt is the claim)
 *   pending + unpaid, ≥ 48 h old
 *     or start date passed       → status=cancelled + reason, traveler emailed,
 *                                  traveler + operator notified in-app
 *
 * The verdict comes from lib/abandoned-bookings.ts (pure, unit-tested);
 * this route only applies it. `requested` bookings are out of scope — a
 * human confirms or declines those. Payments that land after expiry are
 * refunded by the webhook without reopening inventory.
 *
 * Until 2026-09-03 this route only LISTED the candidates and sent nothing.
 *
 * Protected by CRON_SECRET.
 */
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();
    const now = new Date();

    // Every unpaid card booking still pending. This is a small set (tens
    // at most); classification happens in JS so the SQL and the tests
    // cannot disagree about what "abandoned" means.
    const candidates = await db
      .select({
        id: bookings.id,
        bookingNumber: bookings.bookingNumber,
        status: bookings.status,
        paidAt: bookings.paidAt,
        paymentMethod: bookings.paymentMethod,
        totalAmount: bookings.totalAmount,
        createdAt: bookings.createdAt,
        startDate: bookings.startDate,
        recoveryEmailSentAt: bookings.recoveryEmailSentAt,
        travelerId: bookings.travelerId,
        operatorId: bookings.operatorId,
        travelerName: users.name,
        travelerEmail: users.email,
        listingTitle: listings.title,
        listingSlug: listings.slug,
        islandSlug: islands.slug,
        operatorEmail: sql<string | null>`(select email from users o where o.id = ${bookings.operatorId})`,
      })
      .from(bookings)
      .innerJoin(users, eq(bookings.travelerId, users.id))
      .innerJoin(listings, eq(bookings.listingId, listings.id))
      .innerJoin(islands, eq(listings.islandId, islands.id))
      .where(and(eq(bookings.status, "pending"), isNull(bookings.paidAt), ne(bookings.paymentMethod, "none")))
      .limit(500);

    const result = { recovered: [] as string[], expired: [] as string[], waiting: 0, ignored: 0, failed: [] as string[] };

    for (const b of candidates) {
      const verdict = classifyPendingBooking(b, now);
      if (verdict === "wait") { result.waiting++; continue; }
      if (verdict === "ignore") { result.ignored++; continue; }

      const listingUrl = `https://vakaygo.com/${b.islandSlug}/${b.listingSlug}`;

      if (verdict === "recover") {
        // Claim first (compare-and-set on the NULL) so two overlapping
        // runs cannot both email; only the winner sends.
        const claimed = await db
          .update(bookings)
          .set({ recoveryEmailSentAt: now })
          .where(and(eq(bookings.id, b.id), isNull(bookings.recoveryEmailSentAt), eq(bookings.status, "pending")))
          .returning({ id: bookings.id });
        if (claimed.length === 0) continue;
        try {
          await sendAbandonedBookingRecovery({
            to: b.travelerEmail,
            travelerName: b.travelerName || "Traveler",
            listingTitle: b.listingTitle,
            bookingNumber: b.bookingNumber,
            totalAmount: parseFloat(b.totalAmount).toFixed(2),
            paymentUrl: "https://vakaygo.com/bookings",
          });
          result.recovered.push(b.bookingNumber);
        } catch (err) {
          await db.update(bookings).set({ recoveryEmailSentAt: null }).where(and(eq(bookings.id,b.id),eq(bookings.recoveryEmailSentAt,now)));
          logger.error("Abandoned booking recovery email failed", { bookingNumber: b.bookingNumber, err });
          result.failed.push(b.bookingNumber);
        }
        continue;
      }

      // verdict === "expire"
      const closed = await db
        .update(bookings)
        .set({ status: "cancelled", cancellationReason: expiryReason(), updatedAt: now })
        .where(and(eq(bookings.id, b.id), eq(bookings.status, "pending"), isNull(bookings.paidAt)))
        .returning({ id: bookings.id });
      if (closed.length === 0) continue; // paid or moved on since we read it
      result.expired.push(b.bookingNumber);

      try {
        await sendBookingExpired({
          to: b.travelerEmail,
          travelerName: b.travelerName || "Traveler",
          bookingNumber: b.bookingNumber,
          listingTitle: b.listingTitle,
          listingUrl,
          expiresAfterHours: EXPIRE_AFTER_HOURS,
        });
      } catch (err) {
        logger.error("Booking expired email failed", { bookingNumber: b.bookingNumber, err });
        result.failed.push(b.bookingNumber);
      }
      createNotification({
        userId: b.travelerId,
        type: "booking",
        title: `Booking #${b.bookingNumber} expired unpaid`,
        body: `${b.listingTitle} — you were not charged. Book again any time.`,
        link: listingUrl.replace("https://vakaygo.com", ""),
      }).catch(() => {});
      // The operator was told "New booking" at creation; close the loop
      // unless the listing belongs to the placeholder account.
      if (!isUnclaimedOperatorEmail(b.operatorEmail)) {
        createNotification({
          userId: b.operatorId,
          type: "booking",
          title: `Booking #${b.bookingNumber} expired unpaid`,
          body: `${b.listingTitle} — the traveler never completed payment.`,
          link: "/operator/bookings",
        }).catch(() => {});
      }
    }

    if (result.recovered.length || result.expired.length || result.failed.length) {
      logger.info("Abandoned bookings cron", result);
    }

    return NextResponse.json({
      ok: true,
      candidates: candidates.length,
      ...result,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    logger.error("Abandoned bookings cron error", error);
    return NextResponse.json({ error: "Failed to process abandoned bookings" }, { status: 500 });
  }
}
