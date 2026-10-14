import { expect, it, vi } from "vitest";
const sendEmail = vi.hoisted(() => vi.fn(async (_message: { html: string; replyTo?: string }) => ({ data: { id: "synthetic-mail" } })));
vi.mock("@/server/mail-client", () => ({ sendEmail }));
import { sendWelcomeEmail, sendVerificationEmail, sendMagicLinkEmail } from "@/server/email";

it("renders user names as text in all entry emails and sends replies to the existing receiving mailbox", async () => {
  const name = '<a href="https://untrusted.example">Owner</a>';
  await sendWelcomeEmail({ to: "owner@example.invalid", name });
  await sendVerificationEmail({ to: "owner@example.invalid", name, token: "a".repeat(64), next: "/barbados/cafe?guests=2&day=1" });
  await sendMagicLinkEmail({ to: "owner@example.invalid", name, url: "https://vakaygo.com/auth/continue?token=synthetic&next=%2Fcafe" });
  for (const [message] of sendEmail.mock.calls) {
    expect(message.html).not.toContain(name); expect(message.html).toContain("&lt;a href=&quot;https://untrusted.example&quot;&gt;Owner&lt;/a&gt;");
    expect(message.replyTo).toBe("bookings@vakaygo.com");
  }
});
