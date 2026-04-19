"use client";

import { Check, X, MapPin, Clock, Users } from "lucide-react";

type WhatsIncludedProps = {
  typeData: Record<string, unknown> | null;
  listingType: string;
};

const TOUR_TYPES = ["tour", "excursion", "vip", "guide"];

export function WhatsIncluded({ typeData, listingType }: WhatsIncludedProps) {
  if (!typeData || !TOUR_TYPES.includes(listingType)) return null;

  const included = (typeData.included as string[] | undefined) || [];
  const excluded = (typeData.excluded as string[] | undefined) || [];
  const meetingPoint = typeData.meetingPoint as string | undefined;
  const duration = typeData.duration as string | undefined;
  const groupSize = typeData.groupSize as number | undefined;

  if (included.length === 0 && excluded.length === 0 && !meetingPoint) {
    return null;
  }

  return (
    <div className="mt-8">
      <h2 className="text-xl font-bold text-navy-700 mb-4">
        What&apos;s Included
      </h2>

      {/* Info badges */}
      {(duration || groupSize) && (
        <div className="flex flex-wrap gap-3 mb-5">
          {duration && (
            <div className="flex items-center gap-2 bg-white rounded-xl px-4 py-2.5 shadow-sm">
              <Clock size={14} className="text-gold-700" />
              <span className="text-sm font-medium text-navy-600">{duration}</span>
            </div>
          )}
          {groupSize && (
            <div className="flex items-center gap-2 bg-white rounded-xl px-4 py-2.5 shadow-sm">
              <Users size={14} className="text-gold-700" />
              <span className="text-sm font-medium text-navy-600">
                Max {groupSize} people
              </span>
            </div>
          )}
        </div>
      )}

      {/* Included / Excluded columns */}
      {(included.length > 0 || excluded.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Included */}
          {included.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-navy-600 mb-3 uppercase tracking-wide">
                Included
              </h3>
              <div className="space-y-2.5">
                {included.map((item) => (
                  <div key={item} className="flex items-center gap-3">
                    <div className="w-6 h-6 bg-teal-50 rounded-full flex items-center justify-center shrink-0">
                      <Check size={14} className="text-teal-500" />
                    </div>
                    <span className="text-navy-600 text-sm">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Excluded */}
          {excluded.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-navy-600 mb-3 uppercase tracking-wide">
                Not Included
              </h3>
              <div className="space-y-2.5">
                {excluded.map((item) => (
                  <div key={item} className="flex items-center gap-3">
                    <div className="w-6 h-6 bg-red-50 rounded-full flex items-center justify-center shrink-0">
                      <X size={14} className="text-red-400" />
                    </div>
                    <span className="text-navy-500 text-sm">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Meeting Point */}
      {meetingPoint && (
        <div className="mt-5 flex items-start gap-3 p-4 bg-cream-50 rounded-xl">
          <MapPin size={16} className="text-gold-700 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-navy-700">Meeting Point</p>
            <p className="text-sm text-navy-500 mt-0.5">{meetingPoint}</p>
          </div>
        </div>
      )}
    </div>
  );
}
