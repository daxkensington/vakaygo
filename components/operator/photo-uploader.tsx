"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, X, Image as ImageIcon, Loader2, GripVertical } from "lucide-react";

interface Photo {
  id: string;
  url: string;
  alt: string | null;
}

interface PhotoUploaderProps {
  listingId: string;
  existingPhotos?: Photo[];
  onPhotosChange?: (photos: Photo[]) => void;
}

interface UploadingFile {
  id: string;
  file: File;
  preview: string;
  progress: number;
  error?: string;
}

export default function PhotoUploader({
  listingId,
  existingPhotos = [],
  onPhotosChange,
}: PhotoUploaderProps) {
  const [photos, setPhotos] = useState<Photo[]>(existingPhotos);
  const [uploading, setUploading] = useState<UploadingFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updatePhotos = useCallback(
    (newPhotos: Photo[]) => {
      setPhotos(newPhotos);
      onPhotosChange?.(newPhotos);
    },
    [onPhotosChange]
  );

  const uploadFile = useCallback(
    async (file: File, tempId: string) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("listingId", listingId);

      try {
        // Simulate progress since fetch doesn't support upload progress
        setUploading((prev) =>
          prev.map((u) => (u.id === tempId ? { ...u, progress: 30 } : u))
        );

        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        setUploading((prev) =>
          prev.map((u) => (u.id === tempId ? { ...u, progress: 80 } : u))
        );

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Upload failed");
        }

        const data = await res.json();

        setUploading((prev) =>
          prev.map((u) => (u.id === tempId ? { ...u, progress: 100 } : u))
        );

        // Add to photos list
        const newPhoto: Photo = {
          id: data.mediaId,
          url: data.url,
          alt: file.name.replace(/\.[^.]+$/, ""),
        };

        setPhotos((prev) => {
          const updated = [...prev, newPhoto];
          onPhotosChange?.(updated);
          return updated;
        });

        // Remove from uploading after a brief delay
        setTimeout(() => {
          setUploading((prev) => prev.filter((u) => u.id !== tempId));
        }, 500);
      } catch (err) {
        setUploading((prev) =>
          prev.map((u) =>
            u.id === tempId
              ? { ...u, error: err instanceof Error ? err.message : "Upload failed", progress: 0 }
              : u
          )
        );
      }
    },
    [listingId, onPhotosChange]
  );

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      const validTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
      const maxSize = 5 * 1024 * 1024;

      for (const file of fileArray) {
        if (!validTypes.includes(file.type)) {
          alert(`${file.name}: Invalid type. Use JPEG, PNG, WebP, or GIF.`);
          continue;
        }
        if (file.size > maxSize) {
          alert(`${file.name}: Too large. Maximum 5MB.`);
          continue;
        }

        const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const preview = URL.createObjectURL(file);

        setUploading((prev) => [...prev, { id: tempId, file, preview, progress: 0 }]);
        uploadFile(file, tempId);
      }
    },
    [uploadFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDelete = useCallback(
    async (photoId: string) => {
      try {
        const res = await fetch(`/api/upload/${photoId}`, { method: "DELETE" });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Delete failed");
        }
        setPhotos((prev) => {
          const updated = prev.filter((p) => p.id !== photoId);
          onPhotosChange?.(updated);
          return updated;
        });
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to delete photo");
      }
    },
    [onPhotosChange]
  );

  const removeUploadingFile = useCallback((tempId: string) => {
    setUploading((prev) => {
      const item = prev.find((u) => u.id === tempId);
      if (item) URL.revokeObjectURL(item.preview);
      return prev.filter((u) => u.id !== tempId);
    });
  }, []);

  // Simple drag-to-reorder for uploaded photos
  const handlePhotoDragStart = useCallback((index: number) => {
    setDragIndex(index);
  }, []);

  const handlePhotoDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      if (dragIndex === null || dragIndex === index) return;

      setPhotos((prev) => {
        const updated = [...prev];
        const [moved] = updated.splice(dragIndex, 1);
        updated.splice(index, 0, moved);
        onPhotosChange?.(updated);
        return updated;
      });
      setDragIndex(index);
    },
    [dragIndex, onPhotosChange]
  );

  const handlePhotoDragEnd = useCallback(() => {
    setDragIndex(null);
  }, []);

  return (
    <div className="space-y-4">
      {/* Upload Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`
          relative cursor-pointer rounded-2xl border-2 border-dashed p-8
          transition-colors text-center
          ${
            isDragging
              ? "border-gold-400 bg-gold-50"
              : "border-cream-300 bg-cream-50 hover:bg-cream-100 hover:border-cream-400"
          }
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
        <div className="flex flex-col items-center gap-3">
          <div className="rounded-full bg-cream-100 p-3">
            <Upload className="h-6 w-6 text-navy-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-navy-700">
              Drop photos here or click to upload
            </p>
            <p className="text-xs text-navy-400 mt-1">
              JPEG, PNG, WebP or GIF -- max 5MB each
            </p>
          </div>
        </div>
      </div>

      {/* Uploading files */}
      {uploading.length > 0 && (
        <div className="space-y-2">
          {uploading.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm"
            >
              <img
                src={item.preview}
                alt=""
                className="h-12 w-12 rounded-lg object-cover"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-navy-700 truncate">
                  {item.file.name}
                </p>
                {item.error ? (
                  <p className="text-xs text-red-500">{item.error}</p>
                ) : (
                  <div className="mt-1 h-1.5 w-full rounded-full bg-cream-200 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gold-500 transition-all duration-300"
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                )}
              </div>
              {item.error ? (
                <button
                  onClick={() => removeUploadingFile(item.id)}
                  className="rounded-lg bg-red-50 p-1.5 text-red-500 hover:bg-red-100 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : (
                <Loader2 className="h-5 w-5 animate-spin text-gold-500" />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Photo grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {photos.map((photo, index) => (
            <div
              key={photo.id}
              draggable
              onDragStart={() => handlePhotoDragStart(index)}
              onDragOver={(e) => handlePhotoDragOver(e, index)}
              onDragEnd={handlePhotoDragEnd}
              className={`
                group relative aspect-square rounded-xl overflow-hidden bg-cream-100
                cursor-grab active:cursor-grabbing transition-opacity
                ${dragIndex === index ? "opacity-50" : "opacity-100"}
              `}
            >
              <img
                src={photo.url}
                alt={photo.alt || ""}
                className="h-full w-full object-cover"
                draggable={false}
              />

              {/* Drag handle overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

              {/* Primary badge */}
              {index === 0 && (
                <span className="absolute top-2 left-2 rounded-md bg-gold-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow">
                  Cover
                </span>
              )}

              {/* Drag handle */}
              <div className="absolute bottom-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <GripVertical className="h-4 w-4 text-white drop-shadow" />
              </div>

              {/* Delete button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(photo.id);
                }}
                className="absolute top-2 right-2 rounded-lg bg-red-500 p-1.5 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 shadow-lg"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {photos.length === 0 && uploading.length === 0 && (
        <div className="flex flex-col items-center py-6 text-center">
          <ImageIcon className="h-10 w-10 text-cream-300 mb-2" />
          <p className="text-sm text-navy-400">No photos yet</p>
        </div>
      )}
    </div>
  );
}
