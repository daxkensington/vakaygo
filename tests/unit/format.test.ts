import { describe, it, expect } from "vitest";
import {
  formatDate,
  formatNumber,
  formatCurrency,
  formatRelativeTime,
} from "@/lib/format";

describe("formatDate", () => {
  it("returns medium-style date in en-US", () => {
    const out = formatDate(new Date("2026-04-08T12:00:00Z"), "en-US");
    expect(out).toMatch(/Apr 8, 2026/);
  });

  it("returns empty string for invalid input", () => {
    expect(formatDate("not-a-date", "en-US")).toBe("");
  });
});

describe("formatNumber", () => {
  it("groups thousands in en-US", () => {
    expect(formatNumber(1234567, "en-US")).toBe("1,234,567");
  });
  it("uses dots in de-DE", () => {
    expect(formatNumber(1234567, "de-DE")).toBe("1.234.567");
  });
});

describe("formatCurrency", () => {
  it("formats USD with dollar sign", () => {
    expect(formatCurrency(99, "USD", "en-US")).toMatch(/\$99/);
  });
  it("formats EUR in fr-FR with comma decimal", () => {
    expect(formatCurrency(99.5, "EUR", "fr-FR")).toMatch(/99,5/);
  });
});

describe("formatRelativeTime", () => {
  it("returns past times with 'ago'", () => {
    const past = new Date(Date.now() - 5 * 60 * 1000);
    const out = formatRelativeTime(past, "en-US");
    expect(out).toMatch(/5 minutes ago|ago/);
  });
  it("returns empty for invalid input", () => {
    expect(formatRelativeTime("invalid", "en-US")).toBe("");
  });
});
