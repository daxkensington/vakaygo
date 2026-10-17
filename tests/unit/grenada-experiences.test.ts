// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const state = vi.hoisted(() => ({
  queries: [] as {
    table: string;
    selection: Record<string, unknown>;
    where?: SQL;
    limit?: number;
    offset?: number;
    order: SQL[];
  }[],
  island: [{ slug: "grenada", name: "Grenada" }],
  rows: [] as Record<string, unknown>[],
  counts: { totalCount: 51, "boat-trips": 25, "jet-ski": 1, "jeep-tours": 0, snorkeling: 2, hiking: 1, waterfalls: 2 },
  error: null as Error | null,
  opened: 0,
}));
vi.mock("@/server/db", () => ({
  createDb: () => {
    ++state.opened;
    return { select: (selection: Record<string, unknown>) => new Query(selection) };
  },
}));
vi.mock("@/lib/image-utils", () => ({ getImageUrl: (url: string | null) => url }));

import {
  GRENADA_EXPERIENCE_TOPICS,
  GRENADA_EXPERIENCES_MAX_PAGE,
  GRENADA_EXPERIENCES_PAGE_SIZE,
  getGrenadaExperienceTopic,
  isValidGrenadaExperiencesPage,
} from "@/lib/grenada-experiences";
import { grenadaExperiencesPredicate, loadGrenadaExperiences } from "@/server/grenada-experiences";

class Query {
  table = "";
  whereValue?: SQL;
  limitValue?: number;
  offsetValue?: number;
  order: SQL[] = [];
  constructor(private selection: Record<string, unknown>) {}
  from(table: Parameters<typeof getTableName>[0]) { this.table = getTableName(table); return this; }
  innerJoin() { return this; }
  where(value: SQL) { this.whereValue = value; return this; }
  orderBy(...values: SQL[]) { this.order = values; return this; }
  limit(value: number) { this.limitValue = value; return this; }
  offset(value: number) { this.offsetValue = value; return this; }
  then(resolve: (rows: unknown[]) => unknown, reject: (error: Error) => unknown) {
    state.queries.push({ table: this.table, selection: this.selection, where: this.whereValue, limit: this.limitValue, offset: this.offsetValue, order: this.order });
    const result = state.error
      ? Promise.reject(state.error)
      : Promise.resolve(this.table === "islands" ? state.island : this.selection.totalCount ? [state.counts] : state.rows);
    return result.then(resolve, reject);
  }
}
const dialect = new PgDialect();
function compiled(value: unknown) {
  if (!(value instanceof SQL)) throw new Error("Expected SQL");
  return dialect.sqlToQuery(value);
}

beforeEach(() => {
  state.queries = [];
  state.island = [{ slug: "grenada", name: "Grenada" }];
  state.rows = [];
  state.counts = { totalCount: 51, "boat-trips": 25, "jet-ski": 1, "jeep-tours": 0, snorkeling: 2, hiking: 1, waterfalls: 2 };
  state.error = null;
  state.opened = 0;
});

describe("closed Grenada directory topics", () => {
  it("accepts exactly the six initial topics and rejects unlaunched or malformed topics", () => {
    expect(GRENADA_EXPERIENCE_TOPICS.map((topic) => topic.slug)).toEqual(["boat-trips", "jet-ski", "jeep-tours", "snorkeling", "hiking", "waterfalls"]);
    for (const topic of GRENADA_EXPERIENCE_TOPICS) expect(getGrenadaExperienceTopic(topic.slug)).toBe(topic);
    for (const invalid of ["", "boats", "landfall", "oasis", "honeymoon", "whale-watching", "Boat-trips", "../boat-trips", "__proto__"]) {
      expect(getGrenadaExperienceTopic(invalid)).toBeNull();
    }
  });

  it.each([0, -1, 1.5, 1001, Infinity, NaN])("rejects invalid page %s before opening a DB client", async (page) => {
    expect(isValidGrenadaExperiencesPage(page)).toBe(false);
    await expect(loadGrenadaExperiences(undefined, page)).rejects.toThrow(RangeError);
    expect(state.opened).toBe(0);
  });

  it("bounds paging and rejects unknown runtime topics without querying", async () => {
    expect(GRENADA_EXPERIENCES_PAGE_SIZE).toBe(24);
    expect(GRENADA_EXPERIENCES_MAX_PAGE).toBe(1000);
    expect(isValidGrenadaExperiencesPage(1)).toBe(true);
    expect(isValidGrenadaExperiencesPage(1000)).toBe(true);
    await expect(loadGrenadaExperiences("landfall" as "boat-trips")).rejects.toThrow("Unknown");
    await expect(loadGrenadaExperiences("" as "boat-trips")).rejects.toThrow("Unknown");
    expect(state.opened).toBe(0);
  });

  it("uses public active Grenada activity predicates and only title evidence", () => {
    const query = compiled(grenadaExperiencesPredicate("boat-trips"));
    for (const column of ["status", "operator_id", "title", "slug", "is_active", "name", "type"]) expect(query.sql).toContain('"' + column + '"');
    for (const value of ["active", true, "grenada", "tour", "excursion", "guide", "197d8586-7fd3-4999-91de-a50ad7d70e23"]) expect(query.params).toContain(value);
    expect(query.sql).toContain('"listings"."title" ~*');
    expect(query.params).toContain(getGrenadaExperienceTopic("boat-trips")!.titlePattern);
    expect(query.sql).not.toMatch(/description|headline|type_data|latitude|longitude|bookable|price/i);
  });
});

it("projects discovery fields only and keeps category totals/paging aligned", async () => {
  state.rows = [{
    id: "a", title: "Boat Day", slug: "boat-day", type: "tour", islandSlug: "grenada", parish: "St George", image: null,
    priceAmount: "999", bookingEligible: true, description: "Open daily and free", operatorId: "private",
  }];
  const data = await loadGrenadaExperiences("boat-trips", 2);
  expect(data.listings).toEqual([{ id: "a", title: "Boat Day", slug: "boat-day", type: "tour", islandSlug: "grenada", parish: "St George", image: null }]);
  expect(data).toMatchObject({ totalCount: 25, totalPages: 2, page: 2, pageSize: 24, topic: { slug: "boat-trips" } });
  expect(data.topics.find((topic) => topic.slug === "jeep-tours")?.count).toBe(0);
  const cards = state.queries.find((query) => "id" in query.selection)!;
  expect(Object.keys(cards.selection).sort()).toEqual(["id", "title", "slug", "type", "islandSlug", "parish", "image"].sort());
  expect(cards.limit).toBe(24);
  expect(cards.offset).toBe(24);
  expect(cards.order.map((value) => compiled(value).sql)).toEqual(['"listings"."title" asc', '"listings"."id" asc']);
  const counts = state.queries.find((query) => "totalCount" in query.selection)!;
  expect(compiled(counts.where).params).not.toContain(getGrenadaExperienceTopic("boat-trips")!.titlePattern);
  expect(compiled(counts.selection["boat-trips"]).params).toEqual([getGrenadaExperienceTopic("boat-trips")!.titlePattern]);
});

it("returns hub totals and bounded final-page offsets without restricting the hub to a topic", async () => {
  const data = await loadGrenadaExperiences(undefined, 1000);
  expect(data).toMatchObject({ totalCount: 51, totalPages: 3, page: 1000, topic: null });
  expect(state.queries.find((query) => "id" in query.selection)?.offset).toBe(23976);
  expect(compiled(state.queries.find((query) => "id" in query.selection)?.where).sql).not.toContain("~*");
});

it("distinguishes successful empty categories from query failures", async () => {
  const empty = await loadGrenadaExperiences("jeep-tours");
  expect(empty).toMatchObject({ totalCount: 0, totalPages: 0, listings: [] });
  state.error = new Error("database unavailable");
  await expect(loadGrenadaExperiences("jeep-tours")).rejects.toThrow("database unavailable");
});

it("keeps pagination within the accepted route range while preserving the catalogue count", async () => {
  state.counts.totalCount = 24001;
  const data = await loadGrenadaExperiences(undefined, 1000);
  expect(data).toMatchObject({ totalCount: 24001, totalPages: 1000, page: 1000 });
});

it("does not manufacture destination metadata when Grenada is inactive or unavailable", async () => {
  state.island = [];
  const data = await loadGrenadaExperiences();
  expect(data.island).toBeNull();
});
