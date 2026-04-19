"use client";

import { useEffect, useState } from "react";
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Lightbulb,
} from "lucide-react";

type KeywordEntry = {
  word: string;
  count: number;
  sentiment: "positive" | "negative" | "neutral";
};

type IntelligenceData = {
  summary: string;
  sentiment: "positive" | "mixed" | "negative";
  sentimentScore: number;
  highlights: string[];
  concerns: string[];
  bestFor: string[];
  trendDirection: "improving" | "stable" | "declining";
  tipFromReviewers: string;
  keywordCloud: KeywordEntry[];
};

export function ReviewIntelligence({
  listingId,
  reviewCount,
}: {
  listingId: string;
  reviewCount: number;
}) {
  const [data, setData] = useState<IntelligenceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (reviewCount < 3) return;
    setLoading(true);
    fetch("/api/ai/review-intelligence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingId }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((result) => {
        if (result && result.summary) setData(result);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [listingId, reviewCount]);

  if (reviewCount < 3 || (!data && !loading)) return null;

  const sentimentDot =
    data?.sentiment === "positive"
      ? "bg-emerald-500"
      : data?.sentiment === "negative"
        ? "bg-red-500"
        : "bg-amber-500";

  const trendIcon =
    data?.trendDirection === "improving" ? (
      <TrendingUp size={14} className="text-emerald-500" />
    ) : data?.trendDirection === "declining" ? (
      <TrendingDown size={14} className="text-red-500" />
    ) : (
      <ArrowRight size={14} className="text-navy-400" />
    );

  const trendLabel =
    data?.trendDirection === "improving"
      ? "Improving"
      : data?.trendDirection === "declining"
        ? "Declining"
        : "Stable";

  const maxKeywordCount = data
    ? Math.max(...data.keywordCloud.map((k) => k.count), 1)
    : 1;

  return (
    <div className="mb-6">
      {loading ? (
        <div className="p-5 bg-gradient-to-r from-teal-50 to-gold-50 rounded-2xl shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-teal-500/15 rounded-lg flex items-center justify-center shrink-0">
              <Sparkles size={16} className="text-teal-600 animate-pulse" />
            </div>
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-teal-200/50 rounded-full w-3/4 animate-pulse" />
              <div className="h-3 bg-teal-200/50 rounded-full w-1/2 animate-pulse" />
            </div>
          </div>
        </div>
      ) : data ? (
        <div className="bg-gradient-to-r from-teal-50 to-gold-50 rounded-2xl shadow-[var(--shadow-card)] overflow-hidden">
          {/* Summary header - always visible */}
          <div className="p-5">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-teal-500/15 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles size={16} className="text-teal-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-sm font-bold text-navy-700">
                    AI Review Analysis
                  </h3>
                  <span
                    className={`w-2 h-2 rounded-full ${sentimentDot}`}
                    title={`Sentiment: ${data.sentiment}`}
                  />
                  <span className="text-xs text-navy-400 capitalize">
                    {data.sentiment}
                  </span>
                  <span className="text-navy-200">|</span>
                  <span className="flex items-center gap-1 text-xs text-navy-400">
                    {trendIcon}
                    {trendLabel}
                  </span>
                </div>
                <p className="text-navy-700 text-sm leading-relaxed">
                  {data.summary}
                </p>
              </div>
            </div>

            {/* Expand/Collapse toggle */}
            <button
              onClick={() => setExpanded(!expanded)}
              className="mt-3 ml-11 flex items-center gap-1 text-xs font-medium text-teal-600 hover:text-teal-700 transition-colors"
            >
              {expanded ? (
                <>
                  Show less <ChevronUp size={14} />
                </>
              ) : (
                <>
                  View full analysis <ChevronDown size={14} />
                </>
              )}
            </button>
          </div>

          {/* Expanded detail */}
          {expanded && (
            <div className="px-5 pb-5 space-y-5 border-t border-teal-100/50 pt-4">
              {/* Highlights & Concerns */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {data.highlights.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-navy-500 mb-2">
                      Highlights
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {data.highlights.map((h) => (
                        <span
                          key={h}
                          className="inline-block bg-emerald-100 text-emerald-700 text-xs px-2.5 py-1 rounded-full"
                        >
                          {h}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {data.concerns.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-navy-500 mb-2">
                      Things to note
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {data.concerns.map((c) => (
                        <span
                          key={c}
                          className="inline-block bg-amber-100 text-amber-700 text-xs px-2.5 py-1 rounded-full"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Best For */}
              {data.bestFor.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-navy-500 mb-2">
                    Best for
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {data.bestFor.map((b) => (
                      <span
                        key={b}
                        className="inline-block bg-sky-100 text-sky-700 text-xs px-2.5 py-1 rounded-full"
                      >
                        {b}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Tip from Reviewers */}
              {data.tipFromReviewers && (
                <div className="flex items-start gap-2.5 p-3 bg-white/70 rounded-xl">
                  <Lightbulb
                    size={16}
                    className="text-gold-700 shrink-0 mt-0.5"
                  />
                  <div>
                    <p className="text-xs font-semibold text-navy-500 mb-0.5">
                      Tip from reviewers
                    </p>
                    <p className="text-sm text-navy-600">
                      {data.tipFromReviewers}
                    </p>
                  </div>
                </div>
              )}

              {/* Keyword Cloud */}
              {data.keywordCloud.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-navy-500 mb-2">
                    Most mentioned
                  </p>
                  <div className="flex flex-wrap gap-2 items-center">
                    {data.keywordCloud
                      .sort((a, b) => b.count - a.count)
                      .map((kw) => {
                        const scale =
                          0.75 + (kw.count / maxKeywordCount) * 0.5;
                        const colorClass =
                          kw.sentiment === "positive"
                            ? "text-emerald-600"
                            : kw.sentiment === "negative"
                              ? "text-red-500"
                              : "text-navy-500";
                        return (
                          <span
                            key={kw.word}
                            className={`${colorClass} font-medium`}
                            style={{ fontSize: `${scale}rem` }}
                            title={`${kw.word}: mentioned ${kw.count} time${kw.count !== 1 ? "s" : ""} (${kw.sentiment})`}
                          >
                            {kw.word}
                          </span>
                        );
                      })}
                  </div>
                </div>
              )}

              <p className="text-xs text-navy-300">
                AI-generated analysis based on {reviewCount} reviews
              </p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
