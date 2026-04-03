"use client";

import { useState } from "react";
import { Star } from "lucide-react";

type SuperhostBadgeProps = {
  variant?: "default" | "small" | "card";
  label?: string;
};

export function SuperhostBadge({ variant = "default", label }: SuperhostBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const text = label || "Superhost";

  if (variant === "card") {
    return (
      <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 text-xs font-semibold px-2 py-0.5 rounded-full">
        <Star size={10} className="fill-amber-500 text-amber-500" />
        {text}
      </span>
    );
  }

  if (variant === "small") {
    return (
      <div className="relative inline-flex">
        <span
          className="inline-flex items-center gap-1 bg-gradient-to-r from-amber-400 to-amber-500 text-white text-xs font-semibold px-2.5 py-1 rounded-full cursor-help"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <Star size={12} className="fill-white" />
          {text}
        </span>
        {showTooltip && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-navy-700 text-white text-xs rounded-xl p-3 shadow-lg z-50">
            <p className="font-semibold mb-1">Top Operator</p>
            <p className="text-white/80 leading-relaxed">
              This operator has a 4.8+ rating, 10+ completed bookings, and less than 5% cancellation rate.
            </p>
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2 h-2 bg-navy-700 rotate-45" />
          </div>
        )}
      </div>
    );
  }

  // Default variant — full badge for detail pages
  return (
    <div className="relative inline-flex">
      <span
        className="inline-flex items-center gap-1.5 bg-gradient-to-r from-amber-400 to-amber-500 text-white text-sm font-semibold px-3 py-1.5 rounded-full shadow-sm cursor-help"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <Star size={14} className="fill-white" />
        {text}
      </span>
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-navy-700 text-white text-xs rounded-xl p-3 shadow-lg z-50">
          <p className="font-semibold mb-1">Top Operator</p>
          <p className="text-white/80 leading-relaxed">
            This operator has a 4.8+ rating, 10+ completed bookings, and less than 5% cancellation rate.
          </p>
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2 h-2 bg-navy-700 rotate-45" />
        </div>
      )}
    </div>
  );
}
