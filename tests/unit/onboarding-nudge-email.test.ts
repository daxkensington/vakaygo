// @vitest-environment node
import { expect, it, vi } from "vitest";
const sendEmail = vi.hoisted(() => vi.fn<(message: { to: string; subject: string; html: string; replyTo?: string }) => Promise<{ data: { id: string } }>>(async () => ({ data: { id: "synthetic-mail" } })));
vi.mock("@/server/mail-client", () => ({ sendEmail }));
import { sendOnboardingNudge, sendOnboardingReviewReminderToTeam } from "@/server/email-requests";
import { describeNextStep } from "@/lib/onboarding-nudges";

const hostile = '<img src=x onerror="alert(1)">Tours';

it("renders the operator reminder as text-safe HTML with the action, the checklist and a stop link", async () => {
  const next = describeNextStep({ kind: "stage", stage: "listing_setup" }, { listingId: "11111111-1111-4111-8111-111111111111", stripeConnected: false })!;
  const result = await sendOnboardingNudge({
    to: "owner@example.invalid",
    operatorName: hostile,
    listingTitle: `Lady ${hostile}`,
    islandName: "Bonaire",
    next,
    checklist: [{ label: "Business claim verified", done: true }, { label: "Price, capacity, policy and open dates", done: false }],
    completed: 4,
    total: 6,
    nudgeNumber: 1,
    final: false,
    actionUrl: "https://vakaygo.com" + next.href,
    stopUrl: "https://vakaygo.com/api/onboarding-nudges/stop?token=abc.def",
  });
  expect(result.data.id).toBe("synthetic-mail");
  const [message] = sendEmail.mock.calls[0];
  expect(message.to).toBe("owner@example.invalid");
  expect(message.replyTo).toBe("bookings@vakaygo.com");
  expect(message.subject).toBe("Set your price and open dates — Lady " + hostile);
  expect(message.html).not.toContain(hostile);
  expect(message.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;Tours");
  expect(message.html).toContain('href="https://vakaygo.com/operator/listings/11111111-1111-4111-8111-111111111111"');
  expect(message.html).toContain("Set price and availability");
  expect(message.html).toContain("4 of 6 steps done");
  expect(message.html).toContain("&#10003; Business claim verified");
  expect(message.html).toContain("&#9675; Price, capacity, policy and open dates");
  expect(message.html).toContain("Reminder 1 of 3");
  expect(message.html).toContain("check in once more");
  // Every transactional email names the operating business and its mailing address.
  expect(message.html).toContain("VakayGo · operated by Avmere · 240 Richmond St W, Toronto, ON M5V 1V6, Canada");
  expect(message.html).toContain('href="https://vakaygo.com/api/onboarding-nudges/stop?token=abc.def"');
});

it("says goodbye on the final reminder and greets without a name when none is known", async () => {
  sendEmail.mockClear();
  const next = describeNextStep({ kind: "stage", stage: "activate" }, { listingId: "11111111-1111-4111-8111-111111111111", stripeConnected: false })!;
  await sendOnboardingNudge({
    to: "owner@example.invalid", operatorName: "  ", listingTitle: "Dominica Tours", islandName: "Dominica", next,
    checklist: [], completed: 6, total: 6, nudgeNumber: 3, final: true,
    actionUrl: "https://vakaygo.com" + next.href, stopUrl: "https://vakaygo.com/stop",
  });
  const [message] = sendEmail.mock.calls[0];
  expect(message.html).toContain(">Hello,<");
  expect(message.html).toContain("Reminder 3 of 3");
  expect(message.html).toContain("last reminder about this step");
  expect(message.html).not.toContain("check in once more");
});

it("sends the team one digest of items waiting on review, with escaped titles and both admin links", async () => {
  sendEmail.mockClear();
  await sendOnboardingReviewReminderToTeam({
    items: [
      { kind: "payout_profile", title: `Faro ${hostile}`, islandName: "Dominican Republic", waitingSince: new Date(Date.now() - 3 * 86_400_000).toISOString(), detail: "bank_wire · USD" },
      { kind: "listing", title: "Cap Cana Charters", islandName: "Dominican Republic", waitingSince: new Date(Date.now() - 9 * 86_400_000).toISOString(), detail: "excursion" },
    ],
    payoutUrl: "https://vakaygo.com/admin/payout-profiles",
    listingsUrl: "https://vakaygo.com/admin/listings",
  });
  const [message] = sendEmail.mock.calls[0];
  expect(message.to).toBe("bookings@vakaygo.com");
  expect(message.subject).toBe("ACTION: 2 onboarding reviews waiting on VakayGo");
  expect(message.html).not.toContain(hostile);
  expect(message.html).toContain("Payout profile: Faro &lt;img");
  expect(message.html).toContain("waiting 3 days");
  expect(message.html).toContain("waiting 9 days");
  expect(message.html).toContain('href="https://vakaygo.com/admin/payout-profiles"');
  expect(message.html).toContain('href="https://vakaygo.com/admin/listings"');
});
