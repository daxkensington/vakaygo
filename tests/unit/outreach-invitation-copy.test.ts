// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildInvitationMessage, invitationLanguage, tidyBusinessName } from "@/lib/outreach-invitation-copy";
import { parseCampaignAdminAction } from "@/lib/outreach-campaign-admin";

const base = {
  title: "Island Divers", island: "Grenada", islandSlug: "grenada",
  listingUrl: "https://vakaygo.com/grenada/island-divers",
  claimUrl: "https://vakaygo.com/api/outreach/claim?context=abc",
  unsubscribeUrl: "https://vakaygo.com/api/outreach/unsubscribe?context=def",
  operator: "Avmere", postalAddress: "240 Richmond St W, Toronto, ON M5V 1V6, Canada", solicitationRequired: false,
};

describe("invitation language", () => {
  it("picks Spanish and French by destination country, English otherwise", () => {
    expect(invitationLanguage("dominican-republic")).toBe("es");
    expect(invitationLanguage("cancun-riviera-maya")).toBe("es");
    expect(invitationLanguage("puerto-rico")).toBe("es");
    expect(invitationLanguage("martinique")).toBe("fr");
    expect(invitationLanguage("guadeloupe")).toBe("fr");
    expect(invitationLanguage("ambergris-caye")).toBe("en"); // Belize is English-speaking
    expect(invitationLanguage("grenada")).toBe("en");
    expect(invitationLanguage("unknown-place")).toBe("en");
  });
});

describe("business names in invitations", () => {
  it("tidies spacing and softens all-capitals names, leaving mixed case alone", () => {
    expect(tidyBusinessName("PARACHUTE ASCENSIONNEL ( JET FORCE )")).toBe("Parachute Ascensionnel (Jet Force)");
    expect(tidyBusinessName("  Island   Divers ,  Grenada ")).toBe("Island Divers, Grenada");
    expect(tidyBusinessName("McDonald's Tours")).toBe("McDonald's Tours");
    expect(tidyBusinessName("BBQ")).toBe("BBQ");
  });
});

describe("invitation copy", () => {
  it("keeps every legal line in every language", () => {
    for (const islandSlug of ["grenada", "dominican-republic", "martinique"]) {
      const message = buildInvitationMessage({ ...base, islandSlug });
      for (const part of [message.text, message.html]) {
        expect(part).toContain(base.claimUrl.replace(/&/g, part === message.html ? "&amp;" : "&"));
        expect(part).toContain(base.unsubscribeUrl);
        expect(part).toContain("Avmere · VakayGo");
        expect(part).toContain("240 Richmond St W");
        expect(part).toContain("support@vakaygo.com");
      }
    }
  });
  it("never promises bookings or payments, in any language", () => {
    expect(buildInvitationMessage(base).text).toContain("We are not confirming that booking or payment is enabled for your listing.");
    expect(buildInvitationMessage({ ...base, islandSlug: "dominican-republic" }).text).toContain("No confirmamos que las reservas o los pagos estén activados");
    expect(buildInvitationMessage({ ...base, islandSlug: "martinique" }).text).toContain("Nous ne confirmons pas que la réservation ou le paiement est activé");
  });
  it("gives the US solicitation notice in English as well when the message is in Spanish", () => {
    const pr = buildInvitationMessage({ ...base, islandSlug: "puerto-rico", island: "Puerto Rico", solicitationRequired: true });
    expect(pr.language).toBe("es");
    expect(pr.text).toContain("Este mensaje es una comunicación comercial de VakayGo, operado por Avmere.");
    expect(pr.text).toContain("This message is a business solicitation from VakayGo, operated by Avmere.");
    expect(buildInvitationMessage(base).text).not.toContain("solicitation");
  });
  it("uses the tidied name in the subject and escapes it in the HTML", () => {
    const message = buildInvitationMessage({ ...base, title: "SUN & SEA <TOURS>" });
    expect(message.subject).toBe("Sun & Sea <Tours> is listed on VakayGo (Grenada): free to claim");
    expect(message.html).toContain("Sun &amp; Sea &lt;Tours&gt;");
    expect(message.html).not.toContain("<Tours>");
  });
});

describe("campaign admin actions", () => {
  const attemptId = "71000000-0000-4000-8000-000000000001";
  it("reconciles an unknown send only with a note, and a sent one only with a provider id", () => {
    expect(parseCampaignAdminAction({ action: "reconcile_attempt", attemptId, outcome: "not_sent", note: "Not in the Sendcorex log for that hour." })).not.toBeNull();
    expect(parseCampaignAdminAction({ action: "reconcile_attempt", attemptId, outcome: "sent", providerEmailId: "msg_123", note: "Found in the Sendcorex log at 14:02." })).not.toBeNull();
    expect(parseCampaignAdminAction({ action: "reconcile_attempt", attemptId, outcome: "sent", note: "Found in the Sendcorex log at 14:02." })).toBeNull();
    expect(parseCampaignAdminAction({ action: "reconcile_attempt", attemptId, outcome: "not_sent", providerEmailId: "msg_123", note: "Not in the Sendcorex log for that hour." })).toBeNull();
    expect(parseCampaignAdminAction({ action: "reconcile_attempt", attemptId, outcome: "not_sent", note: "short" })).toBeNull();
    expect(parseCampaignAdminAction({ action: "reconcile_attempt", attemptId, outcome: "sent", providerEmailId: "bad id!", note: "Found in the Sendcorex log at 14:02." })).toBeNull();
  });
  it("suppresses any address an opt-out arrived for, lower-cased", () => {
    expect(parseCampaignAdminAction({ action: "suppress_address", recipientEmail: " Owner@Gmail.com ", reason: "Replied asking to stop" }))
      .toMatchObject({ recipientEmail: "owner@gmail.com" });
    expect(parseCampaignAdminAction({ action: "suppress_address", recipientEmail: "not an address", reason: "Replied asking to stop" })).toBeNull();
  });
});
