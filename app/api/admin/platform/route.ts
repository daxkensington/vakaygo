import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { platformSettings, users } from "@/drizzle/schema";
import { eq, sql } from "drizzle-orm";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

import { logger } from "@/lib/logger";
import { requireAdmin } from "@/server/admin-auth";
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET!);

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

export async function GET() {
  const __auth = await requireAdmin();
  if (!__auth.ok) return __auth.error;
  const adminId = __auth.userId;

  try {
    const db = drizzle(neon(process.env.DATABASE_URL!));

    const rows = await db
      .select({
        key: platformSettings.key,
        value: platformSettings.value,
        updatedBy: users.name,
        updatedAt: platformSettings.updatedAt,
      })
      .from(platformSettings)
      .leftJoin(users, eq(platformSettings.updatedBy, users.id));

    const settings: Record<string, { value: string; updatedBy: string | null; updatedAt: string }> = {};
    for (const row of rows) {
      settings[row.key] = {
        value: row.value,
        updatedBy: row.updatedBy,
        updatedAt: row.updatedAt?.toISOString() ?? "",
      };
    }

    return NextResponse.json(settings);
  } catch (err) {
    logger.error("Platform settings GET error", err);
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const __auth = await requireAdmin();
  if (!__auth.ok) return __auth.error;
  const adminId = __auth.userId;

  try {
    const db = drizzle(neon(process.env.DATABASE_URL!));
    const body = await req.json();
    const { settings, adminId } = body as {
      settings: Record<string, string>;
      adminId?: string;
    };

    if (!settings || typeof settings !== "object") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const validKeys = [
      "promo_banner_text",
      "promo_banner_link",
      "promo_banner_enabled",
      "announcement_text",
      "announcement_enabled",
      "maintenance_mode",
    ];

    const now = new Date();

    for (const [key, value] of Object.entries(settings)) {
      if (!validKeys.includes(key)) continue;

      await db
        .insert(platformSettings)
        .values({
          key,
          value: String(value),
          updatedBy: adminId || null,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: platformSettings.key,
          set: {
            value: sql`excluded.value`,
            updatedBy: sql`excluded.updated_by`,
            updatedAt: sql`excluded.updated_at`,
          },
        });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("Platform settings PATCH error", err);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
