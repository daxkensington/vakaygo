import { describe, expect, it } from "vitest";
import {
  DESTINATION_TIMEZONES,
  checkRecipientSendingWindow,
  resolveRecipientTimeZone,
} from "@/lib/outreach-timezone";

describe("outreach-timezone quiet-hours guard", () => {
  it("maps all 34 global Sun & Sea destinations to valid IANA timezones", () => {
    const slugs = Object.keys(DESTINATION_TIMEZONES);
    expect(slugs.length).toBeGreaterThanOrEqual(34);

    for (const [slug, tz] of Object.entries(DESTINATION_TIMEZONES)) {
      expect(() => new Intl.DateTimeFormat("en-US", { timeZone: tz })).not.toThrow();
      expect(resolveRecipientTimeZone({ islandSlug: slug })).toBe(tz);
    }
  });

  it("blocks Caribbean and Latin America at 07:31 UTC (2:31 AM / 3:31 AM local) while allowing Mediterranean (9:31 AM / 10:31 AM local)", () => {
    // 2026-10-16T07:31:00Z:
    // - Cancun / Cartagena / Jamaica (UTC-5): 02:31 -> BLOCKED
    // - Grenada / Barbados / Dominican Republic (UTC-4): 03:31 -> BLOCKED
    // - Los Cabos (UTC-7): 00:31 -> BLOCKED
    // - Mallorca / Ibiza / Amalfi / Hvar-Split (CEST UTC+2): 09:31 -> ALLOWED
    // - Santorini / Mykonos / Crete (EEST UTC+3): 10:31 -> ALLOWED
    const instant = new Date("2026-10-16T07:31:00Z");

    const cancun = checkRecipientSendingWindow({ islandSlug: "cancun" }, instant);
    expect(cancun.allowed).toBe(false);
    expect(cancun.timeZone).toBe("America/Cancun");
    expect(cancun.localTimeFormatted).toBe("02:31");

    const cartagena = checkRecipientSendingWindow({ islandSlug: "cartagena" }, instant);
    expect(cartagena.allowed).toBe(false);
    expect(cartagena.timeZone).toBe("America/Bogota");
    expect(cartagena.localTimeFormatted).toBe("02:31");

    const grenada = checkRecipientSendingWindow({ islandSlug: "grenada" }, instant);
    expect(grenada.allowed).toBe(false);
    expect(grenada.timeZone).toBe("America/Grenada");
    expect(grenada.localTimeFormatted).toBe("03:31");

    const cabos = checkRecipientSendingWindow({ islandSlug: "los-cabos" }, instant);
    expect(cabos.allowed).toBe(false);
    expect(cabos.timeZone).toBe("America/Mazatlan");

    const mallorca = checkRecipientSendingWindow({ islandSlug: "mallorca" }, instant);
    expect(mallorca.allowed).toBe(true);
    expect(mallorca.timeZone).toBe("Europe/Madrid");
    expect(mallorca.localTimeFormatted).toBe("09:31");

    const santorini = checkRecipientSendingWindow({ islandSlug: "santorini" }, instant);
    expect(santorini.allowed).toBe(true);
    expect(santorini.timeZone).toBe("Europe/Athens");
    expect(santorini.localTimeFormatted).toBe("10:31");
  });

  it("enforces exact 08:30 start and 19:30 end boundaries in local time", () => {
    // America/Barbados is UTC-4 year-round:
    // 08:29 AST = 12:29 UTC -> blocked
    // 08:30 AST = 12:30 UTC -> allowed
    // 19:29 AST = 23:29 UTC -> allowed
    // 19:30 AST = 23:30 UTC -> blocked
    expect(
      checkRecipientSendingWindow({ islandSlug: "barbados" }, new Date("2026-10-16T12:29:00Z")).allowed
    ).toBe(false);
    expect(
      checkRecipientSendingWindow({ islandSlug: "barbados" }, new Date("2026-10-16T12:30:00Z")).allowed
    ).toBe(true);
    expect(
      checkRecipientSendingWindow({ islandSlug: "barbados" }, new Date("2026-10-16T23:29:00Z")).allowed
    ).toBe(true);
    expect(
      checkRecipientSendingWindow({ islandSlug: "barbados" }, new Date("2026-10-16T23:30:00Z")).allowed
    ).toBe(false);
  });

  it("falls back to country and email ccTLD when islandSlug is not provided", () => {
    expect(resolveRecipientTimeZone({ country: "Greece" })).toBe("Europe/Athens");
    expect(resolveRecipientTimeZone({ country: "CR" })).toBe("America/Costa_Rica");
    expect(resolveRecipientTimeZone({ email: "info@seazetheday.gr" })).toBe("Europe/Athens");
    expect(resolveRecipientTimeZone({ email: "info@travelwithus.hr" })).toBe("Europe/Zagreb");
    expect(resolveRecipientTimeZone({ email: "caboskytours@yahoo.com.mx" })).toBe("America/Mexico_City");
  });
});
