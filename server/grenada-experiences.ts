import { cache } from "react";
import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { islands, listings, media } from "@/drizzle/schema";
import { getImageUrl } from "@/lib/image-utils";
import {
  GRENADA_EXPERIENCE_TOPICS,
  GRENADA_EXPERIENCES_MAX_PAGE,
  GRENADA_EXPERIENCES_PAGE_SIZE,
  getGrenadaExperienceTopic,
  isValidGrenadaExperiencesPage,
  type GrenadaExperienceTopic,
  type GrenadaExperienceTopicDefinition,
} from "@/lib/grenada-experiences";
import { createDb, type Database } from "@/server/db";
import { publicDestinations, publicDirectoryListings } from "@/server/public-listing-eligibility";

export type GrenadaExperienceListing = {
  id: string;
  title: string;
  slug: string;
  type: string;
  islandSlug: string;
  parish: string | null;
  image: string | null;
};

export type GrenadaExperiencesData = {
  island: { slug: string; name: string } | null;
  listings: GrenadaExperienceListing[];
  topic: GrenadaExperienceTopicDefinition | null;
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  topics: Array<{ slug: GrenadaExperienceTopic; title: string; description: string; count: number }>;
};

/** Title evidence selects directory matches, never admission, operating or booking facts. */
export function grenadaExperienceTopicPredicate(topic: GrenadaExperienceTopic): SQL {
  const definition = getGrenadaExperienceTopic(topic);
  if (!definition) throw new RangeError("Unknown Grenada experience topic");
  return sql`${listings.title} ~* ${definition.titlePattern}`;
}

export function grenadaExperiencesPredicate(topic?: GrenadaExperienceTopic): SQL {
  return and(
    publicDirectoryListings(),
    eq(islands.slug, "grenada"),
    inArray(listings.type, ["tour", "excursion", "guide"]),
    topic !== undefined ? grenadaExperienceTopicPredicate(topic) : undefined,
  )!;
}

/**
 * Directory-only projection is safe in public ISR HTML: no prices, booking
 * eligibility, coordinates or imported descriptive claims are selected.
 * Counts and cards share the same public/type/title predicates. Query failures
 * propagate so an outage cannot be presented as a confirmed empty category.
 */
export async function loadGrenadaExperiences(
  topic?: GrenadaExperienceTopic,
  page = 1,
  database?: Database,
): Promise<GrenadaExperiencesData> {
  const definition = topic === undefined ? null : getGrenadaExperienceTopic(topic);
  if (topic !== undefined && !definition) throw new RangeError("Unknown Grenada experience topic");
  if (!isValidGrenadaExperiencesPage(page)) throw new RangeError("Invalid Grenada experiences page");

  const db = database ?? createDb();
  const topicCounts = Object.fromEntries(
    GRENADA_EXPERIENCE_TOPICS.map((item) => [
      item.slug,
      sql<number>`count(*) FILTER (WHERE ${grenadaExperienceTopicPredicate(item.slug)})::int`,
    ]),
  ) as Record<GrenadaExperienceTopic, SQL<number>>;

  const [islandRows, rows, countRows] = await Promise.all([
    db.select({ slug: islands.slug, name: islands.name })
      .from(islands)
      .where(and(eq(islands.slug, "grenada"), publicDestinations()))
      .limit(1),
    db.select({
      id: listings.id,
      title: listings.title,
      slug: listings.slug,
      type: listings.type,
      islandSlug: islands.slug,
      parish: listings.parish,
      image: sql<string | null>`(
        SELECT ${media.url} FROM ${media}
        WHERE ${media.listingId} = ${listings.id}
        ORDER BY ${media.isPrimary} DESC NULLS LAST, ${media.sortOrder} ASC, ${media.id} ASC
        LIMIT 1
      )`,
    })
      .from(listings)
      .innerJoin(islands, eq(listings.islandId, islands.id))
      .where(grenadaExperiencesPredicate(topic))
      .orderBy(asc(listings.title), asc(listings.id))
      .limit(GRENADA_EXPERIENCES_PAGE_SIZE)
      .offset((page - 1) * GRENADA_EXPERIENCES_PAGE_SIZE),
    db.select({ totalCount: sql<number>`count(*)::int`, ...topicCounts })
      .from(listings)
      .innerJoin(islands, eq(listings.islandId, islands.id))
      .where(grenadaExperiencesPredicate()),
  ]);

  const counts = countRows[0];
  const totalCount = (topic === undefined ? counts?.totalCount : counts?.[topic]) ?? 0;
  return {
    island: islandRows[0] ?? null,
    listings: rows.map((row) => ({
      id: row.id,
      title: row.title,
      slug: row.slug,
      type: row.type,
      islandSlug: row.islandSlug,
      parish: row.parish,
      image: getImageUrl(row.image) || null,
    })),
    topic: definition,
    page,
    pageSize: GRENADA_EXPERIENCES_PAGE_SIZE,
    totalCount,
    totalPages: Math.min(GRENADA_EXPERIENCES_MAX_PAGE, Math.ceil(totalCount / GRENADA_EXPERIENCES_PAGE_SIZE)),
    topics: GRENADA_EXPERIENCE_TOPICS.map((item) => ({
      slug: item.slug,
      title: item.title,
      description: item.description,
      count: counts?.[item.slug] ?? 0,
    })),
  };
}

/** Request-local deduplication for page + metadata; never a positive booking cache. */
export const getGrenadaExperiences = cache(
  (topic?: GrenadaExperienceTopic, page = 1) => loadGrenadaExperiences(topic, page),
);
