import { isRecord, recordValue, textValue } from "./value-guards";

export type MenuItem = { name: string; description?: string; price?: string };
export type MenuSection = { section: string; items: MenuItem[] };
function entries(value: unknown): unknown[] { return Array.isArray(value) ? value : value == null ? [] : [value]; }
function parseItems(value: unknown): MenuItem[] {
  return entries(value).flatMap(item => {
    if (!isRecord(item) || typeof item.name !== "string" || !item.name.trim()) return [];
    const rawPrice = recordValue(item.offers).price ?? item.price;
    const price = typeof rawPrice === "string" && rawPrice.trim() ? rawPrice
      : typeof rawPrice === "number" && Number.isFinite(rawPrice) ? String(rawPrice) : undefined;
    return [{ name: item.name, description: textValue(item.description), price: price === undefined ? undefined : "$" + price }];
  });
}
/** Supplier JSON may contain malformed sections/items. Ignore those rather than throwing. */
export function parseJsonLdMenuObj(value: unknown): MenuSection[] {
  if (!isRecord(value)) return [];
  const sections = entries(value.hasMenuSection ?? value.menuSection).flatMap(section => {
    if (!isRecord(section)) return [];
    const items = parseItems(section.hasMenuItem ?? section.menuItem ?? section.itemListElement);
    return items.length ? [{ section: textValue(section.name) || "Menu", items }] : [];
  });
  if (sections.length) return sections;
  const items = parseItems(value.hasMenuItem ?? value.menuItem ?? value.itemListElement);
  return items.length ? [{ section: "Menu", items }] : [];
}
