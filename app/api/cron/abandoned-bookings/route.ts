import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { bookings, users, listings, islands } from "@/drizzle/schema";
import { eq, and, isNull, lte, ne, sql } from "drizzle-orm";
import { sendAbandonedBookingRecovery } from "@/server/email";
import { createNotification } from "@/server/notifications";
import { classifyPendingBooking, expiryReason } from "@/lib/abandoned-bookings";
import { classifyRequestedBooking, requestExpiryReason, REQUEST_EXPIRY_FLAG } from "@/lib/booking-request-expiry";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { checkRecipientSendingWindow } from "@/lib/outreach-timezone";
import { isUnclaimedOperatorEmail } from "@/lib/booking-request";
import { logger } from "@/lib/logger";
import { getListingBookingEligibility } from "@/server/business-onboarding";

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
 * this route only applies it. Payments that land after expiry are
 * refunded by the webhook without reopening inventory.
 *
 *   requested + unpaid, start date passed → status=cancelled + reason, traveler
 *                                  notified in-app; the status change queues the
 *                                  cancellation email. Only while the feature flag
 *                                  `booking_request_expiry_enabled` is on (it is
 *                                  absent, so off, until someone enables it);
 *                                  lib/booking-request-expiry.ts decides.
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
        listingId: bookings.listingId,
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
        const eligibility = await getListingBookingEligibility(b.listingId, { refreshProvider: true });
        if (!eligibility.eligible || eligibility.operatorId !== b.operatorId) {
          result.ignored++;
          continue;
        }
        // Respect recipient local daytime business hours (08:30–19:30) before sending recovery nudge
        const windowCheck = checkRecipientSendingWindow({
          islandSlug: b.islandSlug,
          email: b.travelerEmail,
        }, now);
        if (!windowCheck.allowed) {
          result.waiting++;
          continue;
        }
        // Claim first (compare-and-set on the NULL) so two overlapping
        // runs cannot both email; only the winner sends.
        const claimed = await db
          .update(bookings)
          .set({ recoveryEmailSentAt: now })
          .where(and(eq(bookings.id, b.id), isNull(bookings.recoveryEmailSentAt), eq(bookings.status, "pending"), sql`vakaygo_listing_bookable(${bookings.listingId})`))
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

      // The status change atomically queued cancellation mail in the outbox.
      createNotification({
        userId: b.travelerId,
        type: "booking",
        title: `Booking #${b.bookingNumber} expired unpaid`,
        body: `${b.listingTitle} — you were not charged.`,
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

    // Requests nobody answered before their date. Off unless the flag is on.
    const requestsExpired: string[] = [];
    if (await isFeatureEnabled(REQUEST_EXPIRY_FLAG)) {
      const requests = await db
        .select({
          id: bookings.id,
          bookingNumber: bookings.bookingNumber,
          status: bookings.status,
          paidAt: bookings.paidAt,
          startDate: bookings.startDate,
          travelerId: bookings.travelerId,
          listingTitle: listings.title,
          listingSlug: listings.slug,
          islandSlug: islands.slug,
        })
        .from(bookings)
        .innerJoin(listings, eq(bookings.listingId, listings.id))
        .innerJoin(islands, eq(listings.islandId, islands.id))
        .where(and(eq(bookings.status, "requested"), isNull(bookings.paidAt), lte(bookings.startDate, now)))
        .limit(200);
      for (const r of requests) {
        if (classifyRequestedBooking(r, now) !== "expired") continue;
        const closed = await db
          .update(bookings)
          .set({ status: "cancelled", cancellationReason: requestExpiryReason(), updatedAt: now })
          .where(and(eq(bookings.id, r.id), eq(bookings.status, "requested"), isNull(bookings.paidAt)))
          .returning({ id: bookings.id });
        if (closed.length === 0) continue; // answered since we read it
        requestsExpired.push(r.bookingNumber);
        createNotification({
          userId: r.travelerId,
          type: "booking",
          title: `Request #${r.bookingNumber} was not confirmed`,
          body: `${r.listingTitle} — the business did not confirm before the date. You were not charged.`,
          link: `/${r.islandSlug}/${r.listingSlug}`,
        }).catch(() => {});
      }
    }

    if (result.recovered.length || result.expired.length || result.failed.length || requestsExpired.length) {
      logger.info("Abandoned bookings cron", { ...result, requestsExpired });
    }

    return NextResponse.json({
      ok: true,
      candidates: candidates.length,
      ...result,
      requestsExpired,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    logger.error("Abandoned bookings cron error", error);
    return NextResponse.json({ error: "Failed to process abandoned bookings" }, { status: 500 });
  }
}
