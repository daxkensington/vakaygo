import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { abTests } from "@/drizzle/schema";
import { eq, desc } from "drizzle-orm";

import { logger } from "@/lib/logger";
import { requireAdmin } from "@/server/admin-auth";

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

/**
 * GET — List all A/B tests (admin only)
 */
export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.error;

    const db = getDb();

    const tests = await db
      .select()
      .from(abTests)
      .orderBy(desc(abTests.createdAt));

    return NextResponse.json({ tests });
  } catch (error) {
    logger.error("AB tests GET error", error);
    return NextResponse.json(
      { error: "Failed to fetch A/B tests" },
      { status: 500 }
    );
  }
}

/**
 * POST — Create an A/B test
 * Body: { name, description?, variants: [{name, weight}], trafficPercent?, startDate?, endDate? }
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.error;

    const { name, description, variants, trafficPercent, startDate, endDate } =
      await request.json();

    if (!name || !variants || !Array.isArray(variants) || variants.length < 2) {
      return NextResponse.json(
        { error: "name and at least 2 variants required" },
        { status: 400 }
      );
    }

    const db = getDb();

    const [test] = await db
      .insert(abTests)
      .values({
        name,
        description: description || null,
        variants,
        trafficPercent: trafficPercent ?? 100,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
      })
      .returning();

    return NextResponse.json({ test }, { status: 201 });
  } catch (error) {
    logger.error("AB tests POST error", error);
    return NextResponse.json(
      { error: "Failed to create A/B test" },
      { status: 500 }
    );
  }
}

/**
 * PUT — Update an A/B test
 * Body: { id, name?, description?, variants?, trafficPercent?, isActive?, startDate?, endDate? }
 */
export async function PUT(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.error;

    const { id, ...updates } = await request.json();
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const db = getDb();

    const setData: Record<string, unknown> = {};
    if (updates.name !== undefined) setData.name = updates.name;
    if (updates.description !== undefined)
      setData.description = updates.description;
    if (updates.variants !== undefined) setData.variants = updates.variants;
    if (updates.trafficPercent !== undefined)
      setData.trafficPercent = updates.trafficPercent;
    if (updates.isActive !== undefined) setData.isActive = updates.isActive;
    if (updates.startDate !== undefined)
      setData.startDate = updates.startDate
        ? new Date(updates.startDate)
        : null;
    if (updates.endDate !== undefined)
      setData.endDate = updates.endDate ? new Date(updates.endDate) : null;

    const [updated] = await db
      .update(abTests)
      .set(setData)
      .where(eq(abTests.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: "A/B test not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ test: updated });
  } catch (error) {
    logger.error("AB tests PUT error", error);
    return NextResponse.json(
      { error: "Failed to update A/B test" },
      { status: 500 }
    );
  }
}
