// VakayGo Pricing Engine
// Free for businesses to list. Revenue from traveler fees + optional operator commission.

export const PLATFORM_FEES = {
  // Traveler service fee (charged to the traveler on top of listing price)
  TRAVELER_SERVICE_FEE_PERCENT: 0.06, // 6%

  // Operator commission (deducted from operator earnings on completed bookings)
  OPERATOR_COMMISSION_PERCENT: 0.03, // 3% — lowest in the industry

  // Price freeze fee (traveler pays to lock a rate for 48 hours)
  PRICE_FREEZE_FEE: 5.0,

  // Trip insurance rates
  TRIP_INSURANCE_PERCENT: 0.08, // 8% of booking total
  TRIP_INSURANCE_PLATFORM_SHARE: 0.5, // We keep 50% of insurance premium

  // Currency conversion markup
  CURRENCY_CONVERSION_MARKUP: 0.025, // 2.5%

  // Promoted listing tiers (monthly)
  PROMOTED_TIERS: {
    featured: { price: 29, label: "Featured", boost: 2 },
    premium: { price: 69, label: "Premium", boost: 5 },
    spotlight: { price: 99, label: "Spotlight", boost: 10 },
  },

  // Operator subscription tiers (monthly)
  OPERATOR_TIERS: {
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
  },
} as const;

export type BookingPriceBreakdown = {
  basePrice: number;
  quantity: number;
  subtotal: number;
  serviceFee: number;
  insuranceFee: number | null;
  total: number;
  operatorEarnings: number;
  operatorCommission: number;
  platformRevenue: number;
  currency: string;
};

export function calculateBookingPrice(params: {
  pricePerUnit: number;
  quantity: number;
  currency?: string;
  includeInsurance?: boolean;
}): BookingPriceBreakdown {
  const { pricePerUnit, quantity, currency = "USD", includeInsurance = false } = params;

  const subtotal = pricePerUnit * quantity;
  const serviceFee = Math.round(subtotal * PLATFORM_FEES.TRAVELER_SERVICE_FEE_PERCENT * 100) / 100;
  const operatorCommission = Math.round(subtotal * PLATFORM_FEES.OPERATOR_COMMISSION_PERCENT * 100) / 100;

  let insuranceFee: number | null = null;
  let insurancePlatformShare = 0;
  if (includeInsurance) {
    insuranceFee = Math.round(subtotal * PLATFORM_FEES.TRIP_INSURANCE_PERCENT * 100) / 100;
    insurancePlatformShare = Math.round(insuranceFee * PLATFORM_FEES.TRIP_INSURANCE_PLATFORM_SHARE * 100) / 100;
  }

  const total = subtotal + serviceFee + (insuranceFee || 0);
  const operatorEarnings = subtotal - operatorCommission;
  const platformRevenue = serviceFee + operatorCommission + insurancePlatformShare;

  return {
    basePrice: pricePerUnit,
    quantity,
    subtotal,
    serviceFee,
    insuranceFee,
    total,
    operatorEarnings,
    operatorCommission,
    platformRevenue,
    currency,
  };
}

export function formatCurrency(amount: number, currency: string = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}
