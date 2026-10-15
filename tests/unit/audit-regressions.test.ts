import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { generateGoogleCalendarUrl, generateICSFile, escapeICSText } from "@/lib/calendar";
import { validatePayoutProfileInput, maskAccountNumber } from "@/server/payout-profiles";
import {
  extractBusinessEmailsFromHtml,
  isValidBusinessEmail,
  createOutreachUnsubscribeToken,
  verifyOutreachUnsubscribeToken,
} from "@/server/outreach-automation";

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

describe("Caribbean Multi-Rail Payout & Form W-8BEN Validation", () => {
  it("validates PayPal, Wise, and Bank Wire payout rails and W-8BEN certification", () => {
    expect(maskAccountNumber("GD1234567890")).toBe("•••• 7890");

    const validWise = validatePayoutProfileInput({
      listingId: "11111111-2222-3333-4444-555555555555",
      payoutMethod: "wise",
      payoutCurrency: "USD",
      wiseRecipientEmail: "payouts@spiceisle.gd",
      w8benCertified: true,
      w8benBeneficialOwner: "Spice Isle Charters Ltd",
      w8benCountry: "GD",
      w8benSignedName: "Kerry Joseph",
    });
    expect(validWise.payoutMethod).toBe("wise");
    expect(validWise.w8benCountry).toBe("GD");

    expect(() =>
      validatePayoutProfileInput({
        listingId: "11111111-2222-3333-4444-555555555555",
        payoutMethod: "paypal",
        payoutCurrency: "USD",
        paypalEmail: "payouts@spiceisle.gd",
        w8benCertified: false,
        w8benBeneficialOwner: "Spice Isle Charters Ltd",
        w8benCountry: "GD",
        w8benSignedName: "Kerry Joseph",
      })
    ).toThrow(/W-8BEN/);

    expect(() =>
      validatePayoutProfileInput({
        listingId: "11111111-2222-3333-4444-555555555555",
        payoutMethod: "bank_wire",
        payoutCurrency: "USD",
        bankName: "Republic Bank Grenada",
        bankCountry: "GD",
        bankAccountHolder: "Spice Isle Charters Ltd",
        bankAccountNumber: "12345678",
        bankSwiftBic: "BAD",
        w8benCertified: true,
        w8benBeneficialOwner: "Spice Isle Charters Ltd",
        w8benCountry: "GD",
        w8benSignedName: "Kerry Joseph",
      })
    ).toThrow(/SWIFT/);
  });
});

describe("Automated Business Outreach & Website Email Enrichment", () => {
  it("extracts and ranks official business emails from HTML while rejecting junk/tracker addresses", () => {
    const html = `
      <html>
        <body>
          <img src="banner@2x.png" />
          <a href="mailto:noreply@wixpress.com">Ignore</a>
          <p>Contact us at support@example.com or 605a7baede844d278b89dc95ae0a9123@sentry.io</p>
          <p>General: hello@gmail.com</p>
          <a href="mailto:bookings@jcocharters.com?subject=Charter">Book Now</a>
        </body>
      </html>
    `;

    const emails = extractBusinessEmailsFromHtml(html, "https://jcocharters.com");
    expect(emails[0]).toBe("bookings@jcocharters.com");
    expect(emails).toContain("hello@gmail.com");
    expect(emails).not.toContain("noreply@wixpress.com");
    expect(emails).not.toContain("support@example.com");
    expect(isValidBusinessEmail("admin@caicosrentals.com")).toBe(true);
    expect(isValidBusinessEmail("visitor@example.invalid")).toBe(false);
    expect(isValidBusinessEmail("user@domain.com")).toBe(false);

    const listingId = "20000000-0000-4000-8000-000000000009";
    const token = createOutreachUnsubscribeToken(listingId);
    expect(verifyOutreachUnsubscribeToken(listingId, token)).toBe(true);
    expect(verifyOutreachUnsubscribeToken(listingId, "0".repeat(64))).toBe(false);
  });
});

