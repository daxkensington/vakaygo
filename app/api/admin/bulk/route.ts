import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { listings } from "@/drizzle/schema";
import { inArray, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { logAdminAction } from "@/server/audit";

import { logger } from "@/lib/logger";
const VALID_ACTIONS = ["approve", "reject", "pause", "delete"] as const;
type BulkAction = (typeof VALID_ACTIONS)[number];

const STATUS_MAP: Record<Exclude<BulkAction, "delete">, string> = {
  approve: "active",
  reject: "rejected",
  pause: "paused",
};

const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET!);

async function verifyAdmin(_request: NextRequest): Promise<{ ok: boolean; adminId?: string }> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) return { ok: false };

    const { payload } = await jwtVerify(token, SECRET);
    if (payload.role !== "admin") return { ok: false };
    return { ok: true, adminId: payload.id as string };
  } catch {
    return { ok: false };
  }
}

export async function POST(request: NextRequest) {
  try {
    // Verify admin auth
    const { ok: isAdmin, adminId } = await verifyAdmin(request);
    if (!isAdmin || !adminId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = drizzle(neon(process.env.DATABASE_URL!));
    const body = await request.json();

    const { action, listingIds } = body as {
      action: string;
      listingIds: string[];
    };

    // Validate action
    if (!action || !VALID_ACTIONS.includes(action as BulkAction)) {
      return NextResponse.json(
        { error: `Invalid action. Use: ${VALID_ACTIONS.join(", ")}` },
        { status: 400 }
      );
    }

    // Validate listingIds
    if (!Array.isArray(listingIds) || listingIds.length === 0) {
      return NextResponse.json(
        { error: "listingIds must be a non-empty array" },
        { status: 400 }
      );
    }

    if (listingIds.length > 100) {
      return NextResponse.json(
        { error: "Maximum 100 listings per bulk action" },
        { status: 400 }
      );
    }

    let updated = 0;

    if (action === "delete") {
      const result = await db
        .delete(listings)
        .where(inArray(listings.id, listingIds))
        .returning({ id: listings.id });
      updated = result.length;
    } else {
      const newStatus = STATUS_MAP[action as Exclude<BulkAction, "delete">];
      const result = await db
        .update(listings)
        .set({
          status: newStatus as any,
          updatedAt: sql`now()`,
        })
        .where(inArray(listings.id, listingIds))
        .returning({ id: listings.id });
      updated = result.length;
    }

    // Fire-and-forget audit log
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || undefined;
    logAdminAction({
      adminId,
      action: `bulk_${action}`,
      targetType: "listing",
      targetId: listingIds.join(","),
      details: {
        listingCount: listingIds.length,
        updatedCount: updated,
      },
      ipAddress: ip,
    });

    return NextResponse.json({ updated, action });
  } catch (error) {
    logger.error("Admin bulk action error", error);
    return NextResponse.json(
      { error: "Failed to perform bulk action" },
      { status: 500 }
    );
  }
}
