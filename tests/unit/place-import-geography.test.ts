// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it } from "vitest";
import * as geography from "@/scripts/lib/place-geography";

type Table = { name: string };
const importers = [
  ["import-google-places.ts", "Grenada", 12.1165, -61.679, 25_000, 25],
  ["import-caribbean-google.ts", "Dominica", 15.415, -61.371, 30_000, 16],
  ["import-new-verticals-google.ts", "Dominica", 15.415, -61.371, 30_000, 20],
] as const;

async function runImporter(file: string, name: string, latitude: number | null, longitude: number) {
  const script = readFileSync(resolve("scripts", file), "utf8");
  const parsed = ts.createSourceFile(file, script, ts.ScriptTarget.Latest, true);
  // Replace only the CLI entry point. Tests invoke the actual main function
  // with an in-memory provider, database and timer; no import CLI is launched.
  const startup = parsed.statements.at(-1);
  if (!startup || !ts.isExpressionStatement(startup) || !ts.isCallExpression(startup.expression)
    || !ts.isPropertyAccessExpression(startup.expression.expression) || startup.expression.expression.name.text !== "catch"
    || !ts.isCallExpression(startup.expression.expression.expression)
    || startup.expression.expression.expression.expression.getText(parsed) !== "main") throw new Error("Unexpected importer entry point");
  const adapted = ts.createPrinter().printFile(ts.factory.updateSourceFile(parsed, parsed.statements.slice(0, -1))) + "\nexport { main };\n";
  const javascript = ts.transpileModule(adapted, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const inserted: Record<string, unknown>[] = [], requested: URL[] = [];
  let listingLookups = 0;
  const island = { id: 7, slug: name.toLowerCase(), name, latitude: latitude === null ? null : String(latitude), longitude: String(longitude) };
  function select() {
    let table = "";
    const query = {
      from(value: Table) { table = value.name; return query; }, where() { return query; }, limit() { return query; },
      then(accept: (rows: Record<string, unknown>[]) => unknown) {
        if (table === "listings") listingLookups++;
        return Promise.resolve(table === "islands" ? [island] : table === "users" ? [{ id: "synthetic-existing-operator" }] : []).then(accept);
      },
    };
    return query;
  }
  const db = {
    select,
    insert(table: Table) {
      if (table.name !== "listings") throw new Error("Unexpected fixture write");
      return { values(value: Record<string, unknown>) {
        inserted.push(value);
        return { then: (accept: (rows: unknown[]) => unknown) => Promise.resolve([]).then(accept), onConflictDoNothing: async () => {} };
      } };
    },
  };
  const good = { place_id: "shared-id", name: "Accepted local business", formatted_address: `Local street, ${name}`,
    geometry: { location: { lat: latitude ?? 0, lng: longitude } }, types: ["travel_agency"], business_status: "OPERATIONAL" };
  const distant = { ...good, name: "CJ Transfer Punta Cana", geometry: { location: { lat: 18.6527667, lng: -68.4229232 } } };
  const missing = { place_id: "missing-geometry", name: "Missing geometry", formatted_address: `Local street, ${name}`, types: ["travel_agency"] };
  const mocks: Record<string, unknown> = {
    "@neondatabase/serverless": { neon: () => ({}) },
    "drizzle-orm/neon-http": { drizzle: () => db },
    "../drizzle/schema": { islands: { name: "islands" }, listings: { name: "listings" }, users: { name: "users" } },
    "drizzle-orm": { eq: () => ({}), ne: () => ({}) },
    "./lib/place-geography": geography,
  };
  const loaded = { exports: {} as Record<string, unknown> };
  runInNewContext(`(function(require,module,exports){${javascript}\n})`, {
    process: { argv: ["node", file, "dominica"], env: { DATABASE_URL: "synthetic-offline", GOOGLE_PLACES_API_KEY: "synthetic-offline" }, exit: () => { throw new Error("Unexpected CLI exit"); } },
    console: { log() {}, error() {}, warn() {} }, setTimeout: (callback: () => void) => { callback(); return 0; },
    fetch: async (url: string) => {
      const parsedUrl = new URL(url); requested.push(parsedUrl);
      if (parsedUrl.pathname.endsWith("/textsearch/json")) return { json: async () => ({ status: "OK", results: [distant, missing, good] }) };
      if (parsedUrl.pathname.endsWith("/details/json")) return { json: async () => ({ status: "OK", result: {} }) };
      throw new Error("Unexpected provider endpoint");
    },
  }, { filename: file })((id: string) => { if (!(id in mocks)) throw new Error(`Unmocked import: ${id}`); return mocks[id]; }, loaded, loaded.exports);
  if (typeof loaded.exports.main !== "function") throw new Error("Missing adapted importer");
  await loaded.exports.main();
  return { inserted, requested, listingLookups };
}

it.each(importers)("%s rejects distant/missing geometry before details, database lookup and deduplication", async (file, name, lat, lng, radius, searches) => {
  const result = await runImporter(file, name, lat, lng);
  expect(result.inserted).toHaveLength(1);
  expect(result.inserted[0]).toMatchObject({ islandId: 7, title: "Accepted local business", latitude: String(lat), longitude: String(lng) });
  expect(result.listingLookups).toBe(1);
  const searchRequests = result.requested.filter(url => url.pathname.endsWith("/textsearch/json"));
  expect(searchRequests).toHaveLength(searches);
  expect(searchRequests.every(url => url.searchParams.get("location") === `${lat},${lng}` && url.searchParams.get("radius") === String(radius))).toBe(true);
  expect(result.requested.filter(url => url.pathname.endsWith("/details/json"))).toHaveLength(file === "import-google-places.ts" ? 1 : 0);
});

it.each(importers.slice(1))("%s skips a destination without a valid center instead of querying0,0", async (file, name, _lat, lng) => {
  const result = await runImporter(file, name, null, lng);
  expect(result.requested).toEqual([]); expect(result.inserted).toEqual([]); expect(result.listingLookups).toBe(0);
});
