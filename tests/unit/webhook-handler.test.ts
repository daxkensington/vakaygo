import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
const sendBookingConfirmation = vi.fn();
vi.mock("@/server/email", () => ({ sendBookingConfirmation }));
beforeEach(() => { vi.resetModules(); sendBookingConfirmation.mockClear(); process.env.STRIPE_WEBHOOK_SECRET = "whsec_synthetic"; process.env.DATABASE_URL = "postgres://synthetic:synthetic@localhost/synthetic"; });
const session = () => ({ id: "cs_synthetic", payment_intent: "pi_synthetic", payment_status: "paid", amount_total: 12000, currency: "usd", livemode: false, metadata: { bookingId: "booking_known" } });
const event = () => ({ id: "evt_synthetic", type: "checkout.session.completed", livemode: false, data: { object: session() } });
const payment = () => ({ id: "pi_synthetic", status: "succeeded", amount_received: 12000, currency: "usd", livemode: false, metadata: { bookingId: "booking_known" } });
const refund = () => ({ id: "re_synthetic", payment_intent: "pi_synthetic", amount: 12000, currency: "usd", status: "succeeded", metadata: { vakaygoRefundKey: "rejected_checkout_cs_synthetic" } });
async function handler(options: { event?: unknown; booking?: Record<string, unknown> | null; session?: unknown; payment?: unknown; refund?: unknown; badSignature?: boolean; lookupError?: boolean } = {}) {
  vi.resetModules();
  const writes: unknown[] = [];
  const rows = options.booking === null ? [] : [options.booking || { id: "booking_known", status: "requested", paymentId: null, paidAt: null }];
  const chain = { from: () => chain, where: () => chain, limit: async () => rows };
  const db = { select: () => chain, update: () => ({ set: (value: unknown) => ({ where: async () => { writes.push(value); } }) }) };
  const retrieveCheckoutSession = vi.fn(async () => { if (options.lookupError) throw Error("Unavailable"); return options.session || session(); });
  const retrieveBookingPayment = vi.fn(async () => options.payment || payment());
  const refundBooking = vi.fn(async () => options.refund || refund());
  const retrieveBookingRefund = vi.fn(async () => options.refund || refund());
  vi.doMock("@/server/stripe", () => ({ constructWebhookEvent: () => { if (options.badSignature) throw Error("Signature"); return options.event || event(); }, retrieveCheckoutSession, retrieveBookingPayment, refundBooking, retrieveBookingRefund }));
  vi.doMock("@neondatabase/serverless", () => ({ neon: () => ({}) }));
  vi.doMock("drizzle-orm/neon-http", () => ({ drizzle: () => db }));
  const { POST } = await import("@/app/api/payments/webhook/route");
  return { POST, writes, retrieveCheckoutSession, retrieveBookingPayment, refundBooking, retrieveBookingRefund };
}
function request(signature = true) { return new Request("https://audit.invalid/api/payments/webhook", { method: "POST", body: "{}", headers: signature ? { "stripe-signature": "synthetic" } : {} }); }
describe("directory mode webhook", () => {
  it("requires a verified signature", async () => { const missing=await handler();expect((await missing.POST(request(false))).status).toBe(400);const invalid=await handler({badSignature:true});expect((await invalid.POST(request())).status).toBe(400);expect(invalid.writes).toHaveLength(0);expect(invalid.refundBooking).not.toHaveBeenCalled(); });
  it.each(["checkout.session.completed","checkout.session.async_payment_succeeded"])("refunds %s without confirming or emailing", async type => { const t=await handler({event:{...event(),type}});expect((await t.POST(request())).status).toBe(200);expect(t.retrieveCheckoutSession).toHaveBeenCalledWith("cs_synthetic");expect(t.retrieveBookingPayment).toHaveBeenCalledWith("pi_synthetic");expect(t.refundBooking).toHaveBeenCalledWith({paymentIntentId:"pi_synthetic",amount:12000,fullRefund:true,idempotencyKey:"rejected_checkout_cs_synthetic"});expect(t.writes).toHaveLength(0);expect(sendBookingConfirmation).not.toHaveBeenCalled(); });
  it("reuses the refund identity on redelivery",async()=>{const t=await handler();expect((await t.POST(request())).status).toBe(200);expect((await t.POST(request())).status).toBe(200);expect(t.refundBooking.mock.calls[0]).toEqual(t.refundBooking.mock.calls[1]);expect(t.writes).toHaveLength(0);});
  it("acknowledges a pending refund without claiming success",async()=>{const t=await handler({refund:{...refund(),status:"pending"}});expect((await t.POST(request())).status).toBe(200);expect(t.writes).toHaveLength(0);expect(sendBookingConfirmation).not.toHaveBeenCalled();});
  it.each(["failed","canceled","requires_action"])("retries for terminal or unsupported refund status %s",async status=>{const t=await handler({refund:{...refund(),status}});expect((await t.POST(request())).status).toBe(500);expect(t.writes).toHaveLength(0);expect(sendBookingConfirmation).not.toHaveBeenCalled();});
  it("preserves an already recorded historical payment",async()=>{const t=await handler({booking:{id:"booking_known",paymentId:"pi_synthetic",paidAt:new Date()}});expect((await t.POST(request())).status).toBe(200);expect(t.refundBooking).not.toHaveBeenCalled();expect(t.retrieveCheckoutSession).not.toHaveBeenCalled();expect(t.writes).toHaveLength(0);});
  it("does not touch an unknown shared-account checkout",async()=>{const t=await handler({booking:null});expect((await t.POST(request())).status).toBe(200);expect(t.refundBooking).not.toHaveBeenCalled();expect(t.retrieveCheckoutSession).not.toHaveBeenCalled();expect(t.writes).toHaveLength(0);});
  it.each([{session:{...session(),metadata:{bookingId:"other"}}},{session:{...session(),payment_intent:"pi_other"}},{session:{...session(),amount_total:100}},{session:{...session(),livemode:true}},{payment:{...payment(),metadata:{bookingId:"other"}}},{payment:{...payment(),amount_received:100}},{payment:{...payment(),status:"processing"}},{payment:{...payment(),currency:"eur"}}])("refuses mismatched provider identity %#",async mismatch=>{const t=await handler(mismatch);expect((await t.POST(request())).status).toBe(500);expect(t.refundBooking).not.toHaveBeenCalled();expect(t.writes).toHaveLength(0);});
  it("retries when provider identity is unavailable",async()=>{const t=await handler({lookupError:true});expect((await t.POST(request())).status).toBe(500);expect(t.refundBooking).not.toHaveBeenCalled();expect(t.writes).toHaveLength(0);});
  it("rejects a mismatched refund response",async()=>{const t=await handler({refund:{...refund(),amount:100}});expect((await t.POST(request())).status).toBe(500);expect(t.writes).toHaveLength(0);});
  it("never confirms zero-value or unpaid checkout",async()=>{for(const change of [{payment_intent:null,amount_total:0},{payment_status:"unpaid"}]){const t=await handler({event:{...event(),data:{object:{...session(),...change}}}});expect((await t.POST(request())).status).toBe(200);expect(t.refundBooking).not.toHaveBeenCalled();expect(t.writes).toHaveLength(0);}});
  it("late failure cannot overwrite paid history",async()=>{const t=await handler({event:{type:"payment_intent.payment_failed",data:{object:payment()}}});expect((await t.POST(request())).status).toBe(200);expect(t.writes).toHaveLength(0);});
  it("preserves full historical refund reconciliation",async()=>{const t=await handler({event:{type:"charge.refunded",data:{object:{payment_intent:"pi_old",refunded:true}}},booking:{id:"booking_old"}});expect((await t.POST(request())).status).toBe(200);expect(t.writes).toEqual([expect.objectContaining({status:"refunded"})]);});
  it("partial refunds are not full refunds",async()=>{const t=await handler({event:{type:"charge.refunded",data:{object:{payment_intent:"pi_old",refunded:false,amount:12000,amount_refunded:6000}}}});expect((await t.POST(request())).status).toBe(200);expect(t.writes).toHaveLength(0);});
  it("asynchronous refund failure requests support review",async()=>{const t=await handler({event:{type:"refund.failed",data:{object:refund()}},refund:{...refund(),status:"failed"}});expect((await t.POST(request())).status).toBe(500);expect(t.retrieveBookingRefund).toHaveBeenCalledWith("re_synthetic");expect(t.writes).toHaveLength(0);});
});
