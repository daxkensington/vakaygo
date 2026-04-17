import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { listings } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

import { logger } from "@/lib/logger";
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET!);

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Please sign in to claim a listing" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, SECRET);
    if (payload.role !== "operator") {
      return NextResponse.json(
        { error: "Only business operators can claim listings" },
        { status: 403 }
      );
    }

    const { listingId } = await request.json();
    if (!listingId) {
      return NextResponse.json({ error: "listingId is required" }, { status: 400 });
    }

    const db = drizzle(neon(process.env.DATABASE_URL!));

    // Get the listing
    const [listing] = await db
      .select({ id: listings.id, typeData: listings.typeData, operatorId: listings.operatorId })
      .from(listings)
      .where(eq(listings.id, listingId))
      .limit(1);

    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    // Check if it's an unclaimed listing
    const td = listing.typeData as Record<string, unknown> | null;
    if (!td?.unclaimed) {
      return NextResponse.json(
        { error: "This listing has already been claimed" },
        { status: 400 }
      );
    }

    // Transfer ownership to the claiming operator
    const updatedTypeData = { ...td, unclaimed: false, claimedAt: new Date().toISOString() };

    await db
      .update(listings)
      .set({
        operatorId: payload.id as string,
        typeData: updatedTypeData,
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(listings.id, listingId));

    return NextResponse.json({
      success: true,
      message: "Listing claimed successfully! You can now edit it from your dashboard.",
    });
  } catch (error) {
    logger.error("Claim listing error", error);
    return NextResponse.json({ error: "Failed to claim listing" }, { status: 500 });
  }
}
