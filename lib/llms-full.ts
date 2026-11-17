import { BUSINESS_MAILING_ADDRESS, OPERATING_BUSINESS } from "@/lib/brand";
import { DESTINATION_ESSENTIALS } from "@/lib/destination-facts";
import type { GuideLink } from "@/server/guides-queries";

export type LlmsDestinationEntry = {
  slug: string;
  name: string;
  region: "Caribbean" | "Latin America" | "Mediterranean";
  guideSlug: string;
  guideTitle: string;
};

export const LLMS_DESTINATION_DIRECTORY: LlmsDestinationEntry[] = [
  // Caribbean (21)
  { slug: "antigua", name: "Antigua & Barbuda", region: "Caribbean", guideSlug: "antigua-travel-guide-best-stays-tours-and-dining", guideTitle: "Antigua & Barbuda Travel Guide: Best Stays, Tours & Dining" },
  { slug: "aruba", name: "Aruba", region: "Caribbean", guideSlug: "aruba-travel-guide-best-stays-tours-and-dining", guideTitle: "Aruba Travel Guide: Best Stays, Tours & Dining" },
  { slug: "bahamas", name: "The Bahamas", region: "Caribbean", guideSlug: "bahamas-travel-guide-best-stays-tours-and-dining", guideTitle: "The Bahamas Travel Guide: Best Stays, Tours & Dining" },
  { slug: "barbados", name: "Barbados", region: "Caribbean", guideSlug: "barbados-travel-guide-sun-rum-and-culture", guideTitle: "Barbados Travel Guide: Sun, Rum & Culture" },
  { slug: "bonaire", name: "Bonaire", region: "Caribbean", guideSlug: "bonaire-travel-guide-best-stays-tours-and-dining", guideTitle: "Bonaire Travel Guide: Best Stays, Tours & Dining" },
  { slug: "british-virgin-islands", name: "British Virgin Islands", region: "Caribbean", guideSlug: "british-virgin-islands-travel-guide-best-stays-tours-and-dining", guideTitle: "British Virgin Islands Travel Guide: Best Stays, Tours & Dining" },
  { slug: "cayman-islands", name: "Cayman Islands", region: "Caribbean", guideSlug: "cayman-islands-travel-guide-best-stays-tours-and-dining", guideTitle: "Cayman Islands Travel Guide: Best Stays, Tours & Dining" },
  { slug: "curacao", name: "Curaçao", region: "Caribbean", guideSlug: "curacao-travel-guide-best-stays-tours-and-dining", guideTitle: "Curaçao Travel Guide: Best Stays, Tours & Dining" },
  { slug: "dominica", name: "Dominica", region: "Caribbean", guideSlug: "dominica-travel-guide-best-stays-tours-and-dining", guideTitle: "Dominica Travel Guide: Best Stays, Tours & Dining" },
  { slug: "dominican-republic", name: "Dominican Republic", region: "Caribbean", guideSlug: "dominican-republic-travel-guide-best-stays-tours-and-dining", guideTitle: "Dominican Republic Travel Guide: Best Stays, Tours & Dining" },
  { slug: "grenada", name: "Grenada", region: "Caribbean", guideSlug: "ultimate-guide-to-grenada-the-spice-isle", guideTitle: "Ultimate Guide to Grenada: The Spice Isle" },
  { slug: "guadeloupe", name: "Guadeloupe", region: "Caribbean", guideSlug: "guadeloupe-travel-guide-best-stays-tours-and-dining", guideTitle: "Guadeloupe Travel Guide: Best Stays, Tours & Dining" },
  { slug: "jamaica", name: "Jamaica", region: "Caribbean", guideSlug: "jamaica-beyond-the-resort-authentic-local-experiences", guideTitle: "Jamaica Beyond the Resort: Authentic Local Experiences" },
  { slug: "martinique", name: "Martinique", region: "Caribbean", guideSlug: "martinique-travel-guide-best-stays-tours-and-dining", guideTitle: "Martinique Travel Guide: Best Stays, Tours & Dining" },
  { slug: "puerto-rico", name: "Puerto Rico", region: "Caribbean", guideSlug: "puerto-rico-travel-guide-best-stays-tours-and-dining", guideTitle: "Puerto Rico Travel Guide: Best Stays, Tours & Dining" },
  { slug: "st-kitts", name: "St. Kitts & Nevis", region: "Caribbean", guideSlug: "st-kitts-travel-guide-best-stays-tours-and-dining", guideTitle: "St. Kitts & Nevis Travel Guide: Best Stays, Tours & Dining" },
  { slug: "st-lucia", name: "St. Lucia", region: "Caribbean", guideSlug: "st-lucia-travel-guide-best-stays-tours-and-dining", guideTitle: "St. Lucia Travel Guide: Best Stays, Tours & Dining" },
  { slug: "st-vincent", name: "St. Vincent & the Grenadines", region: "Caribbean", guideSlug: "st-vincent-travel-guide-best-stays-tours-and-dining", guideTitle: "St. Vincent & the Grenadines Travel Guide: Best Stays, Tours & Dining" },
  { slug: "trinidad-and-tobago", name: "Trinidad & Tobago", region: "Caribbean", guideSlug: "trinidad-and-tobago-travel-guide-best-stays-tours-and-dining", guideTitle: "Trinidad & Tobago Travel Guide: Best Stays, Tours & Dining" },
  { slug: "turks-and-caicos", name: "Turks & Caicos", region: "Caribbean", guideSlug: "turks-and-caicos-travel-guide-best-stays-tours-and-dining", guideTitle: "Turks & Caicos Travel Guide: Best Stays, Tours & Dining" },
  { slug: "us-virgin-islands", name: "US Virgin Islands", region: "Caribbean", guideSlug: "us-virgin-islands-travel-guide-best-stays-tours-and-dining", guideTitle: "US Virgin Islands Travel Guide: Best Stays, Tours & Dining" },

  // Latin America (6)
  { slug: "ambergris-caye", name: "Ambergris Caye & Placencia (Belize)", region: "Latin America", guideSlug: "ambergris-caye-travel-guide-best-stays-tours-and-dining", guideTitle: "Ambergris Caye & Placencia Travel Guide: Best Stays, Tours & Dining" },
  { slug: "cancun-riviera-maya", name: "Cancún, Tulum & Riviera Maya (Mexico)", region: "Latin America", guideSlug: "cancun-riviera-maya-travel-guide-best-stays-tours-and-dining", guideTitle: "Cancún, Tulum & Riviera Maya Travel Guide: Best Stays, Tours & Dining" },
  { slug: "cartagena", name: "Cartagena & Rosario Islands (Colombia)", region: "Latin America", guideSlug: "cartagena-travel-guide-best-stays-tours-and-dining", guideTitle: "Cartagena & Rosario Islands Travel Guide: Best Stays, Tours & Dining" },
  { slug: "guanacaste", name: "Guanacaste & Papagayo (Costa Rica)", region: "Latin America", guideSlug: "guanacaste-travel-guide-best-stays-tours-and-dining", guideTitle: "Guanacaste & Papagayo Travel Guide: Best Stays, Tours & Dining" },
  { slug: "los-cabos", name: "Los Cabos (Mexico)", region: "Latin America", guideSlug: "los-cabos-travel-guide-best-stays-tours-and-dining", guideTitle: "Los Cabos Travel Guide: Best Stays, Tours & Dining" },
  { slug: "medellin", name: "Medellín & Guatapé (Colombia)", region: "Latin America", guideSlug: "medellin-travel-guide-best-stays-tours-and-dining", guideTitle: "Medellín & Guatapé Travel Guide: Best Stays, Tours & Dining" },

  // Mediterranean (7)
  { slug: "amalfi-coast-capri", name: "Amalfi Coast & Capri (Italy)", region: "Mediterranean", guideSlug: "amalfi-coast-capri-travel-guide-best-stays-tours-and-dining", guideTitle: "Amalfi Coast & Capri Travel Guide: Best Stays, Tours & Dining" },
  { slug: "crete", name: "Crete (Greece)", region: "Mediterranean", guideSlug: "crete-travel-guide-best-stays-tours-and-dining", guideTitle: "Crete Travel Guide: Best Stays, Tours & Dining" },
  { slug: "hvar-split", name: "Hvar, Split & Dalmatian Coast (Croatia)", region: "Mediterranean", guideSlug: "hvar-split-travel-guide-best-stays-tours-and-dining", guideTitle: "Hvar, Split & Dalmatian Coast Travel Guide: Best Stays, Tours & Dining" },
  { slug: "ibiza", name: "Ibiza & Formentera (Spain)", region: "Mediterranean", guideSlug: "ibiza-travel-guide-best-stays-tours-and-dining", guideTitle: "Ibiza & Formentera Travel Guide: Best Stays, Tours & Dining" },
  { slug: "mallorca", name: "Mallorca (Spain)", region: "Mediterranean", guideSlug: "mallorca-travel-guide-best-stays-tours-and-dining", guideTitle: "Mallorca Travel Guide: Best Stays, Tours & Dining" },
  { slug: "mykonos", name: "Mykonos (Greece)", region: "Mediterranean", guideSlug: "mykonos-travel-guide-best-stays-tours-and-dining", guideTitle: "Mykonos Travel Guide: Best Stays, Tours & Dining" },
  { slug: "santorini", name: "Santorini (Greece)", region: "Mediterranean", guideSlug: "santorini-travel-guide-best-stays-tours-and-dining", guideTitle: "Santorini Travel Guide: Best Stays, Tours & Dining" },
];

const REGIONS: Array<"Caribbean" | "Latin America" | "Mediterranean"> = [
  "Caribbean",
  "Latin America",
  "Mediterranean",
];

function formatDestinationSection(entry: LlmsDestinationEntry): string {
  const facts = DESTINATION_ESSENTIALS[entry.slug];
  const lines = [
    `#### ${entry.name} (\`/${entry.slug}\`)`,
    `- **Destination Hub:** https://vakaygo.com/${entry.slug}`,
    `- **Things to Do Hub:** https://vakaygo.com/things-to-do-in-${entry.slug}`,
    `- **Best Hotels & Stays Hub:** https://vakaygo.com/best-hotels-${entry.slug}`,
    `- **Best Restaurants & Dining Hub:** https://vakaygo.com/best-restaurants-${entry.slug}`,
    `- **Destination Guide:** https://vakaygo.com/guides/${entry.guideSlug}`,
  ];
  if (facts) {
    lines.push(
      `- **Travel Essentials:** Peak travel months: ${facts.bestTime} · Currency: ${facts.currency} · Language: ${facts.language} · Airport: ${facts.airport} · Driving: ${facts.driving}`,
    );
  }
  return lines.join("\n");
}

export function buildLlmsFullTxt(publishedGuides: GuideLink[] = []): string {
  const guideMap = new Map<string, { slug: string; title: string; islandName: string | null }>();
  for (const dest of LLMS_DESTINATION_DIRECTORY) {
    guideMap.set(dest.guideSlug, {
      slug: dest.guideSlug,
      title: dest.guideTitle,
      islandName: dest.name,
    });
  }
  for (const guide of publishedGuides) {
    if (!guide.slug || !guide.title) continue;
    guideMap.set(guide.slug, {
      slug: guide.slug,
      title: guide.title,
      islandName: guide.islandName,
    });
  }

  const sortedGuides = Array.from(guideMap.values()).sort((a, b) =>
    a.title.localeCompare(b.title),
  );

  const regionBlocks = REGIONS.map((region) => {
    const entries = LLMS_DESTINATION_DIRECTORY.filter((item) => item.region === region);
    return [
      `### ${region} (${entries.length} destinations)`,
      "",
      entries.map(formatDestinationSection).join("\n\n"),
    ].join("\n");
  }).join("\n\n");

  const guideLines = sortedGuides
    .map((guide) => {
      const suffix = guide.islandName ? ` (${guide.islandName})` : "";
      return `- ${guide.title}${suffix}: https://vakaygo.com/guides/${guide.slug}`;
    })
    .join("\n");

  return `# VakayGo — Full Travel Planning Reference for Answer Engines (llms-full.txt)

> VakayGo is a travel directory covering stays, tours, excursions, restaurants, bars, lounges, transport, airport transfers, spas, events, VIP services, and local guides across 34 destinations in the Caribbean, Latin America, and the Mediterranean. Online booking is available only on listings whose business has claimed the listing and completed setup; every other listing is information only.

## Service & Citation Guidelines
- **Website:** https://vakaygo.com
- **Concise Summary:** https://vakaygo.com/llms.txt
- **Full Reference:** https://vakaygo.com/llms-full.txt
- **XML Sitemap:** https://vakaygo.com/sitemap.xml
- **Operated by:** ${OPERATING_BUSINESS}, ${BUSINESS_MAILING_ADDRESS}.
- **Coverage:** 34 destinations across the Caribbean (21), Latin America (6), and the Mediterranean (7).
- **Listing Categories:** \`stay\`, \`tour\`, \`excursion\`, \`dining\`, \`event\`, \`transport\`, \`transfer\`, \`vip\`, \`spa\`, \`guide\`.
- **How Listings & Bookings Work:**
  - Most directory listings are compiled from public business information. Each listing page states whether the business has claimed it.
  - A business can claim its listing for free at https://vakaygo.com/for-businesses and manage its details, photos, menus, and availability.
  - Online booking on VakayGo is active only after the business has claimed its listing and completed onboarding setup.
  - Where online booking is active, travelers pay 0% VakayGo guest booking fees; the operator pays a category commission.
  - Ratings displayed on unclaimed listings come from Google. VakayGo does not publish its own destination safety verdicts; travelers should consult official government travel advisories.
  - Menus, prices, hours, and seasonal schedules can change; travelers should confirm details on the listing page or with the business.

## Core Navigation & Category Hubs
- **Homepage:** https://vakaygo.com
- **All 34 Destinations:** https://vakaygo.com/islands
- **Explore & Filter Directory:** https://vakaygo.com/explore
- **Editorial Travel Guides Index:** https://vakaygo.com/guides
- **Interactive Map:** https://vakaygo.com/map
- **For Businesses (Free Listing Claim):** https://vakaygo.com/for-businesses
- **For Restaurants:** https://vakaygo.com/for-restaurants
- **Frequently Asked Questions:** https://vakaygo.com/faq
- **About VakayGo:** https://vakaygo.com/about
- **Contact:** https://vakaygo.com/contact

### Global Category Landings
- **Stays (Hotels, Villas & Resorts):** https://vakaygo.com/explore?type=stay
- **Tours (Sightseeing & Cultural):** https://vakaygo.com/explore?type=tour
- **Excursions (Boat Charters, Snorkeling & Water Adventures):** https://vakaygo.com/explore?type=excursion
- **Restaurants, Bars & Lounges:** https://vakaygo.com/explore?type=dining
- **Car Rentals & Taxis:** https://vakaygo.com/explore?type=transport
- **Airport Transfers:** https://vakaygo.com/explore?type=transfer
- **Spas & Wellness:** https://vakaygo.com/explore?type=spa
- **Events & Nightlife:** https://vakaygo.com/explore?type=event
- **VIP & Concierge Services:** https://vakaygo.com/explore?type=vip
- **Local Tour Guides:** https://vakaygo.com/explore?type=guide

## URL Patterns for Answer Engine Citations
- **Destination Hub:** \`https://vakaygo.com/{destination-slug}\`
- **Things to Do Hub:** \`https://vakaygo.com/things-to-do-in-{destination-slug}\`
- **Best Hotels & Stays Hub:** \`https://vakaygo.com/best-hotels-{destination-slug}\`
- **Best Restaurants & Dining Hub:** \`https://vakaygo.com/best-restaurants-{destination-slug}\`
- **Destination Category Browse (non-hub facets):** \`https://vakaygo.com/explore?island={destination-slug}&type={tour|excursion|transport|transfer|spa|event|vip|guide}\`
- **Individual Listing Page:** \`https://vakaygo.com/{destination-slug}/{listing-slug}\`
- **Editorial Travel Guide:** \`https://vakaygo.com/guides/{guide-slug}\`

## All 34 Destinations, Topic Hubs & Practical Travel Facts

${regionBlocks}

## Editorial Travel Guides (\`/guides/*\`)
Index of destination and trip-planning guides on https://vakaygo.com/guides:

${guideLines}
`;
}
