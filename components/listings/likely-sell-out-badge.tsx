"use client";

import { Flame } from "lucide-react";

export function LikelySellOutBadge({
  bookingCount7Days,
  spotsRemaining,
}: {
  bookingCount7Days: number;
  spotsRemaining?: number;
}) {
  const show =
    bookingCount7Days > 5 ||
    (spotsRemaining !== undefined && spotsRemaining < 5);

  if (!show) return null;

  return (
    <div className="inline-flex items-center gap-1.5 bg-gradient-to-r from-red-500 to-orange-500 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm">
      <Flame size={14} />
      <span>Likely to sell out</span>
    </div>
  );
}
