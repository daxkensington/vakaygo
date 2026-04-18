"use client";

import { useState, useRef } from "react";
import { Star, X, Check, Loader2, ImagePlus, Trash2 } from "lucide-react";
import Image from "next/image";

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
  const [photos, setPhotos] = useState<{ file: File; preview: string; uploading: boolean; url?: string }[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const MAX_PHOTOS = 5;
  const MAX_FILE_SIZE = 5 * 1024 * 1024;
  const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

  if (!isOpen) return null;

  const isValid = rating > 0 && comment.trim().length >= 10;

  function addPhotos(files: FileList | File[]) {
    const fileArray = Array.from(files);
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) return;

    const validFiles = fileArray.slice(0, remaining).filter((f) => {
      if (!ALLOWED_TYPES.includes(f.type)) {
        setError("Only JPEG, PNG, and WebP images are allowed");
        return false;
      }
      if (f.size > MAX_FILE_SIZE) {
        setError("Each photo must be under 5MB");
        return false;
      }
      return true;
    });

    const newPhotos = validFiles.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      uploading: false,
    }));

    setPhotos((prev) => [...prev, ...newPhotos]);
    if (validFiles.length > 0) setError("");
  }

  function removePhoto(index: number) {
    setPhotos((prev) => {
      const removed = prev[index];
      if (removed) URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== index);
    });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) addPhotos(e.dataTransfer.files);
  }

  async function uploadPhoto(file: File): Promise<{ url: string } | null> {
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) return null;
      const data = await res.json();
      return { url: data.url };
    } catch {
      return null;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid || submitting) return;

    setSubmitting(true);
    setError("");

    try {
      // Upload all photos first
      let photoUrls: { url: string; alt?: string }[] = [];
      if (photos.length > 0) {
        const uploadResults = await Promise.all(
          photos.map((p) => uploadPhoto(p.file))
        );
        photoUrls = uploadResults
          .filter((r): r is { url: string } => r !== null)
          .map((r) => ({ url: r.url }));
      }

      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId,
          rating,
          title: title.trim() || null,
          comment: comment.trim(),
          photoUrls,
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
    photos.forEach((p) => URL.revokeObjectURL(p.preview));
    setPhotos([]);
    setDragOver(false);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-auto relative max-h-[90vh] overflow-y-auto">
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

              {/* Photo upload */}
              <div>
                <label className="text-sm font-medium text-navy-600 mb-2 block">
                  Photos{" "}
                  <span className="text-navy-300 font-normal">
                    (optional, up to {MAX_PHOTOS})
                  </span>
                </label>

                {/* Photo previews */}
                {photos.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {photos.map((photo, i) => (
                      <div
                        key={i}
                        className="relative w-[72px] h-[72px] rounded-lg overflow-hidden bg-cream-100 group"
                      >
                        <Image
                          src={photo.preview}
                          alt={`Upload ${i + 1}`}
                          fill
                          className="object-cover"
                          sizes="72px"
                        />
                        <button
                          type="button"
                          onClick={() => removePhoto(i)}
                          className="absolute top-1 right-1 w-5 h-5 bg-black/60 hover:bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 size={10} className="text-white" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Drop zone / upload button */}
                {photos.length < MAX_PHOTOS && (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl px-4 py-4 text-center cursor-pointer transition-colors ${
                      dragOver
                        ? "border-gold-500 bg-gold-50"
                        : "border-cream-200 hover:border-gold-400 hover:bg-cream-50"
                    }`}
                  >
                    <ImagePlus
                      size={20}
                      className="mx-auto mb-1.5 text-navy-300"
                    />
                    <p className="text-xs text-navy-400">
                      Drag & drop or click to add photos
                    </p>
                    <p className="text-[10px] text-navy-300 mt-0.5">
                      JPEG, PNG, WebP - Max 5MB each
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files) addPhotos(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </div>
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
                className="w-full bg-gold-700 hover:bg-gold-800 disabled:bg-cream-200 disabled:text-navy-300 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
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
