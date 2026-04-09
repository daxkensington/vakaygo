"use client";

import { Clock } from "lucide-react";

type ItineraryStop = {
  stopNumber: number;
  title: string;
  description: string;
  duration?: string;
  time?: string;
};

export function TourItinerary({ itinerary }: { itinerary: ItineraryStop[] }) {
  if (!itinerary || itinerary.length === 0) return null;

  return (
    <div className="mt-8">
      <h2
        className="text-xl font-bold text-navy-700 mb-6"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Tour Itinerary
      </h2>

      <div className="relative">
        {/* Connecting line */}
        <div className="absolute left-[19px] top-6 bottom-6 w-0.5 bg-gold-300" />

        <div className="space-y-6">
          {itinerary.map((stop, index) => (
            <div key={stop.stopNumber} className="relative flex gap-4">
              {/* Numbered circle badge */}
              <div className="relative z-10 flex-shrink-0">
                <div className="w-10 h-10 rounded-full bg-teal-500 text-white flex items-center justify-center font-bold text-sm shadow-sm">
                  {stop.stopNumber}
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 pb-2">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold text-navy-700 text-sm leading-tight pt-2">
                    {stop.title}
                  </h3>
                  <div className="flex items-center gap-2 shrink-0 pt-2">
                    {stop.time && (
                      <span className="text-xs font-medium text-navy-400">
                        {stop.time}
                      </span>
                    )}
                    {stop.duration && (
                      <span className="inline-flex items-center gap-1 bg-cream-100 text-navy-500 text-xs font-medium px-2.5 py-1 rounded-full">
                        <Clock size={10} className="text-gold-500" />
                        {stop.duration}
                      </span>
                    )}
                  </div>
                </div>
                <p className="mt-1.5 text-sm text-navy-500 leading-relaxed">
                  {stop.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
