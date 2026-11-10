import { describe, expect, it } from "vitest";
import { isValidBusinessEmail } from "@/lib/outreach-email-validation";
import { isValidBusinessEmail as reexported } from "@/server/outreach-automation";
import { parseCampaignAdminAction } from "@/lib/outreach-campaign-admin";

describe("scraped business address screen", () => {
  it.each([
    "info@hotel-example.com", "bookings@villa.co.uk", "reservas@tours.com.do", "hello@dive.shop", "owner+tours@gmail.com",
    "contact@island.community", "desk@harbour.network", "sales@farm.organic", "team@agency.company", "Owner@business.example",
  ])("accepts %s", address => {
    expect(isValidBusinessEmail(address)).toBe(true);
  });

  it.each([
    ["info@hotel.pbz", "ROT13 of .com decoded as-is"],
    ["info@hotel.arg", "ROT13 of .net"],
    ["info@hotel.vasb", "ROT13 of .info"],
    ["info@hotel.comthe", "text glued to .com"],
    ["info@hotel.netcall", "text glued to .net"],
    ["info@hotel.orgfollow", "text glued to .org"],
    ["sales@resort.mail", "not a delegated top-level domain"],
    ["front@desk.local", "private suffix"],
    ["front@desk.internal", "private suffix"],
    ["name@site.html", "page extension"],
    ["name@site.php", "page extension"],
    ["logo@2x.png", "image file"],
    ["u003einfo@hotel.com", "escaped > glued to the address"],
    ["%20info@hotel.com", "URL escape left in the address"],
    [".info@hotel.com", "leading dot"],
    ["info.@hotel.com", "trailing dot"],
    ["in..fo@hotel.com", "double dot"],
    ["info@hotel..com", "empty domain label"],
    ["info@-hotel.com", "label starts with a hyphen"],
    ["info@hotel-.com", "label ends with a hyphen"],
    [`${"a".repeat(65)}@hotel.com`, "local part over 64 characters"],
    ["noreply@hotel.com", "automated mailbox"],
    ["info@example.com", "placeholder domain"],
    ["0123456789abcdef0123456789abcdef@o1.ingest.io", "hash local part"],
    ["not an address", "not an address"],
  ])("rejects %s (%s)", address => {
    expect(isValidBusinessEmail(address)).toBe(false);
  });

  it.each([null, undefined, 42, {}, ""])("rejects the non-address %j", value => {
    expect(isValidBusinessEmail(value)).toBe(false);
  });

  it("is the same function the sender and the extractor use", () => {
    expect(reexported).toBe(isValidBusinessEmail);
  });

  it("refuses to record permission for an address that fails the screen", () => {
    const grant = { action: "grant_consent", listingId: "64000000-0000-4000-8000-000000000001", provider: "sendcorex",
      permissionKind: "business_outreach_permission", recipientCountry: "GD", policyReference: "Dated provider and country policy review",
      evidence: "Address published on the business website contact page." };
    expect(parseCampaignAdminAction({ ...grant, recipientEmail: "info@hotel.pbz", expectedListingEmail: "info@hotel.pbz" })).toBeNull();
    expect(parseCampaignAdminAction({ ...grant, recipientEmail: "info@hotel.comthe", expectedListingEmail: "info@hotel.comthe" })).toBeNull();
    expect(parseCampaignAdminAction({ ...grant, recipientEmail: "Info@Hotel-Example.com", expectedListingEmail: "info@hotel-example.com" }))
      .toMatchObject({ recipientEmail: "info@hotel-example.com" });
  });

  it("parses a delivery review only with a version and a real note", () => {
    expect(parseCampaignAdminAction({ action: "acknowledge_delivery_review", expectedVersion: 4, note: "  Checked the three bounced addresses: dead domains.  " }))
      .toEqual({ action: "acknowledge_delivery_review", expectedVersion: 4, note: "Checked the three bounced addresses: dead domains." });
    expect(parseCampaignAdminAction({ action: "acknowledge_delivery_review", expectedVersion: 4, note: "ok" })).toBeNull();
    expect(parseCampaignAdminAction({ action: "acknowledge_delivery_review", note: "Checked the three bounced addresses" })).toBeNull();
    expect(parseCampaignAdminAction({ action: "acknowledge_delivery_review", expectedVersion: 4, note: "Checked the three bounced addresses", enable: true })).toBeNull();
  });
});
