// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isAllowedSmsDestination, smsDestinationCallingCode } from "@/lib/phone-destinations";

describe("verification text destinations", () => {
  it.each([
    ["+14735550111", "1"],    // Grenada
    ["+18765550111", "1"],    // Jamaica
    ["+12125550111", "1"],    // United States
    ["+447911123456", "44"],  // United Kingdom
    ["+33612345678", "33"],   // France
    ["+596696123456", "596"], // Martinique
    ["+5999123456", "599"],   // Curaçao
    ["+2975612345", "297"],   // Aruba
    ["+306912345678", "30"],  // Greece
    ["+385911234567", "385"], // Croatia
    ["+525512345678", "52"],  // Mexico
    ["+573001234567", "57"],  // Colombia
    ["+50688123456", "506"],  // Costa Rica
  ])("allows %s", (phone, code) => {
    expect(smsDestinationCallingCode(phone)).toBe(code);
    expect(isAllowedSmsDestination(phone)).toBe(true);
  });

  it.each([
    "+79161234567",    // Russia
    "+2348012345678",  // Nigeria
    "+8801712345678",  // Bangladesh
    "+923001234567",   // Pakistan
    "+21620123456",    // Tunisia
    "+37061234567",    // Lithuania: not listed, and must not match a shorter code
    "+5352123456",     // Cuba
    "+593991234567",   // Ecuador: shares "59" with listed codes but is not one
  ])("refuses %s", (phone) => {
    expect(isAllowedSmsDestination(phone)).toBe(false);
  });

  it("refuses premium-rate and malformed North American numbers", () => {
    for (const phone of ["+19005551234", "+19765551234", "+10125551234", "+1473555011", "+147355501112"]) expect(isAllowedSmsDestination(phone)).toBe(false);
  });

  it("refuses anything that is not E.164", () => {
    for (const value of ["14735550111", "+0123456789", "+1 473 555 0111", "", null, undefined, 14735550111]) expect(isAllowedSmsDestination(value)).toBe(false);
  });
});
