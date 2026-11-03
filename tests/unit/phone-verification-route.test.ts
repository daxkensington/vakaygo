// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ session: vi.fn(), status: vi.fn(), reserve: vi.fn(), finish: vi.fn(), consume: vi.fn(), sms: vi.fn(), token: "synthetic" }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => state.token ? { value: state.token } : undefined }) }));
vi.mock("@/server/session-validation", () => ({ verifyCurrentSessionToken: state.session }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("twilio", () => ({ default: () => ({ messages: { create: state.sms } }) }));
vi.mock("@/server/phone-verification", async importOriginal => ({ ...await importOriginal<typeof import("@/server/phone-verification")>(), phoneStatus: state.status, reservePhoneCode: state.reserve, finishPhoneSend: state.finish, consumePhoneCode: state.consume }));
import { GET, POST, PUT } from "@/app/api/auth/phone-verify/route";
import { PhoneVerificationError } from "@/server/phone-verification";
const userId = "18000000-0000-4000-8000-000000000001", phone = "+14735550111";
const actor = { userId, sessionVersion: 3, role: "traveler", email: "phone@fixture.invalid" };
const request = (value: unknown, method = "POST") => new Request("https://vakaygo.com/api/auth/phone-verify", { method, body: JSON.stringify(value), headers: { "content-type": "application/json" } });
beforeEach(() => {
  vi.clearAllMocks(); state.token = "synthetic"; state.session.mockResolvedValue(actor);
  state.status.mockResolvedValue({ userId, phone, verified: true });
  state.reserve.mockResolvedValue({ id: "synthetic-challenge", code: "123456" });
  state.finish.mockResolvedValue(undefined); state.sms.mockResolvedValue({ sid: "synthetic-sms" });
  state.consume.mockResolvedValue({ userId, phone, verified: true });
  vi.stubEnv("TWILIO_ACCOUNT_SID", "synthetic"); vi.stubEnv("TWILIO_AUTH_TOKEN", "synthetic"); vi.stubEnv("TWILIO_PHONE_NUMBER", phone);
});
afterEach(() => vi.unstubAllEnvs());
it("loads the existing security-page GET contract privately", async () => {
  const res = await GET(); expect(res.status).toBe(200); expect(await res.json()).toEqual({ userId, phone, verified: true }); expect(res.headers.get("cache-control")).toBe("private, no-store");
});
it("rejects anonymous/revoked actors before data or provider access", async () => {
  state.session.mockResolvedValue(null);
  for (const call of [() => GET(), () => POST(request({ phone })), () => PUT(request({ code: "123456" }, "PUT"))]) expect((await call()).status).toBe(401);
  expect(state.reserve).not.toHaveBeenCalled(); expect(state.status).not.toHaveBeenCalled(); expect(state.sms).not.toHaveBeenCalled();
});
it("rejects an old account fence and malformed phone before reserving or sending", async () => {
  expect((await GET(new Request("https://vakaygo.com/api/auth/phone-verify?expectedUserId=other"))).status).toBe(409);
  expect((await POST(request({ phone, expectedUserId: "other" }))).status).toBe(409);
  for (const value of [null, [], {}, { phone: 123 }, { phone: "555" }]) expect((await POST(request(value))).status).toBe(400);
  expect(state.reserve).not.toHaveBeenCalled(); expect(state.sms).not.toHaveBeenCalled();
});
it("does not reserve challenges while SMS is unavailable", async () => {
  vi.stubEnv("TWILIO_ACCOUNT_SID", ""); expect((await POST(request({ phone }))).status).toBe(503); expect(state.reserve).not.toHaveBeenCalled();
});
it("sends only after reservation, and reports sent only after conditional finalization", async () => {
  expect((await POST(request({ phone }))).status).toBe(200);
  expect(state.sms).toHaveBeenCalledWith(expect.objectContaining({ to: phone, body: expect.stringContaining("123456") }));
  expect(state.reserve.mock.invocationCallOrder[0]).toBeLessThan(state.sms.mock.invocationCallOrder[0]);
  expect(state.sms.mock.invocationCallOrder[0]).toBeLessThan(state.finish.mock.invocationCallOrder[0]);
  expect(state.finish).toHaveBeenCalledWith(actor, "synthetic-challenge", true);
});
it("marks a failed send unusable without claiming sent", async () => {
  state.sms.mockRejectedValueOnce(new Error("synthetic failure")); const res = await POST(request({ phone }));
  expect(res.status).toBe(503); expect(state.finish).toHaveBeenCalledWith(actor, "synthetic-challenge", false); expect((await res.json()).sent).toBeUndefined();
});
it("does not claim success if identity or challenge changed during the provider call", async () => {
  state.finish.mockRejectedValueOnce(new PhoneVerificationError("Session changed", 401)); expect((await POST(request({ phone }))).status).toBe(401);
});
it("keeps the current code-only PUT contract and returns the actual verified phone", async () => {
  const res = await PUT(request({ code: "123456" }, "PUT")); expect(res.status).toBe(200);
  expect(state.consume).toHaveBeenCalledWith(actor, "123456", undefined); expect(await res.json()).toEqual({ userId, phone, verified: true });
});
it("propagates durable attempt/cooldown denials without another provider send", async () => {
  state.reserve.mockRejectedValueOnce(new PhoneVerificationError("Wait", 429)); expect((await POST(request({ phone }))).status).toBe(429); expect(state.sms).not.toHaveBeenCalled();
  state.consume.mockRejectedValueOnce(new PhoneVerificationError("Too many attempts", 429)); expect((await PUT(request({ code: "000000" }, "PUT"))).status).toBe(429);
});
