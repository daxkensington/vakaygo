import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { bookings, users, listings, islands } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
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

    await jwtVerify(token, SECRET);
    const { bookingId } = await params;
    const { status, operatorNotes } = await request.json();

    const db = drizzle(neon(process.env.DATABASE_URL!));

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (status) updateData.status = status;
    if (operatorNotes) updateData.operatorNotes = operatorNotes;
    if (status === "confirmed") updateData.paidAt = new Date();

    const [updated] = await db
      .update(bookings)
      .set(updateData)
      .where(eq(bookings.id, bookingId))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    // Award loyalty points when booking is completed
    if (status === "completed") {
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
