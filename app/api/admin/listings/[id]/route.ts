import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { listings } from "@/drizzle/schema";
import { eq, sql } from "drizzle-orm";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = drizzle(neon(process.env.DATABASE_URL!));
    const { id } = await params;
    const body = await request.json();

    const { status, isFeatured, rejectionReason } = body as {
      status?: string;
      isFeatured?: boolean;
      rejectionReason?: string;
    };

    // Verify listing exists
    const [existing] = await db
      .select({ id: listings.id, status: listings.status })
      .from(listings)
      .where(eq(listings.id, id));

    if (!existing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    // Validate status if provided
    if (status !== undefined) {
      const validStatuses = ["draft", "pending_review", "active", "paused", "rejected"];
      if (!validStatuses.includes(status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
    }

    // Build update object
    const updateData: Record<string, unknown> = {
      updatedAt: sql`now()`,
    };

    if (status !== undefined) updateData.status = status;
    if (isFeatured !== undefined) updateData.isFeatured = isFeatured;

    const [updated] = await db
      .update(listings)
      .set(updateData)
      .where(eq(listings.id, id))
      .returning({
        id: listings.id,
        status: listings.status,
        isFeatured: listings.isFeatured,
        updatedAt: listings.updatedAt,
      });

    return NextResponse.json({
      listing: updated,
      ...(rejectionReason && status === "rejected" ? { rejectionReason } : {}),
    });
  } catch (error) {
    console.error("Admin listing update error:", error);
    return NextResponse.json({ error: "Failed to update listing" }, { status: 500 });
  }
}
