"use client";

import { useEffect, useState } from "react";
import {
  Sparkles,
  TrendingUp,
  Star,
  Clock,
  Eye,
  RefreshCw,
} from "lucide-react";

const insightIcons = [
  <TrendingUp key="trending" size={16} className="text-emerald-500" />,
  <Star key="star" size={16} className="text-gold-500" />,
  <Clock key="clock" size={16} className="text-amber-500" />,
  <Eye key="eye" size={16} className="text-teal-500" />,
];

export function AiInsights() {
  const [insights, setInsights] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function fetchInsights(force = false) {
    try {
      const url = force
        ? "/api/ai/operator-insights?refresh=1"
        : "/api/ai/operator-insights";
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      if (data.insights) setInsights(data.insights);
    } catch {
      // silently fail
    }
  }

  useEffect(() => {
    setLoading(true);
    fetchInsights().finally(() => setLoading(false));
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    await fetchInsights(true);
    setRefreshing(false);
  }

  return (
    <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-teal-500 to-gold-500 rounded-lg flex items-center justify-center">
            <Sparkles size={16} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-navy-700">AI Insights</h2>
            <p className="text-xs text-navy-400">
              Quick insights for your business
            </p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing || loading}
          className="flex items-center gap-1.5 text-xs font-medium text-navy-400 hover:text-teal-600 disabled:opacity-50 transition-colors"
        >
          <RefreshCw
            size={14}
            className={refreshing ? "animate-spin" : ""}
          />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-start gap-3 animate-pulse">
              <div className="w-8 h-8 bg-cream-100 rounded-lg shrink-0" />
              <div className="flex-1 space-y-1.5 pt-1">
                <div className="h-3 bg-cream-100 rounded-full w-full" />
                <div className="h-3 bg-cream-100 rounded-full w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : insights.length > 0 ? (
        <div className="space-y-3">
          {insights.map((insight, i) => (
            <div
              key={i}
              className="flex items-start gap-3 p-3 rounded-xl bg-cream-50 hover:bg-cream-100 transition-colors"
            >
              <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shrink-0 shadow-sm">
                {insightIcons[i % insightIcons.length]}
              </div>
              <p className="text-sm text-navy-600 leading-relaxed pt-1">
                {insight}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-sm text-navy-300">
          No insights available yet. Check back when you have more activity.
        </div>
      )}
    </div>
  );
}
