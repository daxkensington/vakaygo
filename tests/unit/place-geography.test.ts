// @vitest-environment node
import { expect, it } from "vitest";
import { placeSearchArea, placeWithinSearchArea } from "@/scripts/lib/place-geography";

const point = (lat: unknown, lng: unknown) => ({ geometry: { location: { lat, lng } } });
const area = { latitude: 0, longitude: 0, radiusMeters: 30_000 };

it("accepts valid database centers including the equator and rejects malformed or missing centers", () => {
  expect(placeSearchArea("12.1165", "-61.679", 25_000)).toEqual({ latitude: 12.1165, longitude: -61.679, radiusMeters: 25_000 });
  expect(placeSearchArea(0, 0, 30_000)).toEqual(area);
  expect(placeSearchArea(90, 180, 30_000)).not.toBeNull();
  for (const value of [null, undefined, "", " ", "12junk", "Infinity", NaN, Infinity, {}, []]) {
    expect(placeSearchArea(value, 0, 30_000)).toBeNull(); expect(placeSearchArea(0, value, 30_000)).toBeNull();
  }
  expect(placeSearchArea(90.01, 0, 30_000)).toBeNull(); expect(placeSearchArea(0, -180.01, 30_000)).toBeNull();
  for (const radius of [0, -1, NaN, Infinity]) expect(placeSearchArea(0, 0, radius)).toBeNull();
});

it.each([null, undefined, {}, { geometry: null }, { geometry: [] }, { geometry: {} }, { geometry: { location: null } }, point(undefined, 0), point(0, undefined), point("0", 0), point(0, "0"), point(NaN, 0), point(0, Infinity), point(-90.01, 0), point(0, 180.01)])(
  "rejects missing, coerced or out-of-range provider geometry (%j)", place => {
    expect(placeWithinSearchArea(place, area)).toBe(false);
  },
);

it("uses the configured circle with near-boundary inclusion and exclusion", () => {
  expect(placeWithinSearchArea(point(0, 0), area)).toBe(true);
  // At the equator these are approximately29999.3m and30000.4m east.
  expect(placeWithinSearchArea(point(0, 0.26979), area)).toBe(true);
  expect(placeWithinSearchArea(point(0, 0.26980), area)).toBe(false);
  expect(placeWithinSearchArea(point(0, 180), { ...area, radiusMeters: 20_000_000 })).toBe(false);
});

it("handles shortest distances across the dateline and near the pole", () => {
  const dateline = { ...area, longitude: 179.9 };
  expect(placeWithinSearchArea(point(0, -179.9), dateline)).toBe(true);
  expect(placeWithinSearchArea(point(0, -179.5), dateline)).toBe(false);
  expect(placeWithinSearchArea(point(89.9, -135), { ...area, latitude: 89.9, longitude: 45 })).toBe(true);
  expect(placeWithinSearchArea(point(90, 180), { ...area, latitude: 90 })).toBe(true);
});

it("rejects the evidenced Punta Cana coordinates for the Dominica search circle", () => {
  const dominica = placeSearchArea("15.4150", "-61.3710", 30_000)!;
  expect(placeWithinSearchArea(point(18.6527667, -68.4229232), dominica)).toBe(false);
  expect(placeWithinSearchArea(point(15.42, -61.37), dominica)).toBe(true);
  // Invalid destination readiness also fails closed when called directly.
  expect(placeWithinSearchArea(point(0, 0), { ...area, latitude: NaN })).toBe(false);
});
