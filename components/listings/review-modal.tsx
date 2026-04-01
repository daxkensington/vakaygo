"use client";

import { useState } from "react";
import { Star, X, Check, Loader2 } from "lucide-react";

type ReviewModalProps = {
  isOpen: boolean;
  onClose: () => void;
  bookingId: string;
  listingTitle: string;
  onSubmitted?: () => void;
};

export function ReviewModal({
  isOpen,
  onClose,
  bookingId,
  listingTitle,
  onSubmitted,
}: ReviewModalProps) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const isValid = rating > 0 && comment.trim().length >= 10;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid || submitting) return;

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId,
          rating,
          title: title.trim() || null,
          comment: comment.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to submit review");
      }

      setSuccess(true);
      onSubmitted?.();

      setTimeout(() => {
        handleClose();
      }, 1800);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setRating(0);
    setHoverRating(0);
    setTitle("");
    setComment("");
    setSubmitting(false);
    setSuccess(false);
    setError("");
    onClose();
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-auto relative">
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-navy-400 hover:text-navy-600 transition-colors"
        >
          <X size={20} />
        </button>

        {success ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-[scale-in_0.3s_ease-out]">
              <Check size={32} className="text-green-600" />
            </div>
            <h3
              className="text-xl font-bold text-navy-700"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Thank you!
            </h3>
            <p className="text-navy-400 mt-2">
              Your review has been submitted.
            </p>
          </div>
        ) : (
          <>
            <h3
              className="text-xl font-bold text-navy-700 mb-1 pr-8"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Leave a Review
            </h3>
            <p className="text-sm text-navy-400 mb-6">{listingTitle}</p>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Star rating */}
              <div>
                <label className="text-sm font-medium text-navy-600 mb-2 block">
                  Rating
                </label>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      className="p-0.5 transition-transform hover:scale-110"
                    >
                      <Star
                        size={30}
                        className={
                          star <= (hoverRating || rating)
                            ? "text-gold-500 fill-gold-500"
                            : "text-cream-300"
                        }
                      />
                    </button>
                  ))}
                </div>
              </div>

              {/* Title */}
              <div>
                <label
                  htmlFor="review-title"
                  className="text-sm font-medium text-navy-600 mb-2 block"
                >
                  Title{" "}
                  <span className="text-navy-300 font-normal">(optional)</span>
                </label>
                <input
                  id="review-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Summarize your experience"
                  maxLength={120}
                  className="w-full border border-cream-200 rounded-xl px-4 py-2.5 text-sm text-navy-700 placeholder:text-navy-300 focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent transition-shadow"
                />
              </div>

              {/* Comment */}
              <div>
                <label
                  htmlFor="review-comment"
                  className="text-sm font-medium text-navy-600 mb-2 block"
                >
                  Your Review
                </label>
                <textarea
                  id="review-comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Share the details of your experience (min 10 characters)"
                  rows={4}
                  className="w-full border border-cream-200 rounded-xl px-4 py-2.5 text-sm text-navy-700 placeholder:text-navy-300 focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent transition-shadow resize-none"
                />
                {comment.length > 0 && comment.trim().length < 10 && (
                  <p className="text-xs text-red-500 mt-1">
                    Please write at least 10 characters
                  </p>
                )}
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={!isValid || submitting}
                className="w-full bg-gold-500 hover:bg-gold-600 disabled:bg-cream-200 disabled:text-navy-300 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit Review"
                )}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
