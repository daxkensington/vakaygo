import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { featureFlags, users } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev-secret-change-in-production"
);

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

async function requireAdmin(): Promise<{
  userId: string;
  error?: NextResponse;
}> {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) {
    return {
      userId: "",
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  try {
    const { payload } = await jwtVerify(token, SECRET);
    const userId = payload.id as string;

    const db = getDb();
    const [user] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user || user.role !== "admin") {
      return {
        userId: "",
        error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      };
    }

    return { userId };
  } catch {
    return {
      userId: "",
      error: NextResponse.json({ error: "Invalid session" }, { status: 401 }),
    };
  }
}

/**
 * GET — List all feature flags (admin only)
 */
export async function GET() {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const db = getDb();

    const flags = await db.select().from(featureFlags).orderBy(featureFlags.key);

    return NextResponse.json({ flags });
  } catch (error) {
    console.error("Feature flags GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch feature flags" },
      { status: 500 }
    );
  }
}

/**
 * POST — Create a feature flag
 * Body: { key, enabled?, rolloutPercent?, allowedUsers?, description? }
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const { key, enabled, rolloutPercent, allowedUsers, description } =
      await request.json();

    if (!key) {
      return NextResponse.json({ error: "key required" }, { status: 400 });
    }

    const db = getDb();

    const [flag] = await db
      .insert(featureFlags)
      .values({
        key,
        enabled: enabled ?? false,
        rolloutPercent: rolloutPercent ?? 100,
        allowedUsers: allowedUsers || null,
        description: description || null,
        updatedBy: auth.userId,
      })
      .returning();

    return NextResponse.json({ flag }, { status: 201 });
  } catch (error) {
    console.error("Feature flags POST error:", error);
    return NextResponse.json(
      { error: "Failed to create feature flag" },
      { status: 500 }
    );
  }
}

/**
 * PUT — Toggle or update a feature flag
 * Body: { key, enabled?, rolloutPercent?, allowedUsers?, description? }
 */
export async function PUT(request: Request) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const { key, enabled, rolloutPercent, allowedUsers, description } =
      await request.json();

    if (!key) {
      return NextResponse.json({ error: "key required" }, { status: 400 });
    }

    const db = getDb();

    const setData: Record<string, unknown> = {
      updatedBy: auth.userId,
      updatedAt: new Date(),
    };
    if (enabled !== undefined) setData.enabled = enabled;
    if (rolloutPercent !== undefined) setData.rolloutPercent = rolloutPercent;
    if (allowedUsers !== undefined) setData.allowedUsers = allowedUsers;
    if (description !== undefined) setData.description = description;

    const [updated] = await db
      .update(featureFlags)
      .set(setData)
      .where(eq(featureFlags.key, key))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: "Feature flag not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ flag: updated });
  } catch (error) {
    console.error("Feature flags PUT error:", error);
    return NextResponse.json(
      { error: "Failed to update feature flag" },
      { status: 500 }
    );
  }
}
