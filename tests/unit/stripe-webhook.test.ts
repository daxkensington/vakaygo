import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
});

describe("constructWebhookEvent", () => {
  it("delegates body+signature+secret to stripe.webhooks.constructEvent", async () => {
    const constructEvent = vi.fn(() => ({
      id: "evt_1",
      type: "checkout.session.completed",
    }));

    vi.doMock("stripe", () => {
      class StripeMock {
        webhooks = { constructEvent };
        constructor(_key: string) {}
      }
      return { default: StripeMock };
    });

    const { constructWebhookEvent } = await import("@/server/stripe");
    const evt = constructWebhookEvent("body-text", "sig-header", "whsec_x");
    expect(constructEvent).toHaveBeenCalledWith(
      "body-text",
      "sig-header",
      "whsec_x"
    );
    expect(evt).toMatchObject({ id: "evt_1" });
  });

  it("throws if STRIPE_SECRET_KEY is missing on first use", async () => {
    delete process.env.STRIPE_SECRET_KEY;

    vi.doMock("stripe", () => {
      class StripeMock {
        webhooks = { constructEvent: () => ({}) };
        constructor(_key: string) {}
      }
      return { default: StripeMock };
    });

    const { constructWebhookEvent } = await import("@/server/stripe");
    expect(() => constructWebhookEvent("b", "s", "w")).toThrow(
      /STRIPE_SECRET_KEY/
    );
  });
});

describe("createCheckoutSession", () => {
  it("passes platform fee + transfer destination to stripe", async () => {
    const sessionsCreate = vi.fn(async () => ({ id: "cs_1", url: "https://x" }));

    vi.doMock("stripe", () => {
      class StripeMock {
        checkout = { sessions: { create: sessionsCreate } };
        webhooks = { constructEvent: () => ({}) };
        constructor(_key: string) {}
      }
      return { default: StripeMock };
    });

    const { createCheckoutSession } = await import("@/server/stripe");
    const out = await createCheckoutSession({
      amount: 10000,
      currency: "USD",
      platformFee: 500,
      operatorStripeAccountId: "acct_op",
      bookingId: "bk_1",
      listingTitle: "Sunset Tour",
      travelerEmail: "a@b.com",
      successUrl: "https://x/success",
      cancelUrl: "https://x/cancel",
    });

    expect(out).toMatchObject({ id: "cs_1" });
    expect(sessionsCreate).toHaveBeenCalledOnce();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const args = (sessionsCreate.mock.calls as any[][])[0][0];
    expect(args.payment_intent_data.application_fee_amount).toBe(500);
    expect(args.payment_intent_data.transfer_data.destination).toBe("acct_op");
    expect(args.metadata.bookingId).toBe("bk_1");
    expect(args.line_items[0].price_data.unit_amount).toBe(10000);
    expect(args.line_items[0].price_data.currency).toBe("usd");
  });
});
