import { and, eq, ne, sql } from "drizzle-orm";
import { islands, listings } from "@/drizzle/schema";

export function publicDestinations() {
  return and(eq(islands.isActive, true), sql`${islands.name} ~ ${"[^[:space:]]"}`,
    sql`${islands.slug} ~ ${"[^[:space:]]"}`)!;
}

/** A public card must lead to a usable listing on a published destination. */
export function publicDirectoryListings() {
  const nonWhitespace = "[^[:space:]]";
  return and(
    eq(listings.status, "active"),
    publicDestinations(),
    ne(listings.operatorId, "197d8586-7fd3-4999-91de-a50ad7d70e23"),
    sql`${listings.title} ~ ${nonWhitespace}`,
    sql`${listings.slug} ~ ${nonWhitespace}`,
  )!;
}
