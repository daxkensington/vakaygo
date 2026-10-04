import { expect, it } from "vitest";
import { claimIdFromPath, claimListingPath, claimStartHref, magicLinkUrl, signInHref, verificationUrl } from "@/lib/claim-return";

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

it("puts a valid claim on a sign-in link and rejects a bad token", () => {
  const token = "b".repeat(64);
  expect(magicLinkUrl(token, id)).toBe(`https://vakaygo.com/auth/continue?token=${token}&claim=${id}`);
  expect(magicLinkUrl(token, "https://evil.example")).toBe(`https://vakaygo.com/auth/continue?token=${token}`);
  expect(magicLinkUrl("not-a-token", id)).toBeNull();
  expect(signInHref(id, { method: "email" })).toBe(`/auth/signin?method=email&next=/operator/claim/${id}`);
  expect(signInHref("https://evil.example", { method: "email" })).toBe("/auth/signin?method=email");
  expect(signInHref(id, { error: "use_password" })).toBe(`/auth/signin?error=use_password&next=/operator/claim/${id}`);
  expect(signInHref(id, { error: "https://evil.example" })).toBe(`/auth/signin?next=/operator/claim/${id}`);
});
