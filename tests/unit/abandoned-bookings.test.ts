import { describe, it, expect } from "vitest";
import { classifyPendingBooking, RECOVERY_AFTER_MS, EXPIRE_AFTER_MS } from "@/lib/abandoned-bookings";

const NOW = new Date("2026-09-03T12:00:00Z");
const h = (n: number) => n * 3_600_000;

function booking(over: Partial<Parameters<typeof classifyPendingBooking>[0]> = {}) {
  return {
    status: "pending",
    paidAt: null,
    paymentMethod: "card",
    totalAmount: "120.00",
    createdAt: new Date(NOW.getTime() - h(1)),
    startDate: new Date(NOW.getTime() + h(24 * 10)),
    recoveryEmailSentAt: null,
    ...over,
  };
}

describe("classifyPendingBooking", () => {
  it("waits during the first two hours", () => {
    expect(classifyPendingBooking(booking(), NOW)).toBe("wait");
    expect(classifyPendingBooking(booking({ createdAt: new Date(NOW.getTime() - RECOVERY_AFTER_MS + 1) }), NOW)).toBe("wait");
  });

  it("sends one recovery email after two hours, never a second", () => {
    const b = booking({ createdAt: new Date(NOW.getTime() - RECOVERY_AFTER_MS) });
    expect(classifyPendingBooking(b, NOW)).toBe("recover");
    expect(classifyPendingBooking({ ...b, recoveryEmailSentAt: NOW }, NOW)).toBe("wait");
  });

  it("expires after 48 hours whether or not a reminder went out", () => {
    const b = booking({ createdAt: new Date(NOW.getTime() - EXPIRE_AFTER_MS) });
    expect(classifyPendingBooking(b, NOW)).toBe("expire");
    expect(classifyPendingBooking({ ...b, recoveryEmailSentAt: NOW }, NOW)).toBe("expire");
  });

  it("expires an unpaid booking whose start has passed, even if young", () => {
    expect(classifyPendingBooking(booking({ startDate: new Date(NOW.getTime() - 1) }), NOW)).toBe("expire");
  });

  it("ignores requested, paid, free, and non-pending bookings", () => {
    expect(classifyPendingBooking(booking({ status: "requested", paymentMethod: "none" }), NOW)).toBe("ignore");
    expect(classifyPendingBooking(booking({ paidAt: NOW }), NOW)).toBe("ignore");
    expect(classifyPendingBooking(booking({ totalAmount: "0.00" }), NOW)).toBe("ignore");
    expect(classifyPendingBooking(booking({ status: "confirmed" }), NOW)).toBe("ignore");
    expect(classifyPendingBooking(booking({ paymentMethod: "none" }), NOW)).toBe("ignore");
  });
});
