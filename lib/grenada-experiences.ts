/** Closed, name-based directory topics; these are not product or availability claims. */
export const GRENADA_EXPERIENCES_PAGE_SIZE = 24;
export const GRENADA_EXPERIENCES_MAX_PAGE = 1000;

export const GRENADA_EXPERIENCE_TOPICS = [
  {
    slug: "boat-trips",
    title: "Boat trips",
    description: "Explore listed boat businesses and trips in Grenada. Check each listing for current routes, inclusions and booking status.",
    titlePattern: String.raw`\m(boats?|boating|charters?|sail|sailing|catamarans?|cruises?|yachts?|schooners?)\M`,
  },
  {
    slug: "jet-ski",
    title: "Jet ski",
    description: "Browse jet ski listings in Grenada. Check individual listings for details and confirm current requirements with the business.",
    titlePattern: String.raw`\mjet[[:space:]-]*skis?\M`,
  },
  {
    slug: "jeep-tours",
    title: "Jeep tours",
    description: "Explore jeep and off-road activity listings in Grenada. Check routes, inclusions and booking status on each listing.",
    titlePattern: String.raw`\m(jeeps?|off[[:space:]-]?road|4x4)\M`,
  },
  {
    slug: "snorkeling",
    title: "Snorkeling",
    description: "Browse snorkeling listings in Grenada. Check each listing for trip details and confirm current conditions with the business.",
    titlePattern: String.raw`\msnorkel(l?ing|s)?\M`,
  },
  {
    slug: "hiking",
    title: "Hiking",
    description: "Explore hiking and trekking listings in Grenada. Confirm routes, current access and any visitor requirements before setting out.",
    titlePattern: String.raw`\m(hikes?|hiking|treks?|trekking)\M`,
  },
  {
    slug: "waterfalls",
    title: "Waterfalls",
    description: "Explore waterfall activity listings in Grenada. Confirm current access and any admission requirements before visiting.",
    titlePattern: String.raw`\m(waterfalls?|falls)\M`,
  },
] as const;

export type GrenadaExperienceTopic = (typeof GRENADA_EXPERIENCE_TOPICS)[number]["slug"];
export type GrenadaExperienceTopicDefinition = (typeof GRENADA_EXPERIENCE_TOPICS)[number];

export function getGrenadaExperienceTopic(slug: string): GrenadaExperienceTopicDefinition | null {
  return GRENADA_EXPERIENCE_TOPICS.find((topic) => topic.slug === slug) ?? null;
}

export function isValidGrenadaExperiencesPage(page: number): boolean {
  return Number.isSafeInteger(page) && page >= 1 && page <= GRENADA_EXPERIENCES_MAX_PAGE;
}
