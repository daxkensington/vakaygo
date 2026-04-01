"use client";

import { useEffect, useState } from "react";
import { Star, MessageCircle, PenLine } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { ReviewModal } from "@/components/listings/review-modal";

type Review = {
  id: string;
  rating: number;
  title: string | null;
  comment: string | null;
  operatorReply: string | null;
  createdAt: string;
  travelerName: string | null;
  travelerAvatar: string | null;
};

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

export function ReviewSection({
  listingId,
  listingTitle,
}: {
  listingId: string;
  listingTitle?: string;
}) {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [showReviewModal, setShowReviewModal] = useState(false);

  useEffect(() => {
    async function fetchReviews() {
      try {
        const res = await fetch(`/api/reviews?listingId=${listingId}`);
        if (!res.ok) return;
        const data = await res.json();
        setReviews(data.reviews || []);
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchReviews();
  }, [listingId]);

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
            className="flex items-center gap-2 bg-gold-500 hover:bg-gold-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
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
          {/* Summary */}
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
          </div>

          {/* Individual reviews */}
          <div className="space-y-4">
            {reviews.map((review) => {
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
                        <p className="font-semibold text-navy-700 text-sm">
                          {review.travelerName || "Traveler"}
                        </p>
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
          // Refresh reviews
          fetch(`/api/reviews?listingId=${listingId}`)
            .then((res) => res.json())
            .then((data) => setReviews(data.reviews || []))
            .catch(() => {});
        }}
      />
    </div>
  );
}
