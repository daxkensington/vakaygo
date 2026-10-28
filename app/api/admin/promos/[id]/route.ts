import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { promoCodes } from "@/drizzle/schema";
import { eq } from "drizzle-orm";

import { logger } from "@/lib/logger";
import { requireAdmin } from "@/server/admin-auth";

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

// Accept only real numbers or non-empty numeric strings; returns null otherwise.
function parseDiscountValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

// PATCH: Update a promo code
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const __auth = await requireAdmin();
  if (!__auth.ok) return __auth.error;

  try {
    const { id } = await params;
    const body = await request.json();

    if (body.discountType !== undefined && !["percentage", "fixed"].includes(body.discountType)) {
      return NextResponse.json({ error: "Invalid discount type" }, { status: 400 });
    }

    let discountValue: number | null = null;
    if (body.discountValue !== undefined) {
      discountValue = parseDiscountValue(body.discountValue);
      if (discountValue === null) {
        return NextResponse.json({ error: "Invalid discount value" }, { status: 400 });
      }
    }

    const db = getDb();

    const updateData: Record<string, unknown> = {};

    if (body.code !== undefined) updateData.code = body.code.toUpperCase().trim();
    if (body.description !== undefined) updateData.description = body.description || null;
    if (body.discountType !== undefined) updateData.discountType = body.discountType;
    if (discountValue !== null) updateData.discountValue = String(discountValue);
    if (body.currency !== undefined) updateData.currency = body.currency;
    if (body.minOrderAmount !== undefined) updateData.minOrderAmount = body.minOrderAmount ? String(body.minOrderAmount) : null;
    if (body.maxDiscountAmount !== undefined) updateData.maxDiscountAmount = body.maxDiscountAmount ? String(body.maxDiscountAmount) : null;
    if (body.maxUses !== undefined) updateData.maxUses = body.maxUses !== null ? Number(body.maxUses) : null;
    if (body.maxUsesPerUser !== undefined) updateData.maxUsesPerUser = Number(body.maxUsesPerUser) || 1;
    if (body.validFrom !== undefined) updateData.validFrom = new Date(body.validFrom);
    if (body.validUntil !== undefined) updateData.validUntil = new Date(body.validUntil);
    if (body.applicableTypes !== undefined) updateData.applicableTypes = body.applicableTypes;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;

    const [updated] = await db
      .update(promoCodes)
      .set(updateData)
      .where(eq(promoCodes.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Promo code not found" }, { status: 404 });
    }

    return NextResponse.json({ promo: updated });
  } catch (error) {
    logger.error("Update promo error", error);
    return NextResponse.json({ error: "Failed to update promo code" }, { status: 500 });
  }
}

// DELETE: Delete a promo code
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const __auth = await requireAdmin();
  if (!__auth.ok) return __auth.error;

  try {
    const { id } = await params;
    const db = getDb();

    await db.delete(promoCodes).where(eq(promoCodes.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Delete promo error", error);
    return NextResponse.json({ error: "Failed to delete promo code" }, { status: 500 });
  }
}
