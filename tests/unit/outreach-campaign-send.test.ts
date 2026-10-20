// @vitest-environment node
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(), window: vi.fn(), prerequisites: vi.fn(), fetch: vi.fn(),
  accepted: vi.fn(), failure: vi.fn(), event: vi.fn(), suppress: vi.fn(), unsubscribe: vi.fn(),
}));
vi.mock("@neondatabase/serverless", () => ({ neon: () => ({ query: mocks.query }) }));
vi.mock("@/lib/env", () => ({ env: new Proxy({}, { get: (_target, key) => process.env[String(key)] }) }));
vi.mock("@/lib/outreach-campaign-policy", async () => ({
  ...await vi.importActual("@/lib/outreach-campaign-policy"),
  checkCampaignSendingWindow: mocks.window, getOutreachPrerequisites: mocks.prerequisites,
}));
vi.mock("@/server/outreach-tracking", async () => ({
  ...await vi.importActual("@/server/outreach-tracking"), recordOutreachAccepted: mocks.accepted,
  recordOutreachFailure: mocks.failure, recordOutreachProviderEvent: mocks.event, suppressOutreachRecipient: mocks.suppress,
}));
vi.mock("@/server/outreach-attribution", () => ({ unsubscribeInvitationUrl: mocks.unsubscribe }));

import { deliverClaimInvitation, preserveCampaignSuppression, refreshOutreachTelemetry } from "@/server/outreach-campaign-send";

const attemptId = "11111111-1111-4111-8111-111111111111";
const listingId = "22222222-2222-4222-8222-222222222222";
const ready = () => ({ ready: true, reasons: [], provider: "resend", from: "hello@vakaygo.com" });
const message = () => ({ subject: "Fixture invitation", text: "Fixture text", html: "<p>Fixture text</p>" });
const invitation = () => ({ listingId, recipient: " Business@audit.invalid ", islandSlug: "grenada", buildMessage: vi.fn(message) });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const requiredEvents = ["email.sent", "email.delivered", "email.bounced", "email.complained", "email.delivery_delayed", "email.failed", "email.suppressed"];
const webhookSecret = "whsec_fixture_same_value_no_network";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", mocks.fetch);
  vi.stubEnv("RESEND_API_KEY", "re_fixture_no_network");
  vi.stubEnv("RESEND_WEBHOOK_SECRET", webhookSecret);
  vi.stubEnv("DATABASE_URL", "postgresql://fixture:fixture@localhost:5432/fixture");
  mocks.prerequisites.mockImplementation(ready);
  mocks.window.mockReturnValue({ allowed: true });
  mocks.query.mockImplementation((text: string) => {
    if (text.startsWith("SELECT * FROM vakaygo_reserve")) return [{ attempt_id: attemptId, reason: null }];
    if (text.startsWith("SELECT a.id FROM outreach_email_attempts")) return [{ id: attemptId }];
    return [];
  });
  mocks.accepted.mockResolvedValue(true);
  mocks.failure.mockResolvedValue(true);
  mocks.event.mockResolvedValue({ recorded: true, applied: 1 });
  mocks.suppress.mockResolvedValue(undefined);
  mocks.unsubscribe.mockReturnValue("https://vakaygo.audit.invalid/unsubscribe/fixture");
  mocks.fetch.mockResolvedValue(response({ id: "provider-email-1" }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("claim campaign dispatch", () => {
  it("does not reserve or contact a provider when prerequisites fail", async () => {
    mocks.prerequisites.mockReturnValue({ ...ready(), ready: false, reasons: ["recipient_permission_missing"] });
    const input = invitation();
    expect((await deliverClaimInvitation(input)).reason).toBe("recipient_permission_missing");
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(input.buildMessage).not.toHaveBeenCalled();
  });
  it("rejects invalid recipients and quiet-hour calls before reservation", async () => {
    expect((await deliverClaimInvitation({ ...invitation(), recipient: "invalid" })).reason).toBe("invalid_recipient");
    mocks.window.mockReturnValue({ allowed: false });
    expect((await deliverClaimInvitation(invitation())).reason).toBe("outside_local_business_hours");
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("obeys the durable reservation refusal without building or sending an email", async () => {
    mocks.query.mockResolvedValueOnce([{ attempt_id: null, reason: "already_reserved" }]);
    const input = invitation();
    expect((await deliverClaimInvitation(input)).reason).toBe("already_reserved");
    expect(input.buildMessage).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it.each(["permission", "window", "prerequisite"])("rechecks a changed %s gate immediately before dispatch", async changed => {
    if (changed === "permission") mocks.query.mockResolvedValueOnce([{ attempt_id: attemptId }]).mockResolvedValueOnce([]);
    if (changed === "window") mocks.window.mockReturnValueOnce({ allowed: true }).mockReturnValueOnce({ allowed: false });
    if (changed === "prerequisite") mocks.prerequisites.mockReturnValueOnce(ready()).mockReturnValueOnce({ ...ready(), ready: false, reasons: ["provider_changed"] });
    expect((await deliverClaimInvitation(invitation())).reason).toBe("dispatch_gate_changed");
    expect(mocks.failure).toHaveBeenCalledWith(attemptId, "dispatch_gate_changed", { uncertain: false });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it.each([
    ["complaint", "h.complained_at>=now()-interval '7 days'"],
    ["recent bounce with no accepted sample", "accepted=0 OR bounced::numeric/greatest(accepted,1)>=0.02"],
    ["uncertain outcome from another provider", "h.state='uncertain'"],
    ["reservation stale for 20 minutes", "h.reserved_at<now()-interval '20 minutes'"],
    ["unresolved acceptance overdue for 24 hours", "h.accepted_at<now()-interval '24 hours'"],
    ["manual contact", "b.contacted_at IS NOT NULL"],
  ])("refuses a %s recorded after reservation without building or sending", async (_race, predicate) => {
    mocks.query.mockImplementation((text: string) => {
      if (text.startsWith("SELECT * FROM vakaygo_reserve")) return [{ attempt_id: attemptId }];
      // Emulate the new evidence becoming visible in the final statement.
      // If its predicate is absent, the old query incorrectly returns eligible.
      if (text.startsWith("SELECT a.id FROM outreach_email_attempts")) return text.includes(predicate) ? [] : [{ id: attemptId }];
      return [];
    });
    const input = invitation();
    expect((await deliverClaimInvitation(input)).reason).toBe("dispatch_gate_changed");
    expect(mocks.failure).toHaveBeenCalledWith(attemptId, "dispatch_gate_changed", { uncertain: false });
    expect(input.buildMessage).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.query.mock.calls.filter(([text]) => text.startsWith("SELECT * FROM vakaygo_reserve"))).toHaveLength(1);
    const finalGate = mocks.query.mock.calls.find(([text]) => text.startsWith("SELECT a.id FROM outreach_email_attempts"))?.[0];
    expect(finalGate).toContain("h.campaign_key=a.campaign_key");
    expect(finalGate).toContain("h.bounced_at>=now()-interval '7 days'");
    expect(finalGate).toContain("h.accepted_at>=now()-interval '7 days'");
    expect(finalGate).toContain("h.suppressed_at IS NULL AND h.failed_at IS NULL");
  });
  it("binds the provider envelope and stable idempotency key to the reservation", async () => {
    const result = await deliverClaimInvitation(invitation());
    expect(result.sent).toBe(true);
    const [url, options] = mocks.fetch.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(options.method).toBe("POST");
    expect(options.redirect).toBe("error");
    expect(options.headers["Idempotency-Key"]).toBe(`outreach:${attemptId}`);
    const body = JSON.parse(options.body);
    expect(body.to).toBe("business@audit.invalid");
    expect(body.from).toBe("VakayGo <hello@vakaygo.com>");
    expect(body.reply_to).toBe("support@vakaygo.com");
    expect(body.bcc).toBeUndefined();
    expect(body.cc).toBeUndefined();
    expect(mocks.accepted).toHaveBeenCalledWith(attemptId, "provider-email-1");
  });
  it("does not let message content override the consent-bound sender or recipient", async () => {
    const input = { ...invitation(), buildMessage: () => ({ ...message(), to: "other@audit.invalid", from: "wrong@audit.invalid", reply_to: "wrong@audit.invalid" }) };
    await deliverClaimInvitation(input);
    const body = JSON.parse(mocks.fetch.mock.calls[0][1].body);
    expect(body.to).toBe("business@audit.invalid");
    expect(body.from).toBe("VakayGo <hello@vakaygo.com>");
    expect(body.reply_to).toBe("support@vakaygo.com");
  });
  it.each([400, 409, 429, 500])("records HTTP %s without treating rejection as a sent message", async status => {
    mocks.fetch.mockResolvedValueOnce(response({ error: "fixture rejection" }, status));
    expect((await deliverClaimInvitation(invitation())).sent).toBe(false);
    expect(mocks.accepted).not.toHaveBeenCalled();
    expect(mocks.failure.mock.calls[0][0]).toBe(attemptId);
    // A rejected 429 is definite; every rejection still opens the circuit.
    expect(mocks.failure.mock.calls[0][2].uncertain).toBe(status >= 500 || status === 409);
    expect(mocks.query.mock.calls.some(([text]) => text.includes("UPDATE outreach_campaign_control SET enabled=false,health_ready=false"))).toBe(true);
  });
  it("does not leak raw transport failures and holds unknown outcomes", async () => {
    mocks.fetch.mockRejectedValueOnce(new Error("private upstream credential detail"));
    const result = await deliverClaimInvitation(invitation());
    expect(result.sent).toBe(false);
    expect(JSON.stringify(result).includes("private")).toBe(false);
    expect(mocks.failure).toHaveBeenCalledWith(attemptId, "transport_outcome_unconfirmed");
  });
  it.each(["missing-id", "not-persisted", "persistence-error"])("holds a successful provider response when acceptance is %s", async failure => {
    if (failure === "missing-id") mocks.fetch.mockResolvedValueOnce(response({ id: 7 }));
    if (failure === "not-persisted") mocks.accepted.mockResolvedValueOnce(false);
    if (failure === "persistence-error") mocks.accepted.mockRejectedValueOnce(new Error("fixture persistence error"));
    expect((await deliverClaimInvitation(invitation())).sent).toBe(false);
    expect(mocks.failure).toHaveBeenCalledWith(attemptId, "transport_outcome_unconfirmed");
  });
  it("does not automatically retry a previously reserved recipient after a provider request", async () => {
    await deliverClaimInvitation(invitation());
    mocks.query.mockResolvedValueOnce([{ attempt_id: null, reason: "already_reserved" }]);
    expect((await deliverClaimInvitation(invitation())).sent).toBe(false);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });
});

describe("provider telemetry and historical blocks", () => {
  function metadataProvider(options: { missingWebhook?: boolean; mismatch?: boolean; unknownStatus?: boolean; signingSecret?: unknown; wrongWebhookId?: boolean } = {}) {
    mocks.fetch.mockImplementation((url: string) => {
      const parsed = new URL(url);
      if (parsed.pathname === "/domains") return response({ data: [{ id: "domain-1", name: "vakaygo.com", status: "verified" }], has_more: false });
      if (parsed.pathname === "/webhooks") return response({ data: options.missingWebhook ? [] : [{ id: "webhook-1", endpoint: "https://vakaygo.com/api/webhooks/resend", status: "enabled" }], has_more: false });
      if (parsed.pathname === "/webhooks/webhook-1") return response({ id: options.wrongWebhookId ? "wrong-webhook" : "webhook-1", endpoint: "https://vakaygo.com/api/webhooks/resend", status: "enabled", events: requiredEvents, signing_secret: Object.hasOwn(options, "signingSecret") ? options.signingSecret : webhookSecret });
      if (url.endsWith("/emails/provider-email-1")) return response({ id: "provider-email-1", to: [options.mismatch ? "other@audit.invalid" : "business@audit.invalid"], last_event: options.unknownStatus ? "unknown" : "delivered" });
      throw new Error("Unexpected fixture provider route");
    });
    mocks.query.mockImplementation((text: string) => text.startsWith("SELECT id,recipient,provider_email_id") ? [{ id: attemptId, recipient: "business@audit.invalid", provider_email_id: "provider-email-1" }] : []);
  }
  it("records only verified-recipient polling observations and never sends during refresh", async () => {
    metadataProvider();
    expect((await refreshOutreachTelemetry()).ready).toBe(true);
    expect(mocks.event.mock.calls[0][2]).toBe("resend");
    expect(mocks.event.mock.calls[0][3]).toBe("provider_poll");
    expect(mocks.event.mock.calls[0][1].recipientHash).toBe(createHash("sha256").update("business@audit.invalid").digest("hex"));
    expect(mocks.fetch.mock.calls.every(([, options]) => options.method === "GET")).toBe(true);
    expect(mocks.fetch.mock.calls.filter(([url]) => ["/domains", "/webhooks"].includes(new URL(url).pathname)).every(([url]) => new URL(url).searchParams.get("limit") === "100")).toBe(true);
    expect(mocks.accepted).not.toHaveBeenCalled();
  });
  it("follows bounded domain and webhook cursors to find a verified sender beyond the first page", async () => {
    metadataProvider();
    const defaultProvider = mocks.fetch.getMockImplementation()!;
    mocks.fetch.mockImplementation((url: string) => {
      const parsed = new URL(url);
      if (parsed.pathname === "/domains" && !parsed.searchParams.has("after")) return response({ data: [{ id: "domain-page-1", name: "other.audit.invalid", status: "verified" }], has_more: true });
      if (parsed.pathname === "/webhooks" && !parsed.searchParams.has("after")) return response({ data: [{ id: "webhook-page-1", endpoint: "https://other.audit.invalid", status: "enabled" }], has_more: true });
      return defaultProvider(url);
    });
    expect((await refreshOutreachTelemetry()).ready).toBe(true);
    const metadataUrls = mocks.fetch.mock.calls.map(([url]) => new URL(url)).filter(url => ["/domains", "/webhooks"].includes(url.pathname));
    expect(metadataUrls.map(url => `${url.pathname}?${url.searchParams}`)).toEqual([
      "/domains?limit=100", "/domains?limit=100&after=domain-page-1",
      "/webhooks?limit=100", "/webhooks?limit=100&after=webhook-page-1",
    ]);
    expect(mocks.fetch.mock.calls.every(([, options]) => options.method === "GET")).toBe(true);
  });
  it.each([
    { label: "missing pagination state", page: { data: [] } },
    { label: "empty next-page cursor", page: { data: [], has_more: true } },
    { label: "unsafe cursor", page: { data: [{ id: "domain-1&after=other" }], has_more: true } },
    { label: "duplicate page cursor", page: { data: [{ id: "domain-repeat" }], has_more: true } },
    { label: "over-size page", page: { data: Array.from({ length: 101 }, (_, id) => ({ id: `domain-${id}` })), has_more: false } },
  ])("holds $label metadata without a provider mutation", async ({ page }) => {
    mocks.fetch.mockImplementation(() => response(page));
    const result = await refreshOutreachTelemetry();
    expect(result).toEqual({ ready: false, reasons: ["provider_telemetry_unavailable"] });
    expect(mocks.fetch.mock.calls.length).toBeLessThanOrEqual(2);
    expect(mocks.fetch.mock.calls.every(([, options]) => options.method === "GET")).toBe(true);
    expect(mocks.query.mock.calls.find(([text]) => text.startsWith("UPDATE outreach_campaign_control"))?.[1][0]).toBe(false);
  });
  it("stops metadata enumeration after five pages and holds incomplete readiness", async () => {
    mocks.fetch.mockImplementation(() => response({ data: [{ id: `domain-page-${mocks.fetch.mock.calls.length}` }], has_more: true }));
    expect((await refreshOutreachTelemetry()).reasons).toContain("provider_telemetry_unavailable");
    expect(mocks.fetch).toHaveBeenCalledTimes(5);
    expect(mocks.fetch.mock.calls.every(([url, options]) => new URL(url).pathname === "/domains" && options.method === "GET")).toBe(true);
  });
  it.each(["whsec_fixture_same_value_no_networl", "different-length", "", null, undefined])("holds a missing or mismatched webhook secret without exposing it", async signingSecret => {
    metadataProvider({ signingSecret });
    const result = await refreshOutreachTelemetry();
    expect(result.ready).toBe(false);
    expect(result.reasons).toContain("campaign_webhook_secret_mismatch");
    expect(JSON.stringify(result)).not.toContain(webhookSecret);
    expect(JSON.stringify(mocks.query.mock.calls)).not.toContain(webhookSecret);
  });
  it("does not trust a webhook detail response bound to a different ID", async () => {
    metadataProvider({ wrongWebhookId: true });
    expect((await refreshOutreachTelemetry()).reasons).toContain("campaign_webhook_events_incomplete");
  });
  it.each(["missingWebhook", "mismatch", "unknownStatus"])("holds telemetry on %s without trusting message metadata", async problem => {
    metadataProvider({ [problem]: true });
    expect((await refreshOutreachTelemetry()).ready).toBe(false);
    if (problem !== "missingWebhook") expect(mocks.event).not.toHaveBeenCalled();
    const healthWrite = mocks.query.mock.calls.find(([text]) => text.startsWith("UPDATE outreach_campaign_control"));
    expect(healthWrite?.[1][0]).toBe(false);
    expect(healthWrite?.[1][2]).toBe("resend");
    expect(mocks.fetch.mock.calls.every(([, options]) => options.method === "GET")).toBe(true);
  });
  it("advances the polling cursor even when the provider observation was already recorded", async () => {
    metadataProvider();
    mocks.event.mockResolvedValueOnce({ recorded: false, applied: 0 });
    expect((await refreshOutreachTelemetry()).ready).toBe(true);
    const selection = mocks.query.mock.calls.find(([text]) => text.startsWith("SELECT id,recipient,provider_email_id"));
    expect(selection?.[0].includes("ORDER BY last_polled_at ASC NULLS FIRST")).toBe(true);
    const cursor = mocks.query.mock.calls.find(([text]) => text.startsWith("UPDATE outreach_email_attempts SET last_polled_at"));
    expect(cursor?.[1]).toEqual([attemptId]);
  });
  it("holds unreadable provider telemetry with a safe machine reason", async () => {
    mocks.fetch.mockRejectedValueOnce(new Error("private upstream credential detail"));
    const result = await refreshOutreachTelemetry();
    expect(result.ready).toBe(false);
    expect(result.reasons).toContain("provider_telemetry_unavailable");
    expect(JSON.stringify(result).includes("private")).toBe(false);
  });
  it("preserves recipient-wide historical suppression while returning only its hash", async () => {
    expect(await preserveCampaignSuppression(" Business@audit.invalid ", "bounce")).toBe(createHash("sha256").update("business@audit.invalid").digest("hex"));
    expect(mocks.suppress).toHaveBeenCalledWith("business@audit.invalid", "bounce");
    await expect(preserveCampaignSuppression("invalid", "bounce")).rejects.toThrow("invalid_recipient");
  });
});
