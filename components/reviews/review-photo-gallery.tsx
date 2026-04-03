"use client";

import { useState, useEffect, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, ImageIcon } from "lucide-react";
import Image from "next/image";

export type ReviewPhoto = {
  id: string;
  url: string;
  alt: string | null;
  width: number | null;
  height: number | null;
};

type ReviewPhotoGalleryProps = {
  photos: ReviewPhoto[];
};

export function ReviewPhotoGallery({ photos }: ReviewPhotoGalleryProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const openLightbox = (index: number) => {
    setActiveIndex(index);
    setLightboxOpen(true);
  };

  const closeLightbox = useCallback(() => {
    setLightboxOpen(false);
  }, []);

  const goNext = useCallback(() => {
    setActiveIndex((prev) => (prev + 1) % photos.length);
  }, [photos.length]);

  const goPrev = useCallback(() => {
    setActiveIndex((prev) => (prev - 1 + photos.length) % photos.length);
  }, [photos.length]);

  // Keyboard navigation
  useEffect(() => {
    if (!lightboxOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [lightboxOpen, closeLightbox, goNext, goPrev]);

  // Prevent body scroll when lightbox open
  useEffect(() => {
    if (lightboxOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [lightboxOpen]);

  if (!photos || photos.length === 0) return null;

  return (
    <>
      {/* Thumbnail grid */}
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        {photos.slice(0, 5).map((photo, i) => (
          <button
            key={photo.id}
            onClick={() => openLightbox(i)}
            className="relative w-[80px] h-[80px] rounded-lg overflow-hidden bg-cream-100 hover:opacity-80 transition-opacity group"
          >
            <Image
              src={photo.url}
              alt={photo.alt || "Review photo"}
              fill
              className="object-cover"
              sizes="80px"
              loading="lazy"
            />
            {/* Photo count badge on last thumbnail if more than shown */}
            {i === 4 && photos.length > 5 && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <span className="text-white text-sm font-semibold">
                  +{photos.length - 5}
                </span>
              </div>
            )}
          </button>
        ))}
        {photos.length > 0 && (
          <span className="text-xs text-navy-400 flex items-center gap-1 ml-1">
            <ImageIcon size={12} />
            {photos.length} photo{photos.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Lightbox Modal */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeLightbox();
          }}
        >
          {/* Close button */}
          <button
            onClick={closeLightbox}
            className="absolute top-4 right-4 text-white/80 hover:text-white z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          >
            <X size={24} />
          </button>

          {/* Photo counter */}
          <div className="absolute top-4 left-4 text-white/80 text-sm font-medium bg-white/10 px-3 py-1.5 rounded-full">
            {activeIndex + 1} / {photos.length}
          </div>

          {/* Navigation arrows */}
          {photos.length > 1 && (
            <>
              <button
                onClick={goPrev}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
              >
                <ChevronLeft size={28} />
              </button>
              <button
                onClick={goNext}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
              >
                <ChevronRight size={28} />
              </button>
            </>
          )}

          {/* Main image */}
          <div className="relative max-w-[90vw] max-h-[85vh] w-full h-full flex items-center justify-center">
            <Image
              src={photos[activeIndex].url}
              alt={photos[activeIndex].alt || "Review photo"}
              width={photos[activeIndex].width || 1200}
              height={photos[activeIndex].height || 800}
              className="object-contain max-w-full max-h-[85vh] rounded-lg"
              priority
            />
          </div>
        </div>
      )}
    </>
  );
}
