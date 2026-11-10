"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { MapPin, ArrowRight } from "lucide-react";
import { getIslandFlag } from "@/lib/island-flags";

export type DeferredIsland = {
  id: number;
  slug: string;
  name: string;
  listingCount: number;
  image: string;
};

export function DeferredIslandGrid({ islands }: { islands: DeferredIsland[] }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Defer the remaining cards until idle, with a timeout so sustained
    // browser activity cannot indefinitely delay the destination links.
    let active = true;
    const mount = () => {
      if (active) setMounted(true);
    };
    const idleWindow = window as unknown as {
      requestIdleCallback?: (cb: () => void, options: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const ric = idleWindow.requestIdleCallback;
    const cancelIdle = idleWindow.cancelIdleCallback;

    if (ric && cancelIdle) {
      const idleId = ric.call(window, mount, { timeout: 2000 });
      return () => {
        active = false;
        cancelIdle.call(window, idleId);
      };
    }

    const timerId = window.setTimeout(mount, 200);
    return () => {
      active = false;
      window.clearTimeout(timerId);
    };
  }, []);

  if (!mounted) return null;

  return (
    <>
      {islands.map((island) => {
        const flag = getIslandFlag(island.slug);
        return (
          <Link
            key={island.id}
            href={`/${island.slug}`}
            className="group relative h-64 rounded-3xl overflow-hidden shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-elevated)] transition-all duration-500 defer-offscreen"
            style={{ containIntrinsicSize: "1px 256px" }}
          >
            <Image
              src={island.image}
              alt={island.name}
              fill
              loading="lazy"
              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              quality={75}
              className="object-cover transition-transform duration-700 group-hover:scale-110"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-navy-900/80 via-navy-900/20 to-transparent" />
            <div className="absolute inset-0 bg-navy-900/10 group-hover:bg-navy-900/0 transition-colors duration-500" />

            <div className="absolute bottom-0 left-0 right-0 p-6">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{flag}</span>
                <div>
                  <h2 className="text-xl font-bold text-white">{island.name}</h2>
                  <p className="text-white/60 text-sm flex items-center gap-1">
                    <MapPin size={12} />
                    {island.listingCount.toLocaleString()} listings
                  </p>
                </div>
              </div>
            </div>

            <div className="absolute bottom-6 right-6 w-10 h-10 bg-gold-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
              <ArrowRight size={18} className="text-white" />
            </div>
          </Link>
        );
      })}
    </>
  );
}
