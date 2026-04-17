import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { blogPosts, users, islands } from "@/drizzle/schema";
import { eq, and, ilike, desc, sql } from "drizzle-orm";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

import { logger } from "@/lib/logger";
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET!);

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

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);

    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "12")));
    const offset = (page - 1) * limit;
    const category = searchParams.get("category");
    const islandSlug = searchParams.get("island");
    const search = searchParams.get("q");

    const conditions = [eq(blogPosts.status, "published")];

    if (category) {
      conditions.push(eq(blogPosts.category, category));
    }
    if (islandSlug) {
      conditions.push(eq(islands.slug, islandSlug));
    }
    if (search) {
      conditions.push(ilike(blogPosts.title, `%${search}%`));
    }

    const whereClause = and(...conditions);

    // Count
    const [totalResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(blogPosts)
      .leftJoin(islands, eq(blogPosts.islandId, islands.id))
      .where(whereClause);

    const total = totalResult.count;

    // Fetch posts
    const posts = await db
      .select({
        id: blogPosts.id,
        slug: blogPosts.slug,
        title: blogPosts.title,
        excerpt: blogPosts.excerpt,
        coverImage: blogPosts.coverImage,
        category: blogPosts.category,
        tags: blogPosts.tags,
        publishedAt: blogPosts.publishedAt,
        authorName: users.name,
        authorAvatar: users.avatarUrl,
        islandName: islands.name,
        islandSlug: islands.slug,
      })
      .from(blogPosts)
      .innerJoin(users, eq(blogPosts.authorId, users.id))
      .leftJoin(islands, eq(blogPosts.islandId, islands.id))
      .where(whereClause)
      .orderBy(desc(blogPosts.publishedAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({
      posts,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    logger.error("Blog GET error", error);
    return NextResponse.json({ error: "Failed to fetch posts" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();
    const body = await request.json();

    const {
      title, slug, excerpt, content, coverImage,
      islandId, category, tags, status,
      metaTitle, metaDescription,
    } = body;

    if (!title || !slug || !content || !category) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const publishedAt = status === "published" ? new Date() : null;

    const [post] = await db
      .insert(blogPosts)
      .values({
        title,
        slug,
        excerpt: excerpt || null,
        content,
        coverImage: coverImage || null,
        authorId: user.sub,
        islandId: islandId ? parseInt(islandId) : null,
        category,
        tags: tags || [],
        status: status || "draft",
        metaTitle: metaTitle || null,
        metaDescription: metaDescription || null,
        publishedAt,
      })
      .returning();

    return NextResponse.json({ post }, { status: 201 });
  } catch (error: any) {
    logger.error("Blog POST error", error);
    if (error?.message?.includes("unique")) {
      return NextResponse.json({ error: "A post with this slug already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create post" }, { status: 500 });
  }
}
