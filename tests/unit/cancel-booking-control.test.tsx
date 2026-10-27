import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CancelBookingControl, type CancellationReceipt } from "@/components/bookings/cancel-booking-control";

const response = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
const defaultProps = {
  bookingId: "20000000-0000-4000-8000-000000000001",
  bookingNumber: "VG-TEST-1",
  status: "confirmed",
  totalAmount: "160.00",
  currency: "USD",
  paidAt: "2099-11-30T12:00:00.000Z",
  startDate: "2099-12-04T12:00:00.000Z",
  cancellationPolicy: "moderate",
  listingTimezone: "UTC",
  actor: "traveler" as const,
};

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
let onComplete: (receipt: CancellationReceipt) => void;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2099-12-01T12:00:00.000Z"));
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  onComplete = vi.fn();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function render(overrides: Partial<React.ComponentProps<typeof CancelBookingControl>> = {}) {
  await act(async () => root.render(<CancelBookingControl {...defaultProps} onComplete={onComplete} {...overrides} />));
}

function buttons(label: string) {
  return Array.from(container.querySelectorAll("button")).filter(button => button.textContent?.trim() === label);
}

async function click(button: HTMLButtonElement | undefined) {
  expect(button).toBeDefined();
  await act(async () => button!.click());
}

async function openDialog(label = "Cancel booking") {
  await click(buttons(label)[0]);
  return container.querySelector('[role="dialog"]')!;
}

describe("CancelBookingControl", () => {
  it("previews the traveler's policy-based refund before sending anything", async () => {
    await render();
    expect(fetchMock).not.toHaveBeenCalled();
    await openDialog();
    expect(container.textContent).toContain("Moderate cancellation policy");
    expect(container.textContent).toContain("Estimated refund: $80.00 (50%)");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the full-refund business rule regardless of the traveler policy deadline", async () => {
    await render({ actor: "business", cancellationPolicy: "non_refundable" });
    await openDialog("Cancel & refund");
    expect(container.textContent).toContain("Operator and admin cancellations refund the full recorded payment.");
    expect(container.textContent).toContain("Refund: $160.00 (100%)");
  });

  it("makes unpaid request cancellation explicit", async () => {
    await render({ status: "requested", paidAt: null, totalAmount: "0.00" });
    await openDialog();
    expect(container.textContent).toContain("No payment has been made, so there is nothing to refund.");
  });

  it("does not offer cancellation for closed bookings", async () => {
    await render({ status: "completed" });
    expect(container.querySelector("button")).toBeNull();
  });

  it("can dismiss the confirmation without calling the API", async () => {
    await render();
    await openDialog();
    await click(buttons("Keep booking")[0]);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("prevents duplicate writes and returns the authoritative refunded status", async () => {
    let resolveRequest!: (value: Response) => void;
    fetchMock.mockImplementation(() => new Promise<Response>(resolve => { resolveRequest = resolve; }));
    await render();
    await openDialog();
    const confirm = buttons("Cancel booking")[1];
    await act(async () => { confirm.click(); confirm.click(); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/bookings/cancel");
    await act(async () => resolveRequest(new Response(JSON.stringify({ success: true, status: "refunded", refundAmount: 80, message: "Cancellation recorded." }), { status: 200 })));
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ status: "refunded", refundAmount: 80 }));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("keeps the dialog open and displays an API failure", async () => {
    fetchMock.mockImplementation(() => response({ error: "Refund failed; support review required" }, 502));
    await render();
    await openDialog();
    await click(buttons("Cancel booking")[1]);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Refund failed");
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it.each(["cancelled", "refunded"] as const)("accepts a successful %s receipt and sends the trimmed reason", async status => {
    const receipt: CancellationReceipt = { success: true, status, refundAmount: status === "refunded" ? 80 : 0 };
    fetchMock.mockImplementation(() => response(receipt));
    await render();
    await openDialog();
    await act(async () => {
      const textarea = container.querySelector("textarea")!;
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(textarea, "  Schedule changed  ");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(buttons("Cancel booking")[1]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ bookingId: defaultProps.bookingId, reason: "Schedule changed" });
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ status }));
  });
});
