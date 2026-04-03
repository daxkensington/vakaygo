"use client";

import { useState } from "react";
import {
  Bed,
  Compass,
  UtensilsCrossed,
  CalendarDays,
  Car,
  Palmtree,
  Users,
} from "lucide-react";

const fallbackConfig: Record<
  string,
  { gradient: string; icon: typeof Bed }
> = {
  stay: { gradient: "from-sky-500 to-teal-500", icon: Bed },
  tour: { gradient: "from-emerald-500 to-green-600", icon: Compass },
  excursion: { gradient: "from-emerald-600 to-teal-600", icon: Compass },
  dining: { gradient: "from-amber-400 to-gold-600", icon: UtensilsCrossed },
  event: { gradient: "from-purple-500 to-violet-600", icon: CalendarDays },
  transport: { gradient: "from-slate-400 to-gray-500", icon: Car },
  transfer: { gradient: "from-slate-500 to-gray-600", icon: Car },
  vip: { gradient: "from-gold-500 to-gold-700", icon: Users },
  guide: { gradient: "from-gold-400 to-teal-500", icon: Users },
};

const defaultConfig = { gradient: "from-teal-500 to-gold-500", icon: Palmtree };

/**
 * Renders a category-specific gradient placeholder with a centered Lucide icon.
 * Used when a listing has no image or the image fails to load.
 */
export function ImageFallback({
  type,
  className = "",
  iconSize = 40,
  children,
  onClick,
}: {
  type: string;
  className?: string;
  iconSize?: number;
  children?: React.ReactNode;
  onClick?: () => void;
}) {
  const config = fallbackConfig[type] || defaultConfig;
  const Icon = config.icon;

  return (
    <div
      className={`bg-gradient-to-br ${config.gradient} flex items-center justify-center ${className}`}
      onClick={onClick}
    >
      <Icon size={iconSize} className="text-white/30" />
      {children}
    </div>
  );
}

/**
 * A wrapper for background-image divs that detects load failures and swaps to
 * the gradient fallback. Uses an invisible <img> to detect errors since CSS
 * background-image has no onError event.
 */
export function ImageWithFallback({
  src,
  type,
  className = "",
  iconSize = 40,
  children,
  onClick,
}: {
  src: string | null;
  type: string;
  className?: string;
  iconSize?: number;
  children?: React.ReactNode;
  onClick?: () => void;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <ImageFallback type={type} className={className} iconSize={iconSize} onClick={onClick}>
        {children}
      </ImageFallback>
    );
  }

  return (
    <div
      className={`bg-cover bg-center ${className}`}
      style={{ backgroundImage: `url(${src})` }}
      onClick={onClick}
    >
      {/* Hidden image to detect load errors */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className="sr-only"
        onError={() => setFailed(true)}
      />
      {children}
    </div>
  );
}
