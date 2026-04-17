import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { pricingRules, listings } from "@/drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { requireOperator, assertListingOwnership } from "@/server/admin-auth";

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

/**
 * GET — List pricing rules for operator's listings
 * Query: ?listingId=xxx (optional, filters to one listing)
 */
export async function GET(request: Request) {
  try {
    const __auth = await requireOperator();
    if (!__auth.ok) return __auth.error;
    const operatorId = __auth.userId;
    const role = __auth.role;

    const { searchParams } = new URL(request.url);
    const listingId = searchParams.get("listingId");

    const db = getDb();

    if (listingId) {
      const owns = await assertListingOwnership(listingId, operatorId, role);
      if (!owns.ok) return owns.error;

      const rules = await db
        .select()
        .from(pricingRules)
        .where(eq(pricingRules.listingId, listingId))
        .orderBy(desc(pricingRules.createdAt));

      return NextResponse.json({ rules });
    }

    // Get all rules for all operator listings
    const rules = await db
      .select({
        id: pricingRules.id,
        listingId: pricingRules.listingId,
        type: pricingRules.type,
        name: pricingRules.name,
        multiplier: pricingRules.multiplier,
        startDate: pricingRules.startDate,
        endDate: pricingRules.endDate,
        daysOfWeek: pricingRules.daysOfWeek,
        isActive: pricingRules.isActive,
        createdAt: pricingRules.createdAt,
        listingTitle: listings.title,
      })
      .from(pricingRules)
      .innerJoin(listings, eq(pricingRules.listingId, listings.id))
      .where(eq(listings.operatorId, operatorId))
      .orderBy(desc(pricingRules.createdAt));

    return NextResponse.json({ rules });
  } catch (error) {
    logger.error("Pricing rules GET error", error);
    return NextResponse.json(
      { error: "Failed to fetch pricing rules" },
      { status: 500 }
    );
  }
}

/**
 * POST — Create a pricing rule
 * Body: { listingId, type, name?, multiplier, startDate?, endDate?, daysOfWeek? }
 */
export async function POST(request: Request) {
  try {
    const __auth = await requireOperator();
    if (!__auth.ok) return __auth.error;
    const operatorId = __auth.userId;
    const role = __auth.role;

    const { listingId, type, name, multiplier, startDate, endDate, daysOfWeek } =
      await request.json();

    if (!listingId || !type || !multiplier) {
      return NextResponse.json(
        { error: "listingId, type, and multiplier required" },
        { status: 400 }
      );
    }

    const owns = await assertListingOwnership(listingId, operatorId, role);
    if (!owns.ok) return owns.error;

    const db = getDb();

    const [rule] = await db
      .insert(pricingRules)
      .values({
        listingId,
        type,
        name: name || null,
        multiplier: multiplier.toString(),
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        daysOfWeek: daysOfWeek || null,
      })
      .returning();

    return NextResponse.json({ rule }, { status: 201 });
  } catch (error) {
    logger.error("Pricing rules POST error", error);
    return NextResponse.json(
      { error: "Failed to create pricing rule" },
      { status: 500 }
    );
  }
}

/**
 * PUT — Update a pricing rule
 * Body: { id, type?, name?, multiplier?, startDate?, endDate?, daysOfWeek?, isActive? }
 */
export async function PUT(request: Request) {
  try {
    const __auth = await requireOperator();
    if (!__auth.ok) return __auth.error;
    const operatorId = __auth.userId;
    const role = __auth.role;

    const { id, ...updates } = await request.json();
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const db = getDb();

    // Verify the rule belongs to operator's listing
    const [rule] = await db
      .select({ listingId: pricingRules.listingId })
      .from(pricingRules)
      .where(eq(pricingRules.id, id))
      .limit(1);

    if (!rule) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    const owns = await assertListingOwnership(rule.listingId, operatorId, role);
    if (!owns.ok) return owns.error;

    const setData: Record<string, unknown> = {};
    if (updates.type !== undefined) setData.type = updates.type;
    if (updates.name !== undefined) setData.name = updates.name;
    if (updates.multiplier !== undefined)
      setData.multiplier = updates.multiplier.toString();
    if (updates.startDate !== undefined)
      setData.startDate = updates.startDate ? new Date(updates.startDate) : null;
    if (updates.endDate !== undefined)
      setData.endDate = updates.endDate ? new Date(updates.endDate) : null;
    if (updates.daysOfWeek !== undefined) setData.daysOfWeek = updates.daysOfWeek;
    if (updates.isActive !== undefined) setData.isActive = updates.isActive;

    const [updated] = await db
      .update(pricingRules)
      .set(setData)
      .where(eq(pricingRules.id, id))
      .returning();

    return NextResponse.json({ rule: updated });
  } catch (error) {
    logger.error("Pricing rules PUT error", error);
    return NextResponse.json(
      { error: "Failed to update pricing rule" },
      { status: 500 }
    );
  }
}

/**
 * DELETE — Remove a pricing rule
 * Query: ?id=xxx
 */
export async function DELETE(request: Request) {
  try {
    const __auth = await requireOperator();
    if (!__auth.ok) return __auth.error;
    const operatorId = __auth.userId;
    const role = __auth.role;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const db = getDb();

    // Verify ownership
    const [rule] = await db
      .select({ listingId: pricingRules.listingId })
      .from(pricingRules)
      .where(eq(pricingRules.id, id))
      .limit(1);

    if (!rule) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    const owns = await assertListingOwnership(rule.listingId, operatorId, role);
    if (!owns.ok) return owns.error;

    await db.delete(pricingRules).where(eq(pricingRules.id, id));

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("Pricing rules DELETE error", error);
    return NextResponse.json(
      { error: "Failed to delete pricing rule" },
      { status: 500 }
    );
  }
}
