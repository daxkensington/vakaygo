import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { users, listings, bookings, islands } from "@/drizzle/schema";
import { eq, sql, desc } from "drizzle-orm";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { logAdminAction } from "@/server/audit";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = drizzle(neon(process.env.DATABASE_URL!));
    const { id } = await params;

    // Fetch user
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        phone: users.phone,
        avatarUrl: users.avatarUrl,
        role: users.role,
        businessName: users.businessName,
        businessDescription: users.businessDescription,
        businessPhone: users.businessPhone,
        emailVerified: users.emailVerified,
        onboardingComplete: users.onboardingComplete,
        islandId: users.islandId,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, id));

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Fetch user's listings
    const userListings = await db
      .select({
        id: listings.id,
        title: listings.title,
        type: listings.type,
        status: listings.status,
        priceAmount: listings.priceAmount,
        avgRating: listings.avgRating,
        reviewCount: listings.reviewCount,
        isFeatured: listings.isFeatured,
        islandName: islands.name,
        createdAt: listings.createdAt,
      })
      .from(listings)
      .innerJoin(islands, eq(listings.islandId, islands.id))
      .where(eq(listings.operatorId, id))
      .orderBy(desc(listings.createdAt))
      .limit(50);

    // Fetch user's bookings (as traveler or operator)
    const userBookings = await db
      .select({
        id: bookings.id,
        bookingNumber: bookings.bookingNumber,
        status: bookings.status,
        startDate: bookings.startDate,
        endDate: bookings.endDate,
        guestCount: bookings.guestCount,
        totalAmount: bookings.totalAmount,
        currency: bookings.currency,
        listingTitle: listings.title,
        createdAt: bookings.createdAt,
        role: sql<string>`CASE
          WHEN bookings.traveler_id = ${id} THEN 'traveler'
          WHEN bookings.operator_id = ${id} THEN 'operator'
        END`,
      })
      .from(bookings)
      .innerJoin(listings, eq(bookings.listingId, listings.id))
      .where(
        sql`bookings.traveler_id = ${id} OR bookings.operator_id = ${id}`
      )
      .orderBy(desc(bookings.createdAt))
      .limit(50);

    return NextResponse.json({
      user,
      listings: userListings,
      bookings: userBookings,
    });
  } catch (error) {
    console.error("Admin user detail error:", error);
    return NextResponse.json({ error: "Failed to fetch user" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = drizzle(neon(process.env.DATABASE_URL!));
    const { id } = await params;
    const body = await request.json();

    const { role } = body as { role?: string };

    // Verify user exists
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, id));

    if (!existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Build update object
    const updateData: Record<string, unknown> = {
      updatedAt: sql`now()`,
    };

    if (role !== undefined) {
      const validRoles = ["traveler", "operator", "admin"];
      if (!validRoles.includes(role)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }
      updateData.role = role;
    }

    const [updated] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        updatedAt: users.updatedAt,
      });

    // Fire-and-forget audit log
    if (role !== undefined) {
      let adminId: string | undefined;
      try {
        const cookieStore = await cookies();
        const token = cookieStore.get("auth_token")?.value;
        if (token) {
          const secret = new TextEncoder().encode(process.env.JWT_SECRET || "");
          const { payload } = await jwtVerify(token, secret);
          if (payload.sub) adminId = payload.sub as string;
        }
      } catch {}

      if (adminId) {
        const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || undefined;
        logAdminAction({
          adminId,
          action: "change_role",
          targetType: "user",
          targetId: id,
          details: {
            newRole: role,
            userEmail: updated.email,
          },
          ipAddress: ip,
        });
      }
    }

    return NextResponse.json({ user: updated });
  } catch (error) {
    console.error("Admin user update error:", error);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}
