import type { MetadataRoute } from "next";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { islands, listings } from "@/drizzle/schema";
import { eq } from "drizzle-orm";

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
  ];

  // Island pages
  const allIslands = await db
    .select({ slug: islands.slug })
    .from(islands);

  const islandPages: MetadataRoute.Sitemap = allIslands.map((island) => ({
    url: `${BASE_URL}/${island.slug}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: 0.8,
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

  return [...staticPages, ...islandPages, ...listingPages];
}
