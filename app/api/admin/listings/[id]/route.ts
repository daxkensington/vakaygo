import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { listings } from "@/drizzle/schema";
import { eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { logAdminAction } from "@/server/audit";

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

    // Fire-and-forget audit log
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

      // Determine action
      let action = "update_listing";
      if (status === "active") action = "approve_listing";
      else if (status === "rejected") action = "reject_listing";
      else if (status === "paused") action = "pause_listing";
      if (isFeatured === true) action = "feature_listing";
      else if (isFeatured === false && status === undefined) action = "unfeature_listing";

      logAdminAction({
        adminId,
        action,
        targetType: "listing",
        targetId: id,
        details: {
          previousStatus: existing.status,
          newStatus: status ?? existing.status,
          isFeatured: isFeatured ?? undefined,
          ...(rejectionReason ? { rejectionReason } : {}),
        },
        ipAddress: ip,
      });
    }

    return NextResponse.json({
      listing: updated,
      ...(rejectionReason && status === "rejected" ? { rejectionReason } : {}),
    });
  } catch (error) {
    console.error("Admin listing update error:", error);
    return NextResponse.json({ error: "Failed to update listing" }, { status: 500 });
  }
}
