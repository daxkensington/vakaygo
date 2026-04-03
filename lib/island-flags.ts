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
};

export function getIslandFlag(slug: string): string {
  return ISLAND_FLAGS[slug] || "🏝️";
}
