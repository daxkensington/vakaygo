import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { desc, eq } from "drizzle-orm";
import { blogPosts, islands } from "@/drizzle/schema";
import { logger } from "@/lib/logger";

export type GuideLink = {
  slug: string;
  title: string;
  category: string;
  islandName: string | null;
};

/**
 * Every published guide, for the server-rendered index on /guides.
 *
 * The interactive list on that page loads from /api/blog in the browser,
 * and robots.txt disallows /api, so without this index a crawler finds no
 * link to any guide. Returns [] when the database is unreachable so the
 * page still renders (the browser list keeps working).
 */
export async function getPublishedGuideLinks(): Promise<GuideLink[]> {
  const url = process.env.DATABASE_URL;
  if (!url) return [];
  try {
    const db = drizzle(neon(url));
    return await db
      .select({
        slug: blogPosts.slug,
        title: blogPosts.title,
        category: blogPosts.category,
        islandName: islands.name,
      })
      .from(blogPosts)
      .leftJoin(islands, eq(blogPosts.islandId, islands.id))
      .where(eq(blogPosts.status, "published"))
      .orderBy(desc(blogPosts.publishedAt), blogPosts.title)
      .limit(500);
  } catch (error) {
    logger.error("guides index query failed", error);
    return [];
  }
}
