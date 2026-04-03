import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { blogPosts, users, islands } from "@/drizzle/schema";
import { eq, and, ne, desc } from "drizzle-orm";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev-secret-change-in-production"
);

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

async function getUser() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, SECRET);
    return payload as { sub: string; role: string };
  } catch {
    return null;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const db = getDb();
    const user = await getUser();
    const isAdmin = user?.role === "admin";

    const conditions = [eq(blogPosts.slug, slug)];
    if (!isAdmin) {
      conditions.push(eq(blogPosts.status, "published"));
    }

    const [post] = await db
      .select({
        id: blogPosts.id,
        slug: blogPosts.slug,
        title: blogPosts.title,
        excerpt: blogPosts.excerpt,
        content: blogPosts.content,
        coverImage: blogPosts.coverImage,
        category: blogPosts.category,
        tags: blogPosts.tags,
        status: blogPosts.status,
        metaTitle: blogPosts.metaTitle,
        metaDescription: blogPosts.metaDescription,
        publishedAt: blogPosts.publishedAt,
        createdAt: blogPosts.createdAt,
        updatedAt: blogPosts.updatedAt,
        authorId: blogPosts.authorId,
        authorName: users.name,
        authorAvatar: users.avatarUrl,
        islandId: blogPosts.islandId,
        islandName: islands.name,
        islandSlug: islands.slug,
      })
      .from(blogPosts)
      .innerJoin(users, eq(blogPosts.authorId, users.id))
      .leftJoin(islands, eq(blogPosts.islandId, islands.id))
      .where(and(...conditions));

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Fetch related posts (same category or island, excluding current)
    const relatedConditions = [
      eq(blogPosts.status, "published"),
      ne(blogPosts.slug, slug),
    ];

    const related = await db
      .select({
        id: blogPosts.id,
        slug: blogPosts.slug,
        title: blogPosts.title,
        excerpt: blogPosts.excerpt,
        coverImage: blogPosts.coverImage,
        category: blogPosts.category,
        publishedAt: blogPosts.publishedAt,
        authorName: users.name,
      })
      .from(blogPosts)
      .innerJoin(users, eq(blogPosts.authorId, users.id))
      .where(and(...relatedConditions, eq(blogPosts.category, post.category)))
      .orderBy(desc(blogPosts.publishedAt))
      .limit(3);

    return NextResponse.json({ post, related });
  } catch (error) {
    console.error("Blog slug GET error:", error);
    return NextResponse.json({ error: "Failed to fetch post" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const user = await getUser();
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { slug } = await params;
    const db = getDb();
    const body = await request.json();

    const {
      title, slug: newSlug, excerpt, content, coverImage,
      islandId, category, tags, status,
      metaTitle, metaDescription,
    } = body;

    // If changing to published and wasn't published before, set publishedAt
    const [existing] = await db
      .select({ status: blogPosts.status, publishedAt: blogPosts.publishedAt })
      .from(blogPosts)
      .where(eq(blogPosts.slug, slug));

    if (!existing) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const publishedAt =
      status === "published" && existing.status !== "published"
        ? new Date()
        : existing.publishedAt;

    const [updated] = await db
      .update(blogPosts)
      .set({
        title,
        slug: newSlug || slug,
        excerpt: excerpt || null,
        content,
        coverImage: coverImage || null,
        islandId: islandId ? parseInt(islandId) : null,
        category,
        tags: tags || [],
        status,
        metaTitle: metaTitle || null,
        metaDescription: metaDescription || null,
        publishedAt,
        updatedAt: new Date(),
      })
      .where(eq(blogPosts.slug, slug))
      .returning();

    return NextResponse.json({ post: updated });
  } catch (error: any) {
    console.error("Blog PUT error:", error);
    if (error?.message?.includes("unique")) {
      return NextResponse.json({ error: "A post with this slug already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to update post" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const user = await getUser();
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { slug } = await params;
    const db = getDb();

    const [deleted] = await db
      .delete(blogPosts)
      .where(eq(blogPosts.slug, slug))
      .returning({ id: blogPosts.id });

    if (!deleted) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Blog DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete post" }, { status: 500 });
  }
}
