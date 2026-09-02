"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Bed,
  Compass,
  UtensilsCrossed,
  CalendarDays,
  Car,
  Palmtree,
  Users,
  Sparkles,
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
  spa: { gradient: "from-pink-400 to-pink-600", icon: Sparkles },
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
 * Hosts next/image may optimise (must match next.config remotePatterns).
 * Anything else — operator-pasted URLs on arbitrary hosts, our own
 * /api/images/proxy — falls back to a plain <img>, because next/image
 * THROWS at render time for an unconfigured host.
 */
const OPTIMIZABLE_HOSTS = [
  ".public.blob.vercel-storage.com",
  "images.unsplash.com",
  "lh3.googleusercontent.com",
  "imgen.x.ai",
];

function isOptimizable(src: string): boolean {
  if (src.startsWith("/") && !src.startsWith("/api/")) return true; // static asset
  try {
    const { protocol, hostname } = new URL(src);
    if (protocol !== "https:") return false;
    return OPTIMIZABLE_HOSTS.some((h) => (h.startsWith(".") ? hostname.endsWith(h) : hostname === h));
  } catch {
    return false;
  }
}

/**
 * Listing image with fallback.
 *
 * Renders through next/image when the host allows it, so a 400px card
 * gets a 400px WebP instead of the 300–500 KB Blob original (a listing
 * page was shipping 2.3 MB of images on mobile). `sizes` tells the
 * browser how wide the slot is — pass it for anything that isn't a
 * third-of-the-row card. Falls back to the gradient placeholder on load
 * failure or when src is null.
 *
 * Pass `priority` for above-the-fold images (hero, first card) so the
 * browser fetches them eagerly with high priority.
 */
export function ImageWithFallback({
  src,
  type,
  alt,
  className = "",
  iconSize = 40,
  children,
  onClick,
  priority = false,
  sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw",
}: {
  src: string | null;
  type: string;
  alt?: string;
  className?: string;
  iconSize?: number;
  children?: React.ReactNode;
  onClick?: () => void;
  priority?: boolean;
  /** CSS `sizes` for srcset selection. Default fits a 1/2/3-column card grid. */
  sizes?: string;
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
    <div className={`relative overflow-hidden ${className}`} onClick={onClick}>
      {isOptimizable(src) ? (
        <Image
          src={src}
          alt={alt || ""}
          fill
          sizes={sizes}
          priority={priority}
          loading={priority ? "eager" : "lazy"}
          quality={75}
          onError={() => setFailed(true)}
          className="object-cover"
        />
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={src}
          alt={alt || ""}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={priority ? "high" : "auto"}
          width={800}
          height={600}
          onError={() => setFailed(true)}
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}
      {children}
    </div>
  );
}
