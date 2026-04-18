"use client";

import { useEffect, useState, useCallback } from "react";
import { Star, MessageCircle, PenLine, ThumbsUp, CheckCircle, ChevronDown } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { ReviewModal } from "@/components/listings/review-modal";
import { ReviewPhotoGallery, type ReviewPhoto } from "@/components/reviews/review-photo-gallery";
import { ReviewIntelligence } from "@/components/listings/review-intelligence";

type SubRating = {
  category: string;
  rating: number;
};

type Review = {
  id: string;
  rating: number;
  title: string | null;
  comment: string | null;
  operatorReply: string | null;
  createdAt: string;
  travelerName: string | null;
  travelerAvatar: string | null;
  photos: ReviewPhoto[];
  helpfulCount: number;
  isVerifiedPurchase: boolean;
  subRatings: SubRating[];
};

type SortOption = "newest" | "highest" | "lowest" | "helpful";

const SORT_LABELS: Record<SortOption, string> = {
  newest: "Newest",
  highest: "Highest Rated",
  lowest: "Lowest Rated",
  helpful: "Most Helpful",
};

const STAY_CATEGORIES = ["Cleanliness", "Accuracy", "Location", "Value", "Communication", "Check-in"];
const TOUR_CATEGORIES = ["Guide Quality", "Value", "Organization", "Safety"];
const TOUR_TYPES = ["tour", "excursion", "vip", "guide"];

function StarRating({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          size={size}
          className={
            star <= rating
              ? "text-gold-500 fill-gold-500"
              : "text-cream-300"
          }
        />
      ))}
    </div>
  );
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function SubRatingBars({
  reviews,
  listingType,
}: {
  reviews: Review[];
  listingType: string;
}) {
  const categories = TOUR_TYPES.includes(listingType)
    ? TOUR_CATEGORIES
    : listingType === "stay"
      ? STAY_CATEGORIES
      : null;

  if (!categories) return null;

  // Aggregate sub-ratings across all reviews
  const categoryAverages: { category: string; avg: number; count: number }[] = [];
  for (const cat of categories) {
    const ratings = reviews.flatMap((r) =>
      r.subRatings.filter(
        (sr) => sr.category.toLowerCase() === cat.toLowerCase()
      )
    );
    if (ratings.length > 0) {
      const avg = ratings.reduce((sum, sr) => sum + sr.rating, 0) / ratings.length;
      categoryAverages.push({ category: cat, avg, count: ratings.length });
    }
  }

  if (categoryAverages.length === 0) return null;

  return (
    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
      {categoryAverages.map(({ category, avg }) => (
        <div key={category} className="flex items-center gap-3">
          <span className="text-xs text-navy-500 w-28 shrink-0">{category}</span>
          <div className="flex-1 h-2 bg-cream-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-teal-500 rounded-full transition-all"
              style={{ width: `${(avg / 5) * 100}%` }}
            />
          </div>
          <span className="text-xs font-semibold text-navy-600 w-6 text-right">
            {avg.toFixed(1)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ReviewSection({
  listingId,
  listingTitle,
  listingType = "tour",
}: {
  listingId: string;
  listingTitle?: string;
  listingType?: string;
}) {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [sortOpen, setSortOpen] = useState(false);
  const [votingIds, setVotingIds] = useState<Set<string>>(new Set());

  const fetchReviews = useCallback(async () => {
    try {
      const res = await fetch(`/api/reviews?listingId=${listingId}`);
      if (!res.ok) return;
      const data = await res.json();
      setReviews(
        (data.reviews || []).map((r: Record<string, unknown>) => ({
          ...r,
          helpfulCount: r.helpfulCount ?? 0,
          isVerifiedPurchase: r.isVerifiedPurchase ?? false,
          subRatings: r.subRatings ?? [],
        }))
      );
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [listingId]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  // Sort reviews
  const sortedReviews = [...reviews].sort((a, b) => {
    switch (sortBy) {
      case "newest":
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case "highest":
        return b.rating - a.rating;
      case "lowest":
        return a.rating - b.rating;
      case "helpful":
        return b.helpfulCount - a.helpfulCount;
      default:
        return 0;
    }
  });

  async function handleVote(reviewId: string) {
    if (!user || votingIds.has(reviewId)) return;
    setVotingIds((prev) => new Set(prev).add(reviewId));
    try {
      const res = await fetch("/api/reviews/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId }),
      });
      if (res.ok) {
        const data = await res.json();
        setReviews((prev) =>
          prev.map((r) =>
            r.id === reviewId
              ? {
                  ...r,
                  helpfulCount: r.helpfulCount + (data.voted ? 1 : -1),
                }
              : r
          )
        );
      }
    } catch {
      // silently fail
    } finally {
      setVotingIds((prev) => {
        const next = new Set(prev);
        next.delete(reviewId);
        return next;
      });
    }
  }

  if (loading) return null;

  // Calculate overall stats
  const totalReviews = reviews.length;
  const avgRating =
    totalReviews > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews
      : 0;

  // Rating distribution
  const distribution = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r) => r.rating === star).length,
  }));

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-6">
        <h2
          className="text-xl font-bold text-navy-700"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Reviews
        </h2>
        {user && (
          <button
            onClick={() => setShowReviewModal(true)}
            className="flex items-center gap-2 bg-gold-700 hover:bg-gold-800 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
          >
            <PenLine size={14} />
            Write a Review
          </button>
        )}
      </div>

      {totalReviews === 0 ? (
        <div className="p-8 bg-white rounded-2xl shadow-[var(--shadow-card)] text-center">
          <MessageCircle size={32} className="text-navy-300 mx-auto mb-3" />
          <p className="text-navy-500">
            No reviews yet. Be the first to share your experience.
          </p>
        </div>
      ) : (
        <>
          {/* AI Review Intelligence */}
          <ReviewIntelligence listingId={listingId} reviewCount={totalReviews} />

          {/* Rating Summary */}
          <div className="p-6 bg-white rounded-2xl shadow-[var(--shadow-card)] mb-6">
            <div className="flex items-center gap-6">
              <div className="text-center">
                <p className="text-4xl font-bold text-navy-700">
                  {avgRating.toFixed(1)}
                </p>
                <StarRating rating={Math.round(avgRating)} size={16} />
                <p className="text-sm text-navy-400 mt-1">
                  {totalReviews} review{totalReviews !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="flex-1 space-y-1.5">
                {distribution.map(({ star, count }) => (
                  <div key={star} className="flex items-center gap-2">
                    <span className="text-xs text-navy-400 w-3">{star}</span>
                    <Star size={10} className="text-gold-500 fill-gold-500" />
                    <div className="flex-1 h-2 bg-cream-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gold-500 rounded-full transition-all"
                        style={{
                          width:
                            totalReviews > 0
                              ? `${(count / totalReviews) * 100}%`
                              : "0%",
                        }}
                      />
                    </div>
                    <span className="text-xs text-navy-300 w-6 text-right">
                      {count}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Sub-rating bars */}
            <SubRatingBars reviews={reviews} listingType={listingType} />
          </div>

          {/* Sort dropdown */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-navy-400">
              {totalReviews} review{totalReviews !== 1 ? "s" : ""}
            </p>
            <div className="relative">
              <button
                onClick={() => setSortOpen((o) => !o)}
                className="flex items-center gap-1.5 bg-white text-sm font-medium text-navy-600 px-3 py-2 rounded-xl shadow-sm hover:shadow-md transition-shadow"
              >
                {SORT_LABELS[sortBy]}
                <ChevronDown size={14} className={`transition-transform ${sortOpen ? "rotate-180" : ""}`} />
              </button>
              {sortOpen && (
                <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-lg z-20 py-1 min-w-[160px]">
                  {(Object.keys(SORT_LABELS) as SortOption[]).map((opt) => (
                    <button
                      key={opt}
                      onClick={() => {
                        setSortBy(opt);
                        setSortOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                        sortBy === opt
                          ? "text-teal-600 bg-teal-50 font-medium"
                          : "text-navy-600 hover:bg-cream-50"
                      }`}
                    >
                      {SORT_LABELS[opt]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Individual reviews */}
          <div className="space-y-4">
            {sortedReviews.map((review) => {
              const initial = (review.travelerName || "T").charAt(0).toUpperCase();
              return (
                <div
                  key={review.id}
                  className="p-5 bg-white rounded-2xl shadow-[var(--shadow-card)]"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-gold-100 rounded-full flex items-center justify-center text-gold-600 font-bold text-sm shrink-0">
                      {initial}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-navy-700 text-sm">
                            {review.travelerName || "Traveler"}
                          </p>
                          {review.isVerifiedPurchase && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-teal-600">
                              <CheckCircle size={12} className="text-teal-500" />
                              Verified Booking
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-navy-300">
                          {formatDate(review.createdAt)}
                        </span>
                      </div>
                      <div className="mt-1">
                        <StarRating rating={review.rating} />
                      </div>
                      {review.title && (
                        <p className="mt-2 font-medium text-navy-700 text-sm">
                          {review.title}
                        </p>
                      )}
                      {review.comment && (
                        <p className="mt-1 text-navy-500 text-sm leading-relaxed">
                          {review.comment}
                        </p>
                      )}

                      {/* Review photos */}
                      {review.photos && review.photos.length > 0 && (
                        <ReviewPhotoGallery photos={review.photos} />
                      )}

                      {/* Helpful button */}
                      <div className="mt-3">
                        <button
                          onClick={() => handleVote(review.id)}
                          disabled={!user || votingIds.has(review.id)}
                          className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                            user
                              ? "text-navy-500 hover:text-teal-600 hover:bg-teal-50 cursor-pointer"
                              : "text-navy-300 cursor-default"
                          }`}
                        >
                          <ThumbsUp size={12} />
                          Helpful{review.helpfulCount > 0 ? ` (${review.helpfulCount})` : ""}
                        </button>
                      </div>

                      {/* Operator reply */}
                      {review.operatorReply && (
                        <div className="mt-3 ml-4 pl-4 border-l-2 border-gold-200">
                          <p className="text-xs font-semibold text-gold-600 mb-1">
                            Operator Response
                          </p>
                          <p className="text-sm text-navy-500 leading-relaxed">
                            {review.operatorReply}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <ReviewModal
        isOpen={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        bookingId=""
        listingTitle={listingTitle || "This listing"}
        onSubmitted={() => {
          fetchReviews();
        }}
      />
    </div>
  );
}
