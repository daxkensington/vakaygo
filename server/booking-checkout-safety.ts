import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq, isNull, sql } from "drizzle-orm";
import { bookings } from "@/drizzle/schema";
import { expireCheckoutSession, retrieveCheckoutSession, verifyStripePlatformIdentity } from "@/server/stripe";

export async function isBookingCalendarAvailable(bookingId: string): Promise<boolean> {
  const db = drizzle(neon(process.env.DATABASE_URL!));
  const [booking] = await db.select({ datesAvailable: sql<boolean>`vakaygo_booking_dates_available(${bookings.listingId},${bookings.startDate},${bookings.endDate},${bookings.guestCount},${bookings.id})` })
    .from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  return booking?.datesAvailable === true;
}

/** Only expire a persisted booking's own hosted payment link. */
export async function expireBookingCheckout(bookingId: string, sessionId: string): Promise<"closed" | "paid"> {
  const platform = await verifyStripePlatformIdentity();
  const session = await retrieveCheckoutSession(sessionId);
  if (session.id !== sessionId || session.metadata?.bookingId !== bookingId || session.livemode !== (platform.environment === "live")) {
    throw new Error("Checkout booking identity mismatch");
  }
  if (!["open", "complete", "expired"].includes(session.status || "")) throw new Error("Checkout state is unknown; expiry must be retried");
  const markClosed = async () => {
    const db = drizzle(neon(process.env.DATABASE_URL!));
    await db.update(bookings).set({ checkoutExpiresAt: new Date() })
      .where(and(eq(bookings.id, bookingId), eq(bookings.checkoutSessionId, sessionId), isNull(bookings.paidAt)));
  };
  if (session.payment_status === "paid") {
    if (session.status !== "open") await markClosed();
    return "paid";
  }
  if (session.status === "open") {
    await expireCheckoutSession(sessionId);
    const current = await retrieveCheckoutSession(sessionId);
    if (current.id !== sessionId || current.metadata?.bookingId !== bookingId || current.livemode !== session.livemode) throw new Error("Checkout booking identity changed");
    if (current.payment_status === "paid") {
      if (current.status === "complete" || current.status === "expired") await markClosed();
      return "paid";
    }
    if (current.status !== "complete" && current.status !== "expired") throw new Error("Checkout remains open or unknown; expiry must be retried");
  }
  // Mark only this observed closed session. A concurrent replacement or payment
  // must not be rewritten. Failed provider calls leave it eligible for retry.
  await markClosed();
  return "closed";
}

/** Closing eligibility also closes outstanding links; paid history is untouched. */
export async function expireListingPendingCheckouts(listingId: string): Promise<void> {
  const db = drizzle(neon(process.env.DATABASE_URL!));
  const pending = await db.select({ id: bookings.id, checkoutSessionId: bookings.checkoutSessionId })
    .from(bookings).where(and(eq(bookings.listingId, listingId),
      isNull(bookings.paidAt), sql`${bookings.checkoutSessionId} is not null`,
      sql`(${bookings.checkoutExpiresAt} is null or ${bookings.checkoutExpiresAt} > now())`));
  const results = await Promise.allSettled(pending.map(booking =>
    expireBookingCheckout(booking.id, booking.checkoutSessionId!)));
  if (results.some(result => result.status === "rejected")) {
    throw new Error("One or more unavailable booking payment links still need expiry");
  }
}
