import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => { vi.resetModules(); process.env.STRIPE_SECRET_KEY = "sk_test_synthetic"; });

async function refundHelper(options: { priorStatus?: string; lookupFails?: boolean; destination?: boolean } = {}) {
  const create = vi.fn(async () => ({ id: "re_created", status: "pending" }));
  const retrieve = vi.fn(async () => {
    if (options.lookupFails) throw Error("Provider unavailable");
    return options.destination
      ? { latest_charge: { transfer: "tr_synthetic", application_fee_amount: 1200 }, transfer_data: { destination: "acct_synthetic" } }
      : { latest_charge: { transfer: null, application_fee_amount: 0 }, transfer_data: null };
  });
  vi.doMock("stripe", () => ({ default: class {
    refunds = { create, list: () => (async function* () {
      if (options.priorStatus) yield { id: "re_existing", status: options.priorStatus, metadata: { vakaygoRefundKey: "rejected_checkout_cs_synthetic" } };
    })() };
    paymentIntents = { retrieve };
  } }));
  const { refundBooking } = await import("@/server/stripe");
  return { refundBooking, create, retrieve };
}

describe("directory refund recovery", () => {
  it.each(["pending", "succeeded", "failed", "canceled"])("recovers the existing %s refund after retry-key expiry", async priorStatus => {
    const test = await refundHelper({ priorStatus });
    const refund = await test.refundBooking({ paymentIntentId: "pi_synthetic", amount: 12000, fullRefund: true, idempotencyKey: "rejected_checkout_cs_synthetic" });
    expect(refund).toMatchObject({ id: "re_existing", status: priorStatus });
    expect(test.create).not.toHaveBeenCalled();
    expect(test.retrieve).not.toHaveBeenCalled();
  });
  it("reverses the actual destination and application fee for a full refund", async () => {
    const test = await refundHelper({ destination: true });
    await test.refundBooking({ paymentIntentId: "pi_synthetic", amount: 12000, fullRefund: true, idempotencyKey: "rejected_checkout_cs_synthetic" });
    expect(test.create).toHaveBeenCalledWith(expect.objectContaining({ payment_intent: "pi_synthetic", amount: 12000,
      reverse_transfer: true, refund_application_fee: true, metadata: { vakaygoRefundKey: "rejected_checkout_cs_synthetic" } }),
    { idempotencyKey: "rejected_checkout_cs_synthetic" });
  });
  it("does not guess that a failed payment lookup was a platform charge", async () => {
    const test = await refundHelper({ lookupFails: true });
    await expect(test.refundBooking({ paymentIntentId: "pi_synthetic", amount: 12000, fullRefund: true, idempotencyKey: "rejected_checkout_cs_synthetic" })).rejects.toThrow("Provider unavailable");
    expect(test.create).not.toHaveBeenCalled();
  });
});
