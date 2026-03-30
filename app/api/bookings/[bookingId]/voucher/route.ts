import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { bookings, listings, users } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import QRCode from "qrcode";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev-secret-change-in-production"
);

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) {
      return NextResponse.json(
        { error: "Please sign in to view your voucher" },
        { status: 401 }
      );
    }

    const { payload } = await jwtVerify(token, SECRET);
    const userId = payload.id as string;
    const { bookingId } = await params;

    const db = getDb();

    // Fetch booking with listing and operator details
    const [booking] = await db
      .select({
        id: bookings.id,
        bookingNumber: bookings.bookingNumber,
        startDate: bookings.startDate,
        endDate: bookings.endDate,
        guestCount: bookings.guestCount,
        totalAmount: bookings.totalAmount,
        currency: bookings.currency,
        status: bookings.status,
        travelerId: bookings.travelerId,
        listingTitle: listings.title,
        listingType: listings.type,
        listingAddress: listings.address,
        operatorId: listings.operatorId,
      })
      .from(bookings)
      .innerJoin(listings, eq(bookings.listingId, listings.id))
      .where(eq(bookings.id, bookingId))
      .limit(1);

    if (!booking) {
      return NextResponse.json(
        { error: "Booking not found" },
        { status: 404 }
      );
    }

    // Ensure the booking belongs to the authenticated user
    if (booking.travelerId !== userId) {
      return NextResponse.json(
        { error: "You do not have access to this voucher" },
        { status: 403 }
      );
    }

    // Get operator info
    const [operator] = await db
      .select({
        name: users.name,
        businessName: users.businessName,
      })
      .from(users)
      .where(eq(users.id, booking.operatorId))
      .limit(1);

    const operatorName =
      operator?.businessName || operator?.name || "Local Operator";

    // Generate QR code as data URL
    const verifyUrl = `https://vakaygo.com/verify/${booking.bookingNumber}`;
    const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
      width: 280,
      margin: 2,
      color: { dark: "#1C2333", light: "#FFFFFF" },
    });

    // Format date
    const startDate = new Date(booking.startDate);
    const dateStr = startDate.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const timeStr = startDate.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    const endDateStr = booking.endDate
      ? new Date(booking.endDate).toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : null;

    const typeLabel =
      booking.listingType.charAt(0).toUpperCase() +
      booking.listingType.slice(1);

    const statusColor =
      booking.status === "confirmed"
        ? "#1A6B6A"
        : booking.status === "pending"
          ? "#C8912E"
          : "#666";

    const statusLabel =
      booking.status.charAt(0).toUpperCase() + booking.status.slice(1);

    const currencySymbol = booking.currency === "XCD" ? "EC$" : "$";

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>VakayGo Voucher — ${booking.bookingNumber}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #F5EDD8;
      color: #1C2333;
      display: flex;
      justify-content: center;
      padding: 32px 16px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .voucher {
      background: #FFFFFF;
      max-width: 520px;
      width: 100%;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 8px 40px rgba(28, 35, 51, 0.12);
    }

    .voucher-header {
      background: linear-gradient(135deg, #1C2333 0%, #2a3548 100%);
      color: #F5EDD8;
      padding: 28px 32px;
      text-align: center;
    }

    .logo {
      font-size: 28px;
      font-weight: 700;
      letter-spacing: -0.5px;
      margin-bottom: 4px;
    }

    .logo span { color: #C8912E; }

    .voucher-header p {
      font-size: 13px;
      opacity: 0.7;
    }

    .qr-section {
      text-align: center;
      padding: 28px 32px 20px;
      border-bottom: 2px dashed #e8e0d0;
    }

    .qr-section img {
      width: 220px;
      height: 220px;
    }

    .booking-number {
      font-size: 18px;
      font-weight: 700;
      letter-spacing: 1px;
      margin-top: 12px;
      color: #1C2333;
    }

    .status-badge {
      display: inline-block;
      padding: 4px 14px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      color: #fff;
      margin-top: 8px;
      background: ${statusColor};
    }

    .details {
      padding: 24px 32px;
    }

    .detail-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 10px 0;
      border-bottom: 1px solid #f0ebe0;
    }

    .detail-row:last-child { border-bottom: none; }

    .detail-label {
      font-size: 12px;
      font-weight: 500;
      color: #8b8577;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .detail-value {
      font-size: 14px;
      font-weight: 600;
      color: #1C2333;
      text-align: right;
      max-width: 60%;
    }

    .total-row .detail-label {
      font-size: 14px;
      color: #1C2333;
      font-weight: 600;
    }

    .total-row .detail-value {
      font-size: 20px;
      font-weight: 700;
      color: #C8912E;
    }

    .instruction {
      background: #f9f5ec;
      text-align: center;
      padding: 16px 32px;
      font-size: 13px;
      font-weight: 500;
      color: #1A6B6A;
    }

    .voucher-footer {
      background: #1C2333;
      text-align: center;
      padding: 14px;
      font-size: 12px;
      color: rgba(245, 237, 216, 0.5);
    }

    @media print {
      body { background: #fff; padding: 0; }
      .voucher { box-shadow: none; border: 1px solid #ddd; }
    }
  </style>
</head>
<body>
  <div class="voucher">
    <div class="voucher-header">
      <div class="logo">Vakay<span>Go</span></div>
      <p>Booking Voucher</p>
    </div>

    <div class="qr-section">
      <img src="${qrDataUrl}" alt="Booking QR Code" />
      <div class="booking-number">${booking.bookingNumber}</div>
      <div class="status-badge">${statusLabel}</div>
    </div>

    <div class="details">
      <div class="detail-row">
        <div class="detail-label">Experience</div>
        <div class="detail-value">${escapeHtml(booking.listingTitle)}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Type</div>
        <div class="detail-value">${typeLabel}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Date</div>
        <div class="detail-value">${dateStr}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Time</div>
        <div class="detail-value">${timeStr}</div>
      </div>
      ${
        endDateStr
          ? `<div class="detail-row">
        <div class="detail-label">End Date</div>
        <div class="detail-value">${endDateStr}</div>
      </div>`
          : ""
      }
      <div class="detail-row">
        <div class="detail-label">Guests</div>
        <div class="detail-value">${booking.guestCount || 1}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Operator</div>
        <div class="detail-value">${escapeHtml(operatorName)}</div>
      </div>
      ${
        booking.listingAddress
          ? `<div class="detail-row">
        <div class="detail-label">Address</div>
        <div class="detail-value">${escapeHtml(booking.listingAddress)}</div>
      </div>`
          : ""
      }
      <div class="detail-row total-row">
        <div class="detail-label">Total Paid</div>
        <div class="detail-value">${currencySymbol}${parseFloat(booking.totalAmount).toFixed(2)}</div>
      </div>
    </div>

    <div class="instruction">
      Show this voucher to your operator upon arrival
    </div>

    <div class="voucher-footer">
      Powered by VakayGo &mdash; vakaygo.com
    </div>
  </div>
</body>
</html>`;

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  } catch (error) {
    console.error("Voucher error:", error);
    return NextResponse.json(
      { error: "Failed to generate voucher" },
      { status: 500 }
    );
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
