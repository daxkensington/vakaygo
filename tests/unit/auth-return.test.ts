import { describe, expect, it } from "vitest";
import { safeAuthNext } from "@/lib/auth-return";
import { magicLinkUrl, signInHref, verificationUrl } from "@/lib/claim-return";

const listing = "/barbados/synthetic-cafe";
const claim = "20000000-0000-4000-8000-000000000009";

describe("validated auth continuation", () => {
  it("retains local listings, search queries and fragments", () => {
    for (const value of [listing, "/", "/operator/onboarding/123", "/explore?island=barbados&q=beach%20cafe#results", "/explore?q=100%25&sort=rating#near%20me"]) {
      expect(safeAuthNext(value)).toBe(value);
    }
    expect(safeAuthNext("/explore?q=beach cafe#near me")).toBe("/explore?q=beach%20cafe#near%20me");
  });

  it.each([
    "https://evil.example", "https://vakaygo.com/barbados/cafe", "//evil.example", "///evil.example", "javascript:alert(1)",
    "/\\evil.example", "/barbados\\cafe", "/%2f%2fevil.example", "/%252f%252fevil.example", "/%5cevil.example", "/%255cevil.example",
    "/barbados/../cafe", "/barbados/./cafe", "/barbados/%2e%2e/cafe", "/barbados//cafe", "/api/auth/google?next=//evil.example",
    "/auth/continue?next=//evil.example", "/API/auth/google", "/cafe\n", "/cafe?x=%0d%0aevil", "/cafe?x=%5cevil", "/cafe?x=%zz", "/" + "x".repeat(2048),
    null, undefined, {}, 123,
  ])("drops unsafe or malformed return value %j", value => {
    expect(safeAuthNext(value)).toBeNull();
  });

  it("carries local continuation across email links and recovery", () => {
    const token = "a".repeat(64);
    expect(new URL(magicLinkUrl(token, null, listing)!).searchParams.get("next")).toBe(listing);
    expect(new URL(verificationUrl(token, null, listing)).searchParams.get("next")).toBe(listing);
    expect(signInHref(null, { method: "email", next: listing })).toBe(`/auth/signin?method=email&next=${encodeURIComponent(listing)}`);
    expect(magicLinkUrl(token, null, "//evil.example")).not.toContain("next=");
  });

  it("keeps an explicit valid claim ahead of a general return destination", () => {
    const token = "b".repeat(64);
    const magic = new URL(magicLinkUrl(token, claim, listing)!);
    const verification = new URL(verificationUrl(token, claim, listing));
    for (const url of [magic, verification]) {
      expect(url.searchParams.get("claim")).toBe(claim);
      expect(url.searchParams.has("next")).toBe(false);
    }
    expect(signInHref(claim, { next: listing })).toBe(`/auth/signin?next=/operator/claim/${claim}`);
  });
});
