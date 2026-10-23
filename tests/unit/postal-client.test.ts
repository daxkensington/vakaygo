// @vitest-environment node
import { constants, createHash, generateKeyPairSync, sign } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPostalClient, POSTAL_ORIGIN, verifyPostalWebhook, type PostalAcceptance, type PostalInvitation } from "@/server/postal-client";

const NOW = Date.parse("2026-10-20T15:00:00Z");
const attemptId = "11111111-1111-4111-8111-111111111111";
const recipient = "operator@example.com";
const config = () => ({ origin: POSTAL_ORIGIN, apiKey: "FixturePostalAPIKey123456", verifiedAt: NOW - 60_000 });
const invitation = (): PostalInvitation => ({ attemptId, reservedAt: NOW - 1000, recipient,
  subject: "Claim your VakayGo listing", text: "Fixture invitation. All bookings go through VakayGo.",
  unsubscribeUrl: "https://vakaygo.com/api/outreach/unsubscribe?context=fixture.signed_context_value" });
const acceptance = (): PostalAcceptance => ({ attemptId, recipient, id: 37171, token: "a4udnay1XYZ12345", messageId: "d620b3b1-8d4c-458f-879d-2ed53d131f84@rp.postal.vakaygo.com" });
const acceptedBody = () => ({ status: "success", time: 0.02, flags: {}, data: {
  message_id: acceptance().messageId, messages: { [recipient]: { id: acceptance().id, token: acceptance().token } } as Record<string, { id: number; token: string }>,
} });
// Payload shapes follow the pinned Postal 3.3.7 request specs, not a guessed SDK.
const statusBody = (status = "Sent") => ({ status: "success", data: { id: acceptance().id, token: acceptance().token,
  status: { status, held: false, hold_expiry: null, last_delivery_attempt: NOW / 1000 - 30 },
  details: { rcpt_to: recipient, mail_from: "hello@vakaygo.com", message_id: acceptance().messageId,
    direction: "outgoing", bounce: false, tag: `outreach:${attemptId}` },
} });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const fetchMock = vi.fn();
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("unwired Postal client", () => {
  it("submits one immutable identity with fixed sender, reply address and stable attempt reference", async () => {
    fetchMock.mockResolvedValue(response(acceptedBody()));
    const result = await createPostalClient(config(), () => NOW).send(invitation());
    expect(result).toEqual({ state: "accepted", acceptance: acceptance() });
    if (result.state !== "accepted") throw new Error("fixture failed");
    expect(Object.isFrozen(result.acceptance)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe(`${POSTAL_ORIGIN}/api/v1/send/message`);
    expect(request).toMatchObject({ method: "POST", redirect: "error", cache: "no-store",
      headers: { "Content-Type": "application/json", "X-Server-API-Key": config().apiKey } });
    expect(JSON.parse(request.body)).toEqual({ to: [recipient], from: "hello@vakaygo.com", reply_to: "support@vakaygo.com",
      subject: invitation().subject, plain_body: invitation().text, tag: `outreach:${attemptId}`,
      headers: { "X-VakayGo-Attempt-ID": attemptId, "List-Unsubscribe": `<${invitation().unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } });
    expect(request.headers).not.toHaveProperty("Idempotency-Key");
    expect(JSON.parse(request.body).headers).not.toHaveProperty("Message-ID");
  });
  it.each(["http://postal.vakaygo.com", "https://postal.vakaygo.com/", "https://postal.vakaygo.com:444", "https://user@postal.vakaygo.com", "https://postal.vakaygo.com.evil.example", "https://127.0.0.1", "https://postal.vakaygo.com?redirect=localhost"])("blocks unapproved endpoint %s before a request", async origin => {
    expect(await createPostalClient({ ...config(), origin }, () => NOW).send(invitation())).toMatchObject({ state: "rejected", reason: "invalid_config" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([{ verifiedAt: NOW - 20 * 60_000 }, { verifiedAt: NOW + 1 }, { verifiedAt: NaN }, { apiKey: "\r\nsecret" }])("blocks stale, future or malformed readiness/config %j", async invalid => {
    expect(await createPostalClient({ ...config(), ...invalid }, () => NOW).send(invitation())).toMatchObject({ state: "rejected", reason: "invalid_config" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([
    { recipient: "operator@example.com,other@example.com" }, { recipient: "Operator <operator@example.com>" },
    { recipient: "operator@example.com\r\nBcc: other@example.com" }, { recipient: "operator@-example.com" },
    { recipient: "Operator@example.com" }, { attemptId: "other" }, { reservedAt: NOW - 20 * 60_000 },
    { reservedAt: NOW + 1 }, { subject: "Hello\r\nBcc: other@example.com" },
    { from: "evil@example.com" }, { replyTo: "evil@example.com" }, { cc: ["other@example.com"] },
    { unsubscribeUrl: "https://evil.example/api/outreach/unsubscribe?context=fixture.signed_context_value" },
    { unsubscribeUrl: "https://vakaygo.com/api/outreach/unsubscribe?context=fixture.signed_context_value&other=1" },
    { text: " " },
  ])("rejects invalid/stale/overridden invitation %j without network access", async invalid => {
    const result = await createPostalClient(config(), () => NOW).send({ ...invitation(), ...invalid });
    expect(result).toEqual({ state: "rejected", reason: "invalid_invitation" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(["network", "timeout", "server", "proxy-rejection", "broken-json", "unknown-error", "oversized"])("returns uncertain once after %s; never retries or leaks response contents", async scenario => {
    if (scenario === "network" || scenario === "timeout") fetchMock.mockRejectedValue(new Error(`private-key-${scenario}`));
    if (scenario === "server") fetchMock.mockResolvedValue(response({ private: "secret" }, 503));
    if (scenario === "proxy-rejection") fetchMock.mockResolvedValue(response({ private: "secret" }, 403));
    if (scenario === "broken-json") fetchMock.mockResolvedValue(new Response("private-broken-json"));
    if (scenario === "unknown-error") fetchMock.mockResolvedValue(response({ status: "error", data: { code: "Unknown", token: config().apiKey } }));
    if (scenario === "oversized") fetchMock.mockResolvedValue(response({ data: "private".repeat(10_000) }));
    const result = await createPostalClient(config(), () => NOW).send(invitation());
    expect(result.state).toBe("uncertain");
    expect(JSON.stringify(result)).not.toMatch(/private|secret|FixturePostalAPIKey/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("recognizes Postal's HTTP200 authentication error as a known pre-enqueue rejection", async () => {
    fetchMock.mockResolvedValue(response({ status: "error", data: { code: "InvalidServerAPIKey", token: config().apiKey } }));
    expect(await createPostalClient(config(), () => NOW).send(invitation())).toEqual({ state: "rejected", reason: "provider_rejected" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each(["recipient", "extra-recipient", "unsafe-id", "bad-token", "bad-message-id"])("does not record an acceptance for a malformed %s", async scenario => {
    const body = acceptedBody();
    if (scenario === "recipient") body.data.messages = { "other@example.com": { id: 37171, token: acceptance().token } };
    if (scenario === "extra-recipient") body.data.messages["other@example.com"] = { id: 37172, token: acceptance().token };
    if (scenario === "unsafe-id") body.data.messages[recipient].id = Number.MAX_SAFE_INTEGER + 1;
    if (scenario === "bad-token") body.data.messages[recipient].token = "bad";
    if (scenario === "bad-message-id") body.data.message_id = "bad\r\nheader";
    fetchMock.mockResolvedValue(response(body));
    expect(await createPostalClient(config(), () => NOW).send(invitation())).toEqual({ state: "uncertain", reason: "invalid_provider_response" });
  });
  it.each(["Pending", "Sent", "SoftFail", "HardFail", "Held", "Bounced"])("reads %s with semantic GET-over-POST and only minimal expansions", async status => {
    fetchMock.mockResolvedValue(response(statusBody(status)));
    expect(await createPostalClient(config(), () => NOW).poll(acceptance())).toEqual({ state: "observed", status, lastAttemptAt: NOW - 30_000 });
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe(`${POSTAL_ORIGIN}/api/v1/messages/message`);
    expect(request.method).toBe("POST");
    expect(JSON.parse(request.body)).toEqual({ id: 37171, _expansions: ["status", "details"] });
  });
  it("accepts the official newly queued Pending shape with no delivery attempt yet", async () => {
    const body = statusBody("Pending");
    const pending = { ...body, data: { ...body.data, status: { ...body.data.status, last_delivery_attempt: null } } };
    fetchMock.mockResolvedValue(response(pending));
    expect(await createPostalClient(config(), () => NOW).poll(acceptance())).toEqual({ state: "observed", status: "Pending", lastAttemptAt: null });
  });
  it.each(["id", "token", "recipient", "sender", "tag", "message-id", "direction", "bounce", "status", "future-attempt"])("refuses a poll with mismatched %s instead of crediting another message", async mismatch => {
    const body = statusBody();
    if (mismatch === "id") body.data.id++;
    if (mismatch === "token") body.data.token = "otherToken123456";
    if (mismatch === "recipient") body.data.details.rcpt_to = "other@example.com";
    if (mismatch === "sender") body.data.details.mail_from = "other@vakaygo.com";
    if (mismatch === "tag") body.data.details.tag = "outreach:other";
    if (mismatch === "message-id") body.data.details.message_id = "other@postal.vakaygo.com";
    if (mismatch === "direction") body.data.details.direction = "incoming";
    if (mismatch === "bounce") body.data.details.bounce = true;
    if (mismatch === "status") body.data.status.status = "Delivered";
    if (mismatch === "future-attempt") body.data.status.last_delivery_attempt = NOW / 1000 + 61;
    fetchMock.mockResolvedValue(response(body));
    expect(await createPostalClient(config(), () => NOW).poll(acceptance())).toEqual({ state: "unavailable", reason: "invalid_provider_response" });
  });
  it("refuses non-scalar/unsafe message identifiers before calling Postal", async () => {
    const client = createPostalClient(config(), () => NOW);
    expect((await client.poll({ ...acceptance(), id: { bad: "SQL" } as unknown as number })).state).toBe("unavailable");
    expect((await client.poll({ ...acceptance(), id: -1 })).state).toBe("unavailable");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("snapshots configuration so subsequent caller mutation cannot change the destination/credential", async () => {
    const supplied = config();
    const client = createPostalClient(supplied, () => NOW);
    supplied.origin = "https://evil.example";
    supplied.apiKey = "private-mutated";
    fetchMock.mockResolvedValue(response(acceptedBody()));
    expect((await client.send(invitation())).state).toBe("accepted");
    expect(fetchMock.mock.calls[0][1].headers["X-Server-API-Key"]).toBe(config().apiKey);
  });
  it("binds the returned acceptance to the submitted identity even if the caller mutates its input while awaiting HTTP", async () => {
    let resolve!: (value: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>(done => { resolve = done; }));
    const input = { ...invitation() };
    const pending = createPostalClient(config(), () => NOW).send(input);
    input.recipient = "other@example.com";
    input.attemptId = "22222222-2222-4222-8222-222222222222";
    resolve(response(acceptedBody()));
    expect(await pending).toEqual({ state: "accepted", acceptance: acceptance() });
  });
});

describe("pinned Postal 3.3.7 raw-body RSA verifier (no ingestion route)", () => {
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pin = { publicKeyPem: keys.publicKey.export({ type: "spki", format: "pem" }).toString(),
    spkiSha256: createHash("sha256").update(keys.publicKey.export({ type: "spki", format: "der" })).digest("hex") };
  const event = () => ({ event: "MessageSent", timestamp: NOW / 1000 - 2, payload: {
    message: { id: 37171, token: acceptance().token, message_id: acceptance().messageId, to: recipient, from: "hello@vakaygo.com", tag: `outreach:${attemptId}` },
    status: "Sent", details: "Message accepted by SMTP server", output: "250 2.0.0 accepted", timestamp: NOW / 1000 - 3,
  }, uuid: "33333333-3333-4333-8333-333333333333" });
  const signed = (body: unknown = event(), digest = "RSA-SHA256") => {
    const raw = Buffer.from(JSON.stringify(body));
    return { raw, signature: sign(digest, raw, { key: keys.privateKey, padding: constants.RSA_PKCS1_PADDING }).toString("base64") };
  };
  it("verifies the exact signed envelope and returns its stable retry UUID for future durable deduplication", () => {
    const { raw, signature } = signed();
    expect(verifyPostalWebhook(raw, signature, pin, NOW)).toEqual(event());
    // The pure verifier intentionally does not claim replay deduplication.
    expect(verifyPostalWebhook(raw, signature, pin, NOW)?.uuid).toBe(event().uuid);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("supports the signed delayed-bounce shape and Postal's 36-minute retry horizon without confusing outer and delivery timestamps", () => {
    const bounced = { ...event(), event: "MessageBounced", timestamp: NOW / 1000 - 36 * 60,
      payload: { original_message: event().payload.message, bounce: { id: 37172, direction: "incoming" } } };
    const { raw, signature } = signed(bounced);
    expect(verifyPostalWebhook(raw, signature, pin, NOW)).toEqual(bounced);
  });
  it("rejects changed whitespace/body, invalid signature and the legacy SHA1 signature without fallback", () => {
    const { raw, signature } = signed();
    expect(verifyPostalWebhook(Buffer.concat([raw, Buffer.from(" ")]), signature, pin, NOW)).toBeNull();
    expect(verifyPostalWebhook(raw, "not-base64!", pin, NOW)).toBeNull();
    expect(verifyPostalWebhook(raw, "A".repeat(2049), pin, NOW)).toBeNull();
    expect(verifyPostalWebhook(raw, signed(event(), "RSA-SHA1").signature, pin, NOW)).toBeNull();
    expect(verifyPostalWebhook(raw, signature, { ...pin, spkiSha256: "0".repeat(64) }, NOW)).toBeNull();
  });
  it.each([{ timestamp: NOW / 1000 - 3601 }, { timestamp: NOW / 1000 + 61 }, { event: "MessageComplained" }, { uuid: "not-a-uuid" }, { payload: [] }])("rejects an authentic but stale/unsupported envelope %j", invalid => {
    const { raw, signature } = signed({ ...event(), ...invalid });
    expect(verifyPostalWebhook(raw, signature, pin, NOW)).toBeNull();
  });
  it("rejects weak keys and oversized signed bodies", () => {
    const weak = generateKeyPairSync("rsa", { modulusLength: 1024 });
    const weakPin = { publicKeyPem: weak.publicKey.export({ type: "spki", format: "pem" }).toString(),
      spkiSha256: createHash("sha256").update(weak.publicKey.export({ type: "spki", format: "der" })).digest("hex") };
    const { raw, signature } = signed({ ...event(), payload: { private: "x".repeat(33_000) } });
    expect(verifyPostalWebhook(raw, signature, pin, NOW)).toBeNull();
    const normal = signed();
    expect(verifyPostalWebhook(normal.raw, sign("RSA-SHA256", normal.raw, weak.privateKey).toString("base64"), weakPin, NOW)).toBeNull();
  });
});
