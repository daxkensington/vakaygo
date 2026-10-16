import { expect, it } from "vitest";
import { resolveListingGuestCapacity } from "@/lib/listing-capacity";

const cases: Array<[number | null, unknown, number | null]> = [
  [4, 1, 4], [4, undefined, 4], [2, 10, 2], [0, 10, null], [-1, 10, null],
  [null, 3, 3], [null, "3", 3], [null, "03", null], [null, "3.5", null],
  [null, "invalid", null], [null, "999999999999999999", null], [null, [4], null],
  [null, true, null], [null, {}, null], [null, undefined, null],
];
it.each(cases)("resolves authoritative capacity %s over legacy %s as %s", (column, legacy, expected) => {
  expect(resolveListingGuestCapacity(column, legacy)).toBe(expected);
});
