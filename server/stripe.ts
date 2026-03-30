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
 * Create checkout session for a booking (redirect-based)
 */
export async function createCheckoutSession(params: {
  amount: number;
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
          name: params.listingTitle,
          description: `Booking on VakayGo`,
        },
        unit_amount: params.amount,
      },
      quantity: 1,
    }],
    payment_intent_data: {
      application_fee_amount: params.platformFee,
      transfer_data: { destination: params.operatorStripeAccountId },
      metadata: { bookingId: params.bookingId },
    },
    customer_email: params.travelerEmail,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: { bookingId: params.bookingId },
  });
}

/**
 * Refund a booking payment
 */
export async function refundBooking(params: {
  paymentIntentId: string;
  amount?: number;
}) {
  return getStripe().refunds.create({
    payment_intent: params.paymentIntentId,
    amount: params.amount,
    reason: "requested_by_customer",
  });
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
