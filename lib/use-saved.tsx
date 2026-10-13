"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useState, useRef, useCallback, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { safeAuthNext } from "@/lib/auth-return";

type SavedContextType = {
  savedIds: Set<string>;
  toggle: (listingId: string) => Promise<boolean>;
  remove: (listingId: string) => Promise<boolean>;
  isSaved: (listingId: string) => boolean;
  loading: boolean;
  error: string;
  pendingIds: Set<string>;
  refresh: () => Promise<void>;
};
const SavedContext = createContext<SavedContextType>({ savedIds: new Set(), toggle: async () => false,
  remove: async () => false, isSaved: () => false, loading: false, error: "", pendingIds: new Set(), refresh: async () => {} });

export function SavedProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  return <SavedAccountProvider key={user?.id || "guest"} userId={user?.id || null} authLoading={loading}>{children}</SavedAccountProvider>;
}

function SavedAccountProvider({ children, userId, authLoading }: { children: ReactNode; userId: string | null; authLoading: boolean }) {
  const router = useRouter();
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(!!userId || authLoading);
  const [error, setError] = useState("");
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const ids = useRef(new Set<string>());
  const loaded = useRef(false);
  const mounted = useRef(true);
  const read = useRef<AbortController | null>(null);
  const actions = useRef(new Map<string, AbortController>());
  const retry = useRef<(() => Promise<unknown>) | null>(null);

  useLayoutEffect(() => {
    const pending = actions.current;
    mounted.current = true;
    return () => { mounted.current = false; read.current?.abort(); for (const controller of pending.values()) controller.abort(); };
  }, []);

  const refresh = useCallback(async () => {
    if (authLoading || !userId || actions.current.size > 0) { if (!authLoading && mounted.current) setLoading(false); return; }
    read.current?.abort();
    const controller = new AbortController(); read.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    setLoading(true);
    try {
      const res = await fetch(`/api/saved?expectedUserId=${encodeURIComponent(userId)}`, { cache: "no-store", signal: controller.signal });
      const data = await res.json().catch(() => null);
      if (!mounted.current || read.current !== controller) return;
      if (controller.signal.aborted) throw new Error("Saved-list read timed out.");
      if (!res.ok || data?.userId !== userId || !Array.isArray(data.saved) || data.saved.some((item: unknown) => !item || typeof item !== "object" || typeof (item as { id?: unknown }).id !== "string")) throw new Error("Your saved listings could not be loaded. Please try again.");
      const next = new Set<string>(data.saved.map((item: { id: string }) => item.id));
      ids.current = next; setSavedIds(next); loaded.current = true;
      setError(""); retry.current = null;
    } catch {
      if (mounted.current && read.current === controller) {
        setError("Your saved listings could not be loaded. Please try again.");
        retry.current = refresh;
      }
    } finally {
      window.clearTimeout(timeout);
      if (mounted.current && read.current === controller) { read.current = null; setLoading(false); }
    }
  }, [authLoading, userId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const mutate = useCallback(async (listingId: string, wantSaved: boolean): Promise<boolean> => {
    if (!mounted.current || authLoading) return false;
    if (!userId) {
      const next = safeAuthNext(`${window.location.pathname}${window.location.search}${window.location.hash}`) || "/saved";
      router.push(`/auth/signin?next=${encodeURIComponent(next)}`);
      return false;
    }
    if (actions.current.size > 0) return false;
    read.current?.abort(); read.current = null;
    const controller = new AbortController(); actions.current.set(listingId, controller);
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    setPendingIds(new Set(actions.current.keys())); setLoading(false); setError("");
    try {
      const res = await fetch("/api/saved", { method: wantSaved ? "POST" : "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, expectedUserId: userId }), signal: controller.signal });
      const data = await res.json().catch(() => null);
      if (!mounted.current || actions.current.get(listingId) !== controller) return false;
      if (controller.signal.aborted) throw new Error("Saved-list update timed out.");
      if (!res.ok || data?.userId !== userId || data.listingId !== listingId || (wantSaved ? data.saved !== true : data.removed !== true)) throw new Error("Saved-list update could not be confirmed.");
      const next = new Set(ids.current); if (wantSaved) next.add(listingId); else next.delete(listingId);
      ids.current = next; setSavedIds(next); retry.current = null;
      return true;
    } catch {
      if (mounted.current && actions.current.get(listingId) === controller) {
        setError("The saved-list update could not be confirmed. Your list is kept. Try again or reload your saved listings.");
        retry.current = () => mutate(listingId, wantSaved);
      }
      return false;
    } finally {
      window.clearTimeout(timeout);
      if (actions.current.get(listingId) === controller) { actions.current.delete(listingId); if (mounted.current) setPendingIds(new Set(actions.current.keys())); }
    }
  }, [authLoading, router, userId]);

  const toggle = useCallback(async (listingId: string) => {
    if (userId && !loaded.current) {
      if (mounted.current) { setError("Load your saved listings before changing them. Please try again."); retry.current = refresh; }
      return false;
    }
    return mutate(listingId, !ids.current.has(listingId));
  }, [mutate, refresh, userId]);
  const remove = useCallback((listingId: string) => mutate(listingId, false), [mutate]);
  const isSaved = useCallback((listingId: string) => savedIds.has(listingId), [savedIds]);
  return <SavedContext value={{ savedIds, toggle, remove, isSaved, loading, error, pendingIds, refresh }}>
    {children}
    {error && <div role="alert" className="fixed bottom-4 left-4 right-4 z-[70] mx-auto max-w-lg rounded-xl border border-red-200 bg-white p-4 text-sm text-navy-700 shadow-lg">
      <p>{error}</p><div className="mt-2 flex gap-4"><button type="button" disabled={loading || pendingIds.size > 0} onClick={() => { void retry.current?.(); }} className="font-semibold text-gold-700 underline disabled:opacity-50">Try again</button>
      <button type="button" onClick={() => { setError(""); retry.current = null; }} className="text-navy-500 underline">Dismiss</button></div>
    </div>}
  </SavedContext>;
}
export function useSaved() { return useContext(SavedContext); }
