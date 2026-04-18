"use client";

import { useState } from "react";
import {
  Phone,
  Globe,
  Clock,
  MapPin,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

type ContactInfoProps = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  typeData: Record<string, any> | null;
};

export function ContactInfo({ typeData }: ContactInfoProps) {
  const [hoursOpen, setHoursOpen] = useState(false);

  if (!typeData) return null;

  const { phone, website, hours, googleMapsUrl, unclaimed } = typeData;

  // Don't render if there's nothing to show
  const hasContact = phone || website || hours || googleMapsUrl;
  if (!hasContact) return null;

  // hours can be a string or an array of strings (e.g. per-day schedule)
  const hoursList: string[] | null = hours
    ? Array.isArray(hours)
      ? hours
      : [hours]
    : null;

  return (
    <div className="mt-8 p-6 bg-cream-50 rounded-2xl shadow-[var(--shadow-card)]">
      <h2 className="text-lg font-bold text-navy-700 mb-4">
        Contact &amp; Location
      </h2>

      <div className="space-y-4">
        {/* Phone */}
        {phone && (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gold-50 rounded-full flex items-center justify-center shrink-0">
              <Phone size={16} className="text-gold-600" />
            </div>
            <a
              href={`tel:${phone}`}
              className="text-navy-600 hover:text-gold-600 transition-colors font-medium"
            >
              {String(phone)}
            </a>
          </div>
        )}

        {/* Website */}
        {website && (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gold-50 rounded-full flex items-center justify-center shrink-0">
              <Globe size={16} className="text-gold-600" />
            </div>
            <a
              href={String(website)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-navy-600 hover:text-gold-600 transition-colors font-medium flex items-center gap-1.5 truncate"
            >
              <span className="truncate">
                {String(website).replace(/^https?:\/\/(www\.)?/, "")}
              </span>
              <ExternalLink size={13} className="shrink-0 text-navy-300" />
            </a>
          </div>
        )}

        {/* Business Hours */}
        {hoursList && hoursList.length > 1 ? (
          <div>
            <button
              onClick={() => setHoursOpen(!hoursOpen)}
              className="flex items-center gap-3 w-full text-left"
            >
              <div className="w-9 h-9 bg-gold-50 rounded-full flex items-center justify-center shrink-0">
                <Clock size={16} className="text-gold-600" />
              </div>
              <span className="text-navy-600 font-medium">Business Hours</span>
              {hoursOpen ? (
                <ChevronUp size={16} className="ml-auto text-navy-400" />
              ) : (
                <ChevronDown size={16} className="ml-auto text-navy-400" />
              )}
            </button>
            {hoursOpen && (
              <ul className="mt-3 ml-12 space-y-1.5">
                {hoursList.map((line, i) => (
                  <li key={i} className="text-sm text-navy-500">
                    {line}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : hoursList ? (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gold-50 rounded-full flex items-center justify-center shrink-0">
              <Clock size={16} className="text-gold-600" />
            </div>
            <span className="text-navy-600 font-medium">{hoursList[0]}</span>
          </div>
        ) : null}

        {/* Google Maps */}
        {googleMapsUrl && (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gold-50 rounded-full flex items-center justify-center shrink-0">
              <MapPin size={16} className="text-gold-600" />
            </div>
            <a
              href={String(googleMapsUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-navy-600 hover:text-gold-600 transition-colors font-medium flex items-center gap-1.5"
            >
              View on Google Maps
              <ExternalLink size={13} className="text-navy-300" />
            </a>
          </div>
        )}
      </div>

      {/* Claim banner */}
      {unclaimed && (
        <p className="mt-5 pt-4 border-t border-cream-200 text-xs text-navy-400">
          This listing was created from public data. If this is your business,{" "}
          <a
            href="/auth/signup"
            className="text-gold-700 font-semibold hover:underline"
          >
            claim it for free
          </a>{" "}
          to manage your details.
        </p>
      )}
    </div>
  );
}
