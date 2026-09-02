import type { Metadata } from "next";
import { firstPageFilters, loadInitial, buildMetadata, ExploreServer } from "./explore-server";

/**
 * /explore — the DYNAMIC entry point. Reads searchParams, so it is
 * rendered per request (first page of cards still in the HTML; data
 * cached an hour per filter set). The indexable URLs never reach this
 * file: next.config rewrites them to /explore/f/... which is ISR.
 * See explore-server.tsx.
 */

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  return buildMetadata(firstPageFilters(await searchParams));
}

export default async function ExplorePage({ searchParams }: Props) {
  const filters = firstPageFilters(await searchParams);
  const data = await loadInitial(filters);
  return <ExploreServer filters={filters} data={data} />;
}
