/** A fixed agreement revision. Changing commercial terms requires a new version. */
export const OPERATOR_TERMS_VERSION = "2026-10-27";
export const PREVIOUS_OPERATOR_TERMS_VERSION = "2026-09-06";
export const PREVIOUS_OPERATOR_TERMS_PATH = "/operator/onboarding/terms/2026-09-06";

/** Fixed to this revision; parity tests prevent pricing changes silently rewriting it. */
export const OPERATOR_TERMS_FEES = [
  { label: "Stays", types: ["stay"], operatorPercent: 12, travelerPercent: 0 },
  { label: "Tours and excursions", types: ["tour", "excursion"], operatorPercent: 15, travelerPercent: 0 },
  { label: "Dining: table requests", types: [], operatorPercent: 0, travelerPercent: 0 },
  { label: "Dining: paid culinary bookings", types: ["dining"], operatorPercent: 12, travelerPercent: 0 },
  { label: "Events", types: ["event"], operatorPercent: 10, travelerPercent: 0 },
  { label: "Transfers and transport", types: ["transfer", "transport"], operatorPercent: 15, travelerPercent: 0 },
  { label: "Guides, VIP and spa services", types: ["guide", "vip", "spa"], operatorPercent: 15, travelerPercent: 0 },
] as const;

export function isPublicOperatorTermsPath(path: string): boolean {
  return path === "/operator/onboarding/terms" || path === PREVIOUS_OPERATOR_TERMS_PATH;
}
