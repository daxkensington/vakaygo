import Stripe from "stripe";

// Lazy Stripe initialization — only connects when used at runtime
let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    _stripe = new Stripe(key, { apiVersion: "2025-03-31.basil" as Stripe.LatestApiVersion });
  }
  return _stripe;
}

/**
 * Create a Stripe Connect account for an operator
 */
export async function createConnectAccount(params: {
  email: string;
  businessName: string;
}) {
  return getStripe().accounts.create({
    type: "express",
    email: params.email,
    business_profile: {
      name: params.businessName,
      mcc: "4722",
    },
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    settings: {
      payouts: {
        schedule: { interval: "weekly" as const, weekly_anchor: "monday" as const },
      },
    },
  });
}

/**
 * Create onboarding link for operator Stripe setup
 */
export async function createAccountLink(accountId: string) {
  const link = await getStripe().accountLinks.create({
    account: accountId,
    refresh_url: "https://vakaygo.com/operator/settings?stripe=refresh",
    return_url: "https://vakaygo.com/operator/settings?stripe=success",
    type: "account_onboarding",
  });
  return link.url;
}

/**
 * Create checkout session for a deposit (partial payment)
 */
export async function createDepositSession(params: {
  amount: number;
  fullAmount: number;
  currency: string;
  platformFee: number;
  operatorStripeAccountId: string;
  bookingId: string;
  listingTitle: string;
  travelerEmail: string;
  successUrl: string;
  cancelUrl: string;
}) {
  return getStripe().checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    line_items: [{
      price_data: {
        currency: params.currency.toLowerCase(),
        product_data: {
          name: `Deposit — ${params.listingTitle}`,
          description: `Deposit for VakayGo booking (full amount: ${(params.fullAmount / 100).toFixed(2)} ${params.currency.toUpperCase()})`,
        },
        unit_amount: params.amount,
      },
      quantity: 1,
    }],
    payment_intent_data: {
      application_fee_amount: params.platformFee,
      transfer_data: { destination: params.operatorStripeAccountId },
      metadata: {
        bookingId: params.bookingId,
        paymentType: "deposit",
        fullAmount: String(params.fullAmount),
      },
    },
    customer_email: params.travelerEmail,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: {
      bookingId: params.bookingId,
      paymentType: "deposit",
    },
  });
}

/**
 * Create a Stripe transfer (for automated payouts to operators)
 */
export async function createTransfer(params: {
  amount: number;
  currency: string;
  destinationAccountId: string;
  description: string;
  metadata?: Record<string, string>;
}) {
  return getStripe().transfers.create({
    amount: params.amount,
    currency: params.currency.toLowerCase(),
    destination: params.destinationAccountId,
    description: params.description,
    metadata: params.metadata || {},
  });
}

/**
 * Release escrow: transfer held funds from platform to operator
 */
export async function releaseEscrowTransfer(params: {
  paymentIntentId: string;
  amount: number;
  destinationAccountId: string;
}) {
  return getStripe().transfers.create({
    amount: params.amount,
    currency: "usd",
    destination: params.destinationAccountId,
    source_transaction: params.paymentIntentId,
    description: "Escrow release — trip completed",
    metadata: {
      type: "escrow_release",
      paymentIntentId: params.paymentIntentId,
    },
  });
}

/**
 * Create checkout session for a booking (redirect-based).
 *
 * Two modes:
 * - operatorStripeAccountId set → Connect destination charge: operator's
 *   share lands in their connected account, platform keeps platformFee.
 * - operatorStripeAccountId absent → platform charge: the full amount is
 *   collected on the platform account and operators are paid out-of-band
 *   from the payouts ledger. This is the default — most Caribbean islands
 *   are not supported Stripe Connect countries, so operators there can
 *   never onboard via Express.
 */
export async function createCheckoutSession(params: {
  amount: number;
  currency: string;
  platformFee: number;
  operatorStripeAccountId?: string | null;
  bookingId: string;
  listingTitle: string;
  travelerEmail: string;
  successUrl: string;
  cancelUrl: string;
  paymentMethodTypes?: string[];
}) {
  const paymentIntentData: Stripe.Checkout.SessionCreateParams.PaymentIntentData = {
    metadata: { bookingId: params.bookingId },
    statement_descriptor_suffix: "VAKAYGO",
  };
  if (params.operatorStripeAccountId) {
    paymentIntentData.application_fee_amount = params.platformFee;
    paymentIntentData.transfer_data = { destination: params.operatorStripeAccountId };
  }

  return getStripe().checkout.sessions.create({
    payment_method_types: (params.paymentMethodTypes || ["card"]) as Stripe.Checkout.SessionCreateParams.PaymentMethodType[],
    mode: "payment",
    line_items: [{
      price_data: {
        currency: params.currency.toLowerCase(),
        product_data: {
          name: params.listingTitle,
          description: `Booking on VakayGo`,
        },
        unit_amount: params.amount,
      },
      quantity: 1,
    }],
    payment_intent_data: paymentIntentData,
    customer_email: params.travelerEmail,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: { bookingId: params.bookingId },
  });
}

/**
 * Refund a booking payment.
 *
 * Whether this was a Connect destination charge (operator transfer must be
 * reversed, else the platform eats the operator's share) is determined from
 * the ACTUAL PaymentIntent/charge — NOT the operator's current onboarding
 * state, which may differ from charge time (operators often onboard later).
 * `refund_application_fee` claws back the platform fee on a full refund.
 *
 * Pass `idempotencyKey` (e.g. `refund_<bookingId>`) so concurrent or
 * double-submitted refund requests collapse to a single Stripe refund.
 */
export async function refundBooking(params: {
  paymentIntentId: string;
  amount?: number;
  fullRefund?: boolean;
  idempotencyKey?: string;
}) {
  const stripe = getStripe();

  let reverseTransfer = false;
  let hadApplicationFee = false;
  try {
    const pi = await stripe.paymentIntents.retrieve(params.paymentIntentId, {
      expand: ["latest_charge"],
    });
    const charge = pi.latest_charge as Stripe.Charge | null;
    reverseTransfer = !!(charge && charge.transfer) || !!pi.transfer_data;
    hadApplicationFee = !!(charge && charge.application_fee_amount);
  } catch {
    // If the lookup fails, fall back to a plain refund (no reversal) — the
    // platform-charge case, which is the default for most operators.
    reverseTransfer = false;
    hadApplicationFee = false;
  }

  const refundParams: Stripe.RefundCreateParams = {
    payment_intent: params.paymentIntentId,
    amount: params.amount,
    reason: "requested_by_customer",
  };
  if (reverseTransfer) {
    refundParams.reverse_transfer = true;
    if (hadApplicationFee && params.fullRefund) {
      refundParams.refund_application_fee = true;
    }
  }

  return stripe.refunds.create(
    refundParams,
    params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : undefined
  );
}

/**
 * Get operator Stripe account status
 */
export async function getAccountStatus(accountId: string) {
  const account = await getStripe().accounts.retrieve(accountId);
  return {
    id: account.id,
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    detailsSubmitted: account.details_submitted,
  };
}

/**
 * Get operator balance
 */
export async function getAccountBalance(accountId: string) {
  const balance = await getStripe().balance.retrieve({ stripeAccount: accountId });
  return {
    available: balance.available.map(b => ({ amount: b.amount / 100, currency: b.currency })),
    pending: balance.pending.map(b => ({ amount: b.amount / 100, currency: b.currency })),
  };
}

/**
 * Construct webhook event (for webhook handler)
 */
export function constructWebhookEvent(body: string, signature: string, secret: string) {
  return getStripe().webhooks.constructEvent(body, signature, secret);
}
