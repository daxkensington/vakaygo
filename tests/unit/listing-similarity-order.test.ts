// @vitest-environment node
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { expect, it } from "vitest";
import { similarListingsQuery } from "@/server/listing-detail";

it("suggests bookable, then ownership-verified listings before ranking the rest by rating", () => {
  // Compiled only; nothing is sent to this address.
  const db = drizzle(neon("postgresql://nobody:nothing@localhost/none"));
  const { sql } = similarListingsQuery(db, { id: "68000000-0000-4000-8000-000000000000", type: "tour", islandId: 1 }).toSQL();
  const order = sql.slice(sql.toLowerCase().lastIndexOf("order by"));
  const bookable = order.indexOf("vakaygo_listing_bookable"), claimed = order.indexOf("vakaygo_listing_claim_verified"), rating = order.indexOf('"avg_rating"');
  expect(bookable).toBeGreaterThan(-1);
  expect(claimed).toBeGreaterThan(bookable);
  expect(rating).toBeGreaterThan(claimed);
});
