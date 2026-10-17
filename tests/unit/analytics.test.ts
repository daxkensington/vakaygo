import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analytics, flushAnalyticsEvents } from "@/lib/analytics";

beforeEach(() => {
  delete window.gtag;
  delete window.vakaygoPendingAnalytics;
  delete window.vakaygoReportedPurchases;
});
afterEach(() => {
  vi.useRealTimers();
  delete window.gtag;
  delete window.vakaygoPendingAnalytics;
  delete window.vakaygoReportedPurchases;
});

describe("analytics readiness", () => {
  it("retains early events in order and flushes each once after initialization", () => {
    analytics.viewListing("Synthetic tour", "tour");
    analytics.listingInterestSaved("listing-1");
    flushAnalyticsEvents();
    expect(window.vakaygoPendingAnalytics).toHaveLength(2);
    window.gtag = vi.fn();
    flushAnalyticsEvents();
    flushAnalyticsEvents();
    expect(vi.mocked(window.gtag).mock.calls.map(call => call[1])).toEqual(["view_listing", "listing_interest_saved"]);
    expect(window.vakaygoPendingAnalytics).toEqual([]);
  });

  it("bounds a blocked provider queue and discards stale events when it becomes ready", () => {
    vi.useFakeTimers();
    for (let i = 0; i < 100; i++) analytics.listingInterestSaved(`listing-${i}`);
    expect(window.vakaygoPendingAnalytics).toHaveLength(30);
    vi.advanceTimersByTime(60_000);
    window.gtag = vi.fn();
    analytics.signUp("email");
    expect(window.gtag).toHaveBeenCalledTimes(1);
    expect(window.gtag).toHaveBeenCalledWith("event", "sign_up", expect.objectContaining({ event_label: "email" }));
  });

  it("never lets provider errors fail the customer action", () => {
    analytics.listingInterestSaved("listing-1");
    window.gtag = vi.fn(() => { throw new Error("Blocked provider"); });
    expect(() => flushAnalyticsEvents()).not.toThrow();
    expect(() => analytics.startCheckout({ listingId: "listing-1", listingType: "tour" })).not.toThrow();
    expect(window.vakaygoPendingAnalytics).toEqual([]);
  });

  it("sends fixed funnel properties without customer details or invented amounts", () => {
    window.gtag = vi.fn();
    analytics.listingInterestSaved("listing-1");
    analytics.bookingRequestSaved({ listingId: "listing-1", listingType: "tour" });
    analytics.startCheckout({ listingId: "listing-1", listingType: "tour" });
    expect(vi.mocked(window.gtag).mock.calls).toEqual([
      ["event", "listing_interest_saved", { listing_id: "listing-1" }],
      ["event", "booking_request_saved", { listing_id: "listing-1", listing_type: "tour" }],
      ["event", "begin_checkout", { items: [{ item_id: "listing-1", item_category: "tour" }] }],
    ]);
  });
});

const paidBooking = {
  transactionId: "booking-1", listingId: "listing-1", listingType: "tour",
  currency: "XCD", totalAmount: "270.00",
  status: "confirmed", paidAt: "2026-10-17T12:00:00Z",
};

describe("paid purchase reporting", () => {
  it("uses recorded item revenue and currency and deduplicates the transaction", () => {
    window.gtag = vi.fn();
    analytics.purchaseConfirmed(paidBooking);
    analytics.purchaseConfirmed({ ...paidBooking, status: "completed" });
    expect(window.gtag).toHaveBeenCalledTimes(1);
    expect(window.gtag).toHaveBeenCalledWith("event", "purchase", {
      transaction_id: "booking-1", currency: "XCD", value: 270,
      items: [{ item_id: "listing-1", item_category: "tour", price: 270, quantity: 1 }],
    });
  });

  it.each([
    { status: "requested" }, { status: "pending" }, { status: "cancelled" }, { status: "refunded" },
    { paidAt: null }, { paidAt: "unverified" }, { totalAmount: "" }, { totalAmount: "not-money" },
    { totalAmount: "0" }, { totalAmount: "-1" }, { totalAmount: "0x100" }, { currency: "" }, { transactionId: "" },
  ])("does not turn an unverified or inconsistent outcome into revenue: %j", changes => {
    window.gtag = vi.fn();
    analytics.purchaseConfirmed({ ...paidBooking, ...changes });
    expect(window.gtag).not.toHaveBeenCalled();
  });
  it("uses the final discounted booking charge without reconstructing prices", () => {
    window.gtag = vi.fn();
    analytics.purchaseConfirmed({ ...paidBooking, totalAmount: "243.00" });
    expect(window.gtag).toHaveBeenCalledWith("event", "purchase", expect.objectContaining({ value: 243, items: [expect.objectContaining({ price: 243 })] }));
  });
  it.each([null, true, {}, Number.NaN])("ignores malformed amounts without failing the booking screen: %j", amount => {
    window.gtag = vi.fn();
    expect(() => analytics.purchaseConfirmed({ ...paidBooking, totalAmount: amount } as unknown as Parameters<typeof analytics.purchaseConfirmed>[0])).not.toThrow();
    expect(window.gtag).not.toHaveBeenCalled();
  });
});
