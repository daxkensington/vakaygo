import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { blogPosts, users, islands } from "@/drizzle/schema";
import { eq } from "drizzle-orm";

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    const [post] = await db
      .select({
        id: blogPosts.id,
        slug: blogPosts.slug,
        title: blogPosts.title,
        excerpt: blogPosts.excerpt,
        content: blogPosts.content,
        coverImage: blogPosts.coverImage,
        authorId: blogPosts.authorId,
        islandId: blogPosts.islandId,
        category: blogPosts.category,
        tags: blogPosts.tags,
        status: blogPosts.status,
        metaTitle: blogPosts.metaTitle,
        metaDescription: blogPosts.metaDescription,
        publishedAt: blogPosts.publishedAt,
        createdAt: blogPosts.createdAt,
        updatedAt: blogPosts.updatedAt,
        authorName: users.name,
        islandName: islands.name,
      })
      .from(blogPosts)
      .innerJoin(users, eq(blogPosts.authorId, users.id))
      .leftJoin(islands, eq(blogPosts.islandId, islands.id))
      .where(eq(blogPosts.id, id));

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    return NextResponse.json({ post });
  } catch (error) {
    console.error("Admin blog [id] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch post" }, { status: 500 });
  }
}
