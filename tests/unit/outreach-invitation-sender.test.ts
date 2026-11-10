// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), neon: vi.fn(), deliver: vi.fn(), fetch: vi.fn() }));
vi.mock("@neondatabase/serverless", () => ({ neon: mocks.neon }));
vi.mock("@/server/outreach-campaign-send", () => ({ deliverClaimInvitation: mocks.deliver }));
vi.mock("@/server/outreach-attribution", () => ({
  claimInvitationUrl: (attemptId: string, listingId: string) => `https://vakaygo.com/campaign/claim/${attemptId}?listing=${listingId}`,
  unsubscribeInvitationUrl: (attemptId: string) => `https://vakaygo.com/campaign/unsubscribe/${attemptId}`,
}));

import { sendBusinessInterestOutreachEmail } from "@/server/outreach-automation";

const listingId = "11111111-1111-4111-8111-111111111111";
const attemptId = "22222222-2222-4222-8222-222222222222";
const listing = () => ({ id: listingId, title: 'Example & <Charters>', listingSlug: "example-charters", listingStatus: "active", email: " Owner@business.example ",
  islandSlug: "grenada", islandName: "Grenada", islandCountry: "Grenada", islandActive: true,
  outreachStatus: "new", contactedAt: null, claimVerified: false,
  permissions: [{ kind: "business_outreach_permission", country: "GD" }], addressAlreadyContacted: false });
const legacyBypasses = { force: true, bypassQuietHours: true, triggeredBy: "admin" as const, markStatusContacted: true };

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("DATABASE_URL", "postgresql://fixture:fixture@localhost:5432/fixture");
  vi.stubEnv("OUTREACH_SENDER_POSTAL_ADDRESS", "Fixture Company, 123 Example Road, Test City");
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.neon.mockReturnValue({ query: mocks.query });
  mocks.query.mockResolvedValue([listing()]);
  mocks.deliver.mockResolvedValue({ sent: false, reason: "campaign_paused" });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("claim invitation sender", () => {
  it("rejects invalid listing IDs without a database or delivery call", async () => {
    expect(await sendBusinessInterestOutreachEmail("not-an-id", legacyBypasses)).toEqual({ sent: false, reason: "invalid_listing" });
    expect(mocks.neon).not.toHaveBeenCalled();
    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  it.each([
    [{ listingStatus: "inactive" }, "listing_inactive"],
    [{ islandActive: false }, "listing_inactive"],
    [{ claimVerified: true }, "listing_already_claimed"],
    [{ outreachStatus: "do_not_contact" }, "suppressed"],
    [{ contactedAt: "2026-10-19T10:00:00Z" }, "already_contacted"],
  ])("never lets legacy force options bypass listing state %j", async (patch, reason) => {
    mocks.query.mockResolvedValue([{ ...listing(), ...patch }]);
    expect(await sendBusinessInterestOutreachEmail(listingId, legacyBypasses)).toEqual({ sent: false, reason });
    expect(mocks.deliver).not.toHaveBeenCalled();
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it("does not crawl or replace contact data when no usable email is on file", async () => {
    mocks.query.mockResolvedValue([{ ...listing(), email: null, website: "https://business.example" }]);
    expect(await sendBusinessInterestOutreachEmail(listingId, legacyBypasses)).toEqual({ sent: false, reason: "no_email_on_file" });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.deliver).not.toHaveBeenCalled();
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.query.mock.calls[0][0]).toMatch(/^SELECT /);
  });

  it("refuses a different admin recipient rather than silently sending to either address", async () => {
    expect(await sendBusinessInterestOutreachEmail(listingId, { ...legacyBypasses, recipientOverride: "replacement@business.example" }))
      .toEqual({ sent: false, reason: "recipient_override_not_supported" });
    expect(mocks.deliver).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it.each(["campaign_paused", "daily_cap", "hourly_cap", "outside_business_hours", "recipient_permission_missing", "suppressed"])(
    "preserves the delivery helper's %s refusal despite force/bypass options", async reason => {
      mocks.deliver.mockResolvedValue({ sent: false, reason });
      expect(await sendBusinessInterestOutreachEmail(listingId, legacyBypasses)).toEqual({ sent: false, reason });
      const input = mocks.deliver.mock.calls[0][0];
      expect(input).toMatchObject({ listingId, recipient: "owner@business.example", islandSlug: "grenada", islandCountry: "Grenada" });
      expect(Object.keys(input).sort()).toEqual(["buildMessage", "islandCountry", "islandSlug", "listingId", "recipient"]);
      expect(JSON.stringify(input)).not.toContain("replacement@");
      expect(mocks.query).toHaveBeenCalledTimes(1);
      expect(mocks.fetch).not.toHaveBeenCalled();
    }
  );

  it("builds truthful platform-only copy with tracked claim/opt-out links and a postal footer", async () => {
    let message: { subject: string; text: string; html: string } | undefined;
    mocks.deliver.mockImplementation(async input => {
      message = input.buildMessage(attemptId);
      return { sent: true, email: input.recipient, attemptId };
    });
    expect(await sendBusinessInterestOutreachEmail(listingId, legacyBypasses)).toEqual({ sent: true, email: "owner@business.example", attemptId });
    expect(message?.subject).toBe("Example & <Charters> is listed on VakayGo (Grenada): free to claim");
    expect(message?.subject).not.toMatch(/your .*listing|your account/i);
    expect(message?.text).toContain("VakayGo is a travel marketplace");
    expect(message?.text).toContain("https://vakaygo.com/grenada/example-charters");
    expect(message?.html).toContain('href="https://vakaygo.com/grenada/example-charters"');
    // Grenada is not under US law: no solicitation line is added there.
    expect(`${message?.text} ${message?.html}`).not.toMatch(/solicitation/i);
    expect(message?.text).toContain(`https://vakaygo.com/campaign/claim/${attemptId}?listing=${listingId}`);
    expect(message?.text).toContain(`https://vakaygo.com/campaign/unsubscribe/${attemptId}`);
    expect(message?.text).toContain("An inquiry is not a reservation");
    expect(message?.text).toContain("bookings and checkout must take place through VakayGo");
    expect(message?.text).toContain("separate supplier onboarding and activation");
    expect(message?.text).toContain("not confirming that booking or payment is enabled");
    expect(message?.text).toContain("Fixture Company, 123 Example Road, Test City");
    expect(message?.html).toContain("Example &amp; &lt;Charters&gt;");
    expect(message?.html).not.toContain("<Charters>");
    expect(`${message?.text} ${message?.html}`).not.toMatch(/85%|90%|Wise|PayPal|60 seconds|0% guest|commission|payout|traveler has expressed|verified travelers/i);
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it.each(["puerto-rico", "us-virgin-islands"])("identifies the message as a solicitation for %s recipients", async islandSlug => {
    let message: { subject: string; text: string; html: string } | undefined;
    mocks.query.mockResolvedValue([{ ...listing(), islandSlug, islandName: "Fixture Territory", permissions: [{ kind: "business_outreach_permission", country: islandSlug === "puerto-rico" ? "PR" : "VI" }] }]);
    mocks.deliver.mockImplementation(async input => { message = input.buildMessage(attemptId); return { sent: true, email: input.recipient, attemptId }; });
    await sendBusinessInterestOutreachEmail(listingId);
    expect(message?.text).toContain("This message is a business solicitation from VakayGo, operated by Avmere.");
    expect(message?.html).toContain("This message is a business solicitation from VakayGo, operated by Avmere.");
    expect(message?.text).toContain("Fixture Company, 123 Example Road, Test City");
  });

  it.each([
    ["santorini", [{ kind: "business_outreach_permission", country: "GR" }], "country_requires_explicit_opt_in"],
    ["mallorca", [{ kind: "business_outreach_permission", country: "CA" }], "country_requires_explicit_opt_in"],
    ["guanacaste", [], "country_requires_explicit_opt_in"],
    ["martinique", [{ kind: "business_outreach_permission", country: "MQ" }], "country_on_hold"],
    ["cartagena", [{ kind: "business_outreach_permission", country: "CO" }], "country_on_hold"],
    ["grenada", [{ kind: "business_outreach_permission", country: "ES" }], "country_requires_explicit_opt_in"],
    ["not-a-destination", [{ kind: "business_outreach_permission", country: "GD" }], "destination_country_unknown"],
  ])("refuses %s with %j before any attempt is reserved", async (islandSlug, permissions, reason) => {
    mocks.query.mockResolvedValue([{ ...listing(), islandSlug, permissions }]);
    expect(await sendBusinessInterestOutreachEmail(listingId, legacyBypasses)).toEqual({ sent: false, reason });
    expect(mocks.deliver).not.toHaveBeenCalled();
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["santorini", [{ kind: "explicit_opt_in", country: null }]],
    ["martinique", [{ kind: "business_outreach_permission", country: "MQ" }, { kind: "explicit_opt_in", country: "MQ" }]],
  ])("honours a recorded explicit opt-in in %s", async (islandSlug, permissions) => {
    mocks.query.mockResolvedValue([{ ...listing(), islandSlug, permissions }]);
    expect(await sendBusinessInterestOutreachEmail(listingId)).toEqual({ sent: false, reason: "campaign_paused" });
    expect(mocks.deliver).toHaveBeenCalledTimes(1);
  });

  it("does not invite an address that an earlier campaign already emailed for another listing", async () => {
    mocks.query.mockResolvedValue([{ ...listing(), addressAlreadyContacted: true }]);
    expect(await sendBusinessInterestOutreachEmail(listingId, legacyBypasses)).toEqual({ sent: false, reason: "address_already_contacted" });
    expect(mocks.deliver).not.toHaveBeenCalled();
    expect(mocks.query.mock.calls[0][0]).toContain("Claim invitation emailed to");
  });

  it.each(["info@hotel.pbz", "info@hotel.comthe", "sales@resort.mail", "u003einfo@hotel.com", "info@hotel..com"])("treats the garbled address %s as no usable email", async email => {
    mocks.query.mockResolvedValue([{ ...listing(), email }]);
    expect(await sendBusinessInterestOutreachEmail(listingId)).toEqual({ sent: false, reason: "no_email_on_file" });
    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  it("cannot build a message without a real configured postal footer", async () => {
    vi.stubEnv("OUTREACH_SENDER_POSTAL_ADDRESS", "");
    mocks.deliver.mockImplementation(async input => input.buildMessage(attemptId));
    await expect(sendBusinessInterestOutreachEmail(listingId)).rejects.toThrow("Sender postal address is required");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
