// VakayGo Pricing Engine
// Category-specific rates based on competitive research
// Each vertical is priced to undercut the market leader by 30-50%

// ─── CATEGORY-SPECIFIC RATES ────────────────────────────────────
export const CATEGORY_RATES: Record<string, { travelerFee: number; operatorFee: number; label: string }> = {
  stay:      { travelerFee: 0.09, operatorFee: 0.03, label: "12% total — saves 3-7% vs Booking.com/Airbnb" },
  excursion: { travelerFee: 0.10, operatorFee: 0.05, label: "15% total — saves 10-15% vs Viator" },
  tour:      { travelerFee: 0.10, operatorFee: 0.05, label: "15% total — saves 10-15% vs Viator/GYG" },
  dining:    { travelerFee: 0.00, operatorFee: 0.00, label: "Subscription-based — no booking fees" },
  event:     { travelerFee: 0.05, operatorFee: 0.03, label: "8% total — cheaper than Eventbrite" },
  transfer:  { travelerFee: 0.08, operatorFee: 0.04, label: "12% total — transparent, fixed pricing" },
  transport: { travelerFee: 0.08, operatorFee: 0.05, label: "13% total — saves 50%+ vs Uber" },
  vip:       { travelerFee: 0.10, operatorFee: 0.05, label: "15% total — premium positioning" },
  guide:     { travelerFee: 0.10, operatorFee: 0.05, label: "15% total — saves 5-10% vs ToursByLocals" },
};

// ─── DINING SUBSCRIPTION TIERS ──────────────────────────────────
export const DINING_TIERS = {
  starter: {
    price: 0,
    label: "Starter",
    description: "Basic listing — get discovered by travelers",
    features: [
      "Business listing on VakayGo",
      "Photos, hours, location, cuisine type",
      "Show up in search results",
      "Google Maps integration",
    ],
  },
  essential: {
    price: 39,
    label: "Essential",
    description: "Online reservations — no per-cover fees, ever",
    features: [
      "Everything in Starter",
      "Online reservations from travelers",
      "Verified diner reviews",
      "Basic analytics (views, bookings)",
      "Reservation reminders (email/SMS)",
      "No per-cover fees",
    ],
  },
  pro: {
    price: 79,
    label: "Pro",
    description: "Featured placement + marketing tools",
    features: [
      "Everything in Essential",
      "Featured in search results",
      "Tonight's Deal promotions",
      "Guest CRM (visit history, preferences)",
      "Advanced analytics",
      "Priority customer support",
      "Menu display with photos",
    ],
  },
} as const;

// ─── OPERATOR SUBSCRIPTION TIERS (non-dining) ──────────────────
export const OPERATOR_TIERS = {
  free: {
    price: 0,
    label: "Free",
    features: [
      "Unlimited listings",
      "Booking management",
      "Basic calendar",
      "Reviews & ratings",
      "Payout tracking",
    ],
  },
  pro: {
    price: 49,
    label: "Pro",
    features: [
      "Everything in Free",
      "Smart pricing suggestions",
      "Advanced analytics",
      "Competitor insights",
      "Automated review requests",
      "Priority in search",
      "Multi-listing management",
    ],
  },
  business: {
    price: 149,
    label: "Business",
    features: [
      "Everything in Pro",
      "API access",
      "Custom booking widget",
      "Multi-location support",
      "Priority support",
      "Dedicated account manager",
      "White-label vouchers",
    ],
  },
} as const;

// ─── ADDITIONAL REVENUE STREAMS ─────────────────────────────────
export const ADDITIONAL_FEES = {
  // Trip insurance
  TRIP_INSURANCE_PERCENT: 0.08,
  TRIP_INSURANCE_PLATFORM_SHARE: 0.5,

  // Price freeze
  PRICE_FREEZE_FEE: 5.0,

  // Currency conversion markup
  CURRENCY_CONVERSION_MARKUP: 0.025,

  // Promoted listing tiers (monthly — available to all verticals)
  PROMOTED_TIERS: {
    featured: { price: 29, label: "Featured", boost: 2 },
    premium: { price: 69, label: "Premium", boost: 5 },
    spotlight: { price: 99, label: "Spotlight", boost: 10 },
  },

  // Dining experience commission (pre-paid culinary experiences)
  DINING_EXPERIENCE_COMMISSION: 0.12,
} as const;

// ─── PRICING CALCULATOR ─────────────────────────────────────────

export type BookingPriceBreakdown = {
  basePrice: number;
  quantity: number;
  subtotal: number;
  serviceFee: number;
  operatorCommission: number;
  insuranceFee: number | null;
  total: number;
  operatorEarnings: number;
  platformRevenue: number;
  currency: string;
  rateInfo: string;
};

export function calculateBookingPrice(params: {
  pricePerUnit: number;
  quantity: number;
  listingType?: string;
  currency?: string;
  includeInsurance?: boolean;
}): BookingPriceBreakdown {
  const {
    pricePerUnit,
    quantity,
    listingType = "tour",
    currency = "USD",
    includeInsurance = false,
  } = params;

  const rates = CATEGORY_RATES[listingType] || CATEGORY_RATES.tour;
  const subtotal = pricePerUnit * quantity;

  const serviceFee = Math.round(subtotal * rates.travelerFee * 100) / 100;
  const operatorCommission = Math.round(subtotal * rates.operatorFee * 100) / 100;

  let insuranceFee: number | null = null;
  let insurancePlatformShare = 0;
  if (includeInsurance) {
    insuranceFee = Math.round(subtotal * ADDITIONAL_FEES.TRIP_INSURANCE_PERCENT * 100) / 100;
    insurancePlatformShare = Math.round(insuranceFee * ADDITIONAL_FEES.TRIP_INSURANCE_PLATFORM_SHARE * 100) / 100;
  }

  const total = subtotal + serviceFee + (insuranceFee || 0);
  const operatorEarnings = subtotal - operatorCommission;
  const platformRevenue = serviceFee + operatorCommission + insurancePlatformShare;

  return {
    basePrice: pricePerUnit,
    quantity,
    subtotal,
    serviceFee,
    operatorCommission,
    insuranceFee,
    total,
    operatorEarnings,
    platformRevenue,
    currency,
    rateInfo: rates.label,
  };
}

export function formatCurrency(amount: number, currency: string = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

// ─── COMPETITIVE COMPARISON ─────────────────────────────────────
export const COMPETITIVE_RATES = {
  stays: { competitor: "Booking.com / Airbnb", theirRate: "15-19%", ourRate: "12%", savings: "20-35%" },
  excursions: { competitor: "Viator", theirRate: "25-30%", ourRate: "15%", savings: "40-50%" },
  tours: { competitor: "Viator / GetYourGuide", theirRate: "20-30%", ourRate: "15%", savings: "40-50%" },
  dining: { competitor: "OpenTable", theirRate: "$149-499/mo + $1.50/cover", ourRate: "$0-79/mo, no cover fees", savings: "50-90%" },
  events: { competitor: "Eventbrite", theirRate: "9-12%", ourRate: "8%", savings: "20-35%" },
  transfers: { competitor: "No dominant player", theirRate: "varies", ourRate: "12%", savings: "Market-setting" },
  transport: { competitor: "Uber", theirRate: "25-40%", ourRate: "13%", savings: "50-65%" },
  vip: { competitor: "No dominant player", theirRate: "varies", ourRate: "15%", savings: "Market-setting" },
  guides: { competitor: "ToursByLocals", theirRate: "20-25%", ourRate: "15%", savings: "25-40%" },
} as const;
