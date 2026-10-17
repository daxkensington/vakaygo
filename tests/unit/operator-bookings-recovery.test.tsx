import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ user: { id: "operator-a", role: "operator" } as { id: string; role: string } | null, loading: false }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => auth }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) }));
import OperatorBookingsPage from "@/app/operator/bookings/page";

const booking = (id = "booking-a", title = "Operator A tour") => ({ id, bookingNumber: id, status: "pending", startDate: "2099-12-05T00:00:00.000Z", guestCount: 2, subtotal: "65.00", currency: "USD", guestNotes: null, listingTitle: title, listingType: "tour" });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function deferred() { let resolve!: (value: Response) => void; return { promise: new Promise<Response>(accept => { resolve = accept; }), resolve: (value: Response) => resolve(value) }; }
let container: HTMLDivElement, root: Root, fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks(); auth.user = { id: "operator-a", role: "operator" }; auth.loading = false;
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function render() { await act(async () => root.render(<OperatorBookingsPage />)); }
const button = (label: string) => Array.from(container.querySelectorAll("button")).find(item => item.getAttribute("aria-label") === label || item.textContent?.trim() === label)!;
const row = (id = "booking-a") => container.querySelector(`article[aria-label="Booking ${id}"]`)!;
async function click(label: string) { expect(button(label), label).toBeDefined(); await act(async () => button(label).click()); }

it("keeps a rejected acceptance pending and out of revenue when the API closes booking eligibility", async () => {
  fetchMock.mockResolvedValueOnce(response({ bookings: [booking()] })).mockResolvedValueOnce(response({ code: "BOOKING_UNAVAILABLE", error: "Synthetic business gate" }, 409));
  await render(); await click("Accept booking booking-a");
  expect(fetchMock.mock.calls[1][0]).toBe("/api/bookings/booking-a");
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ status: "confirmed" });
  expect(row().textContent).toContain("Pending"); expect(row().textContent).not.toContain("Confirmed");
  expect(container.querySelector('section[aria-label="Revenue by recorded currency"]')?.textContent).toContain("No confirmed revenue");
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("not accepting bookings");
  expect(button("Accept booking booking-a").disabled).toBe(true); expect(button("Reload bookings").disabled).toBe(false);
});

it("keeps a schema-valid historical booking with an unknown guest count visible alongside other bookings", async () => {
  fetchMock.mockResolvedValueOnce(response({ bookings: [{ ...booking(), guestCount: null }, booking("booking-b", "Another tour")] }));
  await render();
  expect(row().textContent).toContain("Guest count unavailable");
  expect(row("booking-b").textContent).toContain("2 guests");
  expect(button("Accept booking booking-a").disabled).toBe(false);
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

it.each([
  { status: 503, body: { error: "Unavailable" } },
  { status: 200, body: { bookings: "invalid" } },
  { status: 200, body: { bookings: [{ ...booking(), status: "invented-status" }] } },
  { status: 200, body: { bookings: [booking(), booking()] } },
])("distinguishes failed or malformed list responses from an empty business ($status)", async ({ status, body }) => {
  fetchMock.mockResolvedValueOnce(response(body, status)).mockResolvedValueOnce(response({ bookings: [booking()] }));
  await render(); expect(container.querySelector('[role="alert"]')).not.toBeNull(); expect(container.textContent).not.toContain("No bookings yet");
  expect(container.textContent).not.toContain("$0.00");
  await click("Reload bookings"); expect(row().textContent).toContain("Pending"); expect(container.querySelector('[role="alert"]')).toBeNull();
});

it.each([
  { status: 503, body: { booking: { id: "booking-a", status: "confirmed" } } },
  { status: 200, body: { booking: { id: "another-booking", status: "confirmed" } } },
  { status: 200, body: { booking: { id: "booking-a", status: "pending" } } },
  { status: 200, body: { ok: true } },
])("requires the successful matching server receipt before changing local status ($status)", async ({ status, body }) => {
  fetchMock.mockResolvedValueOnce(response({ bookings: [booking()] })).mockResolvedValueOnce(response(body, status));
  await render(); await click("Accept booking booking-a");
  expect(row().textContent).toContain("Pending"); expect(row().textContent).not.toContain("Confirmed");
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("could not be confirmed");
});

it("reloads authoritative status after an uncertain mutation and retains loaded rows if that read also fails", async () => {
  fetchMock.mockResolvedValueOnce(response({ bookings: [booking()] }))
    .mockRejectedValueOnce(new Error("Synthetic disconnect after sending"))
    .mockResolvedValueOnce(response({ error: "Unavailable" }, 503))
    .mockResolvedValueOnce(response({ bookings: [{ ...booking(), status: "cancelled" }] }));
  await render(); await click("Decline booking booking-a"); await click("Reload bookings");
  expect(row().textContent).toContain("Pending"); expect(container.textContent).not.toContain("No bookings yet");
  expect(button("Decline booking booking-a").disabled).toBe(true);
  await click("Reload bookings");
  expect(row().textContent).toContain("Cancelled"); expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(button("Decline booking booking-a")).toBeUndefined();
});

it("prevents duplicate or opposing writes while one confirmation is in flight", async () => {
  const receipt = deferred();
  fetchMock.mockResolvedValueOnce(response({ bookings: [booking()] })).mockReturnValueOnce(receipt.promise);
  await render();
  await act(async () => { button("Accept booking booking-a").click(); button("Accept booking booking-a").click(); button("Decline booking booking-a").click(); });
  expect(fetchMock).toHaveBeenCalledTimes(2); expect(row().getAttribute("aria-busy")).toBe("true");
  expect(row().textContent).toContain("Pending");
  await act(async () => receipt.resolve(response({ booking: { id: "booking-a", status: "confirmed" } })));
  expect(row().textContent).toContain("Confirmed"); expect(container.querySelector('section[aria-label="Revenue by recorded currency"]')?.textContent).toContain("USD 65.00");
});

it("does not accept a non-JSON successful response as a confirmed change", async () => {
  fetchMock.mockResolvedValueOnce(response({ bookings: [booking()] })).mockResolvedValueOnce(new Response("<html>not a booking receipt</html>"));
  await render(); await click("Accept booking booking-a");
  expect(row().textContent).toContain("Pending"); expect(container.querySelector('[role="alert"]')).not.toBeNull();
});

it("isolates old account reads even when a fetch ignores its aborted signal", async () => {
  const old = deferred();
  fetchMock.mockReturnValueOnce(old.promise).mockResolvedValueOnce(response({ bookings: [booking("booking-b", "Operator B tour")] }));
  await render(); const signal = fetchMock.mock.calls[0][1].signal;
  auth.user = { id: "operator-b", role: "operator" }; await render(); expect(signal.aborted).toBe(true);
  await act(async () => old.resolve(response({ bookings: [booking()] })));
  expect(container.textContent).toContain("Operator B tour"); expect(container.textContent).not.toContain("Operator A tour");
});

it("isolates a late old account mutation from the next operator's bookings", async () => {
  const old = deferred();
  fetchMock.mockResolvedValueOnce(response({ bookings: [booking()] })).mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce(response({ bookings: [booking("booking-b", "Operator B tour")] }));
  await render(); await click("Accept booking booking-a"); const signal = fetchMock.mock.calls[1][1].signal;
  auth.user = { id: "operator-b", role: "operator" }; await render(); expect(signal.aborted).toBe(true);
  await act(async () => old.resolve(response({ booking: { id: "booking-a", status: "confirmed" } })));
  expect(row("booking-b").textContent).toContain("Pending"); expect(container.textContent).not.toContain("Operator A tour");
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

it("clears private rows and aborts a read when the operator signs out", async () => {
  const old = deferred(); fetchMock.mockReturnValueOnce(old.promise);
  await render(); const signal = fetchMock.mock.calls[0][1].signal;
  auth.user = null; await render(); expect(signal.aborted).toBe(true);
  await act(async () => old.resolve(response({ bookings: [booking()] })));
  expect(container.textContent).not.toContain("Operator A tour"); expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(container.querySelector('a[href="/auth/signin?next=%2Foperator%2Fbookings"]')).not.toBeNull();
});

it.each(["read", "write"] as const)("bounds a stalled %s and leaves recovery available", async operation => {
  const stalled = (_url: string, options: { signal: AbortSignal }) => new Promise<Response>((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }));
  if (operation === "write") {
    fetchMock.mockResolvedValueOnce(response({ bookings: [booking()] })); await render();
    fetchMock.mockImplementationOnce(stalled); vi.useFakeTimers(); await click("Accept booking booking-a");
  } else { fetchMock.mockImplementationOnce(stalled); vi.useFakeTimers(); await render(); }
  await act(async () => vi.advanceTimersByTimeAsync(20_000));
  expect(container.querySelector('[role="alert"]')).not.toBeNull(); expect(button("Reload bookings").disabled).toBe(false);
  if (operation === "write") expect(row().textContent).toContain("Pending"); else expect(container.textContent).not.toContain("No bookings yet");
});

it("preserves each booking's recorded currency and totals confirmed revenue separately by currency", async () => {
  fetchMock.mockResolvedValueOnce(response({ bookings: [
    { ...booking(), status: "confirmed", subtotal: "65.10" },
    { ...booking("usd-completed"), status: "completed", subtotal: "34.90", currency: "usd" },
    { ...booking("euro"), status: "confirmed", subtotal: "50.00", currency: "EUR" },
    { ...booking("euro-completed"), status: "completed", subtotal: "10.00", currency: "EUR" },
    { ...booking("ec-dollar"), status: "completed", subtotal: "270.00", currency: "XCD" },
    { ...booking("pending-euro"), subtotal: "999.00", currency: "EUR" },
    { ...booking("cancelled-usd"), status: "cancelled", subtotal: "888.00" },
  ] }));
  await render();
  expect(row().textContent).toContain("USD 65.10");
  expect(row("euro").textContent).toContain("EUR 50.00");
  expect(row("ec-dollar").textContent).toContain("XCD 270.00");
  const totals = Array.from(container.querySelectorAll('section[aria-label="Revenue by recorded currency"] li')).map(item => item.textContent);
  expect(totals).toEqual(["EUR 60.00", "USD 100.00", "XCD 270.00"]);
  expect(container.textContent).not.toContain("$430.00");
  await act(async () => Array.from(container.querySelectorAll("button")).find(item => item.textContent?.trim().startsWith("confirmed"))!.click());
  expect(Array.from(container.querySelectorAll('section[aria-label="Revenue by recorded currency"] li')).map(item => item.textContent)).toEqual(totals);
});

it("keeps historical amounts with unknown currencies visible without treating them as USD or adding them together", async () => {
  const missing = { ...booking("missing-currency"), status: "completed", subtotal: "30.00" };
  Reflect.deleteProperty(missing, "currency");
  fetchMock.mockResolvedValueOnce(response({ bookings: [
    { ...booking(), status: "confirmed", currency: null },
    { ...booking("blank-currency"), status: "completed", subtotal: "20.00", currency: " " },
    missing,
    { ...booking("known-euro"), status: "completed", subtotal: "40.00", currency: "EUR" },
  ] }));
  await render();
  expect(row().textContent).toContain("65.00 (currency unavailable)");
  expect(row("blank-currency").textContent).toContain("20.00 (currency unavailable)");
  expect(row("missing-currency").textContent).toContain("30.00 (currency unavailable)");
  const revenue = container.querySelector('section[aria-label="Revenue by recorded currency"]')!;
  expect(Array.from(revenue.querySelectorAll("li")).map(item => item.textContent)).toEqual(["EUR 40.00"]);
  expect(revenue.textContent).toContain("3 bookings are excluded");
  expect(revenue.textContent).not.toContain("115.00");
  expect(container.textContent).not.toContain("USD");
  expect(container.querySelector('[role="alert"]')).toBeNull();
});
