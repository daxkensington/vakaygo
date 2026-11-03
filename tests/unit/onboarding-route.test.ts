// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  auth: vi.fn(), status: vi.fn(), save: vi.fn(), activate: vi.fn(), neon: vi.fn(), revalidate: vi.fn(),
}));
vi.mock("@/server/business-onboarding", () => ({
  requireCurrentOperator: state.auth,
  getOnboardingStatus: state.status,
  saveOnboarding: state.save,
  activateOnboarding: state.activate,
  onboardingErrorResponse: (error: Error & { status?: number }) => Response.json({ error: error.message }, { status: error.status || 500 }),
}));
vi.mock("@neondatabase/serverless", () => ({ neon: state.neon }));
vi.mock("@/lib/revalidate-listing", () => ({ revalidateListing: state.revalidate }));
import { GET, PATCH, POST } from "@/app/api/operator/onboarding/[listingId]/route";
import { OPERATOR_TERMS_VERSION } from "@/lib/operator-terms";

const listingId = "20000000-0000-4000-8000-000000000001";
const operatorId = "10000000-0000-4000-8000-000000000001";
const context = () => ({ params: Promise.resolve({ listingId }) });
const request = (body: unknown) => new Request(`https://vakaygo.com/api/operator/onboarding/${listingId}`, { method: "POST", body: JSON.stringify(body) });
const status = {
  listingId, eligible: false, termsVersion: OPERATOR_TERMS_VERSION, activatedAt: "2026-10-20T12:00:00Z",
  requirements: { claim: true, business: true, representative: true, terms: false, listing: true, payments: false, activation: false },
  payoutProfile: { status: "verified", w8benCertified: true, revoked: false },
};

beforeEach(() => {
  Object.values(state).forEach(mock => mock.mockReset());
  state.auth.mockResolvedValue({ ok: true, userId: operatorId });
  state.status.mockResolvedValue(status);
  state.save.mockResolvedValue(status);
  state.activate.mockResolvedValue(status);
  state.neon.mockImplementation(() => { throw new Error("Unexpected direct database write"); });
});

it("returns canonical direct-payout readiness without overriding failed payment or activation checks", async () => {
  const response = await GET(new Request(`https://vakaygo.com/api/operator/onboarding/${listingId}?refresh=1`), context());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(status);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(state.status).toHaveBeenCalledExactlyOnceWith(listingId, operatorId, true);
});

it("preserves a genuine canonical activation rejection despite a seemingly ready direct payout profile", async () => {
  const failure = Object.assign(new Error("Accept the current operator terms before activating"), { status: 409 });
  state.activate.mockRejectedValueOnce(failure);
  state.status.mockResolvedValueOnce({ ...status, requirements: { ...status.requirements, terms: true, payments: true, activation: true } });
  const response = await POST(request({ action: "activate" }), context());
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: failure.message });
  expect(state.activate).toHaveBeenCalledExactlyOnceWith(listingId, operatorId);
  expect(state.status).not.toHaveBeenCalled();
  expect(state.neon).not.toHaveBeenCalled();
  expect(state.revalidate).not.toHaveBeenCalled();
});

it("returns canonical activation success and never performs a separate activation write", async () => {
  const activated = { ...status, activatedAt: "2026-10-27T12:00:00Z", requirements: { ...status.requirements, terms: true, payments: true, activation: true } };
  state.activate.mockResolvedValueOnce(activated);
  const response = await POST(request({ action: "activate" }), context());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(activated);
  expect(state.neon).not.toHaveBeenCalled();
});

it("passes the submitted exact consent version through to canonical save without changing the readiness receipt", async () => {
  const body = { business: { legalName: "Synthetic Company" }, authorityAccepted: true, termsAccepted: true, termsVersion: OPERATOR_TERMS_VERSION };
  const response = await PATCH(request(body), context());
  expect(response.status).toBe(200);
  expect(state.save).toHaveBeenCalledExactlyOnceWith(listingId, operatorId, body);
  expect(await response.json()).toEqual(status);
});

it("rejects an unrecognized activation action before any onboarding mutation", async () => {
  expect((await POST(request({ action: "skip_terms" }), context())).status).toBe(400);
  expect(state.activate).not.toHaveBeenCalled();
  expect(state.save).not.toHaveBeenCalled();
  expect(state.neon).not.toHaveBeenCalled();
});

it("honors an authentication failure without onboarding reads or writes", async () => {
  state.auth.mockResolvedValue({ ok: false, error: Response.json({ error: "Unauthorized" }, { status: 401 }) });
  expect((await POST(request({ action: "activate" }), context())).status).toBe(401);
  expect(state.activate).not.toHaveBeenCalled();
  expect(state.status).not.toHaveBeenCalled();
});
