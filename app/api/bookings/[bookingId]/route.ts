import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { bookings, users, listings, islands } from "@/drizzle/schema";
import { eq, and, ne } from "drizzle-orm";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import { sendBookingConfirmation, sendBookingCancellation } from "@/server/email";
import { createNotification } from "@/server/notifications";
import { awardBookingPoints } from "@/server/loyalty";

import { logger } from "@/lib/logger";
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET!);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, SECRET);
    const userId = payload.id as string;
    const role = payload.role as string;
    const { bookingId } = await params;

    const db = drizzle(neon(process.env.DATABASE_URL!));

    const [row] = await db
      .select({
        id: bookings.id,
        bookingNumber: bookings.bookingNumber,
        status: bookings.status,
        startDate: bookings.startDate,
        endDate: bookings.endDate,
        guestCount: bookings.guestCount,
        subtotal: bookings.subtotal,
        serviceFee: bookings.serviceFee,
        totalAmount: bookings.totalAmount,
        currency: bookings.currency,
        paymentMethod: bookings.paymentMethod,
        paidAt: bookings.paidAt,
        guestNotes: bookings.guestNotes,
        operatorNotes: bookings.operatorNotes,
        cancellationReason: bookings.cancellationReason,
        checkedIn: bookings.checkedIn,
        checkedInAt: bookings.checkedInAt,
        depositAmount: bookings.depositAmount,
        depositPaid: bookings.depositPaid,
        escrowReleased: bookings.escrowReleased,
        escrowReleasedAt: bookings.escrowReleasedAt,
        createdAt: bookings.createdAt,
        travelerId: bookings.travelerId,
        operatorId: bookings.operatorId,
        travelerName: users.name,
        travelerEmail: users.email,
        travelerPhone: users.phone,
        listingId: bookings.listingId,
        listingTitle: listings.title,
        listingType: listings.type,
        listingSlug: listings.slug,
        islandSlug: islands.slug,
        islandName: islands.name,
      })
      .from(bookings)
      .innerJoin(users, eq(bookings.travelerId, users.id))
      .innerJoin(listings, eq(bookings.listingId, listings.id))
      .innerJoin(islands, eq(listings.islandId, islands.id))
      .where(eq(bookings.id, bookingId))
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    const isOwner = row.travelerId === userId || row.operatorId === userId;
    if (!isOwner && role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ booking: row });
  } catch (error) {
    logger.error("Get booking error", error);
    return NextResponse.json({ error: "Failed to fetch booking" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, SECRET);
    const userId = payload.id as string;
    const role = payload.role as string;
    const { bookingId } = await params;
    const { status, operatorNotes } = await request.json();

    const db = drizzle(neon(process.env.DATABASE_URL!));

    const [existing] = await db
      .select({
        id: bookings.id,
        status: bookings.status,
        travelerId: bookings.travelerId,
        operatorId: bookings.operatorId,
        paymentId: bookings.paymentId,
        paidAt: bookings.paidAt,
      })
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    const isTraveler = existing.travelerId === userId;
    const isOperator = existing.operatorId === userId;
    const isAdmin = role === "admin";
    if (!isTraveler && !isOperator && !isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Travelers can only cancel their own booking; status transitions and
    // operatorNotes are for operators/admins.
    if (isTraveler && !isOperator && !isAdmin) {
      if (status && status !== "cancelled") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (operatorNotes !== undefined) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // "confirmed" AND "completed" both imply the booking was PAID. Without
    // this gate an operator could move a never-paid booking straight to
    // "completed", which the escrow-release + payouts crons then turn into a
    // real payout-ledger credit. Only allow these transitions once payment
    // is on record (the webhook stamps paymentId + paidAt).
    if (
      (status === "confirmed" || status === "completed") &&
      !(existing.paymentId && existing.paidAt)
    ) {
      return NextResponse.json(
        { error: "A booking can only be confirmed or completed after payment is received" },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (status) updateData.status = status;
    if (operatorNotes !== undefined) updateData.operatorNotes = operatorNotes;

    // Make the transition INTO "completed" atomic: guard the UPDATE on the row
    // not already being completed, so concurrent PATCHes produce exactly one
    // winner and loyalty points are awarded once (no check-then-act race).
    const isCompleting = status === "completed";
    const whereClause = isCompleting
      ? and(eq(bookings.id, bookingId), ne(bookings.status, "completed"))
      : eq(bookings.id, bookingId);

    const [updated] = await db
      .update(bookings)
      .set(updateData)
      .where(whereClause)
      .returning();

    if (!updated) {
      if (isCompleting) {
        // Lost the race (already completed) — idempotent success, no re-award.
        return NextResponse.json({ booking: { id: bookingId, status: "completed" } });
      }
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    // Award loyalty points only when THIS request performed the transition into
    // "completed". awardBookingPoints is also idempotent per booking as a
    // second line of defense. Payment is already guaranteed by the gate above.
    if (isCompleting) {
      try {
        const totalAmount = parseFloat(updated.totalAmount);
        awardBookingPoints(updated.travelerId, updated.id, totalAmount).catch((err) => {
          logger.error("Failed to award booking points", err);
        });
      } catch (loyaltyErr) {
        logger.error("Loyalty error", loyaltyErr);
      }
    }

    // Send email notifications on status change
    if (status === "confirmed" || status === "cancelled") {
      try {
        const [traveler] = await db
          .select({ email: users.email, name: users.name })
          .from(users)
          .where(eq(users.id, updated.travelerId));

        const [listing] = await db
          .select({ title: listings.title })
          .from(listings)
          .where(eq(listings.id, updated.listingId));

        if (traveler?.email) {
          if (status === "confirmed") {
            await sendBookingConfirmation({
              to: traveler.email,
              travelerName: traveler.name || "Traveler",
              bookingNumber: updated.bookingNumber,
              listingTitle: listing?.title || "Your booking",
              startDate: updated.startDate.toISOString(),
              guestCount: updated.guestCount || 1,
              totalAmount: updated.totalAmount,
            });
          } else if (status === "cancelled") {
            await sendBookingCancellation({
              to: traveler.email,
              travelerName: traveler.name || "Traveler",
              bookingNumber: updated.bookingNumber,
              listingTitle: listing?.title || "Your booking",
              reason: updated.cancellationReason || undefined,
            });
          }
        }
        // In-app notification to traveler about booking status change
        const statusLabel = status === "confirmed" ? "confirmed" : "cancelled";
        createNotification({
          userId: updated.travelerId,
          type: "booking",
          title: `Booking ${statusLabel}: ${listing?.title || "your booking"}`,
          body: `Your booking ${updated.bookingNumber} has been ${statusLabel}.`,
          link: "/bookings",
        }).catch(() => {});
      } catch (emailErr) {
        logger.error("Failed to send booking status email", emailErr);
        // Don't fail the request if email fails
      }
    }

    return NextResponse.json({ booking: { id: updated.id, status: updated.status } });
  } catch (error) {
    logger.error("Update booking error", error);
    return NextResponse.json({ error: "Failed to update booking" }, { status: 500 });
  }
}
