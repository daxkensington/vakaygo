// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ query: vi.fn(), auth: vi.fn(), expire: vi.fn(), revalidate: vi.fn(), error: vi.fn(), send: vi.fn() }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => ({ query: state.query }) }));
vi.mock("@/server/admin-auth", () => ({ requireAdmin: state.auth }));
vi.mock("@/server/booking-checkout-safety", () => ({ expireListingPendingCheckouts: state.expire }));
vi.mock("@/lib/revalidate-listing", () => ({ revalidateListing: state.revalidate }));
vi.mock("@/server/payout-profiles", () => ({ maskAccountNumber: (value: string) => value }));
vi.mock("@/lib/logger", () => ({ logger: { error: state.error } }));
vi.mock("@/server/mail-client", () => ({ sendEmail: state.send }));
import { PATCH } from "@/app/api/admin/payout-profiles/route";
import { OPERATOR_TERMS_VERSION } from "@/lib/operator-terms";

const listingId = "20000000-0000-4000-8000-000000000001";
const operatorId = "10000000-0000-4000-8000-000000000001";
const profileId = "30000000-0000-4000-8000-000000000001";
const profile = { id: profileId, listing_id: listingId, operator_id: operatorId, status: "verified" };
const request = (decision = "verified") => new Request("https://vakaygo.com/api/admin/payout-profiles", { method: "PATCH", body: JSON.stringify({ action: "review_profile", profileId, decision }) });

beforeEach(() => {
  Object.values(state).forEach(mock => mock.mockReset());
  state.auth.mockResolvedValue({ ok: true, userId: "synthetic-admin" });
  state.expire.mockResolvedValue(undefined);
  state.revalidate.mockResolvedValue(undefined);
  state.send.mockResolvedValue(undefined);
  state.query.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.includes("UPDATE operator_payout_profiles")) return [{ ...profile, status: params?.[1] === "verified" ? "verified" : "rejected" }];
    if (sql.includes("vakaygo_activate_listing")) return [{ activated: false }];
    return [];
  });
});

it("uses locked canonical activation for the profile's operator and keeps verification distinct when current terms fail", async () => {
  const response = await PATCH(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ success: true, profile, listingActivated: false });
  expect(state.query).toHaveBeenCalledWith("SELECT CASE WHEN vakaygo_operator_terms_version()=$3::text THEN vakaygo_activate_listing($1::uuid,$2::uuid) ELSE false END AS activated", [listingId, operatorId, OPERATOR_TERMS_VERSION]);
  expect(state.query.mock.calls.some(([sql]) => /UPDATE listing_onboarding/.test(sql))).toBe(false);
  expect(state.expire).not.toHaveBeenCalled();
  expect(state.revalidate).toHaveBeenCalledExactlyOnceWith(listingId);
});

it("makes canonical activation conditional on the database enforcing this application's exact terms version", async () => {
  const response = await PATCH(request());
  expect(await response.json()).toMatchObject({ success: true, profile, listingActivated: false });
  const activation = state.query.mock.calls.find(([sql]) => sql.includes("vakaygo_activate_listing"))!;
  expect(activation[0]).toMatch(/^SELECT CASE WHEN vakaygo_operator_terms_version\(\)=\$3::text THEN vakaygo_activate_listing\(\$1::uuid,\$2::uuid\) ELSE false END AS activated$/);
  expect(activation[1]).toEqual([listingId, operatorId, OPERATOR_TERMS_VERSION]);
  expect(activation[1][2]).not.toBe("2026-09-06");
  expect(state.query.mock.calls.some(([sql]) => /UPDATE listing_onboarding/.test(sql))).toBe(false);
});

it("reports saved verification and unconfirmed activation truthfully when the activation operation fails", async () => {
  state.query.mockImplementation(async (sql: string) => {
    if (sql.includes("UPDATE operator_payout_profiles")) return [profile];
    if (sql.includes("vakaygo_activate_listing")) throw new Error("private-database-detail");
    return [];
  });
  const response = await PATCH(request());
  const body = await response.json();
  expect(response.status).toBe(200);
  expect(body).toMatchObject({ success: true, profile, listingActivated: null });
  expect(body.warning).toContain("payout profile was verified");
  expect(body.warning).toContain("activation could not be confirmed");
  expect(JSON.stringify(body)).not.toContain("private-database-detail");
  expect(state.query.mock.calls.some(([sql]) => /UPDATE listing_onboarding/.test(sql))).toBe(false);
  expect(state.error).toHaveBeenCalledOnce();
});

it("can finalize verified setup without claiming that deployment booking launch is enabled", async () => {
  state.query.mockImplementation(async (sql: string) => {
    if (sql.includes("UPDATE operator_payout_profiles")) return [profile];
    if (sql.includes("vakaygo_activate_listing")) return [{ activated: true }];
    if (sql.includes("SELECT u.email")) return [{ email: "operator@example.invalid", name: "Owner", title: "Synthetic Tour", bookable: true }];
    return [];
  });
  const response = await PATCH(request());
  expect(await response.json()).toMatchObject({ success: true, listingActivated: true });
  await vi.waitFor(() => expect(state.send).toHaveBeenCalledOnce());
  expect(state.send.mock.calls[0][0].html).toContain("Payout verification alone does not enable bookings");
  expect(state.send.mock.calls[0][0].html).not.toContain("active and accepting online bookings");
});

it.each(["rejected", "revoked"])("retains revocation and pending-checkout expiry when a payout profile is %s", async decision => {
  const response = await PATCH(request(decision));
  expect(response.status).toBe(200);
  expect(state.query.mock.calls.some(([sql]) => sql.includes("vakaygo_activate_listing"))).toBe(false);
  expect(state.query).toHaveBeenCalledWith(expect.stringContaining("SET activated_at = NULL"), [listingId]);
  expect(state.expire).toHaveBeenCalledExactlyOnceWith(listingId);
});

it("keeps historical settlement completion independent from new-listing activation requirements", async () => {
  const payout = { id: "historical-payout", operator_id: operatorId, amount: "125.00", currency: "USD" };
  state.query.mockImplementation(async (sql: string) => sql.includes("UPDATE payouts") ? [payout] : []);
  const response = await PATCH(new Request("https://vakaygo.com/api/admin/payout-profiles", {
    method: "PATCH", body: JSON.stringify({ action: "complete_payout", payoutId: payout.id, paymentReference: "settlement-reference" }),
  }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ success: true, payout });
  expect(state.query.mock.calls.some(([sql]) => sql.includes("vakaygo_activate_listing"))).toBe(false);
  expect(state.expire).not.toHaveBeenCalled();
});
