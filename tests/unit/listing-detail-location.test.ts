// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ rows: [] as unknown[][] }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => ({}) }));
vi.mock("drizzle-orm/neon-http", () => ({ drizzle: () => ({ select: () => new Query() }) }));
vi.mock("@/server/business-onboarding", () => ({ getListingBookingEligibility: async () => ({ eligible: false, reason: "launch_disabled" }) }));
class Query {
  from() { return this; } innerJoin() { return this; } where() { return this; } orderBy() { return this; } limit() { return this; }
  then(resolve: (value: unknown[]) => unknown) { return Promise.resolve(state.rows.shift() || []).then(resolve); }
}
import { getListingDetail } from "@/server/listing-detail";
import { listingStructuredData } from "@/lib/listing-structured-data";
import manifest from "@/server/data/location-quarantine.json";
const point = manifest.entries[0];
const listing = () => ({ id: point.id, title: "Observed directory entry", slug: "observed-entry", type: "tour", islandId: 1, islandSlug: "owned-island", islandName: "Owned island", islandCountry: "GD", address: "Recorded address", parish: null, description: null, latitude: point.latitude, longitude: point.longitude, meetingPointLat: point.latitude, meetingPointLng: point.longitude, typeData: {}, isInstantBook: true });
beforeEach(() => { state.rows = []; });
it("withholds exact suspect main/similar/meeting points and resulting JSON-LD geo while retaining business and booking state", async () => {
  const row = listing(); state.rows = [[row], [], [row], []];
  const result = await getListingDetail(row.slug, row.islandSlug);
  expect(result!.listing).toMatchObject({ title: row.title, address: row.address, latitude: null, longitude: null, meetingPointLat: null, meetingPointLng: null, bookingEligible: false, isInstantBook: false });
  expect(result!.similar[0]).toMatchObject({ id: row.id, latitude: null, longitude: null });
  expect(listingStructuredData(result!.listing as unknown as Parameters<typeof listingStructuredData>[0])["@graph"][0]).not.toHaveProperty("geo");
});
it("retains corrected coordinates on the same ID and distinct recorded meeting points", async () => {
  const row = { ...listing(), latitude: String(Number(point.latitude) + 0.001), meetingPointLat: String(Number(point.latitude) + 0.002) };
  state.rows = [[row], [], [row], []];
  const result = await getListingDetail(row.slug, row.islandSlug);
  expect(result!.listing.latitude).toBe(row.latitude); expect(result!.listing.longitude).toBe(row.longitude);
  expect(result!.listing.meetingPointLat).toBe(row.meetingPointLat); expect(result!.listing.meetingPointLng).toBe(row.meetingPointLng);
  expect(result!.similar[0].latitude).toBe(row.latitude);
});
it("withholds a matching main point while keeping a different meeting point", async () => {
  const row = { ...listing(), meetingPointLat: String(Number(point.latitude) + 0.002) };
  state.rows = [[row], [], []];
  const result = await getListingDetail(row.slug, row.islandSlug);
  expect(result!.listing.latitude).toBeNull(); expect(result!.listing.longitude).toBeNull();
  expect(result!.listing.meetingPointLat).toBe(row.meetingPointLat); expect(result!.listing.meetingPointLng).toBe(row.meetingPointLng);
});