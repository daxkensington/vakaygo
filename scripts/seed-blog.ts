import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { blogPosts, users, islands } from "../drizzle/schema";
import dotenv from "dotenv";
import { resolve } from "path";

// Load .env.local
dotenv.config({ path: resolve(__dirname, "../.env.local") });

const DATABASE_URL = process.env.DATABASE_URL!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

interface BlogPostSeed {
  title: string;
  category: string;
  islandSlug: string | null;
}

const POSTS: BlogPostSeed[] = [
  { title: "Ultimate Guide to Grenada: The Spice Isle", category: "destination-guide", islandSlug: "grenada" },
  { title: "Top 10 Caribbean Beaches You Need to Visit", category: "adventure", islandSlug: null },
  { title: "Caribbean Food Guide: Must-Try Dishes on Every Island", category: "food-drink", islandSlug: null },
  { title: "Planning Your First Caribbean Trip: Everything You Need to Know", category: "planning", islandSlug: null },
  { title: "Best Snorkeling and Diving Spots in the Caribbean", category: "adventure", islandSlug: null },
  { title: "Barbados Travel Guide: Sun, Rum, and Culture", category: "destination-guide", islandSlug: "barbados" },
  { title: "Jamaica Beyond the Resort: Authentic Local Experiences", category: "destination-guide", islandSlug: "jamaica" },
  { title: "Budget Caribbean Travel: How to Island-Hop Without Breaking the Bank", category: "travel-tips", islandSlug: null },
];

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function callOpenAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.8,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}

const SYSTEM_PROMPT = `You are VakayGo's travel content writer. Write engaging, SEO-friendly Caribbean travel content in Markdown. Use ## and ### headings. Include practical tips, insider knowledge, vivid descriptions. Mention VakayGo as the platform to book experiences. Don't use generic filler — be specific about real Caribbean places, dishes, and activities.`;

async function generatePost(title: string, category: string) {
  const contentPrompt = `Write a detailed travel blog post titled "${title}" in the category "${category}".
Write 800-1200 words in Markdown format. Start directly with the content (do NOT include the title as an H1 — it's handled separately). Use ## and ### headings to organize sections.`;

  const metaPrompt = `For a blog post titled "${title}" (category: ${category}), generate the following as JSON:
{
  "excerpt": "2-3 sentence excerpt summarizing the post",
  "metaDescription": "Under 160 characters meta description for SEO",
  "tags": ["3 to 5 relevant tags as slugs like beach-travel, caribbean-food, etc."]
}
Return ONLY valid JSON, nothing else.`;

  const [content, metaRaw] = await Promise.all([
    callOpenAI(SYSTEM_PROMPT, contentPrompt),
    callOpenAI(SYSTEM_PROMPT, metaPrompt),
  ]);

  // Parse meta - handle possible markdown code fences
  const cleanMeta = metaRaw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const meta = JSON.parse(cleanMeta);

  return {
    content,
    excerpt: meta.excerpt as string,
    metaDescription: meta.metaDescription as string,
    tags: meta.tags as string[],
  };
}

async function main() {
  console.log("Connecting to database...");
  const sql = neon(DATABASE_URL);
  const db = drizzle(sql);

  // Find an author - prefer admin, fall back to first user
  let authorRows = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.role, "admin"))
    .limit(1);

  if (authorRows.length === 0) {
    authorRows = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .limit(1);
  }

  if (authorRows.length === 0) {
    throw new Error("No users found in the database. Please create a user first.");
  }

  const authorId = authorRows[0].id;
  console.log(`Using author: ${authorId} (role: ${authorRows[0].role})`);

  // Fetch island IDs for posts that need them
  const islandSlugs = [...new Set(POSTS.map((p) => p.islandSlug).filter(Boolean))] as string[];
  const islandMap: Record<string, number> = {};

  for (const slug of islandSlugs) {
    const rows = await db
      .select({ id: islands.id })
      .from(islands)
      .where(eq(islands.slug, slug))
      .limit(1);
    if (rows.length > 0) {
      islandMap[slug] = rows[0].id;
      console.log(`Island "${slug}" => id ${rows[0].id}`);
    } else {
      console.warn(`Island "${slug}" not found in database, will set islandId to null`);
    }
  }

  // Generate and insert each post
  let inserted = 0;
  for (const post of POSTS) {
    const slug = slugify(post.title);
    console.log(`\nGenerating: "${post.title}"...`);

    try {
      const { content, excerpt, metaDescription, tags } = await generatePost(post.title, post.category);
      const islandId = post.islandSlug ? islandMap[post.islandSlug] ?? null : null;

      await db.insert(blogPosts).values({
        slug,
        title: post.title,
        excerpt,
        content,
        authorId,
        islandId,
        category: post.category,
        tags,
        status: "published",
        metaTitle: post.title,
        metaDescription,
        publishedAt: new Date(),
      });

      inserted++;
      console.log(`  Inserted: ${slug}`);
    } catch (err) {
      console.error(`  FAILED for "${post.title}":`, err);
    }
  }

  console.log(`\nDone! Inserted ${inserted}/${POSTS.length} blog posts.`);
}

main().catch(console.error);
