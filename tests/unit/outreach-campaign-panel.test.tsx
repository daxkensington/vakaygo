import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CampaignPanel, OutreachPermissionForm } from "@/app/admin/outreach/campaign-panel";
import type { CampaignReport } from "@/lib/outreach-campaign-admin";
let root: Root, container: HTMLDivElement, fetchMock: ReturnType<typeof vi.fn>;
const endpoint = "/api/admin/outreach/campaign";
const report = (): CampaignReport => ({
  control: { enabled: false, stage: 0, provider: "resend", version: 8, stageStartedAt: "2026-10-20T00:00:00Z", updatedAt: "2026-10-20T00:00:00Z", pauseReason: "Awaiting review" }, caps: [18,24,32,44,60],
  prerequisites: { ready: false, reasons: ["sender_postal_address_missing"] }, health: { ready: false, reasons: ["telemetry_unavailable"], nextStageAllowed: false },
  metrics: { reserved24h: 0, accepted: 0, delivered: 0, bounced: 0, complained: 0, uncertain: 0, failed: 0, opened: 0, clicked: 0, matureAccepted: 0, matureResolved: 0, suppressions: 0, activePermissions: 0, linkVisits: 0, approvedClaimsFromLinks: 0 }, permissions: [],
});
const response = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));
beforeEach(() => {
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fetchMock = vi.fn(() => response(report())); vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const button = (text: string) => [...container.querySelectorAll("button")].find(element => element.textContent?.startsWith(text))!;
it("loads evidence using GET only and keeps unhealthy enable/promotion controls disabled", async () => {
  await act(async () => root.render(<CampaignPanel />));
  expect(fetchMock).toHaveBeenCalledTimes(1); expect(fetchMock.mock.calls[0][0]).toBe(endpoint);
  expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: "no-store" }); expect(fetchMock.mock.calls[0][1].method).toBeUndefined();
  expect(button("Enable").disabled).toBe(true); expect(button("Request next").disabled).toBe(true);
  expect(container.textContent).toContain("sender postal address missing"); expect(container.textContent).toContain("Opens and clicks can include scanners or proxies");
});
it("submits only an explicit reviewed control action and current version", async () => {
  const ready = report(); ready.prerequisites = { ready: true, reasons: [] }; ready.health = { ready: true, reasons: [], nextStageAllowed: false };
  fetchMock.mockImplementation(() => response(ready)); await act(async () => root.render(<CampaignPanel />));
  expect(button("Enable").disabled).toBe(false);
  await act(async () => button("Enable").click());
  const call = fetchMock.mock.calls.find(call => call[1]?.method === "POST")!;
  expect(call[0]).toBe(endpoint); expect(JSON.parse(call[1].body)).toEqual({ action: "enable", expectedVersion: 8 });
  expect(fetchMock.mock.calls.every(call => call[0] === endpoint)).toBe(true);
});
it("does not offer permission for a business without a saved recipient", async () => {
  await act(async () => root.render(<OutreachPermissionForm listingId="64000000-0000-4000-8000-000000000001" title="Synthetic business" email={null} onSaved={vi.fn()} />));
  expect(container.querySelector("form")).toBeNull(); expect(fetchMock).not.toHaveBeenCalled();
});
it("records exact per-listing recipient evidence without sending or enabling", async () => {
  const saved = vi.fn(); fetchMock.mockImplementation(() => response({ saved: true }));
  await act(async () => root.render(<OutreachPermissionForm listingId="64000000-0000-4000-8000-000000000001" title="Synthetic business" email="reviewed@audit.invalid" onSaved={saved} />));
  const form = container.querySelector("form")!; (form.elements.namedItem("evidence") as HTMLTextAreaElement).value = "Signed opt-in from reviewed recipient on 20 October 2026";
  await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(fetchMock).toHaveBeenCalledTimes(1); expect(fetchMock.mock.calls[0][0]).toBe(endpoint);
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ action: "grant_consent", recipientEmail: "reviewed@audit.invalid", expectedListingEmail: "reviewed@audit.invalid", provider: "resend", permissionKind: "explicit_opt_in" });
  expect(saved).toHaveBeenCalledTimes(1); expect(container.textContent).toContain("This did not send an email");
});
it("cannot present a business outreach permission as a Resend option", async () => {
  await act(async () => root.render(<OutreachPermissionForm listingId="64000000-0000-4000-8000-000000000001" title="Synthetic business" email="reviewed@audit.invalid" onSaved={vi.fn()} />));
  expect(container.querySelector<HTMLOptionElement>('option[value="business_outreach_permission"]')?.disabled).toBe(true);
  expect(container.querySelector('input[type="checkbox"]')).toBeNull(); expect(fetchMock).not.toHaveBeenCalled();
});
