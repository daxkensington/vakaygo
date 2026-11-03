// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { getTableName, SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
const state = vi.hoisted(() => ({ queries: [] as { table: string; joins: string[]; where?: SQL; selection: Record<string, unknown> }[] }));
vi.mock("@/server/db", () => ({ createDb: () => ({ select: (selection: Record<string, unknown>) => new Query(selection), selectDistinct: (selection: Record<string, unknown>) => new Query(selection) }) }));
import { getActiveIslands, getActiveIslandsWithCounts, getListingForSeo, getIslandBySlug, getTopListingsByType, getTopListingsForIsland, getAllListingSlugsForIsland, getIslandStats, getIslandsWithDining, getIslandsWithStays } from "@/server/seo-queries";
class Query {
  table = ""; joins: string[] = []; predicate?: SQL;
  constructor(private selection: Record<string, unknown>) {}
  from(table: Parameters<typeof getTableName>[0]) { this.table = getTableName(table); return this; }
  innerJoin(table: Parameters<typeof getTableName>[0]) { this.joins.push(getTableName(table)); return this; }
  leftJoin(table: Parameters<typeof getTableName>[0]) { this.joins.push("left:" + getTableName(table)); return this; }
  where(predicate: SQL) { this.predicate = predicate; return this; }
  orderBy() { return this; } groupBy() { return this; } limit() { return this; }
  then(resolve: (rows: unknown[]) => unknown) { state.queries.push({ table: this.table, joins: this.joins, where: this.predicate, selection: this.selection }); return Promise.resolve([]).then(resolve); }
}
function compiled(value: unknown) { if (!(value instanceof SQL)) throw new Error("Expected SQL expression"); return new PgDialect().sqlToQuery(value); }
function expectPublic(value: unknown) {
 const query = compiled(value);
 for (const column of ['"listings"."status"', '"listings"."slug"', '"listings"."title"', '"listings"."operator_id"', '"islands"."is_active"', '"islands"."slug"', '"islands"."name"']) expect(query.sql).toContain(column);
 expect(query.params).toContain("active"); expect(query.params).toContain(true); expect(query.params).toContain("197d8586-7fd3-4999-91de-a50ad7d70e23"); expect(query.params).toContain("[^[:space:]]");
}
beforeEach(() => { state.queries = []; });
it("uses the same public directory fence for SEO details, cards, crawl slugs, stats and category destinations", async () => {
 await getListingForSeo("grenada", "a-tour"); await getTopListingsByType(1, "tour"); await getTopListingsForIsland(1); await getAllListingSlugsForIsland(1); await getIslandStats(1); await getIslandsWithDining(); await getIslandsWithStays();
 expect(state.queries).toHaveLength(8);
 for (const query of state.queries) { expectPublic(query.where); expect(query.table === "islands" ? query.joins : query.joins.filter(value => value === "islands")).not.toHaveLength(0); }
});
it("counts eligible listings inside CASE without dropping destinations with zero public listings", async () => {
 await getActiveIslandsWithCounts(); const query = state.queries[0];
 expect(query.joins).toContain("left:listings"); expectPublic(query.selection.listingCount);
 expect(compiled(query.selection.listingCount).sql).toContain("COUNT(CASE WHEN");
 expect(compiled(query.where).sql).not.toContain('"listings"');
});
it("does not publish inactive or blank destination metadata", async () => {
 await getActiveIslands(); await getIslandBySlug("grenada");
 for (const query of state.queries) { const where = compiled(query.where); expect(where.sql).toContain('"islands"."is_active"'); expect(where.sql).toContain('"islands"."slug"'); expect(where.sql).toContain('"islands"."name"'); expect(where.params).toContain(true); }
});
it("ignores unknown listing types before issuing SQL", async () => { expect(await getTopListingsByType(1, "unsupported")).toEqual([]); expect(state.queries).toEqual([]); });
