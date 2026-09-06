import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ user: null as null | { id: string } }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => auth }));
vi.mock("@/lib/currency", () => ({ useCurrency: () => ({ currency: "USD", format: String }) }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) }));

import { BookingEligibilityGate, BookingUnavailableNotice, invalidateBookingControls } from "@/components/listings/booking-eligibility";
import { BookingWidget } from "@/components/listings/booking-widget";
import { DiningReservation } from "@/components/listings/dining-reservation";
import { TransferBooking } from "@/components/listings/transfer-booking";
import { AvailabilityCalendar } from "@/components/listings/availability-calendar";
import { TrustBadges } from "@/components/listings/trust-badges";

const listingId = "20000000-0000-4000-8000-000000000001";
let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
const response = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
async function render(element: React.ReactNode) { await act(async () => { root.render(element); }); }

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2099-12-01T12:00:00Z"));
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  auth.user = null;
  fetchMock = vi.fn(() => response({ eligible: false, reason: "unclaimed" }));
  vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("booking controls require current eligibility", () => {
  it("renders information only for every widget when eligibility is missing", async () => {
    await render(<>
      <BookingWidget listing={{ id: listingId, type: "tour", priceAmount: "100", priceCurrency: "USD", priceUnit: "person", avgRating: null, reviewCount: 0, isInstantBook: true }} />
      <DiningReservation listingId={listingId} listingTitle="Restaurant" operatorId="owner" />
      <TransferBooking listingId={listingId} listingTitle="Transfer" priceAmount="100" priceUnit="trip" typeData={{}} />
    </>);
    expect(container.querySelectorAll('[aria-label="Booking availability"]')).toHaveLength(3);
    expect(container.querySelector("form, input, select")).toBeNull();
    expect(container.textContent).not.toMatch(/Book Now|Request to Book|Reserve a Table|Book Transfer|Pay Now/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not trust a cached true prop when the API denies eligibility", async () => {
    await render(<BookingEligibilityGate listingId={listingId} bookingEligible><button>Pay Now</button></BookingEligibilityGate>);
    expect(container.textContent).toContain("Information only");
    expect(container.textContent).not.toContain("Pay Now");
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/listings/eligibility?listingId="), expect.objectContaining({ cache: "no-store" }));
  });

  it("clears an existing payment session on page restoration and never reopens from an older response", async () => {
    let resolveOld: ((value: Response) => void) | undefined;
    fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => { resolveOld = resolve; }));
    await render(<BookingEligibilityGate listingId={listingId} bookingEligible><button>Pay Now</button></BookingEligibilityGate>);
    fetchMock.mockImplementation(() => response({ eligible: false, reason: "suspended" }));
    await act(async () => { window.dispatchEvent(new Event("pageshow")); });
    await act(async () => { resolveOld!(new Response(JSON.stringify({ eligible: true, reason: "ready" }))); });
    expect(container.textContent).not.toContain("Pay Now");
  });

  it("unmounts payment state when readiness is lost and starts clean after re-verification", async () => {
    function PaymentState() { const [session, setSession] = useState(""); return <button onClick={() => setSession("saved checkout")}>{session || "Choose dates"}</button>; }
    fetchMock.mockImplementation(() => response({ eligible: true, reason: "ready" }));
    const screen = (eligible: boolean) => <BookingEligibilityGate listingId={listingId} bookingEligible={eligible}><PaymentState /></BookingEligibilityGate>;
    await render(screen(true));
    await act(async () => { container.querySelector("button")!.click(); });
    expect(container.textContent).toContain("saved checkout");
    fetchMock.mockImplementation(() => response({ eligible: false }, 503));
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(container.textContent).not.toContain("saved checkout");
    fetchMock.mockImplementation(() => response({ eligible: true, reason: "ready" }));
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(container.textContent).toContain("Choose dates");
    expect(container.textContent).not.toContain("saved checkout");
  });

  it("shows the onboarding action only to the current owner", async () => {
    auth.user = { id: "other" };
    await render(<BookingUnavailableNotice listingId={listingId} operatorId="owner" />);
    expect(container.querySelector('a[href*="/operator/onboarding/"]')).toBeNull();
    auth.user = { id: "owner" };
    await render(<BookingUnavailableNotice listingId={listingId} operatorId="owner" />);
    expect(container.querySelector('a[href*="/operator/onboarding/"]')).not.toBeNull();
  });

  it("immediately drops checkout controls after the booking API rejects eligibility", async () => {
    fetchMock.mockImplementation(() => response({ eligible: true, reason: "ready" }));
    await render(<BookingEligibilityGate listingId={listingId} bookingEligible><button>Pay Now</button></BookingEligibilityGate>);
    expect(container.textContent).toContain("Pay Now");
    await act(async () => { invalidateBookingControls(listingId); });
    expect(container.textContent).not.toContain("Pay Now");
    expect(container.textContent).toContain("Information only");
  });

  it("suppresses booking and verification badges without explicit eligibility", async () => {
    await render(<TrustBadges isInstantBook avgRating="4.9" reviewCount={10} />);
    expect(container.textContent).not.toMatch(/Instant book|Free cancellation|Verified operator/);
    expect(container.textContent).toContain("Top rated");
  });

  it("never offers an unpublished, unlimited or full calendar date", async () => {
    const now = new Date(); const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    fetchMock.mockImplementation((url: string) => url.includes("/eligibility?") ? response({ eligible: true }) : response({ bookingEligible: true, availability: [
      { date: `${month}-28`, spots: null, spotsRemaining: null, isBlocked: false },
      { date: `${month}-27`, spots: 2, spotsRemaining: 0, isBlocked: false },
      { date: `${month}-26`, spots: 2, spotsRemaining: 2, isBlocked: false },
    ], bookings: {} }));
    await render(<AvailabilityCalendar listingId={listingId} bookingEligible />);
    const day = (number: string) => Array.from(container.querySelectorAll("button")).find(button => button.firstElementChild?.textContent === number)!;
    expect(day("28").disabled).toBe(true);
    expect(day("27").disabled).toBe(true);
    expect(day("25").disabled).toBe(true);
    expect(day("26").disabled).toBe(false);
  });
});
