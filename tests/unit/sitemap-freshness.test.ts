// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
const state = vi.hoisted(() => ({
  islandSlug: "old-island", missing: false, lookupError: false, queries: 0,
  revalidate: vi.fn(), warn: vi.fn(),
}));
vi.mock("@neondatabase/serverless", () => ({ neon: () => ({}) }));
vi.mock("drizzle-orm/neon-http", () => ({ drizzle: () => ({
  select: (selection: Record<string, unknown>) => new Query(selection),
  selectDistinct: (selection: Record<string, unknown>) => new Query(selection),
}) }));
vi.mock("next/cache", () => ({ revalidatePath: state.revalidate }));
vi.mock("@/lib/logger", () => ({ logger: { warn: state.warn } }));
import sitemap from "@/app/sitemap";
import { revalidateListing } from "@/lib/revalidate-listing";
class Query {
  private table = "";
  constructor(private selection: Record<string, unknown>) {}
  from(table: Parameters<typeof getTableName>[0]) { this.table = getTableName(table); return this; }
  innerJoin() { return this; } where() { return this; } groupBy() { return this; } limit() { return this; }
  then(resolve: (rows: Record<string, unknown>[]) => unknown, reject: (reason: Error) => unknown) {
    state.queries++;
    if (this.table === "listings" && "islandSlug" in this.selection && !("updatedAt" in this.selection)) {
      if (state.lookupError) return Promise.reject(new Error("Synthetic lookup unavailable")).then(resolve, reject);
      return Promise.resolve(state.missing ? [] : [{ slug: "moved-listing", islandSlug: state.islandSlug }]).then(resolve, reject);
    }
    const rows = this.table === "islands" && "isActive" in this.selection ? [{ slug: state.islandSlug, isActive: true }]
      : this.table === "listings" && "updatedAt" in this.selection ? [{ slug: "moved-listing", islandSlug: state.islandSlug, updatedAt: new Date("2026-10-16T00:00:00Z") }]
      : this.table === "listings" && "n" in this.selection ? [{ slug: state.islandSlug, type: "tour", n: 3 }] : [];
    return Promise.resolve(rows).then(resolve, reject);
  }
}
beforeEach(() => {
  vi.clearAllMocks(); state.revalidate.mockReset(); state.islandSlug = "old-island"; state.missing = false; state.lookupError = false; state.queries = 0;
  vi.stubEnv("DATABASE_URL", "postgresql://synthetic.invalid/test");
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected network access"); }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("invalidates catalogue metadata after an edit and emits current listing paths on regeneration", async () => {
  const before = await sitemap();
  expect(before.some(item => item.url === "https://vakaygo.com/old-island/moved-listing")).toBe(true);
  state.islandSlug = "new-island";
  await revalidateListing("synthetic-listing");
  expect(state.revalidate.mock.calls.map(call => call[0])).toEqual(["/sitemap.xml", "/new-island/moved-listing", "/new-island"]);
  const after = await sitemap();
  expect(after.some(item => item.url === "https://vakaygo.com/new-island/moved-listing")).toBe(true);
  expect(after.some(item => item.url === "https://vakaygo.com/old-island/moved-listing")).toBe(false);
  expect(after.some(item => item.url === "https://vakaygo.com/explore?island=new-island&amp;type=tour")).toBe(true);
  expect(fetch).not.toHaveBeenCalled();
});
it.each(["missing", "lookupError"] as const)("still invalidates the sitemap when the listing lookup is %s", async reason => {
  state[reason] = true;
  await expect(revalidateListing("synthetic-listing")).resolves.toBeUndefined();
  expect(state.revalidate).toHaveBeenCalledExactlyOnceWith("/sitemap.xml");
  expect(fetch).not.toHaveBeenCalled();
});
it("keeps existing listing and destination invalidation working if sitemap invalidation fails", async () => {
  state.revalidate.mockImplementation(path => { if (path === "/sitemap.xml") throw new Error("Synthetic cache failure"); });
  await expect(revalidateListing("synthetic-listing")).resolves.toBeUndefined();
  expect(state.revalidate).toHaveBeenCalledWith("/old-island/moved-listing");
  expect(state.revalidate).toHaveBeenCalledWith("/old-island");
  expect(state.warn).toHaveBeenCalledWith("Sitemap revalidation failed", { listingId: "synthetic-listing" });
});
it("preserves the static-route preview fallback without querying a missing database", async () => {
  vi.stubEnv("DATABASE_URL", "");
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const result = await sitemap();
  expect(result.some(item => item.url === "https://vakaygo.com")).toBe(true);
  expect(result.some(item => item.url.includes("/moved-listing"))).toBe(false);
  expect(state.queries).toBe(0); expect(warn).toHaveBeenCalledOnce(); expect(fetch).not.toHaveBeenCalled();
});