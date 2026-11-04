// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
const sendTeam = vi.hoisted(() => vi.fn());
const sendReceived = vi.hoisted(() => vi.fn());
const logger = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => ({ query }) }));
vi.mock("@/server/email-requests", () => ({ sendListingInquiryToTeam: sendTeam, sendListingInquiryReceived: sendReceived }));
vi.mock("@/lib/logger", () => ({ logger }));
import { POST } from "@/app/api/listings/inquiries/route";

const listingId = "11111111-1111-4111-8111-111111111111";
const inquiryId = "22222222-2222-4222-8222-222222222222";
const valid = () => ({ listingId, email: " Traveler@Example.invalid ", startDate: "2099-12-10", endDate: "2099-12-12", partySize: 2, message: "  <script>not executable</script>  ", website: "" });
const details = () => ({ id: inquiryId, team_notified_at: null, traveler_notified_at: null, title: "<Synthetic Tour>", slug: "synthetic-tour", business_phone: "+1 555 0100", business_website: "https://business.example", island_name: "Grenada", island_slug: "grenada" });
function request(body: unknown, origin = "https://vakaygo.com") {
  return new NextRequest("https://vakaygo.com/api/listings/inquiries", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: { "Content-Type": "application/json", Origin: origin } });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2099-12-01T12:00:00Z"));
  query.mockImplementation((sql: string) => {
    if (sql.includes("vakaygo_create_listing_inquiry")) return Promise.resolve([{ inquiry_id: inquiryId, created: true }]);
    if (sql.includes("FROM listing_inquiries")) return Promise.resolve([details()]);
    if (sql.includes("SET team_notified_at=now()")) return Promise.resolve([{ team_notified_at: "2099-12-01T12:00:00Z" }]);
    if (sql.includes("SET traveler_notified_at=now()")) return Promise.resolve([{ traveler_notified_at: "2099-12-01T12:00:00Z" }]);
    return Promise.resolve([]);
  });
  sendTeam.mockResolvedValue(undefined);
  sendReceived.mockResolvedValue(undefined);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("POST /api/listings/inquiries", () => {
  it("rejects cross-origin and malformed requests before database work", async () => {
    expect((await POST(request(valid(), "https://attacker.invalid"))).status).toBe(403);
    expect((await POST(request("{broken"))).status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    { ...valid(), listingId: "not-a-uuid" },
    { ...valid(), email: "not-an-email" },
    { ...valid(), partySize: 0 },
    { ...valid(), partySize: 2.5 },
    { ...valid(), startDate: "2099-02-30" },
    { ...valid(), startDate: "2020-01-01" },
    { ...valid(), endDate: "2099-12-09" },
    { ...valid(), message: "x".repeat(2001) },
  ])("rejects invalid input without database or email work: %j", async body => {
    expect((await POST(request(body))).status).toBe(400);
    expect(query).not.toHaveBeenCalled();
    expect(sendTeam).not.toHaveBeenCalled();
  });

  it("accepts a honeypot submission without storing or emailing it", async () => {
    const response = await POST(request({ ...valid(), website: "https://spam.example" }));
    expect(response.status).toBe(200);
    expect(query).not.toHaveBeenCalled();
    expect(sendTeam).not.toHaveBeenCalled();
  });

  it("normalizes the email, stores only an inquiry, and notifies team and traveler", async () => {
    const response = await POST(request(valid()));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, inquiryId, duplicate: false });
    const create = query.mock.calls.find(call => call[0].includes("vakaygo_create_listing_inquiry"));
    expect(create).toBeDefined();
    expect(create![1]).toEqual([listingId, "traveler@example.invalid", "2099-12-10", "2099-12-12", 2, "<script>not executable</script>"]);
    expect(query.mock.calls.every(call => !call[0].toLowerCase().includes("booking"))).toBe(true);
    expect(sendTeam).toHaveBeenCalledWith(expect.objectContaining({ inquiryId, listingTitle: "<Synthetic Tour>", travelerEmail: "traveler@example.invalid", partySize: 2, whenText: "2099-12-10 to 2099-12-12", message: "<script>not executable</script>" }));
    expect(sendReceived).toHaveBeenCalledWith(expect.objectContaining({ to: "traveler@example.invalid", listingTitle: "<Synthetic Tour>" }));
  });

  it("deduplicates a recent inquiry without resending accepted notifications", async () => {
    query.mockImplementation((sql: string) => {
      if (sql.includes("vakaygo_create_listing_inquiry")) return Promise.resolve([{ inquiry_id: inquiryId, created: false }]);
      if (sql.includes("FROM listing_inquiries")) return Promise.resolve([{ ...details(), team_notified_at: "2099-12-01T11:00:00Z", traveler_notified_at: "2099-12-01T11:00:00Z" }]);
      return Promise.resolve([]);
    });
    const response = await POST(request(valid()));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, inquiryId, duplicate: true });
    expect(sendTeam).not.toHaveBeenCalled();
    expect(sendReceived).not.toHaveBeenCalled();
  });

  it("returns a saved-inquiry retry state and releases the claim when team mail fails", async () => {
    sendTeam.mockRejectedValueOnce(new Error("sensitive-provider-detail"));
    const response = await POST(request(valid()));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Your inquiry is saved, but our team notification did not finish. Please retry in a moment.", code: "INQUIRY_SAVED", inquiryId });
    expect(sendReceived).not.toHaveBeenCalled();
    expect(query.mock.calls.some(call => call[0].includes("SET team_notified_at=NULL"))).toBe(true);
    expect(logger.error).toHaveBeenCalledWith("Listing inquiry team notification failed", expect.any(Error));
  });

  it("keeps team acceptance successful when the traveller acknowledgement fails", async () => {
    sendReceived.mockRejectedValueOnce(new Error("synthetic-acknowledgement-failure"));
    const response = await POST(request(valid()));
    expect(response.status).toBe(200);
    expect(sendTeam).toHaveBeenCalledOnce();
    expect(query.mock.calls.some(call => call[0].includes("SET traveler_notified_at=NULL"))).toBe(true);
  });

  it.each([
    ["VG_INQUIRY:LIMIT", 429],
    ["VG_INQUIRY:UNAVAILABLE", 409],
    ["VG_INQUIRY:INPUT", 400],
  ])("maps database policy error %s without exposing internals", async (code, status) => {
    query.mockReset();
    query.mockRejectedValue({ cause: { message: `prefix ${code} sensitive-detail` } });
    const response = await POST(request(valid()));
    expect(response.status).toBe(status);
    expect(JSON.stringify(await response.json())).not.toContain("sensitive-detail");
    expect(sendTeam).not.toHaveBeenCalled();
  });
});
