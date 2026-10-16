"use client";

import { useAuth } from "@/lib/auth-context";
import { claimStartHref } from "@/lib/claim-return";
import {
  Clock,
  ShieldCheck,
} from "lucide-react";

type ContactInfoProps = {
  listingId?: string;
  bookingEligible?: boolean;
  unclaimed?: boolean;
  typeData: Record<string, unknown> | null;
};

export function ContactInfo({ typeData, listingId, bookingEligible = false, unclaimed }: ContactInfoProps) {
  const { user } = useAuth();
  if (!typeData) return null;

  const hours = Array.isArray(typeData.hours) ? typeData.hours : [typeData.hours];
  const hoursList = hours
    .filter((line): line is string => typeof line === "string" && Boolean(line.trim()))
    .map((line) => line.trim());
  const isUnclaimed = unclaimed ?? typeData.unclaimed === true;

  // Render if there are valid business hours or if listing context is provided
  const hasContent = hoursList.length > 0 || Boolean(listingId) || bookingEligible || isUnclaimed;
  if (!hasContent) return null;

  return (
    <section
      id="business-contact"
      aria-label="Booking protection and hours"
      className="mt-8 p-6 bg-white rounded-2xl border border-cream-200 shadow-[var(--shadow-card)]"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 bg-teal-50 rounded-full flex items-center justify-center shrink-0 mt-0.5">
          <ShieldCheck size={18} className="text-teal-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-navy-700">
            Protected by VakayGo
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-navy-500">
            {bookingEligible
              ? "To protect your reservation under the VakayGo Guarantee, direct operator contact details and check-in instructions are shared automatically after your booking is confirmed and paid. Have a question first? Message the operator in-app or ask our AI Concierge."
              : "Direct operator contact details are protected until a booking is confirmed on VakayGo. Online bookings and payments are currently unavailable for this listing—register your interest and we will notify you as soon as this operator enables instant booking."}
          </p>
        </div>
      </div>

      {hoursList.length > 0 && (
        <div className="mt-5 pt-4 border-t border-cream-100">
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
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gold-50 rounded-full flex items-center justify-center shrink-0">
                <Clock size={16} className="text-gold-700" />
              </div>
              <span className="text-sm text-navy-600">{hoursList[0]}</span>
            </div>
          )}
        </div>
      )}

      {isUnclaimed && listingId && (
        <p className="mt-5 border-t border-cream-200 pt-4 text-xs text-navy-400">
          Own or represent this business?{" "}
          <a
            href={claimStartHref(listingId, Boolean(user))}
            className="font-semibold text-gold-700 underline hover:text-gold-800"
          >
            Claim this listing for free
          </a>{" "}
          to manage your profile and accept protected bookings on VakayGo.
        </p>
      )}
    </section>
  );
}
