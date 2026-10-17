import { z } from "zod";

export const planningDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
});
const slot = z.enum(["morning", "afternoon", "evening"]);
const listingType = z.enum(["stay", "tour", "dining", "event", "excursion", "transport", "transfer", "guide", "spa", "vip", "free"]);
const choice = z.object({ timeSlot: slot, type: listingType, listingId: z.string().uuid().nullable() });
const plan = z.object({ days: z.array(z.object({
  dayNumber: z.number().int().min(1).max(30), date: planningDate,
  items: z.array(choice).max(12),
})).min(1).max(30) });
const legacyPlan = z.array(z.object({ day: z.number().int().min(1).max(30), activities: z.array(z.object({
  timeSlot: slot, listingId: z.string().uuid().nullable(),
})).max(12) })).min(1).max(30);

export type PlannerListing = {
  id: string; title: string; slug: string; type: string; islandSlug: string;
  image?: string | null; avgRating: string | null;
};
export const UNKNOWN_VISITOR_FACTS = "Admission fees, access, opening hours and reservation requirements are unconfirmed. Check with the venue before visiting. Planning slots do not confirm venue hours or availability.";
export const PERSONAL_NOTE = "Personal time for your own plans. No venue, free admission or current access is confirmed. Planning slots are suggestions only.";

/** Model output selects catalog references and planning slots, never visitor facts. */
export function projectTripPlan(input: unknown, context: {
  islandName: string; islandSlug: string; startDate: string; days: number;
  listings: ReadonlyMap<string, PlannerListing>;
}) {
  const parsed = plan.safeParse(input);
  if (!parsed.success || parsed.data.days.length !== context.days) return null;
  const days = [];
  for (const [index, day] of parsed.data.days.entries()) {
    const expectedDate = new Date(Date.parse(context.startDate) + index * 86400000).toISOString().slice(0, 10);
    if (day.dayNumber !== index + 1 || day.date !== expectedDate) return null;
    const items = [];
    for (const item of day.items) {
      if (!item.listingId) {
        if (item.type !== "free") return null;
        items.push({ ...item, title: "Personal time", listingSlug: null, listingTitle: null,
          price: null, rating: null, image: null, note: PERSONAL_NOTE });
        continue;
      }
      const listing = context.listings.get(item.listingId);
      if (!listing || listing.islandSlug !== context.islandSlug || listing.type !== item.type) return null;
      const rating = listing.avgRating === null ? null : Number(listing.avgRating);
      items.push({ ...item, title: listing.title, listingSlug: listing.slug, listingTitle: listing.title,
        price: null, rating: rating !== null && Number.isFinite(rating) && rating >= 0 && rating <= 5 ? rating : null,
        image: listing.image ?? null, note: UNKNOWN_VISITOR_FACTS });
    }
    days.push({ dayNumber: day.dayNumber, date: day.date, theme: `Planning day ${day.dayNumber}`, items });
  }
  return { title: `${context.islandName} trip plan`, summary: `A suggested directory itinerary for ${context.islandName}. ${UNKNOWN_VISITOR_FACTS} Costs are not estimated.`, days };
}

/** The legacy provider also supplies choices only; discard every narrative field. */
export function projectLegacyTrip(input: unknown, context: Parameters<typeof projectTripPlan>[1]) {
  const parsed = legacyPlan.safeParse(input);
  if (!parsed.success) return null;
  const converted = { days: parsed.data.map(day => ({
    dayNumber: day.day, date: new Date(Date.parse(context.startDate) + (day.day - 1) * 86400000).toISOString().slice(0, 10),
    items: day.activities.map(item => ({ ...item, type: item.listingId ? context.listings.get(item.listingId)?.type : "free" })),
  })) };
  const projected = projectTripPlan(converted, context);
  return projected?.days.map(day => ({ day: day.dayNumber, activities: day.items })) ?? null;
}

/** Personal notes are user-authored input, not an AI or verified-facts receipt. */
export const personalItinerary = z.object({
  title: z.string().trim().min(1).max(256).optional(),
  days: z.array(z.object({ dayNumber: z.number().int().min(1).max(30), items: z.array(z.object({
    timeSlot: slot.default("morning"), listingId: z.string().uuid().nullable().optional(),
    title: z.string().min(1).max(256).default("Activity"), note: z.string().max(4000).nullable().optional(),
  })).max(12) })).max(30),
});
