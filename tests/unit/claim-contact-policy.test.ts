// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  INSTANT_CLAIM_MESSAGES, automaticClaimChannels, instantClaimDecision, isSharedHostDomain,
  type ContactExclusivity,
} from "@/lib/claim-contact-policy";

const alone: ContactExclusivity = { phoneSharedBy: 0, emailSharedBy: 0, domainSharedBy: 0, priorDomainClaims: 0 };

describe("instantClaimDecision", () => {
  it("accepts the listing's own published address when no other listing publishes it", () => {
    expect(instantClaimDecision({ exactEmailMatch: true, domainMatch: false, claimantDomain: null, exclusivity: alone })).toEqual({ eligible: true, reason: null });
    // Free-mail addresses have no domain to match, but the exact address still proves the mailbox.
    expect(instantClaimDecision({ exactEmailMatch: true, domainMatch: false, claimantDomain: null, exclusivity: { ...alone, domainSharedBy: 9 } }).eligible).toBe(true);
  });

  it("refuses an address that several listings publish", () => {
    expect(instantClaimDecision({ exactEmailMatch: true, domainMatch: true, claimantDomain: "toursgrenada.example", exclusivity: { ...alone, emailSharedBy: 8 } }))
      .toEqual({ eligible: false, reason: "shared_email" });
  });

  it("accepts a mailbox on the business's own domain only when the domain belongs to this listing alone", () => {
    const base = { exactEmailMatch: false, domainMatch: true, claimantDomain: "divegrenada.example" };
    expect(instantClaimDecision({ ...base, exclusivity: alone })).toEqual({ eligible: true, reason: null });
    // A chain or aggregator: one mailbox on the domain would otherwise claim every property on it.
    expect(instantClaimDecision({ ...base, exclusivity: { ...alone, domainSharedBy: 15 } })).toEqual({ eligible: false, reason: "shared_domain" });
    expect(instantClaimDecision({ ...base, exclusivity: { ...alone, domainSharedBy: 1 } }).eligible).toBe(false);
    // One account, one listing by domain.
    expect(instantClaimDecision({ ...base, exclusivity: { ...alone, priorDomainClaims: 1 } })).toEqual({ eligible: false, reason: "already_used" });
  });

  it.each(["marriott.com", "sandals.com", "booking.com", "fresha.com", "mybusiness.wixsite.com", "resort.hilton.com", "MARRIOTT.COM."])(
    "never treats a mailbox at %s as ownership of one listing, however few listings point at it", (domain) => {
      expect(isSharedHostDomain(domain)).toBe(true);
      expect(instantClaimDecision({ exactEmailMatch: false, domainMatch: true, claimantDomain: domain, exclusivity: alone })).toEqual({ eligible: false, reason: "shared_host" });
    });

  it("does not mistake a lookalike for a shared host", () => {
    for (const domain of ["notmarriott.com", "marriott.com.example", "sandals-grenada.example", "", null, undefined]) expect(isSharedHostDomain(domain)).toBe(false);
  });

  it("refuses when nothing matches, and has a message for every refusal", () => {
    expect(instantClaimDecision({ exactEmailMatch: false, domainMatch: false, claimantDomain: "other.example", exclusivity: alone })).toEqual({ eligible: false, reason: "no_match" });
    expect(instantClaimDecision({ exactEmailMatch: false, domainMatch: true, claimantDomain: null, exclusivity: alone }).reason).toBe("no_match");
    for (const reason of ["no_match", "shared_email", "shared_host", "shared_domain", "already_used"] as const) expect(INSTANT_CLAIM_MESSAGES[reason].length).toBeGreaterThan(20);
  });
});

describe("automaticClaimChannels", () => {
  it("offers every channel whose contact belongs to this listing alone", () => {
    expect(automaticClaimChannels({ phoneAvailable: true, emailAvailable: true, exclusivity: alone })).toEqual({ channels: ["sms", "call", "email"], sharedContact: false });
    expect(automaticClaimChannels({ phoneAvailable: false, emailAvailable: true, exclusivity: alone })).toEqual({ channels: ["email"], sharedContact: false });
  });

  it("drops a phone that several listings share: whoever answers it could claim them all", () => {
    // Nine unrelated Grenada operators were filed under one aggregator's number.
    expect(automaticClaimChannels({ phoneAvailable: true, emailAvailable: true, exclusivity: { phoneSharedBy: 8, emailSharedBy: 0 } }))
      .toEqual({ channels: ["email"], sharedContact: true });
  });

  it("leaves no automatic channel when every contact is shared, so the claim goes to team review", () => {
    expect(automaticClaimChannels({ phoneAvailable: true, emailAvailable: true, exclusivity: { phoneSharedBy: 1, emailSharedBy: 3 } }))
      .toEqual({ channels: [], sharedContact: true });
  });

  it("does not call a missing contact shared", () => {
    expect(automaticClaimChannels({ phoneAvailable: false, emailAvailable: false, exclusivity: { phoneSharedBy: 4, emailSharedBy: 4 } }))
      .toEqual({ channels: [], sharedContact: false });
  });
});
