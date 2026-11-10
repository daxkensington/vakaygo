import Link from "next/link";
import type { GuideLink } from "@/server/guides-queries";

const CATEGORY_LABELS: Record<string, string> = {
  "destination-guide": "Destination Guides",
  "travel-tips": "Travel Tips",
  culture: "Culture",
  "food-drink": "Food & Drink",
  adventure: "Adventure",
  planning: "Trip Planning",
};
const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS);

/**
 * Server-rendered index of every guide: plain links in the HTML, so
 * crawlers (and visitors without JavaScript) can reach each guide from the
 * hub. Renders nothing when there are no guides.
 */
export function GuidesIndex({ guides }: { guides: GuideLink[] }) {
  if (guides.length === 0) return null;

  const groups = new Map<string, GuideLink[]>();
  for (const guide of guides) {
    const list = groups.get(guide.category) || [];
    list.push(guide);
    groups.set(guide.category, list);
  }
  const categories = Array.from(groups.keys()).sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a);
    const bi = CATEGORY_ORDER.indexOf(b);
    return (ai === -1 ? CATEGORY_ORDER.length : ai) - (bi === -1 ? CATEGORY_ORDER.length : bi) || a.localeCompare(b);
  });

  return (
    <section aria-labelledby="all-guides-heading" className="bg-white py-14">
      <div className="mx-auto max-w-7xl px-6">
        <h2
          id="all-guides-heading"
          className="text-2xl font-bold text-navy-700"
          style={{ fontFamily: "var(--font-display)" }}
        >
          All travel guides
        </h2>
        <div className="mt-8 space-y-10">
          {categories.map((category) => (
            <div key={category}>
              <h3 className="text-sm font-semibold uppercase tracking-widest text-gold-700">
                {CATEGORY_LABELS[category] || category}
              </h3>
              <ul className="mt-4 grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                {(groups.get(category) || []).map((guide) => (
                  <li key={guide.slug}>
                    <Link
                      href={`/guides/${guide.slug}`}
                      className="text-sm text-navy-600 underline-offset-2 hover:text-gold-700 hover:underline"
                    >
                      {guide.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
