import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { disputes, bookings, users } from "@/drizzle/schema";
import { eq, and, desc, or } from "drizzle-orm";
import { createNotification } from "@/server/notifications";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

import { logger } from "@/lib/logger";
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET!);

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

const VALID_REASONS = [
  "no_show",
  "poor_quality",
  "wrong_listing",
  "overcharged",
  "safety_concern",
  "other",
];

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, SECRET);
    const userId = payload.id as string;
    const role = payload.role as string;

    const db = getDb();

    const results = await db
      .select({
        id: disputes.id,
        bookingId: disputes.bookingId,
        status: disputes.status,
        reason: disputes.reason,
        description: disputes.description,
        resolution: disputes.resolution,
        createdAt: disputes.createdAt,
        updatedAt: disputes.updatedAt,
        bookingNumber: bookings.bookingNumber,
        travelerName: users.name,
        travelerEmail: users.email,
      })
      .from(disputes)
      .innerJoin(bookings, eq(disputes.bookingId, bookings.id))
      .innerJoin(users, eq(disputes.filedBy, users.id))
      .where(
        role === "admin"
          ? undefined
          : eq(disputes.filedBy, userId)
      )
      .orderBy(desc(disputes.createdAt));

    return NextResponse.json({ disputes: results });
  } catch (error) {
    logger.error("Get disputes error", error);
    return NextResponse.json(
      { error: "Failed to fetch disputes" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) {
      return NextResponse.json(
        { error: "Please sign in to file a dispute" },
        { status: 401 }
      );
    }

    const { payload } = await jwtVerify(token, SECRET);
    const userId = payload.id as string;

    const body = await request.json();
    const { bookingId, reason, description } = body;

    if (!bookingId || !reason || !description) {
      return NextResponse.json(
        { error: "Booking, reason, and description are required" },
        { status: 400 }
      );
    }

    if (!VALID_REASONS.includes(reason)) {
      return NextResponse.json(
        { error: "Invalid dispute reason" },
        { status: 400 }
      );
    }

    if (description.trim().length < 20) {
      return NextResponse.json(
        { error: "Description must be at least 20 characters" },
        { status: 400 }
      );
    }

    const db = getDb();

    // Verify booking belongs to user and is in valid status
    const [booking] = await db
      .select({
        id: bookings.id,
        travelerId: bookings.travelerId,
        operatorId: bookings.operatorId,
        status: bookings.status,
        bookingNumber: bookings.bookingNumber,
      })
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1);

    if (!booking) {
      return NextResponse.json(
        { error: "Booking not found" },
        { status: 404 }
      );
    }

    if (booking.travelerId !== userId) {
      return NextResponse.json(
        { error: "You can only file disputes for your own bookings" },
        { status: 403 }
      );
    }

    if (!["completed", "confirmed"].includes(booking.status)) {
      return NextResponse.json(
        { error: "Disputes can only be filed for confirmed or completed bookings" },
        { status: 400 }
      );
    }

    // Check for existing open dispute on this booking
    const [existingDispute] = await db
      .select({ id: disputes.id })
      .from(disputes)
      .where(
        and(
          eq(disputes.bookingId, bookingId),
          or(
            eq(disputes.status, "open"),
            eq(disputes.status, "under_review")
          )
        )
      )
      .limit(1);

    if (existingDispute) {
      return NextResponse.json(
        { error: "An active dispute already exists for this booking" },
        { status: 409 }
      );
    }

    // Create dispute
    const [dispute] = await db
      .insert(disputes)
      .values({
        bookingId,
        filedBy: userId,
        operatorId: booking.operatorId,
        reason,
        description: description.trim(),
      })
      .returning({
        id: disputes.id,
        status: disputes.status,
        reason: disputes.reason,
        createdAt: disputes.createdAt,
      });

    // Notify admins
    const admins = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, "admin"));

    for (const admin of admins) {
      createNotification({
        userId: admin.id,
        type: "system",
        title: `New dispute filed for booking #${booking.bookingNumber}`,
        body: `Reason: ${reason.replace(/_/g, " ")}`,
        link: "/admin/disputes",
      }).catch(() => {});
    }

    return NextResponse.json({ dispute }, { status: 201 });
  } catch (error) {
    logger.error("Create dispute error", error);
    return NextResponse.json(
      { error: "Failed to create dispute" },
      { status: 500 }
    );
  }
}
