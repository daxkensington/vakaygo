"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { X, ChevronLeft, ChevronRight, Play } from "lucide-react";
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
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    setModalOpen(false);
    document.body.style.overflow = "";
  }

  function next() {
    setActiveIndex((i) => (i + 1) % proxiedPhotos.length);
  }

  function prev() {
    setActiveIndex((i) => (i - 1 + proxiedPhotos.length) % proxiedPhotos.length);
  }

  return (
    <>
      {/* Gallery Grid */}
      <div className="mx-auto max-w-7xl px-6 mb-8">
        {displayPhotos.length >= 5 ? (
          <div className="grid grid-cols-4 grid-rows-2 gap-2 rounded-3xl overflow-hidden h-[400px] md:h-[480px]">
            <div className="col-span-2 row-span-2 relative cursor-pointer" onClick={() => openModal(0)}>
              {isVideo(displayPhotos[0]) ? (
                <>
                  <video src={displayPhotos[0].url} muted className="w-full h-full object-cover" />
                  <div className="absolute inset-0 flex items-center justify-center bg-navy-900/20 hover:bg-navy-900/30 transition-colors">
                    <div className="w-14 h-14 bg-white/90 rounded-full flex items-center justify-center">
                      <Play size={24} className="text-navy-700 ml-1" />
                    </div>
                  </div>
                </>
              ) : (
                <ImageWithFallback
                  src={displayPhotos[0].url || null}
                  type={type}
                  className="hover:opacity-95 transition-opacity"
                  iconSize={56}
                />
              )}
            </div>
            {displayPhotos.slice(1, 5).map((photo, i) => (
              <div key={photo.id} className="relative cursor-pointer" onClick={() => openModal(i + 1)}>
                {isVideo(photo) ? (
                  <>
                    <video src={photo.url} muted className="w-full h-full object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center bg-navy-900/20 hover:bg-navy-900/30 transition-colors">
                      <div className="w-10 h-10 bg-white/90 rounded-full flex items-center justify-center">
                        <Play size={16} className="text-navy-700 ml-0.5" />
                      </div>
                    </div>
                  </>
                ) : (
                  <ImageWithFallback
                    src={photo.url || null}
                    type={type}
                    className="hover:opacity-90 transition-opacity relative"
                    iconSize={32}
                  />
                )}
                {i === 3 && proxiedPhotos.length > 5 && (
                  <div className="absolute inset-0 bg-navy-900/50 flex items-center justify-center">
                    <span className="text-white font-semibold text-lg">
                      +{proxiedPhotos.length - 5} more
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : displayPhotos.length >= 2 ? (
          <div className="grid grid-cols-2 gap-2 rounded-3xl overflow-hidden h-[400px] md:h-[480px]">
            <div className="relative cursor-pointer" onClick={() => openModal(0)}>
              {isVideo(displayPhotos[0]) ? (
                <>
                  <video src={displayPhotos[0].url} muted className="w-full h-full object-cover" />
                  <div className="absolute inset-0 flex items-center justify-center bg-navy-900/20 hover:bg-navy-900/30 transition-colors">
                    <div className="w-14 h-14 bg-white/90 rounded-full flex items-center justify-center">
                      <Play size={24} className="text-navy-700 ml-1" />
                    </div>
                  </div>
                </>
              ) : (
                <ImageWithFallback
                  src={displayPhotos[0].url || null}
                  type={type}
                  className="hover:opacity-95 transition-opacity"
                  iconSize={56}
                />
              )}
            </div>
            <div className="grid grid-rows-2 gap-2">
              {displayPhotos.slice(1, 3).map((photo, i) => (
                <div key={photo.id} className="relative cursor-pointer" onClick={() => openModal(i + 1)}>
                  {isVideo(photo) ? (
                    <>
                      <video src={photo.url} muted className="w-full h-full object-cover" />
                      <div className="absolute inset-0 flex items-center justify-center bg-navy-900/20 hover:bg-navy-900/30 transition-colors">
                        <div className="w-10 h-10 bg-white/90 rounded-full flex items-center justify-center">
                          <Play size={16} className="text-navy-700 ml-0.5" />
                        </div>
                      </div>
                    </>
                  ) : (
                    <ImageWithFallback
                      src={photo.url || null}
                      type={type}
                      className="hover:opacity-90 transition-opacity"
                      iconSize={32}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="relative cursor-pointer rounded-3xl overflow-hidden h-[400px] md:h-[480px]" onClick={() => openModal(0)}>
            {isVideo(displayPhotos[0]) ? (
              <>
                <video src={displayPhotos[0].url} muted className="w-full h-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-center bg-navy-900/20 hover:bg-navy-900/30 transition-colors">
                  <div className="w-16 h-16 bg-white/90 rounded-full flex items-center justify-center">
                    <Play size={28} className="text-navy-700 ml-1" />
                  </div>
                </div>
              </>
            ) : (
              <ImageWithFallback
                src={displayPhotos[0].url || null}
                type={type}
                className="h-full"
                iconSize={56}
              />
            )}
          </div>
        )}
      </div>

      {/* Fullscreen Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-[100] bg-navy-900/95 flex items-center justify-center"
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
