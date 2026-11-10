// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  candidates: [] as Record<string, unknown>[],
  capabilities: { agreement_stage: true, setup_links: true } as { agreement_stage: boolean; setup_links: boolean } | "error",
  inserted: [] as unknown[][],
  send: vi.fn<(params: { actionUrl: string; signsIn?: boolean; next: { title: string }; nudgeNumber: number; final: boolean }) => Promise<{ data: { id: string } }>>(async () => ({ data: { id: "synthetic-mail" } })),
}));
vi.mock("@neondatabase/serverless", () => ({
  neon: () => ({
    query: async (text: string, values: unknown[] = []) => {
      if (text.includes("pg_get_constraintdef")) { if (state.capabilities === "error") throw new Error("offline"); return [state.capabilities]; }
      if (text.includes("FROM listing_onboarding n")) return state.candidates;
      if (text.includes("FROM operator_payout_profiles p")) return [];
      if (text.includes("INSERT INTO operator_onboarding_nudges")) { state.inserted.push(values); return [{ id: "99999999-9999-4999-8999-999999999999" }]; }
      return [];
    },
  }),
}));
vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "synthetic-signing-secret-of-at-least-32-chars" } }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/business-onboarding", () => ({ OPERATOR_TERMS_VERSION: "2026-10-27" }));
vi.mock("@/server/email-requests", () => ({ sendOnboardingNudge: state.send, sendOnboardingReviewReminderToTeam: vi.fn() }));
vi.mock("@/server/notifications", () => ({ createNotification: vi.fn() }));
vi.mock("@/server/email-identity", () => ({ establishEmailIdentity: vi.fn() }));

import { SEND_SPACING_MS, runOnboardingNudges } from "@/server/onboarding-nudges";

const listingId = "25e24d36-50be-49e0-8847-28d9e1f0f131";
const operatorId = "22222222-2222-4222-8222-222222222222";
// Wednesday 11:15 in Santo Domingo.
const now = new Date("2026-11-11T15:15:00Z");

/** A business that finished company details under the September agreement and has had three "company details" reminders. */
const reaccept = (over: Record<string, unknown> = {}) => ({
  listing_id: listingId, operator_id: operatorId, title: "Faro a Colón", listing_status: "active",
  island_slug: "dominican-republic", island_name: "Dominican Republic", island_timezone: "America/Santo_Domingo",
  operator_email: "Owner@Example.invalid", operator_name: "Ronnie", business_name: null, email_verified: true, session_version: 4,
  business_legal_name: "Island Tours SRL", business_country: "DO", business_address: "Calle El Conde 504, Santo Domingo", representative_name: "Ronnie Mancebo",
  authority_accepted_at: "2026-10-21T23:49:09Z", terms_version: "2026-09-06", terms_accepted_at: "2026-10-21T23:49:09Z",
  stripe_account_id: null, provider_revoked_at: null, charges_enabled: false, payouts_enabled: false, details_submitted: false, card_payments_active: false, transfers_active: false,
  activated_at: null, suspended_at: null, progress_at: "2026-10-22T00:18:54Z", claim_valid: true, listing_valid: true,
  has_price: true, has_capacity: true, has_policy: true, has_open_dates: true, has_price_unit: true,
  payout_status: "pending_review", payout_revoked_at: null, w8ben_certified: true, w8ben_signed_at: "2026-10-22T00:18:54Z",
  opted_out: false, operator_last_nudged_at: "2026-11-04T16:15:02Z",
  history: [
    { stage: "business_details", sentAt: "2026-11-04T16:15:02Z" },
    { stage: "business_details", sentAt: "2026-10-27T20:15:02Z" },
    { stage: "business_details", sentAt: "2026-10-20T20:15:02Z" },
  ],
  ...over,
});

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgres://synthetic.invalid/db");
  vi.stubEnv("APP_URL", "https://vakaygo.com");
  state.candidates = [reaccept()]; state.capabilities = { agreement_stage: true, setup_links: true }; state.inserted = []; state.send.mockClear();
});

it("reminds a business about a revised agreement under its own stage, with a fresh count", async () => {
  const result = await runOnboardingNudges({ now, dryRun: true });
  expect(result.wouldSend).toEqual([expect.objectContaining({ listingId, stage: "agreement_update", nudgeNumber: 1, to: "owner@example.invalid" })]);
  expect(result.skipped).toEqual({});
});

it("keeps the old stage and its exhausted count until the database accepts the new stage", async () => {
  state.capabilities = { agreement_stage: false, setup_links: false };
  expect((await runOnboardingNudges({ now, dryRun: true })).skipped).toEqual({ max_reached: 1 });
  state.capabilities = "error";
  const result = await runOnboardingNudges({ now, dryRun: true });
  expect(result.wouldSend).toEqual([]); expect(result.skipped).toEqual({ max_reached: 1 });
});

it("does not give a fresh count to a business that never accepted any agreement and ignored three reminders", async () => {
  state.candidates = [reaccept({ terms_version: null, terms_accepted_at: null })];
  const result = await runOnboardingNudges({ now, dryRun: true });
  expect(result.wouldSend).toEqual([]); expect(result.skipped).toEqual({ max_reached: 1 });
});

it("caps the new stage at three reminders like every other step", async () => {
  state.candidates = [reaccept({ history: [1, 8, 15].map(day => ({ stage: "agreement_update", sentAt: `2026-10-${String(day).padStart(2, "0")}T16:15:00Z` })) })];
  expect((await runOnboardingNudges({ now, dryRun: true })).skipped).toEqual({ max_reached: 1 });
});

it("sends the agreement reminder with a one-time sign-in button when the database can record its use", async () => {
  vi.useFakeTimers();
  try {
    const run = runOnboardingNudges({ now });
    await vi.advanceTimersByTimeAsync(SEND_SPACING_MS * 4);
    const result = await run;
    expect(result.sent).toEqual([expect.objectContaining({ stage: "agreement_update", nudgeNumber: 1 })]);
    expect(state.inserted[0]).toEqual([listingId, operatorId, "agreement_update", "owner@example.invalid", now.toISOString()]);
    const mail = state.send.mock.calls[0][0];
    expect(mail.next.title).toBe("Accept the updated operator agreement");
    expect(mail.signsIn).toBe(true);
    const url = new URL(mail.actionUrl);
    expect(url.origin + url.pathname).toBe("https://vakaygo.com/auth/setup-link");
    expect(url.searchParams.get("next")).toBe(`/operator/onboarding/${listingId}`);
    expect(url.searchParams.get("token")).toMatch(/^99999999-9999-4999-8999-999999999999\.\d+\.[A-Za-z0-9_-]+$/);
  } finally { vi.useRealTimers(); }
});

it("sends the plain page link when the one-use marker is not in the database yet", async () => {
  state.capabilities = { agreement_stage: true, setup_links: false };
  vi.useFakeTimers();
  try {
    const run = runOnboardingNudges({ now });
    await vi.advanceTimersByTimeAsync(SEND_SPACING_MS * 4);
    await run;
    const mail = state.send.mock.calls[0][0];
    expect(mail.actionUrl).toBe(`https://vakaygo.com/operator/onboarding/${listingId}`);
    expect(mail.signsIn).toBe(false);
  } finally { vi.useRealTimers(); }
});
