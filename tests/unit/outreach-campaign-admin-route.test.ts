// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
const state = vi.hoisted(() => ({ auth: vi.fn(), read: vi.fn(), apply: vi.fn() }));
vi.mock("@/server/admin-auth", () => ({ requireAdmin: state.auth }));
vi.mock("@/server/outreach-campaign-control", () => ({
  readCampaignReport: state.read, applyCampaignAdminAction: state.apply,
  CampaignControlError: class extends Error { constructor(message: string, readonly status: number) { super(message); } },
}));
import { GET, POST } from "@/app/api/admin/outreach/campaign/route";
import { CampaignControlError } from "@/server/outreach-campaign-control";
import { parseCampaignAdminAction } from "@/lib/outreach-campaign-admin";

const actor = { ok: true, userId: "63000000-0000-4000-8000-000000000001", email: "reviewer@audit.invalid", sessionVersion: 3, role: "admin", emailVerified: true };
const grant = { action: "grant_consent", listingId: "64000000-0000-4000-8000-000000000001", recipientEmail: "business@audit.invalid", expectedListingEmail: "business@audit.invalid", provider: "resend", permissionKind: "explicit_opt_in", evidence: "Dated signed request from this recipient for VakayGo listing outreach." };
const request = (body: unknown, origin = "https://vakaygo.com", contentType = "application/json") => new NextRequest("https://vakaygo.com/api/admin/outreach/campaign", {
  method: "POST", headers: { origin, "content-type": contentType }, body: JSON.stringify(body),
});
beforeEach(() => { vi.clearAllMocks(); state.auth.mockResolvedValue(actor); state.read.mockResolvedValue({ control: { enabled: false } }); state.apply.mockResolvedValue(undefined); });

describe("admin campaign boundary", () => {
  it("reads reports without invoking any mutation and prevents caching", async () => {
    const response = await GET(); expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ control: { enabled: false } }); expect(state.apply).not.toHaveBeenCalled();
  });
  it.each([401, 403])("rejects unauthorized report and write access (%s)", async status => {
    state.auth.mockResolvedValue({ ok: false, error: NextResponse.json({ error: "Denied" }, { status }) });
    expect((await GET()).status).toBe(status); expect((await POST(request({ action: "enable", expectedVersion: 0 }))).status).toBe(status);
    expect(state.read).not.toHaveBeenCalled(); expect(state.apply).not.toHaveBeenCalled();
  });
  it.each([["https://other.invalid", "application/json"], ["null", "application/json"], ["https://vakaygo.com", "text/plain"]])("rejects cross-site or non-JSON writes before auth", async (origin, contentType) => {
    expect((await POST(request({ action: "enable", expectedVersion: 0 }, origin, contentType))).status).toBe(403);
    expect(state.auth).not.toHaveBeenCalled(); expect(state.apply).not.toHaveBeenCalled();
  });
  it("uses the server admin identity and a strict versioned action", async () => {
    const response = await POST(request({ action: "pause", expectedVersion: 7, reason: "Investigate delivery evidence" }));
    expect(response.status).toBe(200); expect(state.apply).toHaveBeenCalledExactlyOnceWith(actor, { action: "pause", expectedVersion: 7, reason: "Investigate delivery evidence" });
  });
  it.each([
    { action: "enable", expectedVersion: 0, healthReady: true },
    { action: "enable", expectedVersion: 0, provider: "arbitrary_smtp" },
    { action: "request_stage", expectedVersion: 0, stage: 5 },
    { action: "request_stage", expectedVersion: -1, stage: 1 },
    { ...grant, permissionKind: "business_outreach_permission", recipientCountry: "CA", policyReference: "Reviewed provider and country policy" },
    { ...grant, recipientEmail: "another@audit.invalid" },
    { ...grant, provider: "mailforge", permissionKind: "business_outreach_permission", recipientCountry: "ZZ", policyReference: "Reviewed provider and country policy" },
    { ...grant, provider: "mailforge", permissionKind: "business_outreach_permission", recipientCountry: "CA" },
  ])("rejects client attempts to bypass policy: %j", async body => {
    expect((await POST(request(body))).status).toBe(400); expect(state.apply).not.toHaveBeenCalled();
  });
  it("records future business permission evidence without enabling or sending", async () => {
    const body = { ...grant, provider: "mailforge", permissionKind: "business_outreach_permission", recipientCountry: "ca", policyReference: "Dated country and provider policy review in audit record 42" };
    expect((await POST(request(body))).status).toBe(200);
    expect(state.apply).toHaveBeenCalledExactlyOnceWith(actor, { ...body, recipientCountry: "CA" });
  });
  it("preserves a failed CAS as a conflict rather than retrying it", async () => {
    state.apply.mockRejectedValue(new CampaignControlError("Refresh the record.", 409));
    const response = await POST(request({ action: "enable", expectedVersion: 0 })); expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Refresh the record." }); expect(state.apply).toHaveBeenCalledTimes(1);
  });
  it("sanitizes underlying database failures", async () => {
    state.apply.mockRejectedValue(new Error("private database connection details"));
    const response = await POST(request({ action: "enable", expectedVersion: 0 })); expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private");
  });
  it("bounds review bodies", async () => {
    const response = await POST(request({ ...grant, evidence: "x".repeat(9000) }));
    expect(response.status).toBe(413); expect(state.apply).not.toHaveBeenCalled();
  });
});

it("normalizes the exact reviewed recipient without treating a different email as permission", () => {
  expect(parseCampaignAdminAction({ ...grant, recipientEmail: " Business@Audit.Invalid ", expectedListingEmail: "BUSINESS@audit.invalid" })).toMatchObject({ recipientEmail: "business@audit.invalid", expectedListingEmail: "business@audit.invalid" });
  expect(parseCampaignAdminAction({ ...grant, recipientEmail: "unreviewed@audit.invalid" })).toBeNull();
});
