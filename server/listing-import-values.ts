import { sql } from "drizzle-orm";
import { listings } from "@/drizzle/schema";

/** Imported JSON is untrusted text; guard casts inside CASE, including overflow. */
export function importedListingInteger(key: "groupSize" | "partySize" | "durationMinutes") {
  const value = sql`${listings.typeData}->>${key}`;
  return sql<number | null>`CASE WHEN ${value} ~ '^[0-9]{1,9}$' THEN (${value})::integer ELSE NULL END`;
}

export const importedMultiDay = sql<boolean | null>`CASE ${listings.typeData}->>'isMultiDay'
  WHEN 'true' THEN true WHEN 'false' THEN false ELSE NULL END`;
