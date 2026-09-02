import { describe, it, expect } from "vitest";
import {
  shouldRequestBooking,
  isUnclaimedTypeData,
  isUnclaimedOperatorEmail,
  TEAM_INBOX,
} from "@/lib/booking-request";

/**
 * 17 real bookings in Aug 2026 landed on listings owned by the placeholder
 * `unclaimed@` account and were shown to travelers as confirmed. These are
 * the rules that route such bookings to a request instead.
 */
describe("booking-request", () => {
  it("treats a public-data listing as a request", () => {
    expect(
      shouldRequestBooking({ typeData: { unclaimed: true, phone: "(242) 323-1777" }, operatorEmail: "x@y.com", priceAmount: "50.00" })
    ).toBe(true);
  });

  it("treats the placeholder operator as a request even if typeData was edited", () => {
    expect(
      shouldRequestBooking({ typeData: {}, operatorEmail: "unclaimed@vakaygo.com", priceAmount: "50.00" })
    ).toBe(true);
  });

  it("treats an unpriced listing as a request (there is nothing Stripe can charge)", () => {
    expect(shouldRequestBooking({ typeData: {}, operatorEmail: "owner@hotel.gd", priceAmount: null })).toBe(true);
    expect(shouldRequestBooking({ typeData: {}, operatorEmail: "owner@hotel.gd", priceAmount: "0.00" })).toBe(true);
    expect(shouldRequestBooking({ typeData: {}, operatorEmail: "owner@hotel.gd", priceAmount: 0 })).toBe(true);
  });

  it("lets a claimed, priced listing book normally", () => {
    expect(
      shouldRequestBooking({ typeData: { unclaimed: false }, operatorEmail: "owner@hotel.gd", priceAmount: "155.00" })
    ).toBe(false);
    expect(shouldRequestBooking({ typeData: null, operatorEmail: "owner@hotel.gd", priceAmount: 155 })).toBe(false);
  });

  it("only the literal boolean marks a listing unclaimed", () => {
    expect(isUnclaimedTypeData({ unclaimed: true })).toBe(true);
    expect(isUnclaimedTypeData({ unclaimed: "true" })).toBe(false);
    expect(isUnclaimedTypeData({ unclaimed: false })).toBe(false);
    expect(isUnclaimedTypeData(null)).toBe(false);
    expect(isUnclaimedTypeData("unclaimed")).toBe(false);
  });

  it("matches the placeholder account case-insensitively", () => {
    expect(isUnclaimedOperatorEmail("Unclaimed@VakayGo.com")).toBe(true);
    expect(isUnclaimedOperatorEmail("demo@vakaygo.com")).toBe(false);
    expect(isUnclaimedOperatorEmail(null)).toBe(false);
  });

  it("routes team mail to a mailbox that exists (hello@ is send-only)", () => {
    expect(TEAM_INBOX).toBe("bookings@vakaygo.com");
  });
});
