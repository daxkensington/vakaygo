import type { MetadataRoute } from "next";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { islands, listings, blogPosts } from "@/drizzle/schema";
import { eq, and } from "drizzle-orm";

const BASE_URL = "https://vakaygo.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const db = drizzle(neon(process.env.DATABASE_URL!));

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: "daily", priority: 1.0 },
    { url: `${BASE_URL}/explore`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/islands`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/about`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/services`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/for-businesses`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/for-restaurants`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/terms`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE_URL}/privacy`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE_URL}/auth/signin`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/auth/signup`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/guides`, lastModified: new Date(), changeFrequency: "daily", priority: 0.8 },
  ];

  // Island pages
  const allIslands = await db
    .select({ slug: islands.slug, isActive: islands.isActive })
    .from(islands);

  const islandPages: MetadataRoute.Sitemap = allIslands.map((island) => ({
    url: `${BASE_URL}/${island.slug}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  // Programmatic SEO pages — things-to-do for all active islands
  const activeIslands = allIslands.filter((i) => i.isActive);

  const thingsToDoPages: MetadataRoute.Sitemap = activeIslands.map((island) => ({
    url: `${BASE_URL}/things-to-do-in-${island.slug}`,
    lastModified: new Date(),
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
    lastModified: new Date(),
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
    lastModified: new Date(),
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
    .where(eq(listings.status, "active"));

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

  return [
    ...staticPages,
    ...islandPages,
    ...thingsToDoPages,
    ...restaurantPages,
    ...hotelPages,
    ...listingPages,
    ...blogPages,
  ];
}
