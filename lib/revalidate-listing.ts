import { revalidatePath } from "next/cache";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { listings, islands } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

/**
 * Public listing pages are ISR-cached for an hour. Call this after any
 * write that changes what a traveler sees (status, price, photos, claim
 * transfer, rating) so the change is live on the next request instead of
 * within the hour. Never throws — a cache miss is not worth failing the
 * write that just succeeded.
 */
export async function revalidateListing(listingId: string): Promise<void> {
  try {
    const db = drizzle(neon(process.env.DATABASE_URL!));
    const [row] = await db
      .select({ slug: listings.slug, islandSlug: islands.slug })
      .from(listings)
      .innerJoin(islands, eq(listings.islandId, islands.id))
      .where(eq(listings.id, listingId))
      .limit(1);
    if (!row) return;
    revalidatePath(`/${row.islandSlug}/${row.slug}`);
    revalidatePath(`/${row.islandSlug}`);
  } catch (err) {
    logger.warn("revalidateListing failed", { listingId, err: err instanceof Error ? err.message : String(err) });
  }
}
