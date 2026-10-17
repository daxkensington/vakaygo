type GtagEvent = {
  action: string;
  category: string;
  label?: string;
  value?: number;
};

type EventParams = Record<string, string | number | undefined | { item_id: string; item_category: string; price?: number; quantity?: number }[]>;
type QueuedEvent = { action: string; params: EventParams; queuedAt: number };
const MAX_PENDING_EVENTS = 30;
const MAX_EVENT_AGE_MS = 60_000;

type ListingEvent = { listingId: string; listingType: string };
type PaidBookingEvent = ListingEvent & {
  transactionId: string;
  currency: string;
  totalAmount: string;
  status: string;
  paidAt: string | null;
};

declare global {
  interface Window {
    gtag?: (command: "event", action: string, params: EventParams) => void;
    vakaygoPendingAnalytics?: QueuedEvent[];
    vakaygoReportedPurchases?: Set<string>;
  }
}

function deliver(action: string, params: EventParams) {
  try {
    window.gtag?.("event", action, params);
  } catch {
    // Analytics must never turn a successful customer action into a failure.
  }
}

/** Drain only after the existing Google initializer has queued its config. */
export function flushAnalyticsEvents() {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  const pending = window.vakaygoPendingAnalytics ?? [];
  window.vakaygoPendingAnalytics = [];
  const now = Date.now();
  for (const event of pending) {
    if (now - event.queuedAt < MAX_EVENT_AGE_MS) deliver(event.action, event.params);
  }
}

function sendEvent(action: string, params: EventParams) {
  if (typeof window === "undefined") return;
  if (typeof window.gtag === "function") {
    flushAnalyticsEvents();
    deliver(action, params);
    return;
  }
  const now = Date.now();
  const pending = (window.vakaygoPendingAnalytics ?? []).filter(event => now - event.queuedAt < MAX_EVENT_AGE_MS);
  // Memory only: no campaign cookies, storage, polling or external fallback.
  pending.push({ action, params, queuedAt: now });
  window.vakaygoPendingAnalytics = pending.slice(-MAX_PENDING_EVENTS);
}

export function trackEvent({ action, category, label, value }: GtagEvent) {
  sendEvent(action, { event_category: category, event_label: label, value });
}

function listingParams({ listingId, listingType }: ListingEvent) {
  return { items: [{ item_id: listingId, item_category: listingType }] };
}

// Pre-built events for common actions
export const analytics = {
  search: (query: string) =>
    trackEvent({ action: "search", category: "discovery", label: query }),
  viewListing: (title: string, type: string) =>
    trackEvent({
      action: "view_listing",
      category: "engagement",
      label: `${type}: ${title}`,
    }),
  listingInterestSaved: (listingId: string) =>
    sendEvent("listing_interest_saved", { listing_id: listingId }),
  bookingRequestSaved: ({ listingId, listingType }: ListingEvent) =>
    sendEvent("booking_request_saved", { listing_id: listingId, listing_type: listingType }),
  startCheckout: (listing: ListingEvent) =>
    sendEvent("begin_checkout", listingParams(listing)),
  purchaseConfirmed: (booking: PaidBookingEvent) => {
    if (typeof window === "undefined" || typeof booking.paidAt !== "string" || !["confirmed", "completed"].includes(booking.status)
      || typeof booking.transactionId !== "string" || typeof booking.listingId !== "string"
      || typeof booking.listingType !== "string"
      || typeof booking.totalAmount !== "string" || !/^\d+(\.\d{1,2})?$/.test(booking.totalAmount)
      || typeof booking.currency !== "string") return;
    const totalAmount = Number(booking.totalAmount);
    if (!booking.transactionId.trim() || !booking.listingId.trim()
      || !/^[A-Z]{3}$/.test(booking.currency) || !Number.isFinite(Date.parse(booking.paidAt))
      || !Number.isFinite(totalAmount) || totalAmount <= 0) return;
    const reported = window.vakaygoReportedPurchases ??= new Set<string>();
    if (reported.has(booking.transactionId)) return;
    if (reported.size >= 100) reported.delete(reported.values().next().value!);
    reported.add(booking.transactionId);
    sendEvent("purchase", {
      transaction_id: booking.transactionId,
      currency: booking.currency,
      // One purchased booking charge, after discounts and including bundled fees.
      // This measures gross booking value, not VakayGo's commission or net revenue.
      value: totalAmount,
      items: [{ item_id: booking.listingId, item_category: booking.listingType, price: totalAmount, quantity: 1 }],
    });
  },
  saveListing: (title: string) =>
    trackEvent({
      action: "add_to_wishlist",
      category: "engagement",
      label: title,
    }),
  signUp: (method: string) =>
    trackEvent({ action: "sign_up", category: "auth", label: method }),
  useConcierge: () =>
    trackEvent({
      action: "ai_concierge",
      category: "ai",
    }),
  generateTrip: (island: string) =>
    trackEvent({
      action: "ai_trip_planner",
      category: "ai",
      label: island,
    }),
  applyPromo: (code: string) =>
    trackEvent({
      action: "apply_promo",
      category: "booking",
      label: code,
    }),
  shareContent: (type: string, title: string) =>
    trackEvent({
      action: "share",
      category: "engagement",
      label: `${type}: ${title}`,
    }),
};
