"use client";

import { useEffect, useRef, useState } from "react";
import { Star, X, Check, Loader2, ImagePlus, Trash2 } from "lucide-react";
import Image from "next/image";

type ReviewModalProps = {
  isOpen: boolean;
  onClose: () => void;
  bookingId: string;
  listingTitle: string;
  onSubmitted?: () => void;
};

type SelectedPhoto = {
  id: string;
  file: File;
  preview: string;
  uploading: boolean;
  url?: string;
  error?: string;
};

type UploadPhotoResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

const MAX_PHOTOS = 5;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

async function uploadPhoto(file: File): Promise<UploadPhotoResult> {
  const formData = new FormData();
  formData.append("file", file);

  try {
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const data: unknown =
      typeof res.json === "function"
        ? await Promise.resolve()
            .then(() => res.json())
            .catch(() => null)
        : null;
    const payload =
      data !== null && typeof data === "object"
        ? (data as { url?: unknown; error?: unknown })
        : null;

    if (!res.ok) {
      const fallbackError =
        typeof res.status === "number"
          ? `Upload failed (${res.status})`
          : "Upload failed";
      const serverError =
        typeof payload?.error === "string" && payload.error.trim().length > 0
          ? payload.error.trim()
          : fallbackError;
      return { ok: false, error: serverError };
    }

    const uploadedUrl =
      typeof payload?.url === "string" ? payload.url.trim() : "";
    if (!uploadedUrl) {
      return {
        ok: false,
        error: "Upload succeeded without returning a photo URL",
      };
    }

    return { ok: true, url: uploadedUrl };
  } catch (err: unknown) {
    const message =
      err instanceof Error && err.message.trim().length > 0
        ? err.message.trim()
        : "Network error while uploading photo";
    return { ok: false, error: message };
  }
}

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
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const nextPhotoIdRef = useRef(0);
  const inFlightRef = useRef(false);
  const lifecycleRef = useRef<{
    mounted: boolean;
    previews: Set<string>;
    closeTimeout: ReturnType<typeof setTimeout> | null;
    sessionId: number;
  }>({
    mounted: true,
    previews: new Set(),
    closeTimeout: null,
    sessionId: 0,
  });

  useEffect(() => {
    const lifecycle = lifecycleRef.current;
    lifecycle.mounted = true;
    return () => {
      lifecycle.mounted = false;
      lifecycle.sessionId += 1;
      if (lifecycle.closeTimeout !== null) {
        clearTimeout(lifecycle.closeTimeout);
        lifecycle.closeTimeout = null;
      }
      for (const preview of lifecycle.previews) {
        URL.revokeObjectURL(preview);
      }
      lifecycle.previews.clear();
    };
  }, []);

  if (!isOpen) return null;

  const anyUploading = photos.some((photo) => photo.uploading);
  const isBusy = submitting || anyUploading;
  const isValid = rating > 0 && comment.trim().length >= 10;
  const failedPhotos = photos.filter((photo) => Boolean(photo.error));

  const nameCounts = new Map<string, number>();
  for (const photo of photos) {
    nameCounts.set(photo.file.name, (nameCounts.get(photo.file.name) ?? 0) + 1);
  }

  function getPhotoLabel(photo: SelectedPhoto, index: number): string {
    const baseName = photo.file.name || `Photo ${index + 1}`;
    if ((nameCounts.get(photo.file.name) ?? 0) > 1) {
      return `${baseName} (${index + 1})`;
    }
    return baseName;
  }

  function revokePreviewUrl(preview: string) {
    if (lifecycleRef.current.previews.delete(preview)) {
      URL.revokeObjectURL(preview);
    }
  }

  function revokeAllPreviewUrls() {
    for (const preview of lifecycleRef.current.previews) {
      URL.revokeObjectURL(preview);
    }
    lifecycleRef.current.previews.clear();
  }

  function addPhotos(files: FileList | File[]) {
    if (isBusy || inFlightRef.current) return;
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) return;

    let validationError = "";
    const validFiles: File[] = [];

    for (const file of fileArray) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        validationError = "Only JPEG, PNG, and WebP images are allowed";
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        validationError = "Each photo must be under 5MB";
        continue;
      }
      if (validFiles.length < remaining) {
        validFiles.push(file);
      }
    }

    if (validFiles.length > 0) {
      const newPhotos: SelectedPhoto[] = validFiles.map((file) => {
        const preview = URL.createObjectURL(file);
        lifecycleRef.current.previews.add(preview);
        nextPhotoIdRef.current += 1;
        return {
          id: `review-photo-${nextPhotoIdRef.current}`,
          file,
          preview,
          uploading: false,
        };
      });
      setPhotos((prev) => [...prev, ...newPhotos]);
    }

    setError(validationError);
  }

  function removePhoto(photoId: string) {
    if (isBusy || inFlightRef.current) return;
    const target = photos.find((photo) => photo.id === photoId);
    if (target) {
      revokePreviewUrl(target.preview);
    }
    setPhotos((prev) => prev.filter((photo) => photo.id !== photoId));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (isBusy || inFlightRef.current) return;
    if (e.dataTransfer.files) addPhotos(e.dataTransfer.files);
  }

  async function uploadTargetPhotos(
    targets: SelectedPhoto[],
    sessionId: number
  ): Promise<Map<string, UploadPhotoResult>> {
    const resultsById = new Map<string, UploadPhotoResult>();
    if (targets.length === 0) return resultsById;

    const targetIds = new Set(targets.map((photo) => photo.id));
    setPhotos((prev) =>
      prev.map((photo) =>
        targetIds.has(photo.id)
          ? { ...photo, uploading: true, error: undefined }
          : photo
      )
    );

    const entries = await Promise.all(
      targets.map(async (target) => {
        const result = await uploadPhoto(target.file);
        if (
          lifecycleRef.current.mounted &&
          lifecycleRef.current.sessionId === sessionId
        ) {
          setPhotos((prev) =>
            prev.map((photo) => {
              if (photo.id !== target.id) return photo;
              if (result.ok) {
                return {
                  ...photo,
                  uploading: false,
                  url: result.url,
                  error: undefined,
                };
              }
              return {
                ...photo,
                uploading: false,
                url: undefined,
                error: result.error,
              };
            })
          );
        }
        return [target.id, result] as const;
      })
    );

    for (const [id, result] of entries) {
      resultsById.set(id, result);
    }
    return resultsById;
  }

  async function retryPhoto(photoId: string) {
    if (isBusy || inFlightRef.current) return;
    const target = photos.find((photo) => photo.id === photoId);
    if (!target || target.url) return;

    const sessionId = lifecycleRef.current.sessionId;
    inFlightRef.current = true;
    try {
      await uploadTargetPhotos([target], sessionId);
    } finally {
      if (lifecycleRef.current.sessionId === sessionId) {
        inFlightRef.current = false;
      }
    }
  }

  async function retryFailedPhotos() {
    if (isBusy || inFlightRef.current) return;
    const targets = photos.filter((photo) => Boolean(photo.error) && !photo.url);
    if (targets.length === 0) return;

    const sessionId = lifecycleRef.current.sessionId;
    inFlightRef.current = true;
    try {
      await uploadTargetPhotos(targets, sessionId);
    } finally {
      if (lifecycleRef.current.sessionId === sessionId) {
        inFlightRef.current = false;
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid || isBusy || inFlightRef.current) return;

    const sessionId = lifecycleRef.current.sessionId;
    inFlightRef.current = true;
    setSubmitting(true);
    setError("");

    try {
      let photoUrls: { url: string; alt?: string }[] = [];

      if (photos.length > 0) {
        const pendingPhotos = photos.filter((photo) => !photo.url);
        const resultsById =
          pendingPhotos.length > 0
            ? await uploadTargetPhotos(pendingPhotos, sessionId)
            : new Map<string, UploadPhotoResult>();

        if (
          !lifecycleRef.current.mounted ||
          lifecycleRef.current.sessionId !== sessionId
        ) {
          return;
        }

        const resolvedUrls: { url: string; alt?: string }[] = [];
        let hasUploadFailure = false;

        for (const photo of photos) {
          if (photo.url) {
            resolvedUrls.push({ url: photo.url });
            continue;
          }
          const uploadResult = resultsById.get(photo.id);
          if (uploadResult?.ok) {
            resolvedUrls.push({ url: uploadResult.url });
          } else {
            hasUploadFailure = true;
          }
        }

        if (hasUploadFailure) {
          return;
        }

        photoUrls = resolvedUrls;
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

      if (
        !lifecycleRef.current.mounted ||
        lifecycleRef.current.sessionId !== sessionId
      ) {
        return;
      }

      if (!res.ok) {
        const data: unknown =
          typeof res.json === "function"
            ? await Promise.resolve()
                .then(() => res.json())
                .catch(() => ({}))
            : {};
        const message =
          data !== null &&
          typeof data === "object" &&
          "error" in data &&
          typeof (data as { error?: unknown }).error === "string" &&
          (data as { error: string }).error.trim().length > 0
            ? (data as { error: string }).error
            : "Failed to submit review";
        throw new Error(message);
      }

      setSuccess(true);
      onSubmitted?.();

      if (lifecycleRef.current.closeTimeout !== null) {
        clearTimeout(lifecycleRef.current.closeTimeout);
      }
      lifecycleRef.current.closeTimeout = setTimeout(() => {
        lifecycleRef.current.closeTimeout = null;
        if (
          lifecycleRef.current.mounted &&
          lifecycleRef.current.sessionId === sessionId
        ) {
          handleClose();
        }
      }, 1800);
    } catch (err: unknown) {
      if (
        lifecycleRef.current.mounted &&
        lifecycleRef.current.sessionId === sessionId
      ) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    } finally {
      if (lifecycleRef.current.sessionId === sessionId) {
        inFlightRef.current = false;
        if (lifecycleRef.current.mounted) {
          setSubmitting(false);
        }
      }
    }
  }

  function handleClose() {
    lifecycleRef.current.sessionId += 1;
    inFlightRef.current = false;
    if (lifecycleRef.current.closeTimeout !== null) {
      clearTimeout(lifecycleRef.current.closeTimeout);
      lifecycleRef.current.closeTimeout = null;
    }
    revokeAllPreviewUrls();
    setRating(0);
    setHoverRating(0);
    setTitle("");
    setComment("");
    setSubmitting(false);
    setSuccess(false);
    setError("");
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
          type="button"
          aria-label="Close review modal"
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
                      disabled={isBusy}
                      aria-label={`${star} ${star === 1 ? "star" : "stars"}`}
                      aria-pressed={rating === star}
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      className="p-0.5 transition-transform hover:scale-110 disabled:opacity-50 disabled:hover:scale-100"
                    >
                      <Star
                        size={30}
                        className={
                          star <= (hoverRating || rating)
                            ? "text-gold-700 fill-gold-500"
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
                  disabled={isBusy}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Summarize your experience"
                  maxLength={120}
                  className="w-full border border-cream-200 rounded-xl px-4 py-2.5 text-sm text-navy-700 placeholder:text-navy-300 focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent transition-shadow disabled:opacity-60"
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
                  disabled={isBusy}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Share the details of your experience (min 10 characters)"
                  rows={4}
                  className="w-full border border-cream-200 rounded-xl px-4 py-2.5 text-sm text-navy-700 placeholder:text-navy-300 focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent transition-shadow resize-none disabled:opacity-60"
                />
                {comment.length > 0 && comment.trim().length < 10 && (
                  <p className="text-xs text-red-500 mt-1">
                    Please write at least 10 characters
                  </p>
                )}
              </div>

              {/* Photo upload */}
              <div>
                <label
                  htmlFor={
                    photos.length < MAX_PHOTOS ? "review-photos" : undefined
                  }
                  className="text-sm font-medium text-navy-600 mb-2 block"
                >
                  Photos{" "}
                  <span className="text-navy-300 font-normal">
                    (optional, up to {MAX_PHOTOS})
                  </span>
                </label>

                {/* Photo previews */}
                {photos.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {photos.map((photo, i) => {
                      const photoLabel = getPhotoLabel(photo, i);
                      const hasFailed = Boolean(photo.error) && !photo.uploading;
                      const isUploaded =
                        Boolean(photo.url) && !photo.error && !photo.uploading;

                      return (
                        <div
                          key={photo.id}
                          data-upload-status={
                            photo.uploading
                              ? "uploading"
                              : hasFailed
                                ? "failed"
                                : isUploaded
                                  ? "uploaded"
                                  : "pending"
                          }
                          className={`relative w-20 h-20 rounded-lg overflow-hidden bg-cream-100 ${
                            hasFailed
                              ? "ring-2 ring-red-500 border border-red-500"
                              : "border border-cream-200"
                          }`}
                        >
                          <Image
                            src={photo.preview}
                            alt={photoLabel}
                            fill
                            className="object-cover"
                            sizes="80px"
                          />

                          {photo.uploading && (
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                              <Loader2
                                size={16}
                                className="animate-spin text-white"
                                aria-hidden="true"
                              />
                              <span className="sr-only">
                                Uploading {photoLabel}
                              </span>
                            </div>
                          )}

                          {hasFailed && (
                            <div className="absolute inset-0 bg-red-950/35 pointer-events-none" />
                          )}

                          {hasFailed && (
                            <span className="absolute top-1 left-1 bg-red-600 text-white text-[9px] font-semibold leading-none px-1.5 py-0.5 rounded">
                              Failed
                            </span>
                          )}

                          {isUploaded && (
                            <span
                              className="absolute top-1 left-1 w-4 h-4 bg-green-600 rounded-full flex items-center justify-center"
                              title={`${photoLabel} uploaded`}
                            >
                              <Check
                                size={10}
                                className="text-white"
                                aria-hidden="true"
                              />
                              <span className="sr-only">
                                {photoLabel} uploaded
                              </span>
                            </span>
                          )}

                          <button
                            type="button"
                            disabled={isBusy}
                            aria-label={`Remove ${photoLabel}`}
                            title={`Remove ${photoLabel}`}
                            onClick={() => removePhoto(photo.id)}
                            className="absolute top-1 right-1 w-5 h-5 bg-black/70 hover:bg-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50 rounded-full flex items-center justify-center transition-colors"
                          >
                            <Trash2
                              size={10}
                              className="text-white"
                              aria-hidden="true"
                            />
                          </button>

                          {hasFailed && (
                            <button
                              type="button"
                              disabled={isBusy}
                              aria-label={`Retry upload for ${photoLabel}`}
                              title={`Retry upload for ${photoLabel}`}
                              onClick={() => void retryPhoto(photo.id)}
                              className="absolute inset-x-1 bottom-1 bg-white/95 hover:bg-white text-red-700 text-[10px] font-semibold leading-none py-1 px-1.5 rounded shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50"
                            >
                              Retry
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Drop zone / upload button */}
                {photos.length < MAX_PHOTOS && (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (!isBusy) setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => {
                      if (!isBusy) fileInputRef.current?.click();
                    }}
                    className={`border-2 border-dashed rounded-xl px-4 py-4 text-center transition-colors ${
                      isBusy
                        ? "border-cream-200 bg-cream-50 opacity-60 cursor-not-allowed"
                        : dragOver
                          ? "border-gold-500 bg-gold-50 cursor-pointer"
                          : "border-cream-200 hover:border-gold-400 hover:bg-cream-50 cursor-pointer"
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
                      id="review-photos"
                      type="file"
                      disabled={isBusy}
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

              {(failedPhotos.length > 0 || Boolean(error)) && (
                <div
                  role="alert"
                  className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 space-y-2"
                >
                  {error && <p className="text-red-600">{error}</p>}
                  {failedPhotos.length > 0 && (
                    <div className="space-y-2">
                      <p className="font-medium text-red-700">
                        {failedPhotos.length === 1
                          ? "1 photo upload failed. Retry or remove it before submitting your review."
                          : `${failedPhotos.length} photo uploads failed. Retry or remove them before submitting your review.`}
                      </p>
                      <ul className="list-disc list-inside text-xs text-red-700 space-y-0.5">
                        {photos.map((photo, index) => {
                          if (!photo.error) return null;
                          const label = getPhotoLabel(photo, index);
                          return (
                            <li key={photo.id}>
                              <span className="font-medium">{label}</span>
                              {`: ${photo.error}`}
                            </li>
                          );
                        })}
                      </ul>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void retryFailedPhotos()}
                        className="inline-flex items-center rounded-md bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-semibold px-2.5 py-1.5 transition-colors"
                      >
                        Retry failed uploads
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={!isValid || isBusy}
                className="w-full bg-gold-700 hover:bg-gold-800 disabled:bg-cream-200 disabled:text-navy-300 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Submitting...
                  </>
                ) : anyUploading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Uploading photos...
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
