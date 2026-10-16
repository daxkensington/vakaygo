"use client";

import { safeWebUrl } from "@/lib/listing-structured-data";
import { useAuth } from "@/lib/auth-context";
import { claimStartHref } from "@/lib/claim-return";
import {
  Phone,
  Globe,
  Clock,
  MapPin,
  ExternalLink,
  MessageCircle,
} from "lucide-react";

type ContactInfoProps = {
  listingId?: string;
  bookingEligible?: boolean;
  unclaimed?: boolean;
  typeData: Record<string, unknown> | null;
};

function phoneContact(value: unknown) {
  if (typeof value !== "string") return undefined;
  const label = value.trim();
  const match = label.match(/^(\+?[\d\s().-]+?)(?:\s*(?:ext\.?|x|#)\s*(\d{1,6}))?$/i);
  if (!match) return undefined;
  const number = match[1].replace(/[^\d+]/g, "");
  const digits = number.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return undefined;
  const whatsappHref =
    digits.length >= 10 && !match[2]
      ? `https://wa.me/${digits}?text=${encodeURIComponent("Hi! I found your business on VakayGo.com and would like to inquire about availability.")}`
      : undefined;
  return { label, href: `tel:${number}${match[2] ? `;ext=${match[2]}` : ""}`, whatsappHref };
}

export function ContactInfo({ typeData, listingId, bookingEligible = false, unclaimed }: ContactInfoProps) {
  const { user } = useAuth();
  if (!typeData) return null;

  const phone = phoneContact(typeData.phone);
  const website = safeWebUrl(typeData.website);
  const googleMapsUrl = safeWebUrl(typeData.googleMapsUrl);
  const hours = Array.isArray(typeData.hours) ? typeData.hours : [typeData.hours];
  const hoursList = hours.filter((line): line is string => typeof line === "string" && Boolean(line.trim())).map(line => line.trim());
  const isUnclaimed = unclaimed ?? typeData.unclaimed === true;

  // Don't render if there's nothing to show
  const hasContact = phone || website || hoursList.length > 0 || googleMapsUrl;
  if (!hasContact) return null;

  return (
    <section id="business-contact" aria-label="Contact and location" className="mt-8 p-6 bg-white rounded-2xl border border-cream-200 shadow-[var(--shadow-card)]">
      <h2 className="text-lg font-bold text-navy-700">
        {phone || website ? "Contact this business" : "Location & hours"}
      </h2>
      {(phone || website) && (
        <p className="mt-2 text-sm leading-relaxed text-navy-500">
          Contact the business directly for current hours, availability and prices.
          {!bookingEligible && " Online bookings and payments are unavailable on VakayGo for this listing."}
        </p>
      )}

      <div className="mt-4 space-y-4">
        {/* Phone & WhatsApp */}
        {phone && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gold-50 rounded-full flex items-center justify-center shrink-0">
                <Phone size={16} className="text-gold-700" />
              </div>
              <a
                href={phone.href}
                className="text-navy-600 hover:text-gold-600 transition-colors font-semibold break-words focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold-700"
              >
                Call {phone.label}
              </a>
            </div>
            {phone.whatsappHref && (
              <a
                href={phone.whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold transition-colors"
              >
                <MessageCircle size={14} className="shrink-0" aria-hidden="true" />
                WhatsApp Business
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            )}
          </div>
        )}

        {/* Website */}
        {website && (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gold-50 rounded-full flex items-center justify-center shrink-0">
              <Globe size={16} className="text-gold-700" />
            </div>
            <div className="min-w-0">
              <a
                href={website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gold-700 hover:text-gold-800 transition-colors font-semibold inline-flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold-700"
              >
                Visit business website
                <ExternalLink size={13} className="shrink-0" aria-hidden="true" />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              <p className="text-xs text-navy-400 break-all">{new URL(website).hostname.replace(/^www\./, "")}</p>
            </div>
          </div>
        )}

        {/* Business Hours */}
        {hoursList.length > 1 ? (
          <details>
            <summary className="flex items-center gap-3 w-full text-left cursor-pointer">
              <div className="w-9 h-9 bg-gold-50 rounded-full flex items-center justify-center shrink-0">
                <Clock size={16} className="text-gold-700" />
              </div>
              <span className="text-navy-600 font-medium">Business Hours</span>
              <span className="ml-auto text-xs text-navy-400">View hours</span>
            </summary>
              <ul className="mt-3 ml-12 space-y-1.5">
                {hoursList.map((line, i) => (
                  <li key={i} className="text-sm text-navy-500">
                    {line}
                  </li>
                ))}
              </ul>
          </details>
        ) : hoursList.length === 1 ? (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gold-50 rounded-full flex items-center justify-center shrink-0">
              <Clock size={16} className="text-gold-700" />
            </div>
            <span className="text-navy-600 font-medium">{hoursList[0]}</span>
          </div>
        ) : null}

        {/* Google Maps */}
        {googleMapsUrl && (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gold-50 rounded-full flex items-center justify-center shrink-0">
              <MapPin size={16} className="text-gold-700" />
            </div>
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-navy-600 hover:text-gold-600 transition-colors font-medium flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold-700"
            >
              View on Google Maps
              <ExternalLink size={13} className="text-navy-300" aria-hidden="true" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </div>
        )}
      </div>

      {/* Claim banner */}
      {isUnclaimed && (
        <p className="mt-5 pt-4 border-t border-cream-200 text-xs text-navy-400">
          Business ownership has not been verified on VakayGo. If this is your business,{" "}
          <a
            href={listingId ? claimStartHref(listingId, Boolean(user)) : "/for-businesses#find-listing"}
            className="text-gold-700 font-semibold hover:underline"
          >
            claim it for free
          </a>{" "}
          to manage your details.
        </p>
      )}
    </section>
  );
}
