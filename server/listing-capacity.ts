import { sql } from "drizzle-orm";
import { listings } from "@/drizzle/schema";
import { LEGACY_STAY_CAPACITY_PATTERN } from "@/lib/listing-capacity";

/** The operator-maintained column wins; only older imports fall back to valid JSON. Unknown stays do not match a requested capacity. */
export const stayGuestCapacity = sql<number | null>`coalesce(${listings.maxGuests}, CASE
  WHEN ${listings.typeData}->>'maxGuests' ~ ${LEGACY_STAY_CAPACITY_PATTERN}
  THEN (${listings.typeData}->>'maxGuests')::int ELSE NULL END)`;
