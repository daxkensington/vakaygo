/**
 * Cancellation / refund policy engine.
 *
 * Single source of truth for how much of a paid booking is refundable given
 * the listing's cancellation policy and how long before the start date the
 * cancellation is requested. Used by both /api/bookings/refund and
 * /api/bookings/cancel so the two endpoints can never diverge.
 */
export type CancellationPolicy =
  | "flexible"
  | "moderate"
  | "strict"
  | "non_refundable";

export function calculateRefundPercent(
  policy: string | null,
  hoursUntilStart: number
): number {
  switch (policy) {
    case "flexible":
      return hoursUntilStart > 24 ? 100 : 0;

    case "moderate":
      if (hoursUntilStart > 5 * 24) return 100;
      if (hoursUntilStart > 24) return 50;
      return 0;

    case "strict":
      return hoursUntilStart > 7 * 24 ? 50 : 0;

    case "non_refundable":
      return 0;

    default:
      // Default to moderate if not set
      if (hoursUntilStart > 5 * 24) return 100;
      if (hoursUntilStart > 24) return 50;
      return 0;
  }
}
