import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { renderToStaticMarkup } from "react-dom/server";
import { proxy } from "@/proxy";
import { blocksNewSale } from "@/lib/directory-mode";
import { BookingWidget } from "@/components/listings/booking-widget";
import { DiningReservation } from "@/components/listings/dining-reservation";
import { TransferBooking } from "@/components/listings/transfer-booking";

describe("live directory safeguard", () => {
  it.each(["/api/bookings", "/api/bookings/", "/api/payments/create-checkout", "/api/payments/gift-cards"])("rejects %s before any booking or payment work", async path => {
    const response = await proxy(new NextRequest(`https://vakaygo.com${path}`, { method: "POST", body: "{}" }));
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("BOOKINGS_UNAVAILABLE");
  });
  it("rejects confirmation while retaining the cancellation route", async () => {
    const request = new NextRequest("https://vakaygo.com/api/bookings/booking-id", { method: "PATCH", body: JSON.stringify({ status: "confirmed" }) });
    expect((await proxy(request)).status).toBe(503);
    expect(blocksNewSale("/api/bookings/cancel", "POST")).toBe(false);
    expect(blocksNewSale("/api/bookings/refund", "POST")).toBe(false);
    expect(blocksNewSale("/api/payments/webhook", "POST")).toBe(false);
  });
  it("returns no bookable dates and suppresses recovery offers", async () => {
    const response = await proxy(new NextRequest("https://vakaygo.com/api/availability?listingId=anything&month=2099-01"));
    expect(await response.json()).toMatchObject({ bookingEligible: false, available: false, availability: [] });
    expect(blocksNewSale("/api/cron/abandoned-bookings", "GET")).toBe(true);
  });
  it("renders directory information with no date, guest, reservation or payment form", () => {
    const html = renderToStaticMarkup(<>
      <BookingWidget listing={{ id: "directory-listing", type: "tour", priceAmount: "65", priceCurrency: "USD", priceUnit: "person", avgRating: null, reviewCount: null, isInstantBook: true }} />
      <DiningReservation listingId="restaurant" listingTitle="Restaurant" operatorId="operator" />
      <TransferBooking listingId="transfer" listingTitle="Transfer" priceAmount="50" priceUnit="trip" typeData={null} />
    </>);
    expect(html).toContain("Bookings are not available");
    expect(html).toContain("Claim your listing");
    expect(html).not.toMatch(/<form|<input|<button|Pay Now|Request a Table|Reserve a Table/);
  });
});
