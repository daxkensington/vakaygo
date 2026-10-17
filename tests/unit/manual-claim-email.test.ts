// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const listingId = "16100000-0000-4000-8000-000000000001";
const operatorId = "16000000-0000-4000-8000-000000000001";
const claimId = "16200000-0000-4000-8000-000000000001";
const state = vi.hoisted(() => ({
  query: vi.fn<(_parts: TemplateStringsArray, ..._values: unknown[]) => Promise<Record<string, unknown>[]>>(),
  mail: vi.fn<(_message: Record<string, unknown>) => Promise<void>>(),
  error: vi.fn(),
}));
vi.mock("@neondatabase/serverless", () => ({ neon: () => state.query }));
vi.mock("@/server/mail-client", () => ({ sendEmail: state.mail }));
vi.mock("@/lib/logger", () => ({ logger: { error: state.error } }));
vi.mock("@/lib/env", () => ({ SESSION_SECRET: () => "synthetic-test-only" }));
vi.mock("@/lib/revalidate-listing", () => ({ revalidateListing: vi.fn() }));
vi.mock("@/server/admin-auth", () => ({ requireUser: vi.fn() }));
vi.mock("@/server/claim-transactions", () => ({ CLAIM_REPLAY_SQL: "", FINISH_CLAIM_SQL: "", claimTransaction: vi.fn() }));
vi.mock("@/server/business-onboarding", () => ({
  OnboardingError: class extends Error {}, assertListingId: vi.fn(),
  completeClaimVerification: vi.fn(), getClaimStatus: vi.fn(), startClaimVerification: vi.fn(),
  requireCurrentOperator: async () => ({ ok: true, userId: "16000000-0000-4000-8000-000000000001", email: "owner&tag@example.invalid" }),
  onboardingErrorResponse: () => Response.json({ error: "Unexpected failure" }, { status: 503 }),
}));
import { POST } from "@/app/api/listings/claim/route";
const notes = '<a href="https://untrusted.example">Review claim</a>';
const request = () => new Request("https://synthetic.invalid/api/listings/claim", { method: "POST", body: JSON.stringify({ listingId, action: "request_review", notes, roleAtBusiness: "<b>Owner</b> & Manager", contactPhone: "<i>123</i>" }) });
const listing = () => ({ id: listingId, unclaimed: true, title: "<script>Tour</script>", operator_name: 'Owner & <img src=x onerror="alert(1)">' });
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("DATABASE_URL", "postgresql://synthetic.invalid/test");
  state.query.mockReset().mockResolvedValueOnce([listing()]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: claimId }]);
  state.mail.mockReset().mockResolvedValue();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected network access"); }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("renders every submitted value as email text while preserving stored notes and the201 pending claim contract", async () => {
  const response = await POST(request());
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ claim: { id: claimId, status: "pending" }, submitted: true });
  const message = state.mail.mock.calls[0][0];
  const html = String(message.html);
  expect(message.to).toBe("support@vakaygo.com");
  expect(html).toContain('Owner &amp; &lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  expect(html).toContain("owner&amp;tag@example.invalid");
  expect(html).toContain("&lt;script&gt;Tour&lt;/script&gt;");
  expect(html).toContain("&lt;b&gt;Owner&lt;/b&gt; &amp; Manager");
  expect(html).toContain("&lt;i&gt;123&lt;/i&gt;");
  expect(html).toContain('&lt;a href=&quot;https://untrusted.example&quot;&gt;Review claim&lt;/a&gt;');
  expect(html).not.toMatch(/<script|<img|<b>|<i>|<a href="https:\/\/untrusted/);
  expect(state.query.mock.calls[2].slice(1)).toContain(notes);
  expect(state.error).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
});
it("waits for notification acceptance before completing a successful submission", async () => {
  let release!: () => void;
  state.mail.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
  let settled = false;
  const pending = POST(request()).then(response => { settled = true; return response; });
  await vi.waitFor(() => expect(state.mail).toHaveBeenCalledOnce());
  expect(settled).toBe(false);
  release(); expect((await pending).status).toBe(201);
  expect(state.query).toHaveBeenCalledTimes(3); expect(fetch).not.toHaveBeenCalled();
});
it("keeps the saved claim successful and exposes a safe warning when notification delivery fails", async () => {
  const providerDetail = "synthetic-private-provider-detail";
  state.mail.mockRejectedValueOnce(new Error(providerDetail));
  const response = await POST(request());
  expect(response.status).toBe(201);
  const body = await response.json();
  expect(body).toMatchObject({ claim: { id: claimId, status: "pending" }, submitted: true });
  expect(body.notificationWarning).toContain("Your claim was saved for team review");
  expect(body.notificationWarning).toContain("do not need to submit again");
  expect(JSON.stringify(body)).not.toContain(providerDetail);
  expect(state.error).toHaveBeenCalledExactlyOnceWith("Manual claim notification unconfirmed", null, { claimId, listingId, operatorId });
  expect(JSON.stringify(state.error.mock.calls)).not.toContain(providerDetail);
  expect(state.query).toHaveBeenCalledTimes(3); expect(fetch).not.toHaveBeenCalled();
});
it("returns an existing pending claim without inserting or retrying any notification", async () => {
  state.query.mockReset().mockResolvedValueOnce([listing()]).mockResolvedValueOnce([{ id: claimId, status: "pending" }]);
  state.mail.mockRejectedValue(new Error("Must not resend"));
  const response = await POST(request());
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ claim: { id: claimId, status: "pending" }, submitted: true });
  expect(state.query).toHaveBeenCalledTimes(2); expect(state.mail).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
});
it("bounds a hung notification while preserving the saved claim and never claiming non-delivery", async () => {
  vi.useFakeTimers();
  let started!: () => void;
  const sending = new Promise<void>(resolve => { started = resolve; });
  state.mail.mockImplementationOnce(() => { started(); return new Promise<void>(() => {}); });
  const pending = POST(request());
  await sending;
  await vi.advanceTimersByTimeAsync(8_000);
  const response = await pending;
  expect(response.status).toBe(201);
  expect(await response.json()).toMatchObject({ claim: { id: claimId, status: "pending" }, submitted: true,
    notificationWarning: expect.stringContaining("notification could not be confirmed") });
  expect(state.mail).toHaveBeenCalledOnce(); expect(state.query).toHaveBeenCalledTimes(3); expect(fetch).not.toHaveBeenCalled();
});