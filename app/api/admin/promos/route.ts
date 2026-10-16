import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { promoCodes } from "@/drizzle/schema";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import { desc } from "drizzle-orm";

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

// GET: List all promo codes
export async function GET() {
  const __auth = await requireAdmin();
  if (!__auth.ok) return __auth.error;
  const adminId = __auth.userId;

  const db = getDb();
  const results = await db
    .select()
    .from(promoCodes)
    .orderBy(desc(promoCodes.createdAt));

  return NextResponse.json({ promos: results });
}

// POST: Create a new promo code
export async function POST(request: Request) {
  const __auth = await requireAdmin();
  if (!__auth.ok) return __auth.error;
  const adminId = __auth.userId;

  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Body must be an object" }, { status: 400 });
    }
    const {
      code,
      description,
      discountType,
      discountValue,
      currency = "XCD",
      minOrderAmount,
      maxDiscountAmount,
      maxUses,
      maxUsesPerUser = 1,
      validFrom,
      validUntil,
      applicableTypes,
      isActive = true,
    } = body;

    if (typeof code !== "string" || !code.trim()) {
      return NextResponse.json({ error: "A promo code is required" }, { status: 400 });
    }
    if (discountType !== "percentage" && discountType !== "fixed") {
      return NextResponse.json({ error: "Invalid discount type" }, { status: 400 });
    }
    const parsedDiscount = parseDiscountValue(discountValue, discountType);
    if (parsedDiscount === null) {
      return NextResponse.json({ error: "Discount value must be finite and positive, fit decimal(10,2), and not exceed 100 for percentages" }, { status: 400 });
    }
    const parsedMaxUses = isUnlimited(maxUses) ? null : parseLimit(maxUses);
    const parsedPerUser = parseLimit(maxUsesPerUser);
    if ((!isUnlimited(maxUses) && parsedMaxUses === null) || parsedPerUser === null) {
      return NextResponse.json({ error: "Usage limits must be positive integers within the database integer range" }, { status: 400 });
    }
    const start = parseDate(validFrom);
    const end = parseDate(validUntil);
    if (!start || !end || start.getTime() >= end.getTime()) {
      return NextResponse.json({ error: "Valid dates are required, with validFrom before validUntil" }, { status: 400 });
    }

    const db = getDb();
    const [promo] = await db
      .insert(promoCodes)
      .values({
        code: code.toUpperCase().trim(),
        description: description || null,
        discountType,
        discountValue: parsedDiscount,
        currency,
        minOrderAmount: minOrderAmount ? String(minOrderAmount) : null,
        maxDiscountAmount: maxDiscountAmount ? String(maxDiscountAmount) : null,
        maxUses: parsedMaxUses,
        maxUsesPerUser: parsedPerUser,
        validFrom: start,
        validUntil: end,
        applicableTypes: applicableTypes || null,
        isActive,
        createdBy: adminId,
      })
      .returning();

    return NextResponse.json({ promo });
  } catch (error: unknown) {
    logger.error("Create promo error", error);
    const msg = error instanceof Error && error.message.includes("unique")
      ? "A promo code with this name already exists"
      : "Failed to create promo code";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
