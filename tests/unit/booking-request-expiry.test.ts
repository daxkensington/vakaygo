// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { classifyRequestedBooking, requestExpiryReason, requestStatusCopy, REQUEST_EXPIRY_FLAG } from "@/lib/booking-request-expiry";

const NOW = new Date("2026-11-10T12:00:00Z");
const request = (over: Partial<Parameters<typeof classifyRequestedBooking>[0]> = {}) => ({ status: "requested", paidAt: null, startDate: "2026-12-29T00:00:00.000Z", ...over });

describe("unanswered booking requests", () => {
  it("expires a request once its date has passed and leaves future ones open", () => {
    expect(classifyRequestedBooking(request({ startDate: "2026-08-20T00:00:00.000Z" }), NOW)).toBe("expired");
    expect(classifyRequestedBooking(request({ startDate: new Date("2026-11-10T12:00:00Z") }), NOW)).toBe("expired");
    expect(classifyRequestedBooking(request(), NOW)).toBe("open");
    expect(classifyRequestedBooking(request({ startDate: new Date("2026-11-17T00:00:00Z") }), NOW)).toBe("open");
  });

  it("never touches anything paid or already moved on", () => {
    for (const status of ["pending", "confirmed", "cancelled", "completed", "refunded"]) {
      expect(classifyRequestedBooking(request({ status, startDate: "2026-08-20T00:00:00.000Z" }), NOW)).toBe("ignore");
    }
    expect(classifyRequestedBooking(request({ paidAt: "2026-08-19T00:00:00Z", startDate: "2026-08-20T00:00:00.000Z" }), NOW)).toBe("ignore");
    expect(classifyRequestedBooking(request({ startDate: "not a date" }), NOW)).toBe("ignore");
  });

  it("tells the traveler the truth in both states", () => {
    const expired = requestStatusCopy("expired")!;
    expect(expired.label).toBe("Not confirmed");
    expect(expired.detail).toContain("did not confirm");
    expect(expired.detail).toContain("not charged");
    const open = requestStatusCopy("open")!;
    expect(open.label).toBe("Request sent");
    expect(open.detail).toContain("not a reservation");
    // The old line claimed someone was working on it; nobody was.
    expect(open.detail).not.toMatch(/we.re confirming/i);
    expect(requestStatusCopy("ignore")).toBeNull();
  });

  it("keeps the one-off script on the same rule, reason and default as the cron", () => {
    const script = fs.readFileSync(path.join(__dirname, "..", "..", "scripts", "expire-stale-booking-requests.mjs"), "utf8");
    expect(script).toContain(`const REASON = "${requestExpiryReason()}";`);
    expect(script).toContain('process.argv.includes("--apply")');
    // The write is compare-and-set on the same three facts the classifier reads.
    expect(script).toMatch(/status = 'requested' AND paid_at IS NULL AND start_date <= now\(\)/);
    const cron = fs.readFileSync(path.join(__dirname, "..", "..", "app", "api", "cron", "abandoned-bookings", "route.ts"), "utf8");
    expect(cron).toContain("isFeatureEnabled(REQUEST_EXPIRY_FLAG)");
    expect(REQUEST_EXPIRY_FLAG).toBe("booking_request_expiry_enabled");
  });
});
