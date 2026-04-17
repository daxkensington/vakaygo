import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { auditLog, users } from "@/drizzle/schema";
import { eq, sql, and, gte, lte, count } from "drizzle-orm";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";

import { logger } from "@/lib/logger";
import { requireAdmin } from "@/server/admin-auth";
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET!);

async function verifyAdmin(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) return null;

    const { payload } = await jwtVerify(token, SECRET);
    if (payload.role !== "admin") return null;
    return payload.id as string;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const __auth = await requireAdmin();
  if (!__auth.ok) return __auth.error;
  const adminId = __auth.userId;

    const db = drizzle(neon(process.env.DATABASE_URL!));
    const { searchParams } = new URL(request.url);

    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "25")));
    const offset = (page - 1) * limit;

    const action = searchParams.get("action");
    const targetType = searchParams.get("targetType");
    const adminFilter = searchParams.get("adminId");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    // Build conditions
    const conditions = [];
    if (action) conditions.push(eq(auditLog.action, action));
    if (targetType) conditions.push(eq(auditLog.targetType, targetType));
    if (adminFilter) conditions.push(eq(auditLog.adminId, adminFilter));
    if (dateFrom) conditions.push(gte(auditLog.createdAt, new Date(dateFrom)));
    if (dateTo) conditions.push(lte(auditLog.createdAt, new Date(dateTo)));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const [{ total: totalCount }] = await db
      .select({ total: count() })
      .from(auditLog)
      .where(whereClause);

    // Get logs with admin name
    const logs = await db
      .select({
        id: auditLog.id,
        adminId: auditLog.adminId,
        adminName: users.name,
        adminEmail: users.email,
        action: auditLog.action,
        targetType: auditLog.targetType,
        targetId: auditLog.targetId,
        details: auditLog.details,
        ipAddress: auditLog.ipAddress,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .innerJoin(users, eq(auditLog.adminId, users.id))
      .where(whereClause)
      .orderBy(sql`${auditLog.createdAt} DESC`)
      .limit(limit)
      .offset(offset);

    const total = Number(totalCount);
    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      logs,
      total,
      page,
      totalPages,
    });
  } catch (error) {
    logger.error("Admin audit log error", error);
    return NextResponse.json({ error: "Failed to fetch audit logs" }, { status: 500 });
  }
}
