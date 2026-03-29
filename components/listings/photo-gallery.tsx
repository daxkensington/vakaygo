"use client";

import { useState } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

type Photo = {
  id: string;
  url: string;
  alt: string | null;
};

export function PhotoGallery({ photos, title }: { photos: Photo[]; title: string }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  if (photos.length === 0) return null;

  const displayPhotos = photos.length >= 5 ? photos.slice(0, 5) : photos;

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
    setActiveIndex((i) => (i + 1) % photos.length);
  }

  function prev() {
    setActiveIndex((i) => (i - 1 + photos.length) % photos.length);
  }

  return (
    <>
      {/* Gallery Grid */}
      <div className="mx-auto max-w-7xl px-6 mb-8">
        {displayPhotos.length >= 5 ? (
          <div className="grid grid-cols-4 grid-rows-2 gap-2 rounded-3xl overflow-hidden h-[400px] md:h-[480px]">
            <div
              className="col-span-2 row-span-2 bg-cover bg-center bg-cream-200 cursor-pointer hover:opacity-95 transition-opacity"
              style={{ backgroundImage: `url(${displayPhotos[0].url})` }}
              onClick={() => openModal(0)}
            />
            {displayPhotos.slice(1, 5).map((photo, i) => (
              <div
                key={photo.id}
                className="bg-cover bg-center bg-cream-200 cursor-pointer hover:opacity-90 transition-opacity relative"
                style={{ backgroundImage: `url(${photo.url})` }}
                onClick={() => openModal(i + 1)}
              >
                {i === 3 && photos.length > 5 && (
                  <div className="absolute inset-0 bg-navy-900/50 flex items-center justify-center">
                    <span className="text-white font-semibold text-lg">
                      +{photos.length - 5} more
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : displayPhotos.length >= 2 ? (
          <div className="grid grid-cols-2 gap-2 rounded-3xl overflow-hidden h-[400px] md:h-[480px]">
            <div
              className="bg-cover bg-center bg-cream-200 cursor-pointer hover:opacity-95 transition-opacity"
              style={{ backgroundImage: `url(${displayPhotos[0].url})` }}
              onClick={() => openModal(0)}
            />
            <div className="grid grid-rows-2 gap-2">
              {displayPhotos.slice(1, 3).map((photo, i) => (
                <div
                  key={photo.id}
                  className="bg-cover bg-center bg-cream-200 cursor-pointer hover:opacity-90 transition-opacity"
                  style={{ backgroundImage: `url(${photo.url})` }}
                  onClick={() => openModal(i + 1)}
                />
              ))}
            </div>
          </div>
        ) : (
          <div
            className="rounded-3xl overflow-hidden h-[400px] md:h-[480px] bg-cover bg-center bg-cream-200 cursor-pointer"
            style={{ backgroundImage: `url(${displayPhotos[0].url})` }}
            onClick={() => openModal(0)}
          />
        )}
      </div>

      {/* Fullscreen Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-[100] bg-navy-900/95 flex items-center justify-center">
          {/* Close */}
          <button
            onClick={closeModal}
            className="absolute top-4 right-4 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center z-10"
          >
            <X size={20} className="text-white" />
          </button>

          {/* Counter */}
          <div className="absolute top-4 left-4 text-white/60 text-sm z-10">
            {activeIndex + 1} / {photos.length}
          </div>

          {/* Title */}
          <div className="absolute bottom-4 left-4 right-4 text-center z-10">
            <p className="text-white/60 text-sm">{title}</p>
          </div>

          {/* Previous */}
          {photos.length > 1 && (
            <button
              onClick={prev}
              className="absolute left-4 w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center z-10"
            >
              <ChevronLeft size={24} className="text-white" />
            </button>
          )}

          {/* Image */}
          <div className="max-w-5xl max-h-[80vh] w-full mx-16">
            <img
              src={photos[activeIndex].url}
              alt={photos[activeIndex].alt || title}
              className="w-full h-full object-contain"
            />
          </div>

          {/* Next */}
          {photos.length > 1 && (
            <button
              onClick={next}
              className="absolute right-4 w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center z-10"
            >
              <ChevronRight size={24} className="text-white" />
            </button>
          )}

          {/* Thumbnail strip */}
          {photos.length > 1 && (
            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 flex gap-2 z-10 overflow-x-auto max-w-[80vw] pb-2">
              {photos.map((photo, i) => (
                <button
                  key={photo.id}
                  onClick={() => setActiveIndex(i)}
                  className={`w-12 h-12 rounded-lg bg-cover bg-center shrink-0 transition-all ${
                    i === activeIndex
                      ? "ring-2 ring-gold-400 opacity-100"
                      : "opacity-50 hover:opacity-80"
                  }`}
                  style={{ backgroundImage: `url(${photo.url})` }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
