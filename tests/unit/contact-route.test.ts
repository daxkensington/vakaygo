import { afterEach, beforeEach, expect, it, vi } from "vitest";

const sendEmail = vi.hoisted(() => vi.fn<(params: Record<string, unknown>) => Promise<void>>(async () => {}));
const logger = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("@/server/mail-client", () => ({ sendEmail }));
vi.mock("@/lib/logger", () => ({ logger }));
import { POST } from "@/app/api/contact/route";

const valid = () => ({ name: "Synthetic Visitor", email: "visitor@example.invalid", category: "Operator Support", subject: "Listing claim review", message: "Please review the synthetic business listing." });
const request = (body: unknown) => new Request("https://vakaygo.com/api/contact", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
beforeEach(() => { vi.clearAllMocks(); sendEmail.mockResolvedValue(); });
afterEach(() => vi.restoreAllMocks());

it.each([null, [], "text", 42])("rejects non-object contact payloads before email work: %j", async body => {
  expect((await POST(request(body))).status).toBe(400);
  expect(sendEmail).not.toHaveBeenCalled();
});

it("rejects malformed JSON before email work", async () => {
  const response = await POST(new Request("https://vakaygo.com/api/contact", { method: "POST", body: "{broken" }));
  expect(response.status).toBe(400); expect(sendEmail).not.toHaveBeenCalled();
});

it.each(["name", "email", "category", "subject", "message"])("rejects invalid types and trimmed empty %s before email work", async field => {
  for (const value of [{ unexpected: true }, 123, null, "   \n  "]) {
    expect((await POST(request({ ...valid(), [field]: value }))).status).toBe(400);
  }
  expect(sendEmail).not.toHaveBeenCalled();
});

it.each([["name", 120], ["email", 320], ["category", 80], ["subject", 200], ["message", 5000]] as const)("keeps the raw %s size cap even when excess content is whitespace", async (field, maximum) => {
  const response = await POST(request({ ...valid(), [field]: " ".repeat(maximum) + "x" }));
  expect(response.status).toBe(400); expect(sendEmail).not.toHaveBeenCalled();
});

it.each([{ email: "not-an-email" }, { email: "visitor@example.invalid\nBcc: recipient@example.invalid" }, { category: "Unrecognized" }])("rejects invalid email/category without email work: %j", async fields => {
  expect((await POST(request({ ...valid(), ...fields }))).status).toBe(400);
  expect(sendEmail).not.toHaveBeenCalled();
});

it("waits for provider acceptance, trims and escapes fields, and sends only to the internal recipient", async () => {
  let accept!: () => void;
  sendEmail.mockImplementationOnce(() => new Promise<void>(resolve => { accept = resolve; }));
  let completed = false;
  const pending = POST(request({ name: "  <Visitor>  ", email: " visitor@example.invalid ", category: " Operator Support ", subject: "  Review <listing>  ", message: "  <script>not executable</script>  ", to: "attacker@example.invalid" }))
    .then(response => { completed = true; return response; });
  await vi.waitFor(() => expect(sendEmail).toHaveBeenCalledOnce());
  expect(completed).toBe(false);
  expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "bookings@vakaygo.com", replyTo: "visitor@example.invalid", subject: "[Operator Support] Review &lt;listing&gt;" }));
  const sent = sendEmail.mock.calls[0][0] as { html: string };
  expect(sent.html).toContain("&lt;Visitor&gt;"); expect(sent.html).toContain("&lt;script&gt;"); expect(sent.html).not.toContain("<script>");
  accept(); const response = await pending;
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ success: true });
  expect(sendEmail).toHaveBeenCalledOnce();
});

it("returns a retryable failure without raw provider details or a false success", async () => {
  sendEmail.mockRejectedValueOnce(new Error("sensitive-provider-detail"));
  const response = await POST(request(valid()));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "Failed to send message. Please try again." });
  expect(logger.error).toHaveBeenCalledOnce(); expect(sendEmail).toHaveBeenCalledOnce();
});

it("sends a static business onboarding auto-reply to real domains without echoing untrusted message text", async () => {
  const response = await POST(request({
    name: "Caicos Rentals",
    email: "admin@caicosrentals.com",
    category: "Partnership",
    subject: "Claim Business Listing",
    message: "We would like to add our business (Caicos Rentals) to your site. UNTRUSTED_PAYLOAD_MARKER",
  }));
  expect(response.status).toBe(200);
  expect(sendEmail).toHaveBeenCalledTimes(2);
  const autoReply = sendEmail.mock.calls[1][0] as { to: string; subject: string; html: string };
  expect(autoReply.to).toBe("admin@caicosrentals.com");
  expect(autoReply.subject).toContain("Claiming or Adding Your Business");
  expect(autoReply.html).toContain("vakaygo.com/for-businesses");
  expect(autoReply.html).toContain("vakaygo.com/operator/listings/new");
  expect(autoReply.html).not.toContain("UNTRUSTED_PAYLOAD_MARKER");
  expect(autoReply.html).toContain("New bookings, payments and payouts are unavailable");
  expect(autoReply.html).not.toMatch(/Wise|PayPal|Bank Wire|Stripe Connect|Payouts Supported/);
});

it("uses evergreen directory guidance in the general acknowledgement without inventing an island count", async () => {
  const response = await POST(request({ ...valid(), email: "visitor@fixture.test", category: "General", subject: "Account question", message: "Please explain the account page." }));
  expect(response.status).toBe(200); expect(sendEmail).toHaveBeenCalledTimes(2);
  const acknowledgement = sendEmail.mock.calls[1][0];
  expect(acknowledgement.to).toBe("visitor@fixture.test");
  expect(acknowledgement.html).toContain("Explore our travel directory:");
  expect(acknowledgement.html).not.toMatch(/21 Caribbean islands|Wise|PayPal|Bank Wire|Stripe Connect/);
});

it("keeps an accepted primary enquiry successful when its optional acknowledgement fails", async () => {
  sendEmail.mockResolvedValueOnce().mockRejectedValueOnce(new Error("synthetic-acknowledgement-failure"));
  const response = await POST(request({ ...valid(), email: "visitor@fixture.test" }));
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ success: true });
  expect(sendEmail).toHaveBeenCalledTimes(2);
  expect(sendEmail.mock.calls[0][0].to).toBe("bookings@vakaygo.com");
  expect(logger.error).toHaveBeenCalledWith("Contact auto-reply failed", expect.any(Error));
});
