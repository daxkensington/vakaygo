"use client";

import { Shield, Clock, Star, Zap, Award, TrendingUp } from "lucide-react";

type TrustBadgesProps = {
  isInstantBook?: boolean | null;
  avgRating?: string | null;
  reviewCount?: number | null;
  isFeatured?: boolean | null;
  type?: string;
};

export function TrustBadges({ isInstantBook, avgRating, reviewCount, isFeatured, type }: TrustBadgesProps) {
  const rating = avgRating ? parseFloat(avgRating) : 0;
  const badges: { icon: typeof Shield; label: string; color: string }[] = [];

  // Free cancellation — always show
  badges.push({
    icon: Clock,
    label: "Free cancellation",
    color: "bg-teal-50 text-teal-700",
  });

  // Instant book
  if (isInstantBook) {
    badges.push({
      icon: Zap,
      label: "Instant book",
      color: "bg-gold-50 text-gold-700",
    });
  }

  // Top rated
  if (rating >= 4.8 && (reviewCount || 0) >= 10) {
    badges.push({
      icon: Award,
      label: "Top rated",
      color: "bg-gold-50 text-gold-700",
    });
  } else if (rating >= 4.5 && (reviewCount || 0) >= 5) {
    badges.push({
      icon: Star,
      label: "Highly rated",
      color: "bg-gold-50 text-gold-700",
    });
  }

  // Featured
  if (isFeatured) {
    badges.push({
      icon: TrendingUp,
      label: "Featured",
      color: "bg-teal-50 text-teal-700",
    });
  }

  // Verified
  badges.push({
    icon: Shield,
    label: "Verified operator",
    color: "bg-cream-200 text-navy-600",
  });

  return (
    <div className="flex flex-wrap gap-2">
      {badges.map((badge) => (
        <span
          key={badge.label}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${badge.color}`}
        >
          <badge.icon size={12} />
          {badge.label}
        </span>
      ))}
    </div>
  );
}
