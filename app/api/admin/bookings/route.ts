import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { bookings, listings, users } from "@/drizzle/schema";
import { eq, sql, desc, and, gte, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

import { logger } from "@/lib/logger";
import { requireAdmin } from "@/server/admin-auth";
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET!);

async function verifyAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (payload.role !== "admin") return null;
    return payload.id as string;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const __auth = await requireAdmin();
  if (!__auth.ok) return __auth.error;
  const adminId = __auth.userId;

  try {
    const db = drizzle(neon(process.env.DATABASE_URL!));
    const { searchParams } = new URL(request.url);

    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));
    const offset = (page - 1) * limit;

    const status = searchParams.get("status");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    // Aliases for traveler and operator joins
    const traveler = alias(users, "traveler");
    const operator = alias(users, "operator");

    // Build conditions
    const conditions = [];
    if (status) conditions.push(eq(bookings.status, status as any));
    if (from) conditions.push(gte(bookings.startDate, new Date(from)));
    if (to) conditions.push(lte(bookings.startDate, new Date(to)));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Count total
    const [totalResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(bookings)
      .where(whereClause);

    const total = totalResult.count;

    // Fetch bookings with related data
    const results = await db
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
        createdAt: bookings.createdAt,
        listingId: bookings.listingId,
        listingTitle: listings.title,
        listingType: listings.type,
        travelerId: bookings.travelerId,
        travelerName: traveler.name,
        travelerEmail: traveler.email,
        operatorId: bookings.operatorId,
        operatorName: operator.name,
        operatorEmail: operator.email,
      })
      .from(bookings)
      .innerJoin(listings, eq(bookings.listingId, listings.id))
      .innerJoin(traveler, eq(bookings.travelerId, traveler.id))
      .innerJoin(operator, eq(bookings.operatorId, operator.id))
      .where(whereClause)
      .orderBy(desc(bookings.createdAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({
      bookings: results,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    logger.error("Admin bookings error", error);
    return NextResponse.json({ error: "Failed to fetch bookings" }, { status: 500 });
  }
}
