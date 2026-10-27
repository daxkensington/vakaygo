import { beforeEach, expect, it, vi } from "vitest";

const sendEmail = vi.hoisted(() => vi.fn());
vi.mock("@/server/mail-client", () => ({ sendEmail }));
import { sendListingInquiryReceived, sendListingInquiryToTeam } from "@/server/email-requests";

beforeEach(() => { vi.clearAllMocks(); sendEmail.mockResolvedValue({}); });

it("escapes inquiry content and addresses only the team with the traveler as reply-to", async () => {
  await sendListingInquiryToTeam({
    inquiryId: "inquiry-1",
    listingTitle: "<Synthetic Tour>",
    listingUrl: "https://vakaygo.com/grenada/synthetic-tour",
    islandName: "Grenada",
    businessPhone: "+1 555 0100",
    businessWebsite: "https://business.example",
    whenText: "2099-12-10",
    partySize: 2,
    message: "<script>not executable</script>",
    travelerEmail: "traveler@example.invalid",
  });
  const mail = sendEmail.mock.calls[0][0];
  expect(mail.to).toBe("bookings@vakaygo.com");
  expect(mail.replyTo).toBe("traveler@example.invalid");
  expect(mail.html).toContain("&lt;Synthetic Tour&gt;");
  expect(mail.html).toContain("&lt;script&gt;not executable&lt;/script&gt;");
  expect(mail.html).not.toContain("<script>");
  expect(mail.html).toContain("This is not a booking");
});

it("sends an honest acknowledgement without promising availability or a business reply", async () => {
  await sendListingInquiryReceived({ to: "traveler@example.invalid", listingTitle: "Synthetic Tour", listingUrl: "https://vakaygo.com/grenada/synthetic-tour", whenText: "Flexible / not specified", partySize: 3 });
  const mail = sendEmail.mock.calls[0][0];
  expect(mail.to).toBe("traveler@example.invalid");
  expect(mail.replyTo).toBe("bookings@vakaygo.com");
  expect(mail.html).toContain("This is not a booking, nothing is reserved, and no payment was taken.");
  expect(mail.html).toContain("We cannot guarantee that the business will respond");
});
