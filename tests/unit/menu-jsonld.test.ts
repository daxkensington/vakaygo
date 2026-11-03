import { expect, it } from "vitest";
import { parseJsonLdMenuObj } from "@/lib/menu-jsonld";
import { recordValue, textList, errorMessage } from "@/lib/value-guards";
it.each([null, false, "menu", [], 42])("ignores invalid supplier menu roots (%j)", value => { expect(parseJsonLdMenuObj(value)).toEqual([]); });
it("skips malformed items while retaining finite zero prices and valid singleton sections", () => {
  expect(parseJsonLdMenuObj({ hasMenuSection: { name: "Lunch", hasMenuItem: [null, "bad", { name: 42 }, { name: " " }, { name: "Soup", offers: { price: 0 }, description: { bad: true } }, { name: "Fish", offers: { price: "25" }, description: "Fresh" }, { name: "Water", price: Infinity }] } })).toEqual([{ section: "Lunch", items: [{ name: "Soup", price: "$0", description: undefined }, { name: "Fish", price: "$25", description: "Fresh" }, { name: "Water", price: undefined, description: undefined }] }]);
});
it("supports direct items when sections contain no valid items", () => { expect(parseJsonLdMenuObj({ hasMenuSection: [null, { hasMenuItem: [] }], hasMenuItem: { name: "Tea", price: 2 } })).toEqual([{ section: "Menu", items: [{ name: "Tea", price: "$2", description: undefined }] }]); });
it("narrows provider objects and lists without accepting arrays or mixed list members", () => {
  expect(recordValue(null)).toEqual({}); expect(recordValue([])).toEqual({}); expect(recordValue({ id: "a" })).toEqual({ id: "a" });
  expect(textList(["Monday", "Tuesday"])).toEqual(["Monday", "Tuesday"]); expect(textList(["Monday", 2])).toBeUndefined();
  expect(errorMessage(new Error("offline"))).toBe("offline"); expect(errorMessage({ message: 3 })).toBe("Unknown error");
});
