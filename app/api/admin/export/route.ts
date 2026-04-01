import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { listings, users, bookings, islands } from "@/drizzle/schema";
import { eq, sql, desc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsv(headers: string[], rows: Record<string, unknown>[], keys: string[]): string {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(keys.map((k) => escapeCsv(row[k])).join(","));
  }
  return lines.join("\n");
}

export async function GET(request: NextRequest) {
  try {
    const db = drizzle(neon(process.env.DATABASE_URL!));
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    if (!type || !["listings", "users", "bookings"].includes(type)) {
      return new Response(JSON.stringify({ error: "Invalid type. Use listings, users, or bookings." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const date = new Date().toISOString().split("T")[0];
    let csv = "";

    if (type === "listings") {
      const results = await db
        .select({
          id: listings.id,
          title: listings.title,
          type: listings.type,
          status: listings.status,
          island: islands.name,
          operator: users.name,
          price: listings.priceAmount,
          rating: listings.avgRating,
          reviews: listings.reviewCount,
          createdAt: listings.createdAt,
        })
        .from(listings)
        .innerJoin(users, eq(listings.operatorId, users.id))
        .innerJoin(islands, eq(listings.islandId, islands.id))
        .orderBy(desc(listings.createdAt));

      csv = toCsv(
        ["ID", "Title", "Type", "Status", "Island", "Operator", "Price", "Rating", "Reviews", "Created At"],
        results as unknown as Record<string, unknown>[],
        ["id", "title", "type", "status", "island", "operator", "price", "rating", "reviews", "createdAt"]
      );
    } else if (type === "users") {
      const results = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          businessName: users.businessName,
          listingCount: sql<number>`(SELECT count(*)::int FROM listings WHERE listings.operator_id = users.id)`,
          bookingCount: sql<number>`(SELECT count(*)::int FROM bookings WHERE bookings.traveler_id = users.id OR bookings.operator_id = users.id)`,
          createdAt: users.createdAt,
        })
        .from(users)
        .orderBy(desc(users.createdAt));

      csv = toCsv(
        ["ID", "Name", "Email", "Role", "Business Name", "Listing Count", "Booking Count", "Created At"],
        results as unknown as Record<string, unknown>[],
        ["id", "name", "email", "role", "businessName", "listingCount", "bookingCount", "createdAt"]
      );
    } else if (type === "bookings") {
      const traveler = alias(users, "traveler");
      const operator = alias(users, "operator");

      const results = await db
        .select({
          bookingNumber: bookings.bookingNumber,
          listing: listings.title,
          traveler: traveler.name,
          operator: operator.name,
          status: bookings.status,
          startDate: bookings.startDate,
          guestCount: bookings.guestCount,
          totalAmount: bookings.totalAmount,
          createdAt: bookings.createdAt,
        })
        .from(bookings)
        .innerJoin(listings, eq(bookings.listingId, listings.id))
        .innerJoin(traveler, eq(bookings.travelerId, traveler.id))
        .innerJoin(operator, eq(bookings.operatorId, operator.id))
        .orderBy(desc(bookings.createdAt));

      csv = toCsv(
        ["Booking Number", "Listing", "Traveler", "Operator", "Status", "Start Date", "Guest Count", "Total Amount", "Created At"],
        results as unknown as Record<string, unknown>[],
        ["bookingNumber", "listing", "traveler", "operator", "status", "startDate", "guestCount", "totalAmount", "createdAt"]
      );
    }

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename=vakaygo-${type}-${date}.csv`,
      },
    });
  } catch (error) {
    console.error("Admin export error:", error);
    return new Response(JSON.stringify({ error: "Failed to export data" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
