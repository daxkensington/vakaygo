"use client";

import { useEffect, useState } from "react";
import { Star, MessageSquare, Clock, Send, X } from "lucide-react";

type Review = {
  id: string;
  rating: number;
  title: string | null;
  comment: string | null;
  operatorReply: string | null;
  operatorRepliedAt: string | null;
  createdAt: string;
  listingTitle: string;
  travelerName: string | null;
};

type Stats = {
  avgRating: number;
  totalReviews: number;
  responseRate: number;
};

type Filter = "all" | "needs_reply" | "replied";

function Stars({ rating, size = 16 }: { rating: number; size?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          className={
            i <= rating
              ? "text-gold-500 fill-gold-500"
              : "text-navy-200 fill-navy-200"
          }
        />
      ))}
    </div>
  );
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function OperatorReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [stats, setStats] = useState<Stats>({
    avgRating: 0,
    totalReviews: 0,
    responseRate: 0,
  });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchReviews();
  }, []);

  async function fetchReviews() {
    try {
      const res = await fetch("/api/operator/reviews");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setReviews(data.reviews);
      setStats(data.stats);
    } catch (err) {
      console.error("Failed to load reviews:", err);
    } finally {
      setLoading(false);
    }
  }

  async function submitReply(reviewId: string) {
    if (!replyText.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/operator/reviews", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId, reply: replyText }),
      });
      if (!res.ok) throw new Error("Failed to save reply");
      const data = await res.json();
      setReviews((prev) =>
        prev.map((r) =>
          r.id === reviewId
            ? {
                ...r,
                operatorReply: data.review.operatorReply,
                operatorRepliedAt: data.review.operatorRepliedAt,
              }
            : r
        )
      );
      // Recompute response rate
      setStats((prev) => {
        const repliedCount = reviews.filter(
          (r) => r.id === reviewId || r.operatorReply
        ).length;
        return {
          ...prev,
          responseRate:
            prev.totalReviews > 0
              ? Math.round((repliedCount / prev.totalReviews) * 100)
              : 0,
        };
      });
      setReplyingTo(null);
      setReplyText("");
    } catch (err) {
      console.error("Failed to save reply:", err);
    } finally {
      setSaving(false);
    }
  }

  const filtered = reviews.filter((r) => {
    if (filter === "needs_reply") return !r.operatorReply;
    if (filter === "replied") return !!r.operatorReply;
    return true;
  });

  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: reviews.length },
    {
      key: "needs_reply",
      label: "Needs Reply",
      count: reviews.filter((r) => !r.operatorReply).length,
    },
    {
      key: "replied",
      label: "Replied",
      count: reviews.filter((r) => !!r.operatorReply).length,
    },
  ];

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <div className="h-8 w-40 bg-navy-100 rounded animate-pulse" />
          <div className="h-4 w-64 bg-navy-100 rounded animate-pulse mt-2" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] h-24 animate-pulse"
            />
          ))}
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] h-40 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1
          className="text-3xl font-bold text-navy-700"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Reviews
        </h1>
        <p className="text-navy-400 mt-1">
          See what travelers are saying about your listings
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] text-center">
          <div className="flex items-center justify-center gap-1 mb-2">
            <Star size={24} className="text-gold-500 fill-gold-500" />
            <span className="text-3xl font-bold text-navy-700">
              {stats.totalReviews > 0 ? stats.avgRating : "—"}
            </span>
          </div>
          {stats.totalReviews > 0 && (
            <div className="flex justify-center mb-1">
              <Stars rating={Math.round(stats.avgRating)} size={14} />
            </div>
          )}
          <p className="text-sm text-navy-400">Average Rating</p>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] text-center">
          <span className="text-3xl font-bold text-navy-700">
            {stats.totalReviews}
          </span>
          <p className="text-sm text-navy-400 mt-2">Total Reviews</p>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] text-center">
          <span className="text-3xl font-bold text-navy-700">
            {stats.responseRate}%
          </span>
          <p className="text-sm text-navy-400 mt-2">Response Rate</p>
        </div>
      </div>

      {/* Filter Tabs */}
      {reviews.length > 0 && (
        <div className="flex gap-2 mb-6">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                filter === tab.key
                  ? "bg-navy-700 text-white"
                  : "bg-white text-navy-500 hover:bg-navy-50"
              }`}
            >
              {tab.label}
              <span
                className={`ml-1.5 text-xs ${
                  filter === tab.key ? "text-navy-300" : "text-navy-300"
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Reviews List */}
      {filtered.length > 0 ? (
        <div className="space-y-4">
          {filtered.map((review) => (
            <div
              key={review.id}
              className="bg-white rounded-2xl shadow-[var(--shadow-card)] p-6"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <Stars rating={review.rating} />
                    {review.title && (
                      <span className="font-semibold text-navy-700">
                        {review.title}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-navy-400">
                    <span className="font-medium text-navy-600">
                      {review.travelerName || "Anonymous"}
                    </span>
                    <span>&middot;</span>
                    <span>{formatDate(review.createdAt)}</span>
                    <span>&middot;</span>
                    <span className="text-coral-500">{review.listingTitle}</span>
                  </div>
                </div>
                {review.operatorReply ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full whitespace-nowrap">
                    <MessageSquare size={12} />
                    Replied
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full whitespace-nowrap">
                    <Clock size={12} />
                    Needs Reply
                  </span>
                )}
              </div>

              {/* Comment */}
              {review.comment && (
                <p className="text-navy-600 mt-3 leading-relaxed">
                  {review.comment}
                </p>
              )}

              {/* Reply Section */}
              {review.operatorReply && (
                <div className="ml-12 pl-4 border-l-2 border-gold-200 mt-4">
                  <p className="text-sm font-medium text-navy-700 mb-1">
                    Your Reply
                  </p>
                  <p className="text-sm text-navy-500 leading-relaxed">
                    {review.operatorReply}
                  </p>
                  {review.operatorRepliedAt && (
                    <p className="text-xs text-navy-300 mt-1">
                      {formatDate(review.operatorRepliedAt)}
                    </p>
                  )}
                </div>
              )}

              {/* Reply Button / Form */}
              {!review.operatorReply && replyingTo !== review.id && (
                <button
                  onClick={() => {
                    setReplyingTo(review.id);
                    setReplyText("");
                  }}
                  className="mt-4 flex items-center gap-2 text-sm font-medium text-coral-500 hover:text-coral-600 transition-colors"
                >
                  <MessageSquare size={16} />
                  Reply
                </button>
              )}

              {replyingTo === review.id && (
                <div className="ml-12 pl-4 border-l-2 border-gold-200 mt-4">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Write your reply..."
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl border border-navy-200 text-sm text-navy-700 placeholder:text-navy-300 focus:outline-none focus:ring-2 focus:ring-coral-500/30 focus:border-coral-500 resize-none"
                    autoFocus
                  />
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={() => submitReply(review.id)}
                      disabled={saving || !replyText.trim()}
                      className="flex items-center gap-2 px-4 py-2 bg-coral-500 text-white text-sm font-medium rounded-xl hover:bg-coral-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Send size={14} />
                      {saving ? "Saving..." : "Save Reply"}
                    </button>
                    <button
                      onClick={() => {
                        setReplyingTo(null);
                        setReplyText("");
                      }}
                      className="flex items-center gap-2 px-4 py-2 text-navy-400 text-sm font-medium rounded-xl hover:bg-navy-50 transition-colors"
                    >
                      <X size={14} />
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : reviews.length > 0 ? (
        /* Filtered empty state */
        <div className="bg-white rounded-2xl p-12 shadow-[var(--shadow-card)] text-center">
          <MessageSquare size={40} className="text-navy-200 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-navy-700">
            No {filter === "needs_reply" ? "unreplied" : "replied"} reviews
          </h3>
          <p className="text-navy-400 mt-2">
            {filter === "needs_reply"
              ? "You've replied to all reviews. Great job!"
              : "You haven't replied to any reviews yet."}
          </p>
        </div>
      ) : (
        /* Empty State */
        <div className="bg-white rounded-2xl p-12 shadow-[var(--shadow-card)] text-center">
          <Star size={40} className="text-navy-200 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-navy-700">No reviews yet</h3>
          <p className="text-navy-400 mt-2 max-w-md mx-auto">
            When travelers complete bookings at your listings, they&apos;ll be
            prompted to leave a review. Reviews help build trust and attract more
            bookings.
          </p>
        </div>
      )}
    </div>
  );
}
