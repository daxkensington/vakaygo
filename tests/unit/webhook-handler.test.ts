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
  const selectMatches: { id: string }[] = [];

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
        return Promise.resolve();
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

  return { db, updateCalls, selectMatches };
}

async function loadHandler(opts: {
  constructEvent: () => unknown;
  db: { db: unknown; updateCalls: unknown[]; selectMatches: { id: string }[] };
}) {
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

  it("checkout.session.completed marks the booking confirmed", async () => {
    const dbMock = makeDbMock();
    const event = {
      type: "checkout.session.completed",
      data: {
        object: {
          payment_intent: "pi_123",
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

  it("charge.refunded looks up booking by paymentId and marks refunded", async () => {
    const dbMock = makeDbMock();
    dbMock.selectMatches.push({ id: "bk_found" });

    const event = {
      type: "charge.refunded",
      data: { object: { payment_intent: "pi_999" } },
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
