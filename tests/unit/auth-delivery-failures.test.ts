import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const state = vi.hoisted(() => ({
  callbacks: [] as (() => Promise<void>)[], writes: [] as { values: Record<string, unknown>; sql: string; params: unknown[] }[],
  user: { id: "20000000-0000-4000-8000-000000000009", email: "owner@example.invalid", name: "Owner", role: "operator", sessionVersion: 1, magicLinkToken: "a".repeat(64), magicLinkExpires: null as Date | null },
}));
const emails = vi.hoisted(() => ({ sendWelcomeEmail: vi.fn(async () => {}), sendVerificationEmail: vi.fn(async () => {}), sendMagicLinkEmail: vi.fn(async () => {}) }));
const createUser = vi.hoisted(() => vi.fn(async () => state.user));
const logger = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("@/server/email", () => emails);
vi.mock("@/server/auth", () => ({ createUser }));
vi.mock("@/lib/logger", () => ({ logger }));
vi.mock("next/server", async original => ({ ...await original<typeof import("next/server")>(), after: (callback: () => Promise<void>) => state.callbacks.push(callback) }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => ({}) }));
vi.mock("drizzle-orm/neon-http", () => ({ drizzle: () => ({
  select: () => { const query = { from: () => query, where: () => query, limit: async () => [{ ...state.user }] }; return query; },
  update: () => ({ set: (values: Record<string, unknown>) => ({ where: (condition: SQL) => {
    const compiled = new PgDialect().sqlToQuery(condition);
    state.writes.push({ values, sql: compiled.sql, params: compiled.params });
    const expectedToken = compiled.params.find(value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value));
    const tokenMatches = !compiled.sql.includes('"magic_link_token"') || (compiled.sql.includes("is null") ? state.user.magicLinkToken == null : state.user.magicLinkToken === expectedToken);
    const epochMatches = !compiled.sql.includes('"session_version"') || compiled.params.includes(state.user.sessionVersion);
    const matches = tokenMatches && epochMatches;
    if (matches) Object.assign(state.user, values);
    return Object.assign(Promise.resolve(), { returning: async () => matches ? [{ id: state.user.id }] : [] });
  } }) }),
}) }));
import { POST as signup } from "@/app/api/auth/signup/route";
import { POST as requestMagic } from "@/app/api/auth/magic-link/route";
const request = (body: unknown) => new Request("https://vakaygo.com/api/auth/test", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
const signupBody = () => ({ email: state.user.email, name: state.user.name, password: "synthetic-password", role: "operator" });
beforeEach(() => {
  vi.clearAllMocks(); state.callbacks = []; state.writes = [];
  state.user.magicLinkToken = "a".repeat(64); state.user.magicLinkExpires = new Date(Date.now() + 13 * 60_000); state.user.sessionVersion = 1;
  createUser.mockResolvedValue(state.user); emails.sendVerificationEmail.mockResolvedValue(); emails.sendMagicLinkEmail.mockResolvedValue();
  vi.stubEnv("DATABASE_URL", "postgresql://synthetic.invalid/test");
});
afterEach(() => vi.unstubAllEnvs());

it("waits for required verification-provider acceptance and reports a recoverable failure after account creation", async () => {
  let rejectSend!: (reason: Error) => void;
  emails.sendVerificationEmail.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectSend = reject; }));
  let completed = false; const pending = signup(request(signupBody())).then(response => { completed = true; return response; });
  await vi.waitFor(() => expect(emails.sendVerificationEmail).toHaveBeenCalledOnce());
  expect(completed).toBe(false);
  rejectSend(new Error("Synthetic provider unavailable"));
  const response = await pending; expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ user: { id: state.user.id }, verificationEmailSent: false });
  expect(createUser).toHaveBeenCalledOnce(); expect(state.callbacks).toHaveLength(1);
  await state.callbacks[0](); expect(emails.sendWelcomeEmail).toHaveBeenCalledOnce();
});

it("reports verification-provider acceptance without claiming inbox delivery and retains safe registration roles", async () => {
  const response = await signup(request({ ...signupBody(), role: "admin" }));
  expect(await response.json()).toMatchObject({ verificationEmailSent: true });
  expect(createUser).toHaveBeenCalledWith(state.user.email, "synthetic-password", "Owner", "traveler");
});

it.each([{ email: {} }, { password: {} }, { name: {} }, { email: "invalid" }])("rejects malformed signup fields before account/database/email work: %j", async invalid => {
  const response = await signup(request({ ...signupBody(), ...invalid }));
  expect(response.status).toBe(400); expect(createUser).not.toHaveBeenCalled(); expect(state.writes).toHaveLength(0); expect(emails.sendVerificationEmail).not.toHaveBeenCalled();
});

it("does not return internal database/provider details in a failed signup response", async () => {
  createUser.mockRejectedValueOnce(new Error("postgresql://sensitive.invalid/internal-detail"));
  const response = await signup(request(signupBody())); expect(response.status).toBe(500);
  expect(await response.text()).not.toContain("sensitive.invalid");
});

it("restores the prior unused magic link on failed send so a retry is not blocked by the failed issuance cooldown", async () => {
  const priorToken = state.user.magicLinkToken; const priorExpires = state.user.magicLinkExpires;
  emails.sendMagicLinkEmail.mockRejectedValueOnce(new Error("Synthetic provider unavailable"));
  const response = await requestMagic(request({ email: state.user.email }));
  expect(await response.json()).toMatchObject({ ok: true });
  await state.callbacks.shift()!();
  expect(state.user.magicLinkToken).toBe(priorToken); expect(state.user.magicLinkExpires).toBe(priorExpires);
  await requestMagic(request({ email: state.user.email })); await state.callbacks.shift()!();
  expect(emails.sendMagicLinkEmail).toHaveBeenCalledTimes(2); expect(state.user.magicLinkToken).not.toBe(priorToken);
});

it("allows only one concurrent issuance from the same snapshot and never restores over a newer token", async () => {
  await requestMagic(request({ email: state.user.email })); await requestMagic(request({ email: state.user.email }));
  await state.callbacks[0](); await state.callbacks[1]();
  expect(emails.sendMagicLinkEmail).toHaveBeenCalledOnce();
  state.user.magicLinkExpires = new Date(Date.now() + 13 * 60_000);
  const newer = "f".repeat(64);
  emails.sendMagicLinkEmail.mockImplementationOnce(async () => { state.user.magicLinkToken = newer; throw new Error("Synthetic newer attempt"); });
  await requestMagic(request({ email: state.user.email })); await state.callbacks[2]();
  expect(state.user.magicLinkToken).toBe(newer);
});
