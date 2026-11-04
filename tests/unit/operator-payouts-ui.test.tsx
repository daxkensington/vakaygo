import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) }));
vi.mock("@/lib/operator-session", () => ({ operatorFetch: (...args: unknown[]) => globalThis.fetch(...args as Parameters<typeof fetch>) }));
import OperatorPayoutsPage from "@/app/operator/payouts/page";

let container: HTMLDivElement, root: Root, fetchMock: ReturnType<typeof vi.fn>;
const earning = { bookingNumber: "SYNTHETIC", listingTitle: "Synthetic tour", totalAmount: 10, serviceFee: 0, netAmount: 10, currency: "EUR", completedAt: "2099-01-02T00:00:00Z" };
const data = { totalEarned: 10, pendingAmount: 0, availableBalance: 7.75, summaryCurrency: "EUR", currencyReviewRequired: false, missingEarnings: { completed: 0, confirmed: 0 }, recentEarnings: [earning], listings: [], payouts: [{ id: "payout", amount: 2.25, currency: "EUR", status: "completed", periodStart: "2099-01-01T00:00:00Z", periodEnd: "2099-01-02T00:00:00Z", bookingCount: 1, paidAt: "2099-01-03T00:00:00Z", createdAt: "2099-01-02T00:00:00Z" }] };

beforeEach(() => {
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function render(body: unknown) {
  fetchMock.mockResolvedValue(new Response(JSON.stringify(body)));
  await act(async () => root.render(<OperatorPayoutsPage />));
}

it("shows recorded earnings and payout currencies without calling the amount withdrawable or the traveler fee an operator commission", async () => {
  await render(data);
  expect(container.textContent).toContain("Unsettled Recorded Earnings");
  expect(container.textContent).toContain("EUR\u00a07.75");
  expect(container.textContent).toContain("EUR\u00a02.25");
  expect(container.textContent).toContain("Traveler Service Fee");
  expect(container.textContent).not.toContain("Platform Fee");
  expect(container.textContent).not.toContain("Available Balance");
  expect(container.textContent).toContain("do not confirm funds are available for withdrawal");
  expect(container.textContent).not.toContain("USD");
});

it("explains missing earnings and leaves the recorded row unknown while preserving a known zero", async () => {
  await render({ ...data, totalEarned: null, availableBalance: null, missingEarnings: { completed: 1, confirmed: 0 }, recentEarnings: [{ ...earning, netAmount: null }, { ...earning, bookingNumber: "ZERO", netAmount: 0 }] });
  expect(container.querySelector('[role="status"]')?.textContent).toContain("1 completed and 0 confirmed bookings");
  expect(container.textContent).toContain("Needs review");
  const rows = container.querySelectorAll("tbody tr");
  expect(rows[0].textContent).toContain("Not recorded");
  expect(rows[1].textContent).toContain("EUR\u00a00.00");
});

it("does not present a combined mixed-currency summary or hide the individual recorded currencies", async () => {
  await render({ ...data, totalEarned: null, availableBalance: null, pendingAmount: null, summaryCurrency: null, currencyReviewRequired: true, recentEarnings: [earning, { ...earning, bookingNumber: "USD-ROW", currency: "USD" }] });
  expect(container.querySelector('[role="status"]')?.textContent).toContain("currencies have not been combined or converted");
  expect(container.querySelectorAll("tbody tr")[0].textContent).toContain("EUR");
  expect(container.querySelectorAll("tbody tr")[1].textContent).toContain("USD");
});

it("exports each recorded currency and marks missing earnings instead of inventing a numeric CSV value", async () => {
  let exported: Blob | undefined;
  vi.spyOn(URL, "createObjectURL").mockImplementation(blob => { exported = blob as Blob; return "blob:synthetic"; });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  await render({ ...data, recentEarnings: [{ ...earning, netAmount: null }, { ...earning, bookingNumber: "ZERO", netAmount: 0, currency: "USD" }] });
  const button = Array.from(container.querySelectorAll("button")).find(item => item.textContent?.includes("Export CSV"))!;
  await act(async () => button.click());
  const csv = await exported!.text();
  expect(csv).toContain("Currency,Traveler Total,Traveler Service Fee,Recorded Operator Earnings");
  expect(csv).toContain('SYNTHETIC,"Synthetic tour",EUR,10.00,0.00,Not recorded');
  expect(csv).toContain('ZERO,"Synthetic tour",USD,10.00,0.00,0.00');
  expect(csv).not.toContain("Gross USD");
});
