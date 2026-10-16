"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { X, ChevronLeft, ChevronRight, Play } from "lucide-react";
import { useFocusTrap } from "@/components/ui/focus-trap";
import { getImageUrl } from "@/lib/image-utils";
import { ImageWithFallback } from "@/components/shared/image-fallback";

type MediaItem = {
  id: string;
  url: string;
  alt: string | null;
  type?: string;
};

type Photo = MediaItem;

export function PhotoGallery({ photos, title, type = "tour" }: { photos: Photo[]; title: string; type?: string }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const modalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(modalRef, modalOpen);
  useEffect(() => {
    if (!modalOpen) return;
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    modalRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => { document.body.style.overflow = overflow; opener?.focus(); };
  }, [modalOpen]);

  // Swipe gesture state
  const touchStartX = useRef<number>(0);
  const touchCurrentX = useRef<number>(0);
  const isSwiping = useRef(false);

  // Transform all photo URLs through the proxy
  const proxiedPhotos = useMemo(
    () => photos.map((p) => ({ ...p, url: getImageUrl(p.url) || p.url })),
    [photos]
  );

  const videoRef = useRef<HTMLVideoElement>(null);

  // Auto-play/pause video when modal active item changes
  useEffect(() => {
    if (videoRef.current) {
      if (modalOpen && proxiedPhotos[activeIndex]?.type === "video") {
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.pause();
      }
    }
  }, [activeIndex, modalOpen, proxiedPhotos]);

  if (proxiedPhotos.length === 0) return null;

  const displayPhotos = proxiedPhotos.length >= 5 ? proxiedPhotos.slice(0, 5) : proxiedPhotos;

  const isVideo = (item: MediaItem) => item.type === "video";

  function openModal(index: number) {
    setActiveIndex(index);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
  }

  function next() {
    setActiveIndex((i) => (i + 1) % proxiedPhotos.length);
  }

  function prev() {
    setActiveIndex((i) => (i - 1 + proxiedPhotos.length) % proxiedPhotos.length);
  }

  return (
    <>
      {/* Mobile: full-width swipeable photos. Desktop: a filled layout for each photo count. */}
      <div className="mx-auto max-w-7xl px-6 mb-8">
        <div className={`flex snap-x snap-mandatory gap-2 overflow-x-auto rounded-3xl h-[280px] sm:h-[360px] md:h-[480px] md:grid md:overflow-hidden ${displayPhotos.length === 1 ? "md:grid-cols-1" : displayPhotos.length === 2 ? "md:grid-cols-2" : displayPhotos.length === 5 ? "md:grid-cols-4 md:grid-rows-2" : "md:grid-cols-2 md:grid-rows-2"}`}>
          {displayPhotos.map((photo, index) => (
            <div
              key={photo.id}
              role="button"
              tabIndex={0}
              aria-label={index === 0 ? "Open photos of " + title : "Open photo " + (index + 1) + " of " + title}
              className={`relative cursor-pointer w-full shrink-0 snap-center md:w-auto ${index === 0 && displayPhotos.length === 5 ? "md:col-span-2 md:row-span-2" : index === 0 && displayPhotos.length === 3 ? "md:row-span-2" : ""}`}
              onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openModal(index); } }}
              onClick={() => openModal(index)}
            >
              {isVideo(photo) ? <>
                <video src={photo.url} muted className="w-full h-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-center bg-navy-900/20 hover:bg-navy-900/30 transition-colors">
                  <div className="w-14 h-14 bg-white/90 rounded-full flex items-center justify-center"><Play size={24} className="text-navy-700 ml-1" /></div>
                </div>
              </> : <ImageWithFallback
                src={photo.url || null}
                alt={photo.alt || title}
                type={type}
                className="absolute inset-0 hover:opacity-95 transition-opacity"
                iconSize={index === 0 ? 56 : 32}
                priority={index === 0}
                sizes={displayPhotos.length === 1 ? "100vw" : "(max-width: 768px) 100vw, 50vw"}
              />}
              {index === 4 && proxiedPhotos.length > 5 && <div className="absolute inset-0 bg-black/70 flex items-center justify-center"><span className="text-white font-semibold text-lg">+{proxiedPhotos.length - 5} more</span></div>}
              {proxiedPhotos.length > 1 && <span aria-hidden="true" className="absolute bottom-3 right-3 rounded-full bg-navy-900/70 px-2.5 py-1 text-xs font-semibold text-white md:hidden">{index + 1} / {proxiedPhotos.length}</span>}
            </div>
          ))}
        </div>
        {displayPhotos.length > 1 && <p className="mt-2 text-xs text-navy-400 md:hidden">Swipe to see photos. Tap a photo to open the gallery.</p>}
      </div>

      {/* Fullscreen Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-[100] bg-navy-900/95 flex items-center justify-center"
          ref={modalRef} role="dialog" aria-modal="true" aria-label={"Photos of " + title}
          onKeyDown={e => { if(e.key === "Escape") closeModal(); if(e.key === "ArrowRight") next(); if(e.key === "ArrowLeft") prev(); }}
          style={{ touchAction: "pan-y" }}
          onTouchStart={(e) => {
            touchStartX.current = e.touches[0].clientX;
            touchCurrentX.current = e.touches[0].clientX;
            isSwiping.current = true;
          }}
          onTouchMove={(e) => {
            if (!isSwiping.current) return;
            touchCurrentX.current = e.touches[0].clientX;
          }}
          onTouchEnd={() => {
            if (!isSwiping.current) return;
            isSwiping.current = false;
            const diff = touchStartX.current - touchCurrentX.current;
            if (Math.abs(diff) > 50) {
              if (diff > 0) next();
              else prev();
            }
          }}
        >
          {/* Close */}
          <button
            aria-label="Close photo gallery"
            onClick={closeModal}
            className="absolute top-4 right-4 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center z-10"
          >
            <X size={20} className="text-white" />
          </button>

          {/* Counter */}
          <div className="absolute top-4 left-4 text-white/60 text-sm z-10">
            {activeIndex + 1} / {proxiedPhotos.length}
          </div>

          {/* Title */}
          <div className="absolute bottom-4 left-4 right-4 text-center z-10">
            <p className="text-white/60 text-sm">{title}</p>
          </div>

          {/* Previous */}
          {proxiedPhotos.length > 1 && (
            <button
              aria-label="Previous photo"
              onClick={prev}
              className="absolute left-4 w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center z-10"
            >
              <ChevronLeft size={24} className="text-white" />
            </button>
          )}

          {/* Image or Video */}
          <div className="max-w-5xl max-h-[80vh] w-full mx-16">
            {isVideo(proxiedPhotos[activeIndex]) ? (
              <video
                ref={videoRef}
                src={proxiedPhotos[activeIndex].url}
                autoPlay
                muted
                controls
                className="w-full h-full object-contain"
              />
            ) : (
              <img
                src={proxiedPhotos[activeIndex].url}
                alt={proxiedPhotos[activeIndex].alt || title}
                className="w-full h-full object-contain"
              />
            )}
          </div>

          {/* Next */}
          {proxiedPhotos.length > 1 && (
            <button
              aria-label="Next photo"
              onClick={next}
              className="absolute right-4 w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center z-10"
            >
              <ChevronRight size={24} className="text-white" />
            </button>
          )}

          {/* Thumbnail strip */}
          {proxiedPhotos.length > 1 && (
            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 flex gap-2 z-10 overflow-x-auto max-w-[80vw] pb-2">
              {proxiedPhotos.map((photo, i) => (
                <button
                  key={photo.id}
                  onClick={() => setActiveIndex(i)}
                  className={`w-12 h-12 rounded-lg shrink-0 transition-all relative overflow-hidden ${
                    i === activeIndex
                      ? "ring-2 ring-gold-400 opacity-100"
                      : "opacity-50 hover:opacity-80"
                  }`}
                >
                  {isVideo(photo) ? (
                    <>
                      <video src={photo.url} muted className="w-full h-full object-cover" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Play size={12} className="text-white drop-shadow-md" />
                      </div>
                    </>
                  ) : (
                    <div
                      className="w-full h-full bg-cover bg-center"
                      style={{ backgroundImage: `url(${photo.url})` }}
                    />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
