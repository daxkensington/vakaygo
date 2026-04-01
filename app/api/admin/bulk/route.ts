import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { listings } from "@/drizzle/schema";
import { inArray, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";

const VALID_ACTIONS = ["approve", "reject", "pause", "delete"] as const;
type BulkAction = (typeof VALID_ACTIONS)[number];

const STATUS_MAP: Record<Exclude<BulkAction, "delete">, string> = {
  approve: "active",
  reject: "rejected",
  pause: "paused",
};

async function verifyAdmin(request: NextRequest): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("auth_token")?.value;
    if (!token) return false;

    const secret = new TextEncoder().encode(process.env.JWT_SECRET || "");
    const { payload } = await jwtVerify(token, secret);
    return payload.role === "admin";
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Verify admin auth
    const isAdmin = await verifyAdmin(request);
    if (!isAdmin) {
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

    return NextResponse.json({ updated, action });
  } catch (error) {
    console.error("Admin bulk action error:", error);
    return NextResponse.json(
      { error: "Failed to perform bulk action" },
      { status: 500 }
    );
  }
}
