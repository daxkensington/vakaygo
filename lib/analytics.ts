type GtagEvent = {
  action: string;
  category: string;
  label?: string;
  value?: number;
};

export function trackEvent({ action, category, label, value }: GtagEvent) {
  if (typeof window !== "undefined" && (window as any).gtag) {
    (window as any).gtag("event", action, {
      event_category: category,
      event_label: label,
      value: value,
    });
  }
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
  startBooking: (listingTitle: string, amount: number) =>
    trackEvent({
      action: "begin_checkout",
      category: "booking",
      label: listingTitle,
      value: amount,
    }),
  completeBooking: (bookingNumber: string, amount: number) =>
    trackEvent({
      action: "purchase",
      category: "booking",
      label: bookingNumber,
      value: amount,
    }),
  saveListing: (title: string) =>
    trackEvent({
      action: "add_to_wishlist",
      category: "engagement",
      label: title,
    }),
  signUp: (method: string) =>
    trackEvent({ action: "sign_up", category: "auth", label: method }),
  useConcierge: (query: string) =>
    trackEvent({
      action: "ai_concierge",
      category: "ai",
      label: query,
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
