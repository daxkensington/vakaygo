// @vitest-environment node
import { expect, it, vi } from "vitest";
const sendEmail = vi.hoisted(() => vi.fn<(message: { to: string; subject: string; html: string; replyTo?: string }) => Promise<{ data: { id: string } }>>(async () => ({ data: { id: "synthetic-mail" } })));
vi.mock("@/server/mail-client", () => ({ sendEmail }));
import { sendClaimDecision } from "@/server/email-requests";

const listingId = "25e24d36-50be-49e0-8847-28d9e1f0f131";
const hostile = '<script>alert(1)</script>Tours';

it("welcomes an approved claim with the three remaining steps and a link to that listing's onboarding", async () => {
  await sendClaimDecision({ to: "owner@example.invalid", contactName: hostile, listingTitle: `Faro ${hostile}`, listingId, approved: true, adminNotes: null, openedDays: 90 });
  const [message] = sendEmail.mock.calls[0];
  expect(message.to).toBe("owner@example.invalid");
  expect(message.replyTo).toBe("bookings@vakaygo.com");
  expect(message.subject).toBe(`Faro ${hostile} is now yours on VakayGo`);
  expect(message.html).not.toContain(hostile);
  expect(message.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;Tours");
  expect(message.html).toContain(`href="https://vakaygo.com/operator/onboarding/${listingId}"`);
  expect(message.html).toContain("Start onboarding");
  expect(message.html).toContain("We opened the next 90 days for bookings");
  expect(message.html).toContain("Confirm your company details and accept the operator terms");
  expect(message.html).toContain("Tell us how you want to be paid");
  expect(message.html).not.toContain("/operator/listings\"");
});

it("skips the open-dates line when the listing already had availability and falls back to the listings page without an id", async () => {
  sendEmail.mockClear();
  await sendClaimDecision({ to: "owner@example.invalid", contactName: "Ronnie", listingTitle: "Faro a Colón", approved: true, adminNotes: "Approved by admin review", openedDays: 0 });
  const [message] = sendEmail.mock.calls[0];
  expect(message.html).not.toContain("We opened the next");
  expect(message.html).toContain('href="https://vakaygo.com/operator/listings"');
  expect(message.html).toContain("Approved by admin review");
});

it("keeps the rejection wording unchanged", async () => {
  sendEmail.mockClear();
  await sendClaimDecision({ to: "owner@example.invalid", contactName: "Ronnie", listingTitle: "Faro a Colón", listingId, approved: false, adminNotes: "Phone did not match" });
  const [message] = sendEmail.mock.calls[0];
  expect(message.subject).toBe("About your claim for Faro a Colón");
  expect(message.html).toContain("We could not verify your claim");
  expect(message.html).toContain("Phone did not match");
  expect(message.html).not.toContain("Start onboarding");
});
