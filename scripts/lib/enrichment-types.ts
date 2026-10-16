/** Exact common columns selected by the listing maintenance queries. JSON stays unknown until inspected. */
export type EnrichmentRow = { id: string; title: string; type: string; typeData: unknown };
export type LocatedEnrichmentRow = EnrichmentRow & { island: string };
