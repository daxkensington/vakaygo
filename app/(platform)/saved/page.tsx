"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { ListingCard } from "@/components/listings/listing-card";
import { useAuth } from "@/lib/auth-context";
import { useSaved } from "@/lib/use-saved";
import {
  Heart,
  Loader2,
  X,
  Plus,
  FolderOpen,
  ChevronDown,
  Check,
} from "lucide-react";
import Link from "next/link";

type SavedListing = {
  id: string;
  title: string;
  slug: string;
  type: string;
  priceAmount: string | null;
  priceUnit: string | null;
  avgRating: string | null;
  reviewCount: number | null;
  parish: string | null;
  isFeatured: boolean | null;
  islandSlug: string;
  islandName: string;
  collectionIds: string[];
  image: string | null;
  reviewSource: "google" | "vakaygo";
};

type WishlistCollection = {
  id: string;
  name: string;
  itemCount: number;
};

export default function SavedPage() {
  const { user } = useAuth();
  return <SavedContent key={user?.id || "guest"} />;
}

function SavedContent() {
  const { user, loading: authLoading } = useAuth();
  const { remove, pendingIds } = useSaved();
  const userId = user?.id || null;
  const [saved, setSaved] = useState<SavedListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [collections, setCollections] = useState<WishlistCollection[]>([]);
  const [activeCollection, setActiveCollection] = useState<string | null>(null);
  const [showCreateCollection, setShowCreateCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [moveDropdownOpen, setMoveDropdownOpen] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [retry, setRetry] = useState(0);
  const [busyListing, setBusyListing] = useState<string | null>(null);
  const mounted = useRef(true);
  const read = useRef<AbortController | null>(null);
  const action = useRef<AbortController | null>(null);

  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; read.current?.abort(); action.current?.abort(); };
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!userId) { setLoading(false); return; }
    const controller = new AbortController(); read.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    let current = true;
    setLoading(true); setError("");
    async function fetchSaved() {
      try {
        const [savedRes, collectionsRes] = await Promise.all([
          fetch(`/api/saved?expectedUserId=${encodeURIComponent(userId!)}`, { cache: "no-store", signal: controller.signal }),
          fetch(`/api/wishlist-collections?expectedUserId=${encodeURIComponent(userId!)}`, { cache: "no-store", signal: controller.signal }),
        ]);

        const [savedData, collectionData] = await Promise.all([savedRes.json().catch(() => null), collectionsRes.json().catch(() => null)]);
        if (!current || !mounted.current || read.current !== controller) return;
        if (controller.signal.aborted || !savedRes.ok || !collectionsRes.ok || savedData?.userId !== userId || collectionData?.userId !== userId ||
          !Array.isArray(savedData.saved) || !Array.isArray(collectionData.collections) ||
          savedData.saved.some((item: SavedListing) => !item || typeof item.id !== "string" || typeof item.title !== "string" || !Array.isArray(item.collectionIds)) ||
          collectionData.collections.some((item: WishlistCollection) => !item || typeof item.id !== "string" || typeof item.name !== "string" || !Number.isInteger(item.itemCount) || item.itemCount < 0)) throw new Error("Saved read failed.");
        setSaved(savedData.saved); setCollections(collectionData.collections); setActionError("");
      } catch {
        if (current && mounted.current && read.current === controller) setError("Your saved listings and collections could not be loaded. Please try again.");
      } finally {
        window.clearTimeout(timeout);
        if (current && mounted.current && read.current === controller) { read.current = null; setLoading(false); }
      }
    }

    void fetchSaved();
    return () => { current = false; controller.abort(); window.clearTimeout(timeout); };
  }, [userId, authLoading, retry]);

  async function handleCreateCollection(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !mounted.current || action.current || !newCollectionName.trim()) return;
    read.current?.abort(); read.current = null;
    const controller = new AbortController(); action.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    setCreatingCollection(true);
    setActionError("");

    try {
      const res = await fetch("/api/wishlist-collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCollectionName.trim(), expectedUserId: userId }), signal: controller.signal,
      });

      const data = await res.json().catch(() => null);
      if (!mounted.current || action.current !== controller) return;
      if (controller.signal.aborted || !res.ok || data?.userId !== userId || typeof data.collection?.id !== "string" || data.collection.name !== newCollectionName.trim() || data.collection.itemCount !== 0) throw new Error("Collection creation could not be confirmed.");
        setCollections((prev) => [...prev, data.collection]);
        setNewCollectionName("");
        setShowCreateCollection(false);
    } catch {
      if (mounted.current && action.current === controller) setActionError("Collection creation could not be confirmed. Your name is kept; try again or reload before retrying.");
    } finally {
      window.clearTimeout(timeout);
      if (action.current === controller) { action.current = null; if (mounted.current) setCreatingCollection(false); }
    }
  }

  async function handleMoveListing(listingId: string, collectionId: string | null) {
    if (!userId || !mounted.current || action.current || busyListing || pendingIds.size > 0) return;
    read.current?.abort(); read.current = null;
    const controller = new AbortController(); action.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    setBusyListing(listingId); setActionError("");
    try {
      const res = await fetch("/api/wishlist-collections/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, collectionId, expectedUserId: userId }), signal: controller.signal,
      });
      const data = await res.json().catch(() => null);
      if (!mounted.current || action.current !== controller) return;
      if (controller.signal.aborted || !res.ok || data?.userId !== userId || data.moved !== true || data.listingId !== listingId || !Array.isArray(data.collectionIds) ||
        data.collectionIds.length !== (collectionId ? 1 : 0) || (collectionId && data.collectionIds[0] !== collectionId)) throw new Error("Move could not be confirmed.");
      const previous = saved.find(item => item.id === listingId)?.collectionIds || [];
      setSaved((prev) =>
        prev.map((l) =>
          l.id === listingId ? { ...l, collectionIds: data.collectionIds } : l
        )
      );
      setCollections(prev => prev.map(col => ({ ...col, itemCount: Math.max(0, col.itemCount - (previous.includes(col.id) ? 1 : 0) + (col.id === collectionId ? 1 : 0)) })));
      setMoveDropdownOpen(null);
    } catch {
      if (mounted.current && action.current === controller) setActionError("The move could not be confirmed. The listing is kept in its current collections. Try again or reload your saved listings.");
    } finally {
      window.clearTimeout(timeout);
      if (action.current === controller) { action.current = null; if (mounted.current) setBusyListing(null); }
    }
  }

  async function handleRemove(listingId: string) {
    if (!mounted.current || action.current || busyListing || pendingIds.size > 0) return;
    const marker = new AbortController(); action.current = marker;
    read.current?.abort(); read.current = null;
    setBusyListing(listingId); setActionError("");
    try {
      const removed = await remove(listingId);
      if (!mounted.current || action.current !== marker) return;
      if (!removed) { setActionError("Removal could not be confirmed. The listing is kept. Try again or reload your saved listings."); return; }
      const previous = saved.find(item => item.id === listingId)?.collectionIds || [];
      setSaved(prev => prev.filter(item => item.id !== listingId));
      setCollections(prev => prev.map(col => ({ ...col, itemCount: Math.max(0, col.itemCount - (previous.includes(col.id) ? 1 : 0)) })));
    } finally { if (action.current === marker) { action.current = null; if (mounted.current) setBusyListing(null); } }
  }

  const filteredSaved = activeCollection
    ? saved.filter((l) => l.collectionIds.includes(activeCollection))
    : saved;

  return (
    <>
      <Header />
      <main className="pt-20 bg-cream-50 min-h-screen">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <div className="flex items-center gap-3">
            <h1
              className="text-3xl md:text-4xl font-bold text-navy-700"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Saved Listings
            </h1>
            {user && !loading && saved.length > 0 && (
              <span className="bg-gold-100 text-gold-700 text-sm font-semibold px-3 py-1 rounded-full">
                {saved.length}
              </span>
            )}
            {user && <button type="button" disabled={loading || creatingCollection || busyListing !== null || pendingIds.size > 0} onClick={() => setRetry(value => value + 1)} className="ml-auto text-sm font-semibold text-gold-700 underline disabled:opacity-50">Reload saved listings</button>}
          </div>

          {/* Auth gate */}
          {!authLoading && !user && (
            <div className="flex flex-col items-center justify-center py-24">
              <div className="w-16 h-16 bg-cream-100 rounded-full flex items-center justify-center mb-6">
                <Heart size={28} className="text-navy-300" />
              </div>
              <h2 className="text-xl font-semibold text-navy-700 mb-2">
                Sign in to see your saved listings
              </h2>
              <p className="text-navy-400 mb-6 text-center max-w-md">
                Save your favorite stays, tours, and experiences so you can easily find them later.
              </p>
              <Link
                href="/auth/signin?next=%2Fsaved"
                className="bg-gold-700 text-white px-6 py-3 rounded-xl font-semibold hover:bg-gold-800 transition-colors"
              >
                Sign In
              </Link>
            </div>
          )}

          {/* Loading */}
          {(authLoading || (user && loading)) && (
            <div className="flex items-center justify-center py-24">
              <Loader2 size={32} className="animate-spin text-gold-700" />
            </div>
          )}

          {user && !loading && error && <div role="alert" className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-700"><p>{error}</p><button type="button" onClick={() => setRetry(value => value + 1)} className="mt-2 font-semibold underline">Try loading saved listings again</button></div>}
          {user && actionError && <div role="alert" className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-700"><p>{actionError}</p><button type="button" disabled={creatingCollection || busyListing !== null || pendingIds.size > 0} onClick={() => { setActionError(""); setRetry(value => value + 1); }} className="mt-2 font-semibold underline disabled:opacity-50">Reload saved listings</button></div>}

          {/* Collection Tabs */}
          {user && !loading && !error && (
            <div className="mt-6">
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
                <button
                  aria-pressed={activeCollection === null}
                  onClick={() => setActiveCollection(null)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                    activeCollection === null
                      ? "bg-navy-700 text-white"
                      : "bg-cream-100 text-navy-500 hover:bg-cream-200"
                  }`}
                >
                  <FolderOpen size={14} />
                  All Saved
                  <span className="ml-1 text-xs opacity-75">({saved.length})</span>
                </button>

                {collections.map((col) => (
                  <button
                    aria-pressed={activeCollection === col.id}
                    key={col.id}
                    onClick={() => setActiveCollection(col.id)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                      activeCollection === col.id
                        ? "bg-navy-700 text-white"
                        : "bg-cream-100 text-navy-500 hover:bg-cream-200"
                    }`}
                  >
                    {col.name}
                    <span className="ml-1 text-xs opacity-75">({col.itemCount})</span>
                  </button>
                ))}

                {/* Create Collection Button */}
                {!showCreateCollection ? (
                  <button
                    disabled={creatingCollection || busyListing !== null || pendingIds.size > 0}
                    onClick={() => setShowCreateCollection(true)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap bg-gold-50 text-gold-700 hover:bg-gold-100 transition-all"
                  >
                    <Plus size={14} />
                    New Collection
                  </button>
                ) : (
                  <form
                    onSubmit={handleCreateCollection}
                    className="flex items-center gap-2 shrink-0"
                  >
                    <input
                      type="text"
                      aria-label="Collection name"
                      maxLength={128}
                      disabled={creatingCollection}
                      autoFocus
                      value={newCollectionName}
                      onChange={(e) => setNewCollectionName(e.target.value)}
                      placeholder="Collection name"
                      className="px-3 py-2 rounded-full bg-white text-navy-700 placeholder:text-navy-300 outline-none text-sm border border-cream-300 focus:border-gold-500 w-40"
                    />
                    <button
                      type="submit"
                      aria-label="Create collection"
                      disabled={creatingCollection || busyListing !== null || pendingIds.size > 0 || !newCollectionName.trim()}
                      className="p-2 bg-gold-700 hover:bg-gold-800 disabled:opacity-50 text-white rounded-full transition-colors"
                    >
                      {creatingCollection ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Check size={14} />
                      )}
                    </button>
                    <button
                      type="button"
                      aria-label="Cancel creating collection"
                      disabled={creatingCollection}
                      onClick={() => {
                        setShowCreateCollection(false);
                        setNewCollectionName("");
                      }}
                      className="p-2 text-navy-400 hover:text-navy-600 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}

          {/* Empty state */}
          {user && !loading && !error && saved.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24">
              <div className="w-16 h-16 bg-cream-100 rounded-full flex items-center justify-center mb-6">
                <Heart size={28} className="text-navy-300" />
              </div>
              <h2 className="text-xl font-semibold text-navy-700 mb-2">
                No saved listings yet
              </h2>
              <p className="text-navy-400 mb-6 text-center max-w-md">
                Tap the heart icon on any listing to save it here for later.
              </p>
              <Link
                href="/explore"
                className="bg-gold-700 text-white px-6 py-3 rounded-xl font-semibold hover:bg-gold-800 transition-colors"
              >
                Explore Listings
              </Link>
            </div>
          )}

          {/* Empty filtered state */}
          {user && !loading && !error && saved.length > 0 && filteredSaved.length === 0 && activeCollection && (
            <div className="flex flex-col items-center justify-center py-24">
              <div className="w-16 h-16 bg-cream-100 rounded-full flex items-center justify-center mb-6">
                <FolderOpen size={28} className="text-navy-300" />
              </div>
              <h2 className="text-xl font-semibold text-navy-700 mb-2">
                This collection is empty
              </h2>
              <p className="text-navy-400 mb-6 text-center max-w-md">
                Move saved listings here using the &quot;Move to...&quot; option on each card.
              </p>
              <button
                onClick={() => setActiveCollection(null)}
                className="text-gold-700 font-semibold hover:text-gold-600 transition-colors"
              >
                View All Saved
              </button>
            </div>
          )}

          {/* Saved listings grid */}
          {user && !loading && !error && filteredSaved.length > 0 && (
            <fieldset disabled={creatingCollection || busyListing !== null || pendingIds.size > 0} className="min-w-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-8">
              {filteredSaved.map((listing) => (
                <div key={listing.id} className="relative">
                  <ListingCard
                    id={listing.id}
                    title={listing.title}
                    slug={listing.slug}
                    type={listing.type}
                    priceAmount={listing.priceAmount}
                    priceUnit={listing.priceUnit}
                    avgRating={listing.avgRating}
                    reviewCount={listing.reviewCount}
                    parish={listing.parish}
                    islandSlug={listing.islandSlug}
                    islandName={listing.islandName}
                    image={listing.image}
                    reviewSource={listing.reviewSource}
                    showSaveButton={false}
                    isFeatured={listing.isFeatured}
                  />
                  {/* Action buttons */}
                  <div className="absolute top-3 right-3 z-10 flex items-center gap-1">
                    {/* Move to collection dropdown */}
                    {collections.length > 0 && (
                      <div className="relative">
                        <button
                          onClick={() =>
                            setMoveDropdownOpen(
                              moveDropdownOpen === listing.id
                                ? null
                                : listing.id
                            )
                          }
                          className="w-8 h-8 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center text-navy-400 hover:text-gold-500 hover:bg-white transition-colors shadow-sm"
                          aria-label="Move to collection"
                          aria-expanded={moveDropdownOpen === listing.id}
                        >
                          <ChevronDown size={14} />
                        </button>
                        {moveDropdownOpen === listing.id && (
                          <div className="absolute top-full right-0 mt-1 bg-white rounded-xl shadow-[var(--shadow-elevated)] z-50 min-w-[160px] overflow-hidden">
                            <p className="text-[10px] font-semibold text-navy-400 uppercase tracking-wide px-3 py-2 border-b border-cream-100">
                              Move to...
                            </p>
                            <p className="px-3 py-2 text-xs text-navy-400">Moving replaces your other collections for this listing. Unsorted keeps it saved without a collection.</p>
                            <button
                              onClick={() => handleMoveListing(listing.id, null)}
                              className={`w-full text-left px-3 py-2 text-xs hover:bg-cream-50 transition-colors ${
                                listing.collectionIds.length === 0
                                  ? "text-gold-700 font-semibold"
                                  : "text-navy-600"
                              }`}
                            >
                              Unsorted
                              {listing.collectionIds.length === 0 && (
                                <Check
                                  size={10}
                                  className="inline ml-1"
                                />
                              )}
                            </button>
                            {collections.map((col) => (
                              <button
                                key={col.id}
                                onClick={() =>
                                  handleMoveListing(listing.id, col.id)
                                }
                                className={`w-full text-left px-3 py-2 text-xs hover:bg-cream-50 transition-colors ${
                                  listing.collectionIds.includes(col.id)
                                    ? "text-gold-700 font-semibold"
                                    : "text-navy-600"
                                }`}
                              >
                                {col.name}
                                {listing.collectionIds.includes(col.id) && (
                                  <Check
                                    size={10}
                                    className="inline ml-1"
                                  />
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Remove button */}
                    <button
                      onClick={() => { void handleRemove(listing.id); }}
                      className="w-8 h-8 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center text-navy-400 hover:text-red-500 hover:bg-white transition-colors shadow-sm"
                      aria-label="Remove from saved"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </fieldset>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
