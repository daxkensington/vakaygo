// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  secret: "synthetic-active-route-session-secret-at-least-32-characters",
  token: "", user: { role: "operator", email: "owner@example.invalid", email_verified: true, session_version: 2 },
  access: vi.fn(), provider: vi.fn(),
}));
vi.mock("@/lib/env", () => ({ env: { DATABASE_URL: "postgresql://synthetic.invalid/offline" }, SESSION_SECRET: () => new TextEncoder().encode(state.secret) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => state.token ? { value: state.token } : undefined }) }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => async () => [state.user] }));
vi.mock("drizzle-orm/neon-http", () => ({ drizzle: () => ({ select: state.access, insert: state.access, update: state.access, delete: state.access }) }));
vi.mock("@vercel/blob", () => ({ put: state.provider, del: state.provider }));
vi.mock("@/server/stripe", () => ({ createCheckoutSession: state.provider, retrieveCheckoutSession: state.provider, expireCheckoutSession: state.provider }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
import { createSessionToken } from "@/server/session-validation";
import * as history from "@/app/api/search-history/route";
import * as notifications from "@/app/api/notifications/route";
import * as phone from "@/app/api/auth/phone-verify/route";
import * as identity from "@/app/api/id-verification/route";
import * as loyalty from "@/app/api/loyalty/route";
import * as referrals from "@/app/api/referrals/route";
import * as disputes from "@/app/api/disputes/route";
import * as dispute from "@/app/api/disputes/[id]/route";
import * as reports from "@/app/api/reports/route";
import * as reviews from "@/app/api/reviews/route";
import * as vote from "@/app/api/reviews/vote/route";
import * as promo from "@/app/api/promo/route";
import * as bookings from "@/app/api/bookings/route";
import * as booking from "@/app/api/bookings/[bookingId]/route";
import * as voucher from "@/app/api/bookings/[bookingId]/voucher/route";
import * as upload from "@/app/api/upload/route";
import * as media from "@/app/api/upload/[id]/route";
import * as checkout from "@/app/api/payments/create-checkout/route";
import * as description from "@/app/api/ai/generate-description/route";
import * as image from "@/app/api/ai/generate-image/route";
import * as blog from "@/app/api/ai/generate-blog/route";
import * as translation from "@/app/api/ai/translate-listing/route";
import * as reply from "@/app/api/ai/suggest-reply/route";
import * as optimization from "@/app/api/ai/optimize-listing/route";
import * as insights from "@/app/api/ai/operator-insights/route";
import * as pricing from "@/app/api/ai/pricing-suggestions/route";

const id = "94000000-0000-4000-8000-000000000001";
const request = () => new NextRequest("https://test.invalid/api/test", { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
const context = () => ({ params: Promise.resolve({ id, bookingId: id }) });
const handlers: [string, () => Promise<Response>][] = [
  ["history GET", () => history.GET()], ["history POST", () => history.POST(request())], ["history DELETE", () => history.DELETE()],
  ["notifications GET", () => notifications.GET()], ["notifications PATCH", () => notifications.PATCH(request())],
  ["phone POST", () => phone.POST(request())], ["phone PUT", () => phone.PUT(request())],
  ["identity POST", () => identity.POST(request())], ["identity GET", () => identity.GET()], ["identity PUT", () => identity.PUT(request())],
  ["loyalty GET", () => loyalty.GET(request())], ["loyalty POST", () => loyalty.POST(request())],
  ["referrals GET", () => referrals.GET()], ["referrals POST", () => referrals.POST()],
  ["disputes GET", () => disputes.GET()], ["disputes POST", () => disputes.POST(request())],
  ["dispute GET", () => dispute.GET(request(), context())], ["dispute PATCH", () => dispute.PATCH(request(), context())],
  ["reports GET", () => reports.GET()], ["reports POST", () => reports.POST(request())],
  ["review POST", () => reviews.POST(request())], ["vote POST", () => vote.POST(request())], ["promo POST", () => promo.POST(request())],
  ["bookings GET", () => bookings.GET(request())], ["bookings POST", () => bookings.POST(request())],
  ["booking GET", () => booking.GET(request(), context())], ["booking PATCH", () => booking.PATCH(request(), context())],
  ["voucher GET", () => voucher.GET(request(), context())], ["upload POST", () => upload.POST(request())],
  ["media DELETE", () => media.DELETE(request(), context())], ["checkout POST", () => checkout.POST(request())],
  ["AI description", () => description.POST(request())], ["AI image", () => image.POST(request())], ["AI blog", () => blog.POST(request())],
  ["AI translation", () => translation.POST(request())], ["AI reply", () => reply.POST(request())],
  ["AI optimization", () => optimization.POST(request())], ["AI insights", () => insights.GET()], ["AI pricing", () => pricing.POST(request())],
];

beforeEach(async () => {
  vi.clearAllMocks();
  state.user = { role: "operator", email: "owner@example.invalid", email_verified: true, session_version: 2 };
  state.token = await createSessionToken({ id, email: state.user.email, role: "operator", sessionVersion: 1 });
  state.access.mockImplementation(() => { throw new Error("Unexpected protected data access"); });
  vi.stubGlobal("fetch", state.provider);
});
afterEach(() => vi.unstubAllGlobals());

it.each(handlers)("rejects a signed but revoked session directly in %s before data or provider access", async (_name, handler) => {
  const response = await handler();
  expect(response.status).toBe(401);
  expect(state.access).not.toHaveBeenCalled(); expect(state.provider).not.toHaveBeenCalled();
});

it.each(["role", "email", "verification"])("rejects current epoch with changed %s before paid generation", async changed => {
  state.user.session_version = 1;
  if (changed === "role") state.user.role = "traveler";
  if (changed === "email") state.user.email = "changed@example.invalid";
  if (changed === "verification") state.user.email_verified = false;
  expect((await description.POST(request())).status).toBe(401);
  expect(state.provider).not.toHaveBeenCalled();
});

it("retains valid operator access and anonymous history behavior", async () => {
  state.user.session_version = 1;
  expect((await description.POST(request())).status).toBe(400);
  state.token = "";
  expect(await (await history.GET()).json()).toEqual({ searches: [] });
  expect(state.access).not.toHaveBeenCalled(); expect(state.provider).not.toHaveBeenCalled();
});
