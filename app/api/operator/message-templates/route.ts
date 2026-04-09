import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { messageTemplates } from "@/drizzle/schema";
import { eq, and } from "drizzle-orm";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev-secret-change-in-production"
);

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

async function getOperatorId(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload.id as string;
  } catch {
    return null;
  }
}

/**
 * GET — List operator's message templates
 */
export async function GET() {
  try {
    const operatorId = await getOperatorId();
    if (!operatorId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();

    const templates = await db
      .select()
      .from(messageTemplates)
      .where(eq(messageTemplates.operatorId, operatorId))
      .orderBy(messageTemplates.createdAt);

    return NextResponse.json({ templates });
  } catch (error) {
    console.error("Message templates GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch templates" },
      { status: 500 }
    );
  }
}

/**
 * POST — Create a message template
 * Body: { title, content, shortcut? }
 */
export async function POST(request: Request) {
  try {
    const operatorId = await getOperatorId();
    if (!operatorId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { title, content, shortcut } = await request.json();

    if (!title || !content) {
      return NextResponse.json(
        { error: "title and content required" },
        { status: 400 }
      );
    }

    const db = getDb();

    const [template] = await db
      .insert(messageTemplates)
      .values({
        operatorId,
        title,
        content,
        shortcut: shortcut || null,
      })
      .returning();

    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    console.error("Message templates POST error:", error);
    return NextResponse.json(
      { error: "Failed to create template" },
      { status: 500 }
    );
  }
}

/**
 * PUT — Update a message template
 * Body: { id, title?, content?, shortcut? }
 */
export async function PUT(request: Request) {
  try {
    const operatorId = await getOperatorId();
    if (!operatorId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, title, content, shortcut } = await request.json();
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const db = getDb();

    const setData: Record<string, unknown> = {};
    if (title !== undefined) setData.title = title;
    if (content !== undefined) setData.content = content;
    if (shortcut !== undefined) setData.shortcut = shortcut;

    const [updated] = await db
      .update(messageTemplates)
      .set(setData)
      .where(
        and(
          eq(messageTemplates.id, id),
          eq(messageTemplates.operatorId, operatorId)
        )
      )
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ template: updated });
  } catch (error) {
    console.error("Message templates PUT error:", error);
    return NextResponse.json(
      { error: "Failed to update template" },
      { status: 500 }
    );
  }
}

/**
 * DELETE — Remove a message template
 * Query: ?id=xxx
 */
export async function DELETE(request: Request) {
  try {
    const operatorId = await getOperatorId();
    if (!operatorId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const db = getDb();

    const deleted = await db
      .delete(messageTemplates)
      .where(
        and(
          eq(messageTemplates.id, id),
          eq(messageTemplates.operatorId, operatorId)
        )
      )
      .returning();

    if (deleted.length === 0) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Message templates DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to delete template" },
      { status: 500 }
    );
  }
}
