import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ user: { id: "traveler-a" } as { id: string } | null, loading: false }));
const navigation = vi.hoisted(() => ({ query: "", router: { push: vi.fn(), replace: vi.fn() } }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => auth }));
vi.mock("@/lib/currency", () => ({ useCurrency: () => ({ currency: "USD", format: String }) }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation.router, useSearchParams: () => new URLSearchParams(navigation.query) }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) }));
vi.mock("@/components/layout/header", () => ({ Header: () => null }));
vi.mock("@/components/layout/footer", () => ({ Footer: () => null }));
vi.mock("@/components/listings/review-modal", () => ({ ReviewModal: () => null }));
vi.mock("@/components/disputes/dispute-modal", () => ({ DisputeModal: () => null }));
import { BookingWidget } from "@/components/listings/booking-widget";
import { DiningReservation } from "@/components/listings/dining-reservation";
import { TransferBooking } from "@/components/listings/transfer-booking";
import TravelerBookingsPage from "@/app/(platform)/bookings/page";

let root: Root, container: HTMLDivElement, fetchMock: ReturnType<typeof vi.fn>;
const listingId = "20000000-0000-4000-8000-000000000001";
const booking = { id: "booking-1", bookingNumber: "VK-PAID", listingId, listingType: "tour", listingTitle: "Synthetic tour", listingSlug: "synthetic-tour", islandSlug: "grenada", status: "confirmed", paidAt: "2026-10-17T12:00:00Z", startDate: "2099-12-28T12:00:00Z", endDate: null, guestCount: 1, subtotal: "100.00", serviceFee: "0.00", totalAmount: "90.00", currency: "USD", createdAt: "2026-10-17T11:00:00Z", paymentEligible: false };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  auth.user = { id: "traveler-a" }; navigation.query = "";
  window.gtag = vi.fn(); delete window.vakaygoPendingAnalytics; delete window.vakaygoReportedPurchases;
  fetchMock = vi.fn(async () => Response.json({ eligible: true })); vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove();
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
  delete window.gtag; delete window.vakaygoPendingAnalytics; delete window.vakaygoReportedPurchases;
});
async function render(element: React.ReactNode) { await act(async () => root.render(element)); }
async function input(selector: string, value: string) {
  const element = container.querySelector(selector) as HTMLInputElement | HTMLSelectElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(element.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  });
}
async function click(text: string) { await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent?.includes(text))!.click()); }
function events(name: string) { return vi.mocked(window.gtag!).mock.calls.filter(call => call[1] === name); }
const widget = () => <BookingWidget bookingEligible listing={{ id: listingId, type: "tour", priceAmount: "100", priceCurrency: "USD", priceUnit: "person", avgRating: null, reviewCount: 0, isInstantBook: true }} />;
async function prepareForm(type: "tour" | "dining" | "transfer") {
  await render(type === "tour" ? widget() : type === "dining" ? <DiningReservation bookingEligible listingId={listingId} listingTitle="Synthetic restaurant" operatorId="owner" /> : <TransferBooking bookingEligible listingId={listingId} listingTitle="Synthetic transfer" priceAmount="100" priceUnit="trip" typeData={{}} />);
  await input('input[type="date"]', "2099-12-28");
  if (type === "dining") await input('select[aria-label="Reservation time"]', "12:00");
  if (type === "transfer") await input('input[placeholder="Hotel name or address"]', "Synthetic private address");
}
async function submit(type: "tour" | "dining" | "transfer") {
  if (type === "tour") await click("Book Now");
  else await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
}

describe("saved request receipts", () => {
  it.each(["tour", "dining", "transfer"] as const)("records a committed %s request without treating it as a purchase", async type => {
    await prepareForm(type);
    fetchMock.mockResolvedValueOnce(Response.json({ mode: "request", booking: { id: "request-1", bookingNumber: "VK-REQ", status: "requested", totalAmount: "0" } }, { status: 201 }));
    await submit(type);
    expect(events("booking_request_saved")).toEqual([["event", "booking_request_saved", { listing_id: listingId, listing_type: type }]]);
    expect(events("purchase")).toEqual([]); expect(events("begin_checkout")).toEqual([]);
  });
  it.each([503, 201])("does not count failed or uncommitted requests (HTTP %s)", async status => {
    await prepareForm("tour");
    fetchMock.mockResolvedValueOnce(Response.json({ mode: "request", booking: { bookingNumber: "VK-REQ", status: "requested" } }, { status }));
    await submit("tour");
    expect(window.gtag).not.toHaveBeenCalled();
  });
});

describe("specialty booking payment states", () => {
  it("uses the server transfer total and selected options for checkout", async () => {
    await prepareForm("transfer");
    await click("SUV");
    await act(async () => { (container.querySelector('input[type="checkbox"]') as HTMLInputElement).click(); });
    fetchMock.mockResolvedValueOnce(Response.json({ booking: { id: "transfer-1", bookingNumber: "VG-TRANSFER", status: "pending", totalAmount: "252.00" } }, { status: 201 }));
    await submit("transfer");
    expect(JSON.parse(fetchMock.mock.calls.find(call => call[0] === "/api/bookings")![1].body)).toMatchObject({ vehicleType: "suv", roundTrip: true });
    expect(container.textContent).toContain("Total: $252.00");
    expect(container.textContent).not.toContain("Transfer Booked!");
    fetchMock.mockResolvedValueOnce(Response.json({ url: "https://checkout.stripe.com/c/pay/transfer" }));
    vi.spyOn(window, "location", "get").mockReturnValue({ href: "" } as Location);
    await click("Pay Now");
    expect(JSON.parse(fetchMock.mock.calls.find(call => call[0] === "/api/payments/create-checkout")![1].body)).toEqual({ bookingId: "transfer-1" });
    expect(events("begin_checkout")).toHaveLength(1);
  });

  it("marks an unpaid transfer as unconfirmed when Pay Later is chosen", async () => {
    await prepareForm("transfer");
    fetchMock.mockResolvedValueOnce(Response.json({ booking: { id: "transfer-1", bookingNumber: "VG-TRANSFER", status: "pending", totalAmount: "100.00" } }, { status: 201 }));
    await submit("transfer");
    await click("Pay Later");
    expect(container.textContent).toContain("Not confirmed until paid.");
    expect(container.querySelector('a[href="/bookings"]')).not.toBeNull();
    expect(container.textContent).not.toContain("Transfer Booked!");
  });

  it("never confirms a dining table request from a non-request response", async () => {
    await prepareForm("dining");
    fetchMock.mockResolvedValueOnce(Response.json({ mode: "booking", booking: { id: "dining-1", bookingNumber: "VG-DINING", status: "pending", totalAmount: "100.00" } }, { status: 201 }));
    await submit("dining");
    expect(JSON.parse(fetchMock.mock.calls.find(call => call[0] === "/api/bookings")![1].body)).toMatchObject({ reservationType: "table" });
    expect(container.textContent).toContain("We couldn't submit a table request.");
    expect(container.textContent).not.toMatch(/Request received|Reservation Confirmed!/);
    expect(events("booking_request_saved")).toEqual([]);
  });
});

describe("validated checkout receipts", () => {
  it.each([200, 503])("measures resumed checkout only after a successful booking-page receipt (HTTP %s)", async status => {
    fetchMock.mockResolvedValueOnce(Response.json({ bookings: [{ ...booking, status: "pending", paidAt: null, paymentEligible: true }] }));
    await render(<TravelerBookingsPage />);
    fetchMock.mockResolvedValueOnce(Response.json({ url: "https://checkout.stripe.com/c/pay/test" }, { status }));
    vi.spyOn(window, "location", "get").mockReturnValue({ href: "" } as Location);
    vi.stubGlobal("alert", vi.fn());
    await click("Pay Now");
    expect(events("begin_checkout")).toHaveLength(status === 200 ? 1 : 0);
    expect(events("purchase")).toEqual([]);
  });
  it.each(["https://checkout.stripe.com/c/pay/test", "https://checkout.stripe.com.evil.invalid/c/pay/test", "http://checkout.stripe.com/c/pay/test", "javascript:void(0)"])("counts only an actual Stripe checkout URL: %s", async url => {
    await prepareForm("tour");
    fetchMock.mockResolvedValueOnce(Response.json({ booking: { ...booking, status: "pending", paidAt: null } }, { status: 201 }));
    await submit("tour");
    expect(events("begin_checkout")).toEqual([]);
    fetchMock.mockResolvedValueOnce(Response.json({ url }));
    vi.spyOn(window, "location", "get").mockReturnValue({ href: "" } as Location);
    await click("Pay Now");
    expect(events("begin_checkout")).toHaveLength(url.startsWith("https://checkout.stripe.com/") ? 1 : 0);
    expect(events("purchase")).toEqual([]);
  });
});

describe("fresh paid booking returns", () => {
  it("waits for a trusted paid record and deduplicates refreshes using the final discounted charge", async () => {
    navigation.query = "paid=VK-PAID";
    fetchMock.mockResolvedValue(Response.json({ bookings: [booking] }));
    await render(<TravelerBookingsPage />);
    expect(events("purchase")).toEqual([["event", "purchase", { transaction_id: "booking-1", currency: "USD", value: 90, items: [{ item_id: listingId, item_category: "tour", price: 90, quantity: 1 }] }]]);
    fetchMock.mockResolvedValue(Response.json({ bookings: [booking] }));
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(events("purchase")).toHaveLength(1);
  });
  it.each([
    { status: "pending", paidAt: null }, { status: "requested", paidAt: null }, { status: "cancelled" },
    { status: "refunded" }, { bookingNumber: "VK-OTHER" }, { totalAmount: "" },
  ])("does not count an unverified return %j", async changes => {
    navigation.query = "paid=VK-PAID";
    fetchMock.mockResolvedValue(Response.json({ bookings: [{ ...booking, ...changes }] }));
    await render(<TravelerBookingsPage />); expect(events("purchase")).toEqual([]);
  });
  it("does not infer purchases from booking history without the payment-return context", async () => {
    fetchMock.mockResolvedValue(Response.json({ bookings: [booking] }));
    await render(<TravelerBookingsPage />); expect(events("purchase")).toEqual([]);
  });
  it("ignores a previous account's late paid response", async () => {
    navigation.query = "paid=VK-PAID";
    let resolveOld!: (value: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>(resolve => { resolveOld = resolve; }));
    await render(<TravelerBookingsPage />);
    auth.user = { id: "traveler-b" };
    fetchMock.mockResolvedValueOnce(Response.json({ bookings: [] }));
    await render(<TravelerBookingsPage />);
    await act(async () => resolveOld(Response.json({ bookings: [booking] })));
    expect(events("purchase")).toEqual([]);
  });
  it("does not count an unsuccessful API response even when it contains a paid-looking row", async () => {
    navigation.query = "paid=VK-PAID";
    fetchMock.mockResolvedValue(Response.json({ bookings: [booking] }, { status: 503 }));
    await render(<TravelerBookingsPage />); expect(events("purchase")).toEqual([]);
  });
});
