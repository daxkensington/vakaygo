import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { generateGoogleCalendarUrl, generateICSFile, escapeICSText } from "@/lib/calendar";

describe("Island SEO canonicals and cross-links match next.config.ts rewrites", () => {
  const root = process.cwd();
  const files = [
    {
      path: "app/(marketing)/best-hotels/[island]/page.tsx",
      expectedCanonical: "https://vakaygo.com/best-hotels-${slug}",
      forbiddenSlash: "https://vakaygo.com/best-hotels/${slug}",
    },
    {
      path: "app/(marketing)/best-restaurants/[island]/page.tsx",
      expectedCanonical: "https://vakaygo.com/best-restaurants-${slug}",
      forbiddenSlash: "https://vakaygo.com/best-restaurants/${slug}",
    },
    {
      path: "app/(marketing)/things-to-do-in/[island]/page.tsx",
      expectedCanonical: "https://vakaygo.com/things-to-do-in-${slug}",
      forbiddenSlash: "https://vakaygo.com/things-to-do-in/${slug}",
    },
  ];

  for (const item of files) {
    it(`${item.path} uses hyphenated canonicals and links (not 308-redirected slash paths)`, () => {
      const src = fs.readFileSync(path.join(root, item.path), "utf8");
      expect(src).toContain(item.expectedCanonical);
      expect(src).not.toContain(item.forbiddenSlash);
      expect(src).not.toContain("href={`/best-hotels/${slug}`}");
      expect(src).not.toContain("href={`/best-restaurants/${slug}`}");
      expect(src).not.toContain("href={`/things-to-do-in/${slug}`}");
    });
  }
});

describe("Wall-clock calendar exports (no UTC 'Z' shift)", () => {
  it("formats timed bookings as floating local wall-clock timestamps without trailing Z", () => {
    const gcalUrl = generateGoogleCalendarUrl({
      title: "Lukka Kairi Waterfront Bar & Grill",
      startDate: "2026-11-17T12:00:00.000Z",
      endDate: "2026-11-17T14:00:00.000Z",
      location: "Nassau, Bahamas",
    });
    const parsed = new URL(gcalUrl);
    expect(parsed.searchParams.get("dates")).toBe("20261117T120000/20261117T140000");

    const ics = generateICSFile({
      title: "Lukka Kairi, Nassau; Table #4",
      startDate: "2026-11-17T12:00:00.000Z",
      endDate: "2026-11-17T14:00:00.000Z",
      description: "Booking #VG-123\nGuests: 2",
      location: "Woodes Rodgers Walk, Nassau",
    });
    expect(ics).toContain("DTSTART:20261117T120000");
    expect(ics).toContain("DTEND:20261117T140000");
    expect(ics).not.toContain("20261117T120000Z");
    expect(ics).toContain("SUMMARY:Lukka Kairi\\, Nassau\\; Table #4");
    expect(ics).toContain("DESCRIPTION:Booking #VG-123\\nGuests: 2");
  });

  it("formats date-only bookings as VALUE=DATE all-day events with exclusive end date", () => {
    const ics = generateICSFile({
      title: "Spice Island Stay",
      startDate: "2026-12-10",
      endDate: "2026-12-12",
    });
    expect(ics).toContain("DTSTART;VALUE=DATE:20261210");
    expect(ics).toContain("DTEND;VALUE=DATE:20261213");
  });

  it("escapes special characters in ICS text fields", () => {
    expect(escapeICSText("A, B; C\\D\nE")).toBe("A\\, B\\; C\\\\D\\nE");
  });
});
