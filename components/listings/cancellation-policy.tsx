"use client";

import { useState } from "react";
import { Check, X, ChevronDown, ChevronUp, ShieldCheck, AlertTriangle } from "lucide-react";

type PolicyType = "flexible" | "moderate" | "strict" | "non_refundable";

const POLICIES: Record<
  PolicyType,
  {
    label: string;
    summary: string;
    details: string[];
    icon: typeof ShieldCheck;
    color: string;
    bgColor: string;
    freeCancel: boolean;
  }
> = {
  flexible: {
    label: "Flexible",
    summary: "Free cancellation up to 24 hours before",
    details: [
      "Full refund if cancelled at least 24 hours before start date",
      "50% refund if cancelled less than 24 hours before",
      "No refund for no-shows",
    ],
    icon: ShieldCheck,
    color: "text-teal-600",
    bgColor: "bg-teal-50",
    freeCancel: true,
  },
  moderate: {
    label: "Moderate",
    summary: "Free cancellation up to 7 days before",
    details: [
      "Full refund if cancelled at least 7 days before start date",
      "50% refund if cancelled 1-7 days before",
      "No refund if cancelled less than 24 hours before",
    ],
    icon: ShieldCheck,
    color: "text-teal-600",
    bgColor: "bg-teal-50",
    freeCancel: true,
  },
  strict: {
    label: "Strict",
    summary: "50% refund up to 14 days before, no refund after",
    details: [
      "50% refund if cancelled at least 14 days before start date",
      "No refund if cancelled less than 14 days before",
      "No refund for no-shows",
    ],
    icon: AlertTriangle,
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    freeCancel: false,
  },
  non_refundable: {
    label: "Non-Refundable",
    summary: "No refunds available for this listing",
    details: [
      "This booking is non-refundable once confirmed",
      "No refund for cancellations at any time",
      "Consider purchasing trip protection for coverage",
    ],
    icon: X,
    color: "text-red-600",
    bgColor: "bg-red-50",
    freeCancel: false,
  },
};

export function CancellationPolicy({
  policy = "moderate",
  compact = false,
}: {
  policy?: string | null;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const policyKey = (policy || "moderate") as PolicyType;
  const config = POLICIES[policyKey] || POLICIES.moderate;
  const Icon = config.icon;

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className={`w-5 h-5 ${config.bgColor} rounded-full flex items-center justify-center shrink-0`}>
          {config.freeCancel ? (
            <Check size={12} className="text-teal-500" />
          ) : (
            <X size={12} className={config.color} />
          )}
        </div>
        <span className="text-sm text-navy-600">
          {config.freeCancel ? (
            <span className="text-teal-600 font-medium">Free cancellation</span>
          ) : (
            <span className={`${config.color} font-medium`}>{config.label}</span>
          )}
          {" "}&middot; {config.summary}
        </span>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white rounded-2xl shadow-[var(--shadow-card)]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start justify-between text-left"
      >
        <div className="flex items-start gap-3">
          <div className={`w-6 h-6 ${config.bgColor} rounded-full flex items-center justify-center shrink-0 mt-0.5`}>
            <Icon size={14} className={config.color} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-navy-700">
              Cancellation Policy
              <span className={`ml-2 text-sm font-semibold ${config.color}`}>
                {config.label}
              </span>
            </h2>
            <p className="text-sm text-navy-500 mt-1">
              {config.freeCancel && (
                <span className="text-teal-600 font-medium">Free cancellation &middot; </span>
              )}
              {config.summary}
            </p>
          </div>
        </div>
        <div className="shrink-0 mt-1 text-navy-400">
          {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
      </button>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-cream-200 space-y-3">
          {config.details.map((detail, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className={`w-5 h-5 ${config.bgColor} rounded-full flex items-center justify-center shrink-0 mt-0.5`}>
                <span className="text-xs font-bold" style={{ color: "inherit" }}>
                  {i + 1}
                </span>
              </div>
              <p className="text-sm text-navy-500">{detail}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
