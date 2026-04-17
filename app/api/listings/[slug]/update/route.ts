import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { listings } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

import { logger } from "@/lib/logger";
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET!);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, SECRET);
    const { slug } = await params;
    const body = await request.json();

    const db = drizzle(neon(process.env.DATABASE_URL!));

    // Verify ownership
    const [listing] = await db
      .select({ id: listings.id, operatorId: listings.operatorId })
      .from(listings)
      .where(eq(listings.slug, slug))
      .limit(1);

    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    if (listing.operatorId !== payload.id) {
      return NextResponse.json({ error: "Not your listing" }, { status: 403 });
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (body.title) updateData.title = body.title;
    if (body.description) updateData.description = body.description;
    if (body.headline) updateData.headline = body.headline;
    if (body.address) updateData.address = body.address;
    if (body.parish) updateData.parish = body.parish;
    if (body.priceAmount !== undefined) updateData.priceAmount = body.priceAmount?.toString();
    if (body.priceUnit) updateData.priceUnit = body.priceUnit;
    if (body.typeData) updateData.typeData = body.typeData;
    if (body.status) updateData.status = body.status;
    if (body.cancellationPolicy !== undefined) updateData.cancellationPolicy = body.cancellationPolicy;
    if (body.minStay !== undefined) updateData.minStay = body.minStay;
    if (body.maxStay !== undefined) updateData.maxStay = body.maxStay;
    if (body.advanceNotice !== undefined) updateData.advanceNotice = body.advanceNotice;
    if (body.maxGuests !== undefined) updateData.maxGuests = body.maxGuests;

    await db.update(listings).set(updateData).where(eq(listings.id, listing.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Update listing error", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
