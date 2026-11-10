/**
 * FAQ answers for the destination hubs. The same text is rendered on the page
 * and emitted as FAQPage JSON-LD, so every sentence has to be true for the
 * destination it is rendered for:
 *
 * - seasons, currency and driving side come from lib/destination-facts.ts and
 *   are left out when a destination has no entry;
 * - no safety verdicts: safety answers point to the official advisory;
 * - no invented price bands and no cuisine a destination may not have;
 * - booking wording stays true while only some listings have completed setup.
 */
import {
  drivingSide,
  isYearRoundDestination,
  localCurrency,
  popularMonths,
} from "@/lib/destination-facts";

export type DestinationFaq = { q: string; a: string };

type Destination = { name: string; slug: string };

const BOOKING_NOTE =
  "Booking options depend on each listing's current setup and available dates; saving a listing or sending an inquiry does not create a reservation.";

function listInProse(values: string[]): string {
  if (values.length <= 1) return values.join("");
  return `${values.slice(0, -1).join(", ")} and ${values[values.length - 1]}`;
}

/** Year the hub titles show. Hubs are ISR (hourly), so this rolls over by itself. */
export function hubTitleYear(now: Date = new Date()): number {
  return now.getUTCFullYear();
}

export function buildBestHotelsFaqs({ name, slug }: Destination): DestinationFaq[] {
  const months = popularMonths(slug);
  const season = months
    ? ` The most popular months to visit are ${months}, when rates are usually highest.`
    : isYearRoundDestination(slug)
      ? ` ${name} is visited year-round, so ask the property how its rates change through the year.`
      : "";
  return [
    {
      q: `What are the best hotels in ${name}?`,
      a: `${name} offers a range of accommodations from luxury resorts to charming guesthouses and vacation rentals. Browse and compare stays on VakayGo. Directory information may come from public sources; check ownership labels and confirm current prices, amenities, and availability with the business. Use only the booking options shown on an eligible listing for your selected dates and group size. Saving a listing or sending an inquiry does not create a reservation.`,
    },
    {
      q: `How much do hotels cost in ${name}?`,
      a: `Hotel prices in ${name} vary by season and property type. Guesthouses and vacation rentals are usually the lower-cost options, and resorts and villas the highest.${season} Confirm current rates with the property.`,
    },
    {
      q: `What type of accommodation is best in ${name}?`,
      a: `It depends on your travel style. Couples may prefer boutique hotels or villas, families enjoy resorts with amenities, and solo travelers often choose guesthouses or hostels. Compare directory listing details and confirm the property type and amenities with the business.`,
    },
    {
      q: `Should I book a hotel or vacation rental in ${name}?`,
      a: `Hotels offer convenience and services, while vacation rentals provide more space and a local feel. For longer stays, rentals often offer better value. VakayGo lists both options so you can compare directly.`,
    },
  ];
}

export function buildBestRestaurantsFaqs({
  name,
  slug,
  cuisines = [],
}: Destination & { cuisines?: string[] }): DestinationFaq[] {
  const listed = cuisines
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .slice(0, 6);
  const cuisineSentence = listed.length > 0
    ? ` Restaurants listed here describe their cooking as ${listInProse(listed)}.`
    : "";
  const months = popularMonths(slug);
  const busy = months
    ? `Popular restaurants in ${name} can fill up in the busiest months (${months}).`
    : `Popular restaurants in ${name} can fill up at busy times.`;
  return [
    {
      q: `What are the best restaurants in ${name}?`,
      a: `${name}'s restaurants range from casual local spots to international dining.${cuisineSentence} VakayGo lists restaurants with their published business information and, where available, their Google rating.`,
    },
    {
      q: `What local food should I try in ${name}?`,
      a: `Local specialties differ from place to place in ${name}.${cuisineSentence} Browse the restaurant listings and ask the restaurant what is local and in season.`,
    },
    {
      q: `Do I need reservations at restaurants in ${name}?`,
      a: `${busy} Check the restaurant's listing for the options it currently offers, or contact the restaurant directly.`,
    },
    {
      q: `What is the average cost of dining in ${name}?`,
      a: `Dining costs in ${name} vary by restaurant and season. Confirm current menu prices with the restaurant before you go.`,
    },
  ];
}

export function buildThingsToDoFaqs({
  name,
  slug,
  country,
}: Destination & { country?: string | null }): DestinationFaq[] {
  const months = popularMonths(slug);
  const side = drivingSide(slug);
  const currency = localCurrency(slug);
  const advisoryPlace = country && country.trim().length > 0 ? country.trim() : name;

  const faqs: DestinationFaq[] = [
    {
      q: `What are the top things to do in ${name}?`,
      a: `${name} offers a wide range of activities including guided tours, time on the water, hiking, dining, cultural events, and excursions. Browse and compare local experiences on VakayGo. ${BOOKING_NOTE}`,
    },
  ];

  if (months) {
    faqs.push({
      q: `When is the best time to visit ${name}?`,
      a: `The most popular time to visit ${name} is ${months}. Outside those months you will usually find lower prices and fewer crowds; check the forecast for your dates.`,
    });
  } else if (isYearRoundDestination(slug)) {
    faqs.push({
      q: `When is the best time to visit ${name}?`,
      a: `${name} is visited year-round. Prices and crowds still change through the year, so check the forecast and rates for your dates.`,
    });
  }

  faqs.push({
    q: `How do I get around ${name}?`,
    a: `You can explore ${name} by taxi, rental vehicle, public transport, or private transfer.${side ? ` Traffic drives on the ${side}.` : ""} Browse transport and transfer listings on VakayGo. ${BOOKING_NOTE}`,
  });

  faqs.push({
    q: `Is ${name} safe for tourists?`,
    a: `Safety conditions differ by area and change over time, so VakayGo does not rate destinations for safety. Check your government's current travel advisory for ${advisoryPlace} before you go, and confirm details with the business you plan to visit.`,
  });

  if (currency) {
    faqs.push({
      q: `What is the local currency in ${name}?`,
      a: `The local currency in ${name} is ${currency}. Confirm accepted payment methods with the business you plan to book or visit.`,
    });
  }

  return faqs;
}
