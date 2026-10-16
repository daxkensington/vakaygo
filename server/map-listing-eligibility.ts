import { and, eq, gte, lte, ne, sql } from "drizzle-orm";
import { islands, listings } from "@/drizzle/schema";

/** Public pins need usable listing links, including when old imports have blank slugs. */
export function publicMapLocations(island: string | null) {
  const nonWhitespace = "[^[:space:]]";
  return and(
    eq(listings.status, "active"), eq(islands.isActive, true),
    ne(listings.operatorId, "197d8586-7fd3-4999-91de-a50ad7d70e23"),
    sql`${listings.title} ~ ${nonWhitespace}`,
    sql`${listings.slug} ~ ${nonWhitespace}`,
    sql`${islands.name} ~ ${nonWhitespace}`,
    sql`${islands.slug} ~ ${nonWhitespace}`,
    gte(listings.latitude, "-90"), lte(listings.latitude, "90"),
    gte(listings.longitude, "-180"), lte(listings.longitude, "180"),
    island ? eq(islands.slug, island) : undefined,
  );
}
