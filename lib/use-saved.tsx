"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";

type SavedContextType = {
  savedIds: Set<string>;
  toggle: (listingId: string) => Promise<void>;
  isSaved: (listingId: string) => boolean;
};

const SavedContext = createContext<SavedContextType>({
  savedIds: new Set(),
  toggle: async () => {},
  isSaved: () => false,
});

export function SavedProvider({ children }: { children: ReactNode }) {
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function fetchSaved() {
      try {
        const res = await fetch("/api/saved");
        if (!res.ok) return;
        const data = await res.json();
        const ids = (data.saved || []).map(
          (item: { id: string }) => item.id
        );
        setSavedIds(new Set(ids));
      } catch {
        // silently fail — user may not be logged in
      }
    }
    fetchSaved();
  }, []);

  const isSaved = useCallback(
    (listingId: string) => savedIds.has(listingId),
    [savedIds]
  );

  const toggle = useCallback(
    async (listingId: string) => {
      const wasSaved = savedIds.has(listingId);

      // Optimistic update
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (wasSaved) {
          next.delete(listingId);
        } else {
          next.add(listingId);
        }
        return next;
      });

      try {
        const res = await fetch("/api/saved", {
          method: wasSaved ? "DELETE" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ listingId }),
        });

        if (!res.ok) {
          // Revert on failure
          setSavedIds((prev) => {
            const reverted = new Set(prev);
            if (wasSaved) {
              reverted.add(listingId);
            } else {
              reverted.delete(listingId);
            }
            return reverted;
          });
        }
      } catch {
        // Revert on error
        setSavedIds((prev) => {
          const reverted = new Set(prev);
          if (wasSaved) {
            reverted.add(listingId);
          } else {
            reverted.delete(listingId);
          }
          return reverted;
        });
      }
    },
    [savedIds]
  );

  return (
    <SavedContext value={{ savedIds, toggle, isSaved }}>
      {children}
    </SavedContext>
  );
}

export function useSaved() {
  return useContext(SavedContext);
}
