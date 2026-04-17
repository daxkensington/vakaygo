import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { users } from "@/drizzle/schema";
import { eq } from "drizzle-orm";

import { logger } from "@/lib/logger";
import { requireOperator } from "@/server/admin-auth";

async function getAuthUserId(): Promise<string | null> {
  const auth = await requireOperator();
  return auth.ok ? auth.userId : null;
}

export async function GET() {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = drizzle(neon(process.env.DATABASE_URL!));

    const [user] = await db
      .select({
        businessName: users.businessName,
        businessDescription: users.businessDescription,
        businessPhone: users.businessPhone,
        email: users.email,
        name: users.name,
      })
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      settings: {
        businessName: user.businessName || "",
        businessDescription: user.businessDescription || "",
        businessPhone: user.businessPhone || "",
        email: user.email || "",
        name: user.name || "",
      },
    });
  } catch (error) {
    logger.error("GET /api/operator/settings error", error);
    return NextResponse.json(
      { error: "Failed to load settings" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { businessName, businessDescription, businessPhone } = body as {
      businessName?: string;
      businessDescription?: string;
      businessPhone?: string;
    };

    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (typeof businessName === "string")
      updates.businessName = businessName.trim() || null;
    if (typeof businessDescription === "string")
      updates.businessDescription = businessDescription.trim() || null;
    if (typeof businessPhone === "string")
      updates.businessPhone = businessPhone.trim() || null;

    if (Object.keys(updates).length === 1) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    const db = drizzle(neon(process.env.DATABASE_URL!));

    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, userId))
      .returning({
        businessName: users.businessName,
        businessDescription: users.businessDescription,
        businessPhone: users.businessPhone,
        email: users.email,
        name: users.name,
      });

    if (!updated) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      settings: {
        businessName: updated.businessName || "",
        businessDescription: updated.businessDescription || "",
        businessPhone: updated.businessPhone || "",
        email: updated.email || "",
        name: updated.name || "",
      },
    });
  } catch (error) {
    logger.error("PATCH /api/operator/settings error", error);
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 }
    );
  }
}
