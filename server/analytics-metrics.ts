import { sql } from "drizzle-orm";
import { bookings, users } from "@/drizzle/schema";

/** Gross recorded paid booking value, in USD only; not net revenue or payout. */
export const paidUsdBookingValue = sql<number>`CASE
  WHEN ${bookings.paidAt} IS NOT NULL AND ${bookings.currency} = 'USD'
  THEN ${bookings.totalAmount} ELSE 0 END`;

/** Correlated aggregate avoids multiplying each booking by the operator's listings. */
export const operatorPaidUsdBookingValue = sql<number>`(
  SELECT coalesce(sum(${paidUsdBookingValue}), 0)::numeric FROM ${bookings}
  WHERE ${bookings.operatorId} = ${users.id}
)`;

/** Share of travelers with completed bookings who have completed more than one. */
export const repeatCompletedBookingRate = sql<number | null>`(
  SELECT round(100.0 * count(*) FILTER (WHERE completed_count > 1) / nullif(count(*), 0), 1)::float
  FROM (SELECT count(*) AS completed_count FROM ${bookings}
    WHERE ${bookings.status} = 'completed' GROUP BY ${bookings.travelerId}) completed_travelers
)`;
