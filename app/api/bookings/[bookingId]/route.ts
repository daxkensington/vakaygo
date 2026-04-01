import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { bookings, users, listings } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import { sendBookingConfirmation, sendBookingCancellation } from "@/server/email";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev-secret-change-in-production"
);

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
      } catch (emailErr) {
        console.error("Failed to send booking status email:", emailErr);
        // Don't fail the request if email fails
      }
    }

    return NextResponse.json({ booking: { id: updated.id, status: updated.status } });
  } catch (error) {
    console.error("Update booking error:", error);
    return NextResponse.json({ error: "Failed to update booking" }, { status: 500 });
  }
}
