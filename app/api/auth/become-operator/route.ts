import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { users } from "@/drizzle/schema";
import { and, eq } from "drizzle-orm";
import { requireUser, setSessionCookie } from "@/server/admin-auth";
import { logger } from "@/lib/logger";

/**
 * POST — switch a TRAVELER account to a BUSINESS (operator) account.
 *
 * Five businesses signed up in Aug 2026 through the generic sign-up, which
 * defaults to traveler, and then had no way to claim their listing. Operator
 * is a role anyone may pick at sign-up, so letting a traveler pick it later
 * grants nothing new. Admins and existing operators are left untouched.
 */
export async function POST() {
  const auth = await requireUser();
  if (!auth.ok) return auth.error;

  try {
    const db = drizzle(neon(process.env.DATABASE_URL!));
    const [user] = await db
      .update(users)
      .set({ role: "operator", updatedAt: new Date() })
      .where(and(eq(users.id, auth.userId), eq(users.role, "traveler")))
      .returning({ id: users.id, email: users.email, name: users.name, role: users.role });

    if (!user) {
      // Already an operator/admin — report the current role, no change.
      const [current] = await db
        .select({ id: users.id, email: users.email, name: users.name, role: users.role })
        .from(users)
        .where(eq(users.id, auth.userId))
        .limit(1);
      if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      return NextResponse.json({ role: current.role, changed: false });
    }

    // The role lives in the JWT — reissue it or the middleware keeps
    // treating this session as a traveler.
    await setSessionCookie({ id: user.id, email: user.email, name: user.name || undefined, role: user.role });
    return NextResponse.json({ role: user.role, changed: true });
  } catch (error) {
    logger.error("become-operator error", error);
    return NextResponse.json({ error: "Could not switch account type" }, { status: 500 });
  }
}
