/**
 * When a paid trip is treated as delivered.
 *
 * Escrow release, the payout ledger and review invitations all start from
 * `status = 'completed'`, which only an operator or admin "Mark completed"
 * click used to set. The trip-completion cron (app/api/cron/complete-past-trips)
 * completes a booking that is confirmed, paid, has no cancellation pending and
 * no open dispute, once this long has passed since the trip ended. The wait
 * leaves the traveler a window to report a problem before money moves.
 */
export const TRIP_COMPLETION_GRACE_MS = 48 * 60 * 60 * 1000;

/** Feature flag that turns the automatic completion on; absent or off = the cron only counts. */
export const TRIP_AUTO_COMPLETE_FLAG = "booking_auto_complete_enabled";

/** Dispute states that still block money moving. */
export const OPEN_DISPUTE_STATUSES = ["open", "under_review"] as const;

export function tripCompletionDue(trip: { startDate: Date; endDate: Date | null }, now: Date = new Date()): boolean {
  const end = (trip.endDate ?? trip.startDate).getTime();
  return Number.isFinite(end) && now.getTime() - end >= TRIP_COMPLETION_GRACE_MS;
}
