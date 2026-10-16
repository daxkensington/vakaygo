import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { promoCodes } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

import { logger } from "@/lib/logger";
import { requireAdmin } from "@/server/admin-auth";
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET!);

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

async function verifyAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (payload.role !== "admin") return null;
    return payload.id as string;
  } catch {
    return null;
  }
}

function parseNumber(value: unknown): number {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) {
    return NaN;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

function parseDiscountValue(value: unknown, type: unknown): string | null {
  const number = parseNumber(value);
  if (!Number.isFinite(number) || number <= 0 || (type === "percentage" && number > 100)) {
    return null;
  }
  const rounded = number.toFixed(2);
  if (Number(rounded) <= 0 || Number(rounded) >= 100000000) return null;
  return rounded;
}

function parseLimit(value: unknown): number | null {
  const number = parseNumber(value);
  return Number.isInteger(number) && number > 0 && number <= 2147483647 ? number : null;
}

function isUnlimited(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && !value.trim());
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

// PATCH: Update a promo code
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const __auth = await requireAdmin();
  if (!__auth.ok) return __auth.error;
  const adminId = __auth.userId;

  try {
    const { id } = await params;
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Body must be an object" }, { status: 400 });
    }
    const updateData: Record<string, unknown> = {};
    if (body.code !== undefined) {
      if (typeof body.code !== "string" || !body.code.trim()) {
        return NextResponse.json({ error: "A promo code is required" }, { status: 400 });
      }
      updateData.code = body.code.toUpperCase().trim();
    }
    if (body.description !== undefined) updateData.description = body.description || null;
    const hasType = body.discountType !== undefined;
    const hasValue = body.discountValue !== undefined;
    if (hasType) {
      if (body.discountType !== "percentage" && body.discountType !== "fixed") {
        return NextResponse.json({ error: "Invalid discount type" }, { status: 400 });
      }
      updateData.discountType = body.discountType;
    }
    if (hasValue) {
      const value = parseDiscountValue(body.discountValue, body.discountType);
      if (value === null) {
        return NextResponse.json({ error: "Discount value must be finite and positive, fit decimal(10,2), and not exceed 100 for percentages" }, { status: 400 });
      }
      updateData.discountValue = value;
    }
    if (body.currency !== undefined) updateData.currency = body.currency;
    if (body.minOrderAmount !== undefined) updateData.minOrderAmount = body.minOrderAmount ? String(body.minOrderAmount) : null;
    if (body.maxDiscountAmount !== undefined) updateData.maxDiscountAmount = body.maxDiscountAmount ? String(body.maxDiscountAmount) : null;
    if (body.maxUses !== undefined) {
      const value = isUnlimited(body.maxUses) ? null : parseLimit(body.maxUses);
      if (!isUnlimited(body.maxUses) && value === null) {
        return NextResponse.json({ error: "maxUses must be a positive integer within the database integer range, or blank or null for unlimited" }, { status: 400 });
      }
      updateData.maxUses = value;
    }
    if (body.maxUsesPerUser !== undefined) {
      const value = parseLimit(body.maxUsesPerUser);
      if (value === null) {
        return NextResponse.json({ error: "maxUsesPerUser must be a positive integer within the database integer range" }, { status: 400 });
      }
      updateData.maxUsesPerUser = value;
    }
    const hasStart = body.validFrom !== undefined;
    const hasEnd = body.validUntil !== undefined;
    const start = hasStart ? parseDate(body.validFrom) : null;
    const end = hasEnd ? parseDate(body.validUntil) : null;
    if ((hasStart && !start) || (hasEnd && !end)) {
      return NextResponse.json({ error: "validFrom and validUntil must be valid dates" }, { status: 400 });
    }
    if (start) updateData.validFrom = start;
    if (end) updateData.validUntil = end;
    if (body.applicableTypes !== undefined) updateData.applicableTypes = body.applicableTypes;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
    }

    const db = getDb();
    if (hasType || hasValue || hasStart || hasEnd) {
      const [existing] = await db.select().from(promoCodes).where(eq(promoCodes.id, id)).limit(1);
      if (!existing) {
        return NextResponse.json({ error: "Promo code not found" }, { status: 404 });
      }
      if (hasType || hasValue) {
        const type = hasType ? body.discountType : existing.discountType;
        // Validate the original input before storage rounding, including value-only updates.
        const value = hasValue ? body.discountValue : existing.discountValue;
        if ((type !== "percentage" && type !== "fixed") || parseDiscountValue(value, type) === null) {
          return NextResponse.json({ error: "Discount value must be finite and positive, fit decimal(10,2), and not exceed 100 for percentages" }, { status: 400 });
        }
      }
      if (hasStart || hasEnd) {
        const effectiveStart = start ?? existing.validFrom;
        const effectiveEnd = end ?? existing.validUntil;
        if (!Number.isFinite(effectiveStart.getTime()) || !Number.isFinite(effectiveEnd.getTime()) || effectiveStart.getTime() >= effectiveEnd.getTime()) {
          return NextResponse.json({ error: "validFrom must be before validUntil" }, { status: 400 });
        }
      }
    }

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
  const adminId = __auth.userId;

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
