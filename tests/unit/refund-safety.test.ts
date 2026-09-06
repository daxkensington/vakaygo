import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => { vi.resetModules(); process.env.STRIPE_SECRET_KEY = "sk_test_dummy"; });

async function setup(options: { prior?: { id: string; metadata: { vakaygoRefundKey: string } }[]; lookupError?: boolean; destination?: boolean } = {}) {
  const create = vi.fn(async () => ({ id: "re_new", status: "succeeded" }));
  const retrieve = vi.fn(async () => {
    if (options.lookupError) throw new Error("Stripe unavailable");
    return { latest_charge: options.destination ? { transfer: "tr_1", application_fee_amount: 1500 } : {} };
  });
  vi.doMock("stripe", () => ({ default: class {
    refunds = { list: () => options.prior || [], create };
    paymentIntents = { retrieve };
  } }));
  return { create, retrieve, refundBooking: (await import("@/server/stripe")).refundBooking };
}

describe("refund safety", () => {
  it("recovers an earlier refund by metadata after an idempotency key can expire", async () => {
    const prior = { id: "re_existing", metadata: { vakaygoRefundKey: "refund_booking" } };
    const { refundBooking, create, retrieve } = await setup({ prior: [prior] });
    expect(await refundBooking({ paymentIntentId: "pi_1", amount: 5000, idempotencyKey: "refund_booking" })).toEqual(prior);
    expect(create).not.toHaveBeenCalled();
    expect(retrieve).not.toHaveBeenCalled();
  });
  it("does not create a refund if the original charge cannot be inspected", async () => {
    const { refundBooking, create } = await setup({ lookupError: true });
    await expect(refundBooking({ paymentIntentId: "pi_1", amount: 5000, idempotencyKey: "refund_booking" })).rejects.toThrow("Stripe unavailable");
    expect(create).not.toHaveBeenCalled();
  });
  it("reverses the destination transfer and application fee on a full refund", async () => {
    const { refundBooking, create } = await setup({ destination: true });
    await refundBooking({ paymentIntentId: "pi_1", amount: 10000, fullRefund: true, idempotencyKey: "refund_booking" });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ reverse_transfer: true, refund_application_fee: true, metadata: { vakaygoRefundKey: "refund_booking" } }), { idempotencyKey: "refund_booking" });
  });
  it("keeps platform-charge refunds separate from destination transfer reversals", async () => {
    const { refundBooking, create } = await setup();
    await refundBooking({ paymentIntentId: "pi_1", amount: 5000, idempotencyKey: "refund_booking" });
    expect(create).toHaveBeenCalledWith(expect.not.objectContaining({ reverse_transfer: true }), { idempotencyKey: "refund_booking" });
  });
});
