export const ISLAND_FLAGS: Record<string, string> = {
  "grenada": "🇬🇩",
  "barbados": "🇧🇧",
  "jamaica": "🇯🇲",
  "trinidad-and-tobago": "🇹🇹",
  "st-lucia": "🇱🇨",
  "antigua": "🇦🇬",
  "dominica": "🇩🇲",
  "bahamas": "🇧🇸",
  "aruba": "🇦🇼",
  "curacao": "🇨🇼",
  "dominican-republic": "🇩🇴",
  "turks-and-caicos": "🇹🇨",
  "cayman-islands": "🇰🇾",
  "bonaire": "🇧🇶",
  "st-kitts": "🇰🇳",
  "martinique": "🇲🇶",
  "guadeloupe": "🇬🇵",
  "usvi": "🇻🇮",
  "us-virgin-islands": "🇻🇮",
  "bvi": "🇻🇬",
  "british-virgin-islands": "🇻🇬",
  "puerto-rico": "🇵🇷",
  "st-vincent": "🇻🇨",
  // Wave 2A — Latin America & Central America
  "cartagena": "🇨🇴",
  "medellin": "🇨🇴",
  "cancun-riviera-maya": "🇲🇽",
  "los-cabos": "🇲🇽",
  "guanacaste": "🇨🇷",
  "ambergris-caye": "🇧🇿",
  // Wave 2B — Mediterranean Islands & Coasts
  "santorini": "🇬🇷",
  "mykonos": "🇬🇷",
  "crete": "🇬🇷",
  "ibiza": "🇪🇸",
  "mallorca": "🇪🇸",
  "amalfi-coast-capri": "🇮🇹",
  "hvar-split": "🇭🇷",
};

export function getIslandFlag(slug: string): string {
  return ISLAND_FLAGS[slug] || "🏝️";
}
