import type { MetadataRoute } from "next";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { islands, listings, blogPosts } from "@/drizzle/schema";
import { eq, and, sql } from "drizzle-orm";

const BASE_URL = "https://vakaygo.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const db = drizzle(neon(process.env.DATABASE_URL!));

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, changeFrequency: "daily", priority: 1.0 },
    { url: `${BASE_URL}/explore`, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/islands`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/about`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/services`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/for-businesses`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/for-restaurants`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE_URL}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    // Sign-in and account workflows are omitted from the discovery sitemap.
    { url: `${BASE_URL}/guides`, changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE_URL}/map`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/faq`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/contact`, changeFrequency: "monthly", priority: 0.5 },
  ];

  // Island pages
  const allIslands = await db
    .select({ slug: islands.slug, isActive: islands.isActive })
    .from(islands);

  const islandPages: MetadataRoute.Sitemap = allIslands.filter(island => island.isActive).map((island) => ({
    url: `${BASE_URL}/${island.slug}`,

    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  // Programmatic SEO pages — things-to-do for all active islands
  const activeIslands = allIslands.filter((i) => i.isActive);

  const thingsToDoPages: MetadataRoute.Sitemap = activeIslands.map((island) => ({
    url: `${BASE_URL}/things-to-do-in-${island.slug}`,

    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  // Islands with dining listings
  const diningIslands = await db
    .selectDistinct({ slug: islands.slug })
    .from(islands)
    .innerJoin(listings, eq(listings.islandId, islands.id))
    .where(
      and(
        eq(islands.isActive, true),
        eq(listings.type, "dining"),
        eq(listings.status, "active")
      )
    );

  const restaurantPages: MetadataRoute.Sitemap = diningIslands.map((island) => ({
    url: `${BASE_URL}/best-restaurants-${island.slug}`,

    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  // Islands with stay listings
  const stayIslands = await db
    .selectDistinct({ slug: islands.slug })
    .from(islands)
    .innerJoin(listings, eq(listings.islandId, islands.id))
    .where(
      and(
        eq(islands.isActive, true),
        eq(listings.type, "stay"),
        eq(listings.status, "active")
      )
    );

  const hotelPages: MetadataRoute.Sitemap = stayIslands.map((island) => ({
    url: `${BASE_URL}/best-hotels-${island.slug}`,

    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  // Listing pages (active only)
  const allListings = await db
    .select({
      slug: listings.slug,
      islandSlug: islands.slug,
      updatedAt: listings.updatedAt,
    })
    .from(listings)
    .innerJoin(islands, eq(listings.islandId, islands.id))
    .where(and(eq(listings.status, "active"), eq(islands.isActive, true), sql`${listings.operatorId} <> '197d8586-7fd3-4999-91de-a50ad7d70e23'`));

  const listingPages: MetadataRoute.Sitemap = allListings.map((listing) => ({
    url: `${BASE_URL}/${listing.islandSlug}/${listing.slug}`,
    lastModified: listing.updatedAt,
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));

  // Blog posts (published only) — wrapped in try/catch since table may not exist yet
  let blogPages: MetadataRoute.Sitemap = [];
  try {
    const allBlogPosts = await db
      .select({
        slug: blogPosts.slug,
        updatedAt: blogPosts.updatedAt,
      })
      .from(blogPosts)
      .where(eq(blogPosts.status, "published"));

    blogPages = allBlogPosts.map((post) => ({
      url: `${BASE_URL}/guides/${post.slug}`,
      lastModified: post.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));
  } catch {
    // blog_posts table may not exist yet — skip
  }

  // Explore landings: /explore?island=x and /explore?island=x&type=y for
  // every combination that has active listings. These are ISR pages
  // (next.config rewrites them to /explore/f/...) with their own title,
  // description and canonical.
  const facetCounts = await db
    .select({ slug: islands.slug, type: listings.type, n: sql<number>`count(*)::int` })
    .from(listings)
    .innerJoin(islands, eq(listings.islandId, islands.id))
    .where(and(eq(islands.isActive, true), eq(listings.status, "active")))
    .groupBy(islands.slug, listings.type);
  const facetIslands = Array.from(new Set(facetCounts.map((r) => r.slug)));
  const explorePages: MetadataRoute.Sitemap = [
    ...facetIslands.map((slug) => ({
      url: `${BASE_URL}/explore?island=${slug}`,

      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
    ...facetCounts
      .filter((r) => r.n >= 3)
      .map((r) => ({
        // Next does not XML-escape <loc>; a raw & would invalidate the whole sitemap.
        url: `${BASE_URL}/explore?island=${r.slug}&amp;type=${r.type}`,

        changeFrequency: "daily" as const,
        priority: 0.6,
      })),
  ];

  return [
    ...staticPages,
    ...islandPages,
    ...explorePages,
    ...thingsToDoPages,
    ...restaurantPages,
    ...hotelPages,
    ...listingPages,
    ...blogPages,
  ];
}
