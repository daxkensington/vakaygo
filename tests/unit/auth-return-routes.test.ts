import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  cookies: new Map<string, string>(), cookieOptions: new Map<string, Record<string, unknown>>(),
  rows: [] as unknown[][], callbacks: [] as (() => Promise<void>)[], writes: [] as unknown[],
  identity: { id: "synthetic-user", email: "traveler@example.invalid", name: "Synthetic traveler", role: "traveler", sessionVersion: 1 },
}));
const cookieStore = vi.hoisted(() => ({
  get: vi.fn((name: string) => state.cookies.has(name) ? { value: state.cookies.get(name) } : undefined),
  set: vi.fn((name: string, value: string, options: Record<string, unknown>) => { state.cookies.set(name, value); state.cookieOptions.set(name, options); }),
  delete: vi.fn((name: string) => state.cookies.delete(name)),
}));
const email = vi.hoisted(() => ({ sendMagicLinkEmail: vi.fn(async (params: { url: string; to: string; name: string }) => { void params; }), sendWelcomeEmail: vi.fn(async (params: unknown) => { void params; }), sendVerificationEmail: vi.fn(async (params: unknown) => { void params; }) }));
const auth = vi.hoisted(() => ({ setSessionCookie: vi.fn(async () => {}), requireUser: vi.fn(async () => ({ ok: true, userId: "synthetic-user", sessionVersion: 1 })) }));
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));
vi.mock("next/server", async importOriginal => ({ ...await importOriginal<typeof import("next/server")>(), after: (callback: () => Promise<void>) => state.callbacks.push(callback) }));
vi.mock("@/server/email", () => email);
vi.mock("@/server/admin-auth", () => auth);
vi.mock("@/server/auth", () => ({ createUser: async () => state.identity }));
vi.mock("@/server/email-identity", () => ({ establishEmailIdentity: async () => state.identity, consumeEmailIdentityToken: vi.fn(), validNewPassword: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("@neondatabase/serverless", () => ({ neon: vi.fn(() => ({})) }));
vi.mock("drizzle-orm/neon-http", () => ({ drizzle: () => ({
  select: () => { const query = { from: () => query, where: () => query, limit: async () => state.rows.shift() || [] }; return query; },
  update: () => ({ set: (values: unknown) => ({ where: () => { state.writes.push(values); return Object.assign(Promise.resolve(), { returning: async () => [{ id: "synthetic-user" }] }); } }) }),
  insert: () => ({ values: (values: Record<string, unknown>) => { state.writes.push(values); return Object.assign(Promise.resolve(), { returning: async () => [{ ...state.identity, ...(values.role ? { role: values.role } : {}) }] }); } }),
}) }));
import { GET as startGoogle } from "@/app/api/auth/google/route";
import { GET as finishGoogle } from "@/app/api/auth/google/callback/route";
import { POST as requestMagic } from "@/app/api/auth/magic-link/route";
import { POST as signup } from "@/app/api/auth/signup/route";
import { POST as resendVerification } from "@/app/api/auth/verify-email/route";
import { GET as openVerification } from "@/app/api/auth/verify-email/confirm/route";

const listing = "/barbados/synthetic-cafe";
const claim = "20000000-0000-4000-8000-000000000009";
const token = "a".repeat(64);
const oauthCookies = ["oauth_state", "oauth_claim", "oauth_next", "oauth_redirect_uri"];
const location = (response: Response) => new URL(response.headers.get("location")!);
const post = (body: unknown) => new Request("https://vakaygo.com/api/auth/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks(); state.cookies.clear(); state.cookieOptions.clear(); state.rows = []; state.callbacks = []; state.writes = [];
  vi.stubEnv("GOOGLE_CLIENT_ID", "synthetic-client"); vi.stubEnv("GOOGLE_CLIENT_SECRET", "synthetic-secret"); vi.stubEnv("DATABASE_URL", "postgresql://synthetic.invalid/test");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://vakaygo.com");
  fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "synthetic-token" })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: "synthetic-google", email: state.identity.email, verified_email: true, name: state.identity.name })));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

function prepareCallback(next: unknown = listing, boundState = "synthetic-state") {
  state.cookies.set("oauth_state", "synthetic-state");
  state.cookies.set("oauth_next", JSON.stringify({ state: boundState, next }));
  state.cookies.set("oauth_redirect_uri", "https://vakaygo.com/api/auth/google/callback");
  state.rows = [[{ ...state.identity, emailVerified: true, totpEnabled: false }], [{ id: "synthetic-account" }]];
}

describe("Google auth continuation", () => {
  it("binds an explicit business signup choice to the matching OAuth state for a new account", async () => {
    const started = await startGoogle(new Request("https://vakaygo.com/api/auth/google?role=operator"));
    const oauthState = location(started).searchParams.get("state");
    expect(JSON.parse(state.cookies.get("oauth_role")!)).toEqual({ state: oauthState, role: "operator" });
    state.rows = [[]];
    const finished = await finishGoogle(new Request(`https://vakaygo.com/api/auth/google/callback?code=synthetic-code&state=${oauthState}`));
    expect(state.writes.some(value => (value as { role?: string }).role === "operator")).toBe(true);
    expect(location(finished).pathname).toBe("/operator");
    expect(state.cookies.has("oauth_role")).toBe(false);
  });

  it.each([{ state: "older-state", role: "operator" }, { state: "synthetic-state", role: "admin" }])("ignores an unmatched or privileged Google signup role %j", async roleChoice => {
    prepareCallback(null); state.cookies.set("oauth_role", JSON.stringify(roleChoice)); state.rows = [[]];
    const finished = await finishGoogle(new Request("https://vakaygo.com/api/auth/google/callback?code=synthetic-code&state=synthetic-state"));
    expect(state.writes.some(value => (value as { role?: string }).role === "traveler")).toBe(true);
    expect(location(finished).pathname).toBe("/explore");
  });

  it("preserves an existing account role and keeps the selected business choice on a valid cancelled attempt", async () => {
    prepareCallback(null); state.cookies.set("oauth_role", JSON.stringify({ state: "synthetic-state", role: "operator" }));
    const finished = await finishGoogle(new Request("https://vakaygo.com/api/auth/google/callback?code=synthetic-code&state=synthetic-state"));
    expect(location(finished).pathname).toBe("/explore");
    expect(state.writes.some(value => "role" in (value as Record<string, unknown>))).toBe(false);
    prepareCallback(null); state.cookies.set("oauth_role", JSON.stringify({ state: "synthetic-state", role: "operator" }));
    const cancelled = await finishGoogle(new Request("https://vakaygo.com/api/auth/google/callback?error=access_denied&state=synthetic-state"));
    expect(location(cancelled).searchParams.get("role")).toBe("operator");
    expect(location(cancelled).searchParams.get("error")).toBe("google_denied");
  });

  it("binds a valid listing return to the generated OAuth state using a short HttpOnly cookie", async () => {
    const response = await startGoogle(new Request(`https://vakaygo.com/api/auth/google?next=${encodeURIComponent(listing)}`));
    const oauth = location(response);
    const continuation = JSON.parse(state.cookies.get("oauth_next")!);
    expect(oauth.hostname).toBe("accounts.google.com");
    expect(continuation).toEqual({ state: oauth.searchParams.get("state"), next: listing });
    expect(state.cookieOptions.get("oauth_next")).toMatchObject({ httpOnly: true, sameSite: "lax", maxAge: 600, path: "/" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["", "?next=https%3A%2F%2Fevil.example", "?next=%2F%252f%252fevil.example"])("clears an old return on a new start %s", async query => {
    prepareCallback();
    await startGoogle(new Request(`https://vakaygo.com/api/auth/google${query}`));
    expect(state.cookies.has("oauth_next")).toBe(false);
    expect(state.cookies.has("oauth_claim")).toBe(false);
  });

  it("keeps claim precedence and removes any prior general continuation", async () => {
    prepareCallback();
    await startGoogle(new Request(`https://vakaygo.com/api/auth/google?claim=${claim}&next=${encodeURIComponent(listing)}`));
    expect(state.cookies.get("oauth_claim")).toBe(claim);
    expect(state.cookies.has("oauth_next")).toBe(false);
  });

  it("returns a successful verified OAuth attempt to the listing and clears all attempt cookies", async () => {
    prepareCallback();
    const response = await finishGoogle(new Request("https://vakaygo.com/api/auth/google/callback?code=synthetic-code&state=synthetic-state"));
    expect(location(response).pathname).toBe(listing);
    expect(auth.setSessionCookie).toHaveBeenCalledOnce();
    for (const cookie of oauthCookies) expect(state.cookies.has(cookie)).toBe(false);
  });

  it("retains claim precedence even if both continuation cookies are supplied", async () => {
    prepareCallback(); state.cookies.set("oauth_claim", claim);
    const response = await finishGoogle(new Request("https://vakaygo.com/api/auth/google/callback?code=synthetic-code&state=synthetic-state"));
    expect(location(response).pathname).toBe(`/operator/claim/${claim}`);
  });

  it.each(["https://evil.example", "//evil.example", "/%2fevil.example", "/\\evil.example"])("revalidates unsafe stored continuation %s", async unsafe => {
    prepareCallback(unsafe);
    const response = await finishGoogle(new Request("https://vakaygo.com/api/auth/google/callback?code=synthetic-code&state=synthetic-state"));
    expect(location(response).origin).toBe("https://vakaygo.com");
    expect(location(response).pathname).toBe("/explore");
  });

  it("ignores a continuation from a different attempt", async () => {
    prepareCallback(listing, "old-state");
    const response = await finishGoogle(new Request("https://vakaygo.com/api/auth/google/callback?code=synthetic-code&state=synthetic-state"));
    expect(location(response).pathname).toBe("/explore");
  });

  it("keeps the listing for a cancellation only when the returned state matches", async () => {
    prepareCallback();
    const response = await finishGoogle(new Request("https://vakaygo.com/api/auth/google/callback?error=access_denied&state=synthetic-state"));
    expect(location(response).searchParams.get("error")).toBe("google_denied");
    expect(location(response).searchParams.get("next")).toBe(listing);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(auth.setSessionCookie).not.toHaveBeenCalled();
    for (const cookie of oauthCookies) expect(state.cookies.has(cookie)).toBe(false);
  });

  it.each(["?code=synthetic-code&state=wrong-state", "?error=access_denied", ""])("rejects old or malformed callbacks without reading or destroying a newer attempt: %s", async query => {
    prepareCallback();
    const response = await finishGoogle(new Request(`https://vakaygo.com/api/auth/google/callback${query}`));
    expect(location(response).searchParams.has("next")).toBe(false);
    expect(cookieStore.get).not.toHaveBeenCalledWith("oauth_next");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(auth.setSessionCookie).not.toHaveBeenCalled();
    expect(state.cookies.get("oauth_state")).toBe("synthetic-state");
    expect(state.cookies.get("oauth_next")).toBe(JSON.stringify({ state: "synthetic-state", next: listing }));
  });

  it("clears old attempt cookies even when the provider is unconfigured", async () => {
    prepareCallback(); vi.stubEnv("GOOGLE_CLIENT_ID", "");
    const response = await startGoogle(new Request(`https://vakaygo.com/api/auth/google?next=${encodeURIComponent(listing)}`));
    expect(location(response).searchParams.get("next")).toBe(listing);
    for (const cookie of oauthCookies) expect(state.cookies.has(cookie)).toBe(false);
    prepareCallback();
    await finishGoogle(new Request("https://vakaygo.com/api/auth/google/callback?code=x&state=synthetic-state"));
    for (const cookie of oauthCookies) expect(state.cookies.has(cookie)).toBe(false);
  });
  it.each(["", "REPLACE_WITH_YOUR_GOOGLE_CLIENT_ID"])("preserves explicit business intent on unavailable Google start %s", async clientId => {
    prepareCallback(); state.cookies.set("oauth_role", JSON.stringify({ state: "older-state", role: "operator" }));
    vi.stubEnv("GOOGLE_CLIENT_ID", clientId);
    const result = await startGoogle(new Request(`https://vakaygo.com/api/auth/google?role=operator&next=${encodeURIComponent(listing)}`));
    expect(location(result).searchParams.get("role")).toBe("operator");
    expect(location(result).searchParams.get("next")).toBe(listing);
    expect(location(result).searchParams.get("error")).toBe("oauth_not_configured");
    expect(state.cookies.has("oauth_role")).toBe(false); expect(fetchMock).not.toHaveBeenCalled();
    const invalidRole = await startGoogle(new Request("https://vakaygo.com/api/auth/google?role=admin"));
    expect(location(invalidRole).searchParams.has("role")).toBe(false);
  });

  it("preserves the validated listing for retry after a provider failure and clears cookies", async () => {
    prepareCallback(); fetchMock.mockReset().mockResolvedValue(new Response("synthetic rejection", { status: 503 }));
    const response = await finishGoogle(new Request("https://vakaygo.com/api/auth/google/callback?code=synthetic-code&state=synthetic-state"));
    expect(location(response).searchParams.get("error")).toBe("token_exchange_failed");
    expect(location(response).searchParams.get("next")).toBe(listing);
    expect(auth.setSessionCookie).not.toHaveBeenCalled();
    for (const cookie of oauthCookies) expect(state.cookies.has(cookie)).toBe(false);
  });
});

describe("email continuation", () => {
  it("adds the listing to a deferred magic email while retaining anti-enumeration and no synchronous write", async () => {
    state.rows = [[{ ...state.identity, magicLinkExpires: null }]];
    const response = await requestMagic(post({ email: state.identity.email, next: listing }));
    expect(await response.json()).toEqual({ ok: true, message: "If an account exists for that email, a sign-in link is on its way." });
    expect(state.writes).toEqual([]); expect(email.sendMagicLinkEmail).not.toHaveBeenCalled();
    await state.callbacks[0]();
    const params = email.sendMagicLinkEmail.mock.calls[0][0] as { url: string };
    expect(new URL(params.url).searchParams.get("next")).toBe(listing);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the same response for unknown accounts and drops unsafe email continuation", async () => {
    const response = await requestMagic(post({ email: "unknown@example.invalid", next: "//evil.example" }));
    expect(response.status).toBe(200); await state.callbacks[0]();
    expect(state.writes).toEqual([]); expect(email.sendMagicLinkEmail).not.toHaveBeenCalled();
    state.rows = [[{ ...state.identity, magicLinkExpires: null }]]; state.callbacks = [];
    await requestMagic(post({ email: state.identity.email, next: "//evil.example" })); await state.callbacks[0]();
    const params = email.sendMagicLinkEmail.mock.calls[0][0] as { url: string };
    expect(new URL(params.url).searchParams.has("next")).toBe(false);
  });

  it("carries signup and authenticated verification resend into the verification email", async () => {
    const response = await signup(post({ email: state.identity.email, password: "synthetic-password", name: state.identity.name, next: listing }));
    expect(response.status).toBe(200);
    expect(email.sendVerificationEmail).toHaveBeenCalledWith(expect.objectContaining({ next: listing }));
    state.rows = [[{ ...state.identity, emailVerified: false }]];
    await resendVerification(post({ next: listing }));
    expect(email.sendVerificationEmail).toHaveBeenLastCalledWith(expect.objectContaining({ next: listing }));
    expect(auth.setSessionCookie).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards a safe inbox link to the confirmation page without consuming it", async () => {
    const response = await openVerification(new NextRequest(`https://vakaygo.com/api/auth/verify-email/confirm?token=${token}&next=${encodeURIComponent(listing)}`));
    expect(location(response).pathname).toBe("/auth/verify-email");
    expect(location(response).searchParams.get("next")).toBe(listing);
    expect(location(response).searchParams.get("token")).toBe(token);
    expect(auth.setSessionCookie).not.toHaveBeenCalled();
    expect(state.writes).toEqual([]);
  });

  it("keeps claim precedence on inbox redirects and drops malicious general returns", async () => {
    const claimed = await openVerification(new NextRequest(`https://vakaygo.com/api/auth/verify-email/confirm?token=${token}&claim=${claim}&next=${encodeURIComponent(listing)}`));
    expect(location(claimed).searchParams.get("claim")).toBe(claim);
    expect(location(claimed).searchParams.has("next")).toBe(false);
    const unsafe = await openVerification(new NextRequest(`https://vakaygo.com/api/auth/verify-email/confirm?token=${token}&next=%2F%252f%252fevil.example`));
    expect(location(unsafe).searchParams.has("next")).toBe(false);
  });
});
