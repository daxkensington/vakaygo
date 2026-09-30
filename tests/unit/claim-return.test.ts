import { expect, it } from "vitest";
import { claimIdFromPath, claimListingPath, claimStartHref, verificationUrl } from "@/lib/claim-return";

const id = "20000000-0000-4000-8000-000000000009";

it("accepts only a listing claim path", () => {
  expect(claimListingPath(id)).toBe(`/operator/claim/${id}`);
  expect(claimListingPath("not-a-listing")).toBeNull();
  expect(claimListingPath("https://evil.example")).toBeNull();
  expect(claimIdFromPath(`/operator/claim/${id}`)).toBe(id);
  expect(claimIdFromPath("/operator/claim/../admin")).toBeNull();
  expect(claimIdFromPath("//evil.example")).toBeNull();
});

it("sends signed-in people to the claim and new accounts through operator signup", () => {
  expect(claimStartHref(id, false)).toBe(`/auth/signup?role=operator&claim=${id}`);
  expect(claimStartHref(id, true)).toBe(`/operator/claim/${id}`);
});

it("puts a valid claim on the verification link and drops anything else", () => {
  const token = "a".repeat(64);
  expect(verificationUrl(token, id)).toBe(`https://vakaygo.com/api/auth/verify-email/confirm?token=${token}&claim=${id}`);
  expect(verificationUrl(token, "https://evil.example")).toBe(`https://vakaygo.com/api/auth/verify-email/confirm?token=${token}`);
});
