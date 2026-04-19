"use client";

import { LOYALTY_TIERS, type LoyaltyTier } from "@/lib/loyalty-tiers";

const tierStyles: Record<LoyaltyTier, { bg: string; text: string; icon: string }> = {
  explorer: { bg: "bg-gray-100", text: "text-gray-600", icon: "\uD83C\uDF0D" },
  adventurer: { bg: "bg-blue-100", text: "text-blue-700", icon: "\uD83C\uDFD4\uFE0F" },
  voyager: { bg: "bg-purple-100", text: "text-purple-700", icon: "\u26F5" },
  captain: { bg: "bg-amber-100", text: "text-amber-700", icon: "\uD83D\uDC51" },
};

export function LoyaltyBadge({
  tier,
  size = "sm",
  showLabel = true,
}: {
  tier: LoyaltyTier;
  size?: "xs" | "sm" | "md";
  showLabel?: boolean;
}) {
  const style = tierStyles[tier];
  const tierInfo = LOYALTY_TIERS[tier];

  const sizeClasses = {
    xs: "text-xs px-1.5 py-0.5 gap-0.5",
    sm: "text-xs px-2 py-1 gap-1",
    md: "text-sm px-3 py-1.5 gap-1.5",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${style.bg} ${style.text} ${sizeClasses[size]}`}
    >
      <span>{style.icon}</span>
      {showLabel && <span>{tierInfo.name}</span>}
    </span>
  );
}

export function LoyaltyPointsBadge({ points }: { points: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-gold-700 bg-gold-50 px-2 py-1 rounded-full">
      <span className="text-gold-700">{"\u2B50"}</span>
      {points.toLocaleString()}
    </span>
  );
}
