/** Version 1 preserves the existing refund engine; display copy uses these same rules. */
export type CancellationPolicy = "flexible" | "moderate" | "strict" | "non_refundable";
export const CANCELLATION_POLICY_VERSION = 1;
export const CANCELLATION_POLICIES = {
  flexible: { label: "Flexible", summary: "Full refund more than 24 hours before start", details: ["Full refund more than 24 hours before start.", "No refund at 24 hours or less before start."], fullHours: 24, halfHours: null },
  moderate: { label: "Moderate", summary: "Full refund more than 5 days before start", details: ["Full refund more than 5 days before start.", "50% refund from 5 days to more than 24 hours before start.", "No refund at 24 hours or less before start."], fullHours: 120, halfHours: 24 },
  strict: { label: "Strict", summary: "50% refund more than 7 days before start", details: ["50% refund more than 7 days before start.", "No refund at 7 days or less before start."], fullHours: null, halfHours: 168 },
  non_refundable: { label: "Non-refundable", summary: "No refund for traveler cancellations", details: ["No refund for traveler cancellations or no-shows."], fullHours: null, halfHours: null },
} as const;
export function cancellationPolicyKey(policy: string | null | undefined): CancellationPolicy {
  return Object.hasOwn(CANCELLATION_POLICIES, policy || "") ? policy as CancellationPolicy : "moderate";
}
export function calculateRefundPercent(policy: string | null, hoursUntilStart: number): number {
  if (!Number.isFinite(hoursUntilStart)) return 0;
  const rule = CANCELLATION_POLICIES[cancellationPolicyKey(policy)];
  if (rule.fullHours !== null && hoursUntilStart > rule.fullHours) return 100;
  if (rule.halfHours !== null && hoursUntilStart > rule.halfHours) return 50;
  return 0;
}
