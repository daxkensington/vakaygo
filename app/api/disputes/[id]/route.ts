import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { disputes, bookings, users, listings } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { createNotification } from "@/server/notifications";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import { Resend } from "resend";

import { logger } from "@/lib/logger";
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET!);

const resend = new Resend(
  process.env.RESEND_API_KEY || "re_9veHwfmR_EfQt6FpKGS8MwUJgJcejmPDz"
);

const FROM = "VakayGo <hello@vakaygo.com>";

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
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

    const { id } = await params;
    const db = getDb();

    const [dispute] = await db
      .select({
        id: disputes.id,
        bookingId: disputes.bookingId,
        filedBy: disputes.filedBy,
        operatorId: disputes.operatorId,
        status: disputes.status,
        reason: disputes.reason,
        description: disputes.description,
        adminNotes: disputes.adminNotes,
        resolution: disputes.resolution,
        resolvedAt: disputes.resolvedAt,
        createdAt: disputes.createdAt,
        updatedAt: disputes.updatedAt,
        // Booking info
        bookingNumber: bookings.bookingNumber,
        bookingStatus: bookings.status,
        startDate: bookings.startDate,
        totalAmount: bookings.totalAmount,
        guestCount: bookings.guestCount,
        listingId: bookings.listingId,
      })
      .from(disputes)
      .innerJoin(bookings, eq(disputes.bookingId, bookings.id))
      .where(eq(disputes.id, id))
      .limit(1);

    if (!dispute) {
      return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
    }

    // Non-admins can only see their own disputes
    if (role !== "admin" && dispute.filedBy !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Fetch traveler, operator, and listing info
    const [traveler] = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, dispute.filedBy))
      .limit(1);

    const [operator] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        businessName: users.businessName,
      })
      .from(users)
      .where(eq(users.id, dispute.operatorId))
      .limit(1);

    const [listing] = await db
      .select({ title: listings.title, type: listings.type })
      .from(listings)
      .where(eq(listings.id, dispute.listingId))
      .limit(1);

    return NextResponse.json({
      dispute: {
        ...dispute,
        traveler,
        operator,
        listing,
      },
    });
  } catch (error) {
    logger.error("Get dispute error", error);
    return NextResponse.json(
      { error: "Failed to fetch dispute" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
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

    if (role !== "admin") {
      return NextResponse.json(
        { error: "Only admins can resolve disputes" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { status, resolution, adminNotes } = body;

    const validStatuses = [
      "open",
      "under_review",
      "resolved_traveler",
      "resolved_operator",
      "closed",
    ];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: "Invalid status" },
        { status: 400 }
      );
    }

    const db = getDb();

    // Get existing dispute
    const [existing] = await db
      .select({
        id: disputes.id,
        filedBy: disputes.filedBy,
        operatorId: disputes.operatorId,
        bookingId: disputes.bookingId,
      })
      .from(disputes)
      .where(eq(disputes.id, id))
      .limit(1);

    if (!existing) {
      return NextResponse.json(
        { error: "Dispute not found" },
        { status: 404 }
      );
    }

    const isResolved =
      status === "resolved_traveler" ||
      status === "resolved_operator" ||
      status === "closed";

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (status) updateData.status = status;
    if (resolution !== undefined) updateData.resolution = resolution;
    if (adminNotes !== undefined) updateData.adminNotes = adminNotes;
    if (isResolved) {
      updateData.resolvedBy = userId;
      updateData.resolvedAt = new Date();
    }

    const [updated] = await db
      .update(disputes)
      .set(updateData)
      .where(eq(disputes.id, id))
      .returning();

    // Send notifications on resolution
    if (isResolved) {
      const [booking] = await db
        .select({ bookingNumber: bookings.bookingNumber })
        .from(bookings)
        .where(eq(bookings.id, existing.bookingId))
        .limit(1);

      const [traveler] = await db
        .select({ name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, existing.filedBy))
        .limit(1);

      const [operator] = await db
        .select({
          name: users.name,
          email: users.email,
          businessName: users.businessName,
        })
        .from(users)
        .where(eq(users.id, existing.operatorId))
        .limit(1);

      const statusLabel =
        status === "resolved_traveler"
          ? "resolved in your favor"
          : status === "resolved_operator"
            ? "resolved in favor of the operator"
            : "closed";

      // In-app notifications
      createNotification({
        userId: existing.filedBy,
        type: "system",
        title: `Your dispute for booking #${booking?.bookingNumber} has been ${statusLabel}`,
        body: resolution || undefined,
        link: "/bookings",
      }).catch(() => {});

      createNotification({
        userId: existing.operatorId,
        type: "system",
        title: `Dispute for booking #${booking?.bookingNumber} has been ${statusLabel}`,
        body: resolution || undefined,
        link: "/operator/bookings",
      }).catch(() => {});

      // Email notifications
      const emailHtml = (recipientName: string) => `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FEFCF7;font-family:'Helvetica Neue',Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:40px 24px">
  <div style="text-align:center;margin-bottom:24px">
    <span style="font-size:24px;font-weight:bold;color:#1C2333">Vakay<span style="color:#C8912E">Go</span></span>
  </div>
  <div style="background:#1C2333;border-radius:16px;padding:32px;text-align:center;margin-bottom:24px">
    <p style="color:white;font-size:14px;margin:0 0 8px">Dispute Resolution</p>
    <h1 style="color:white;font-size:22px;margin:0">Booking #${booking?.bookingNumber}</h1>
  </div>
  <div style="background:white;border-radius:16px;padding:24px;box-shadow:0 2px 12px rgba(28,35,51,0.08)">
    <p style="color:#1C2333;margin:0 0 16px">Hi ${recipientName},</p>
    <p style="color:#4A4F73;margin:0 0 16px;line-height:1.6">Your dispute has been <strong>${statusLabel}</strong>.</p>
    ${resolution ? `<div style="background:#F5EDD8;border-radius:12px;padding:16px;margin-bottom:16px"><p style="color:#1C2333;font-weight:600;margin:0 0 8px;font-size:14px">Resolution</p><p style="color:#4A4F73;margin:0;font-size:14px;line-height:1.6">${resolution}</p></div>` : ""}
    <p style="color:#9A9DB0;font-size:12px;margin:16px 0 0;line-height:1.5">If you have questions, please contact us at <a href="mailto:support@vakaygo.com" style="color:#C8912E">support@vakaygo.com</a></p>
  </div>
  <p style="text-align:center;color:#9A9DB0;font-size:11px;margin-top:24px">VakayGo &middot; Caribbean Travel Platform &middot; <a href="https://vakaygo.com" style="color:#C8912E">vakaygo.com</a></p>
</div>
</body></html>`;

      if (traveler?.email) {
        resend.emails
          .send({
            from: FROM,
            to: traveler.email,
            subject: `Dispute ${statusLabel} — Booking #${booking?.bookingNumber}`,
            html: emailHtml(traveler.name || "Traveler"),
          })
          .catch(() => {});
      }

      if (operator?.email && !operator.email.includes("unclaimed")) {
        resend.emails
          .send({
            from: FROM,
            to: operator.email,
            subject: `Dispute ${statusLabel} — Booking #${booking?.bookingNumber}`,
            html: emailHtml(
              operator.businessName || operator.name || "Operator"
            ),
          })
          .catch(() => {});
      }
    }

    return NextResponse.json({ dispute: updated });
  } catch (error) {
    logger.error("Update dispute error", error);
    return NextResponse.json(
      { error: "Failed to update dispute" },
      { status: 500 }
    );
  }
}
