import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  process.env.DATABASE_URL = "postgres://test:test@localhost/test";
  process.env.AUTH_SECRET = "test-secret-must-be-at-least-32-chars-yes";
});

// Drizzle helper that records calls. Each chain method returns `this`
// so `db.update(t).set(v).where(c)` resolves to a thenable that captures
// the final values.
function makeDbMock() {
  const updateCalls: { table: unknown; values: unknown; where: unknown }[] = [];
  const selectMatches: Record<string, unknown>[] = [];
  // Rows handed back by `.returning()` after an update.
  const returningRows: Record<string, unknown>[] = [];

  const updateChain = (table: unknown) => {
    let captured: { values?: unknown; where?: unknown } = {};
    const chain = {
      set(values: unknown) {
        captured.values = values;
        return chain;
      },
      where(cond: unknown) {
        captured.where = cond;
        updateCalls.push({ table, values: captured.values, where: cond });
        // Awaitable directly, or chained with .returning()
        return Object.assign(Promise.resolve(), {
          returning: () => Promise.resolve(returningRows),
        });
      },
    };
    return chain;
  };

  const selectChain = () => {
    const chain = {
      from(_t: unknown) {
        return chain;
      },
      where(_c: unknown) {
        return chain;
      },
      limit(_n: number) {
        return Promise.resolve(selectMatches);
      },
    };
    return chain;
  };

  const db = {
    update: (t: unknown) => updateChain(t),
    select: (_cols?: unknown) => selectChain(),
  };

  return { db, updateCalls, selectMatches, returningRows };
}

const sendBookingConfirmation = vi.fn(async (_params: Record<string, unknown>) => {});

async function loadHandler(opts: {
  constructEvent: () => unknown;
  db: { db: unknown; updateCalls: unknown[]; selectMatches: Record<string, unknown>[] };
}) {
  sendBookingConfirmation.mockClear();
  // The route emails the traveler on payment; the real module throws at
  // load without RESEND_API_KEY.
  vi.doMock("@/server/email", () => ({ sendBookingConfirmation }));
  vi.doMock("stripe", () => {
    class StripeMock {
      webhooks = { constructEvent: opts.constructEvent };
      constructor(_key: string) {}
    }
    return { default: StripeMock };
  });
  vi.doMock("@neondatabase/serverless", () => ({
    neon: () => () => Promise.resolve([]),
  }));
  vi.doMock("drizzle-orm/neon-http", () => ({
    drizzle: () => opts.db.db,
  }));

  return await import("@/app/api/payments/webhook/route");
}

function mkRequest(body: string, signature: string | null) {
  const headers = new Headers();
  if (signature) headers.set("stripe-signature", signature);
  return new Request("https://x/api/payments/webhook", {
    method: "POST",
    body,
    headers,
  });
}

describe("Stripe webhook handler", () => {
  it("rejects requests without a stripe-signature header (400)", async () => {
    const dbMock = makeDbMock();
    const { POST } = await loadHandler({
      constructEvent: () => ({ type: "noop" }),
      db: dbMock,
    });
    const res = await POST(mkRequest("{}", null));
    expect(res.status).toBe(400);
  });

  it("rejects when constructEvent throws (invalid signature → 400)", async () => {
    const dbMock = makeDbMock();
    const { POST } = await loadHandler({
      constructEvent: () => {
        throw new Error("bad sig");
      },
      db: dbMock,
    });
    const res = await POST(mkRequest("{}", "t=1,v1=fake"));
    expect(res.status).toBe(400);
  });

  it("checkout.session.completed marks the booking confirmed and emails the traveler", async () => {
    const dbMock = makeDbMock();
    dbMock.returningRows.push({
      bookingNumber: "VG-TEST-1",
      travelerId: "u1",
      listingId: "l1",
      startDate: new Date("2026-12-01T00:00:00Z"),
      guestCount: 2,
      totalAmount: "120.00",
    });
    dbMock.selectMatches.push({ email: "traveler@example.com", name: "Pat", title: "Sunset Sail" });
    const event = {
      type: "checkout.session.completed",
      data: {
        object: {
          payment_intent: "pi_123",
          amount_total: 12000,
          metadata: { bookingId: "bk_abc" },
        },
      },
    };
    const { POST } = await loadHandler({
      constructEvent: () => event,
      db: dbMock,
    });
    const res = await POST(mkRequest(JSON.stringify(event), "sig"));
    expect(res.status).toBe(200);
    expect(dbMock.updateCalls).toHaveLength(1);
    const call = dbMock.updateCalls[0];
    expect(call.values).toMatchObject({
      status: "confirmed",
      paymentId: "pi_123",
      paymentMethod: "card",
    });
    expect(sendBookingConfirmation).toHaveBeenCalledTimes(1);
    expect(sendBookingConfirmation.mock.calls[0][0]).toMatchObject({
      to: "traveler@example.com",
      bookingNumber: "VG-TEST-1",
      totalAmount: "120.00",
    });
  });

  it("checkout.session.completed with no payment_intent ($0 session) confirms NOTHING", async () => {
    // Stripe completes a $0 Checkout as paid with payment_intent null.
    // That marked four unpaid bookings "confirmed" in Aug 2026.
    const dbMock = makeDbMock();
    const event = {
      type: "checkout.session.completed",
      data: {
        object: {
          payment_intent: null,
          amount_total: 0,
          metadata: { bookingId: "bk_free" },
        },
      },
    };
    const { POST } = await loadHandler({ constructEvent: () => event, db: dbMock });
    const res = await POST(mkRequest(JSON.stringify(event), "sig"));
    expect(res.status).toBe(200);
    expect(dbMock.updateCalls).toHaveLength(0);
    expect(sendBookingConfirmation).not.toHaveBeenCalled();
  });

  it("payment_intent.payment_failed cancels the booking", async () => {
    const dbMock = makeDbMock();
    const event = {
      type: "payment_intent.payment_failed",
      data: { object: { metadata: { bookingId: "bk_xyz" } } },
    };
    const { POST } = await loadHandler({
      constructEvent: () => event,
      db: dbMock,
    });
    const res = await POST(mkRequest(JSON.stringify(event), "sig"));
    expect(res.status).toBe(200);
    expect(dbMock.updateCalls).toHaveLength(1);
    expect(dbMock.updateCalls[0].values).toMatchObject({
      status: "cancelled",
      cancellationReason: "Payment failed",
    });
  });

  it("charge.refunded (full) looks up booking by paymentId and marks refunded", async () => {
    const dbMock = makeDbMock();
    dbMock.selectMatches.push({ id: "bk_found" });

    const event = {
      type: "charge.refunded",
      // A fully-refunded charge — Stripe sets refunded:true.
      data: { object: { payment_intent: "pi_999", refunded: true } },
    };
    const { POST } = await loadHandler({
      constructEvent: () => event,
      db: dbMock,
    });
    const res = await POST(mkRequest(JSON.stringify(event), "sig"));
    expect(res.status).toBe(200);
    expect(dbMock.updateCalls).toHaveLength(1);
    expect(dbMock.updateCalls[0].values).toMatchObject({ status: "refunded" });
  });

  it("charge.refunded (partial) does NOT overwrite the booking to refunded", async () => {
    const dbMock = makeDbMock();
    dbMock.selectMatches.push({ id: "bk_found" });

    const event = {
      type: "charge.refunded",
      // A partial refund (e.g. 50% cancellation) — must not be flagged refunded.
      data: {
        object: {
          payment_intent: "pi_999",
          refunded: false,
          amount: 10000,
          amount_refunded: 5000,
        },
      },
    };
    const { POST } = await loadHandler({
      constructEvent: () => event,
      db: dbMock,
    });
    const res = await POST(mkRequest(JSON.stringify(event), "sig"));
    expect(res.status).toBe(200);
    expect(dbMock.updateCalls).toHaveLength(0);
  });

  it("charge.refunded with no matching booking does NOT update", async () => {
    const dbMock = makeDbMock();
    // selectMatches stays empty
    const event = {
      type: "charge.refunded",
      data: { object: { payment_intent: "pi_unmatched" } },
    };
    const { POST } = await loadHandler({
      constructEvent: () => event,
      db: dbMock,
    });
    const res = await POST(mkRequest(JSON.stringify(event), "sig"));
    expect(res.status).toBe(200);
    expect(dbMock.updateCalls).toHaveLength(0);
  });

  it("unknown event type returns 200 without DB writes", async () => {
    const dbMock = makeDbMock();
    const { POST } = await loadHandler({
      constructEvent: () => ({ type: "customer.created", data: { object: {} } }),
      db: dbMock,
    });
    const res = await POST(mkRequest("{}", "sig"));
    expect(res.status).toBe(200);
    expect(dbMock.updateCalls).toHaveLength(0);
  });
});
