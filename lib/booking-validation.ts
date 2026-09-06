import { toWallClockDate } from "./booking-time";
export const DEMO_OPERATOR_ID = "197d8586-7fd3-4999-91de-a50ad7d70e23";
export function isDemoListing(operatorId: string, typeData?: unknown): boolean {
  return operatorId === DEMO_OPERATOR_ID || (!!typeData && typeof typeData === "object" && (typeData as Record<string, unknown>).demo === true);
}
export function parseBookingDate(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(value)) return null;
  const date = toWallClockDate(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== value.slice(0,10)) return null;
  return date;
}
export function bookingInputError(body: Record<string, unknown>): string | null {
  if (typeof body.listingId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.listingId)) return "A valid listing is required";
  if (!parseBookingDate(body.startDate) || (body.endDate != null && body.endDate !== "" && !parseBookingDate(body.endDate))) return "Enter valid dates in the business's local time";
  const guests = body.guestCount ?? 1;
  if (typeof guests !== "number" || !Number.isInteger(guests) || guests < 1 || guests > 1000) return "Guest count must be a whole number between 1 and 1000";
  if (body.guestNotes != null && (typeof body.guestNotes !== "string" || body.guestNotes.length > 2000)) return "Notes must be 2000 characters or fewer";
  if (body.includeInsurance || body.giftCardCode || (body.paymentType && body.paymentType !== "full")) return "Trip protection, deposits and gift card checkout are currently unavailable";
  if (body.paymentMethod && body.paymentMethod !== "card") return "Only card checkout is currently available";
  if (body.promoCode != null && typeof body.promoCode !== "string") return "Invalid promo code";
  return null;
}
export function localBookingNow(timezone: string | null, now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone || "America/Puerto_Rico", year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23" }).formatToParts(now);
  const part = (key: string) => parts.find(p => p.type === key)!.value;
  return new Date(part("year")+"-"+part("month")+"-"+part("day")+"T"+part("hour")+":"+part("minute")+":"+part("second")+"Z");
}
