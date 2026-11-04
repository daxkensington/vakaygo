import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { bookingInputError } from "@/lib/booking-validation";
import { calculateTransferUnitPrice, isTransferVehicleType, type TransferVehicleType } from "@/lib/transfer-pricing";

const validBooking = {
  listingId: "20000000-0000-4000-8000-000000000001",
  startDate: "2099-12-28T12:00:00",
  guestCount: 1,
};

describe("transfer pricing", () => {
  it.each([
    ["sedan", 100, 180],
    ["suv", 140, 252],
    ["minivan", 170, 306],
    ["luxury", 220, 396],
  ] as const)("prices %s consistently for one-way and round trips", (vehicle, oneWay, roundTrip) => {
    expect(calculateTransferUnitPrice(100, vehicle, false)).toBe(oneWay);
    expect(calculateTransferUnitPrice(100, vehicle, true)).toBe(roundTrip);
  });

  it("accepts only known vehicle types", () => {
    for (const vehicle of ["sedan", "suv", "minivan", "luxury"] satisfies TransferVehicleType[]) {
      expect(isTransferVehicleType(vehicle)).toBe(true);
    }
    for (const vehicle of ["hovercraft", "toString", "", null, 1]) {
      expect(isTransferVehicleType(vehicle)).toBe(false);
    }
  });

  it("uses the same multipliers in the database guard", () => {
    const migration = readFileSync(path.resolve("drizzle/migrations/0017_specialty_booking_pricing.sql"), "utf8");
    expect(migration).toContain("WHEN 'sedan' THEN 1 WHEN 'suv' THEN 1.4 WHEN 'minivan' THEN 1.7 WHEN 'luxury' THEN 2.2");
    expect(migration).toContain("CASE WHEN NEW.transfer_round_trip THEN 1.8 ELSE 1 END");
  });
});

describe("specialty booking validation", () => {
  it.each([
    [{ vehicleType: "hovercraft" }, "Choose a valid transfer vehicle"],
    [{ roundTrip: "true" }, "Choose a valid transfer trip type"],
    [{ reservationType: "experience" }, "Choose a valid dining reservation type"],
  ])("rejects invalid options %j", (options, message) => {
    expect(bookingInputError({ ...validBooking, ...options })).toBe(message);
  });

  it("accepts structured transfer and table-request options", () => {
    expect(bookingInputError({ ...validBooking, vehicleType: "suv", roundTrip: true })).toBeNull();
    expect(bookingInputError({ ...validBooking, reservationType: "table" })).toBeNull();
  });
});
