import { beforeEach, expect, it, vi } from "vitest";

beforeEach(() => { vi.resetModules(); delete process.env.RESEND_API_KEY; });

it("loads without email credentials but rejects an actual send", async () => {
  const { sendEmail } = await import("@/server/mail-client");
  await expect(sendEmail({ from: "audit@example.invalid", to: "recipient@example.invalid", subject: "Test", text: "Test" })).rejects.toThrow("RESEND_API_KEY");
});

it("treats a provider error response as a failed delivery", async () => {
  process.env.RESEND_API_KEY = "re_ci_only";
  vi.doMock("resend", () => ({ Resend: class { emails = { send: async () => ({ data: null, error: { message: "rate limited" } }) }; } }));
  const { sendEmail } = await import("@/server/mail-client");
  await expect(sendEmail({ from: "audit@example.invalid", to: "recipient@example.invalid", subject: "Test", text: "Test" })).rejects.toThrow("rate limited");
});
