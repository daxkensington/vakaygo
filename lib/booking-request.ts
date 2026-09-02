/**
 * Which bookings are REQUESTS rather than instant bookings.
 *
 * ~7,100 of the platform's listings were built from public data and belong
 * to the placeholder `unclaimed@vakaygo.com` account. Nobody at the business
 * sees a booking made on one of them, so the traveler must never be told it
 * is "confirmed" and must never be sent to a (necessarily $0) Stripe checkout.
 * Instead the booking is stored as `requested`, the traveler is told VakayGo
 * will confirm with the business, and the VakayGo team gets the details to
 * make the call.
 */

/** Team inbox that receives booking requests and claim requests. A real
 *  mailbox exists for this address; `hello@` is send-only. */
export const TEAM_INBOX = "bookings@vakaygo.com";

export function isUnclaimedTypeData(typeData: unknown): boolean {
  if (!typeData || typeof typeData !== "object") return false;
  return (typeData as Record<string, unknown>).unclaimed === true;
}

export function isUnclaimedOperatorEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().includes("unclaimed");
}

/**
 * A booking becomes a request when the business cannot see it (unclaimed
 * listing) or when there is nothing to charge (no price on the listing).
 */
export function shouldRequestBooking(params: {
  typeData: unknown;
  operatorEmail?: string | null;
  priceAmount: string | number | null | undefined;
}): boolean {
  if (isUnclaimedTypeData(params.typeData)) return true;
  if (isUnclaimedOperatorEmail(params.operatorEmail)) return true;
  const price = typeof params.priceAmount === "number" ? params.priceAmount : parseFloat(params.priceAmount || "0");
  return !(price > 0);
}
