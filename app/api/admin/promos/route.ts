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
    const body = await request.json();
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

    if (!code || !discountType || !discountValue || !validFrom || !validUntil) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!["percentage", "fixed"].includes(discountType)) {
      return NextResponse.json({ error: "Invalid discount type" }, { status: 400 });
    }

    const db = getDb();

    const [promo] = await db
      .insert(promoCodes)
      .values({
        code: code.toUpperCase().trim(),
        description: description || null,
        discountType,
        discountValue: String(discountValue),
        currency,
        minOrderAmount: minOrderAmount ? String(minOrderAmount) : null,
        maxDiscountAmount: maxDiscountAmount ? String(maxDiscountAmount) : null,
        maxUses: maxUses !== null && maxUses !== undefined ? Number(maxUses) : null,
        maxUsesPerUser: Number(maxUsesPerUser) || 1,
        validFrom: new Date(validFrom),
        validUntil: new Date(validUntil),
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
