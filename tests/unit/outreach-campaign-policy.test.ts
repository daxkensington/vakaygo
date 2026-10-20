import { describe, expect, it } from "vitest";
import { checkCampaignSendingWindow, evaluateCampaignHealth, providerAllowsPermission } from "@/lib/outreach-campaign-policy";
const healthy = { stage: 0, stageStartedAt: "2026-10-10T12:00:00Z", now: new Date("2026-10-20T12:00:00Z"), prerequisitesReady: true,
  telemetryHealthy: true, accepted: 100, bounced: 1, complained: 0, uncertain: 0, overdue: 0, matureAccepted: 50, matureResolved: 50 };
describe("measured campaign growth", () => {
  it("requires a mature complete cohort, healthy results and at least 72 hours", () => {
    expect(evaluateCampaignHealth(healthy).nextStageAllowed).toBe(true);
    expect(evaluateCampaignHealth({ ...healthy, matureAccepted: 49, matureResolved: 49 }).nextStageAllowed).toBe(false);
    expect(evaluateCampaignHealth({ ...healthy, matureResolved: 49 }).nextStageAllowed).toBe(false);
    expect(evaluateCampaignHealth({ ...healthy, stageStartedAt: "2026-10-19T12:00:00Z" }).nextStageAllowed).toBe(false);
  });
  it.each([{ bounced: 2 }, { complained: 1 }, { uncertain: 1 }, { overdue: 1 }, { telemetryHealthy: false }, { prerequisitesReady: false }, { stage: 5 }, { accepted: NaN }])("holds unsafe evidence %j", change => {
    expect(evaluateCampaignHealth({ ...healthy, ...change }).ready).toBe(false);
  });
  it("does not transfer business-outreach permission to an opt-in provider", () => {
    expect(providerAllowsPermission("resend", "business_outreach_permission")).toBe(false);
    expect(providerAllowsPermission("mailforge", "business_outreach_permission")).toBe(true);
    expect(providerAllowsPermission("unknown", "explicit_opt_in")).toBe(false);
  });
  it("holds recent bounces with no accepted denominator and uses the strict two-percent boundary", () => {
    expect(evaluateCampaignHealth({ ...healthy, accepted: 0, bounced: 1 }).ready).toBe(false);
    expect(evaluateCampaignHealth({ ...healthy, accepted: 50, bounced: 1 }).ready).toBe(false);
    expect(evaluateCampaignHealth({ ...healthy, accepted: 51, bounced: 1 }).ready).toBe(true);
  });
});
describe("campaign local hours", () => {
  it.each([
    ["grenada", "2026-10-20T12:59:59Z", false], ["grenada", "2026-10-20T13:00:00Z", true],
    ["grenada", "2026-10-20T20:59:59Z", true], ["grenada", "2026-10-20T21:00:00Z", false],
    ["grenada", "2026-10-24T14:00:00Z", false], ["unknown", "2026-10-20T14:00:00Z", false],
    ["santorini", "2026-10-23T06:00:00Z", true], ["santorini", "2026-10-26T06:00:00Z", false],
    ["santorini", "2026-10-26T07:00:00Z", true],
  ])("%s at %s => %s", (destination, time, allowed) => {
    expect(checkCampaignSendingWindow(destination as string, new Date(time as string)).allowed).toBe(allowed);
  });
});
