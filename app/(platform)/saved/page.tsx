"use client";

import { useEffect, useState } from "react";
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
  collectionId?: string | null;
};

type WishlistCollection = {
  id: string;
  name: string;
  count: number;
};

export default function SavedPage() {
  const { user, loading: authLoading } = useAuth();
  const { toggle } = useSaved();
  const [saved, setSaved] = useState<SavedListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [collections, setCollections] = useState<WishlistCollection[]>([]);
  const [activeCollection, setActiveCollection] = useState<string | null>(null);
  const [showCreateCollection, setShowCreateCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [moveDropdownOpen, setMoveDropdownOpen] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSaved() {
      try {
        const [savedRes, collectionsRes] = await Promise.all([
          fetch("/api/saved"),
          fetch("/api/wishlist-collections"),
        ]);

        if (savedRes.ok) {
          const data = await savedRes.json();
          setSaved(data.saved || []);
        }

        if (collectionsRes.ok) {
          const data = await collectionsRes.json();
          setCollections(data.collections || []);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }

    if (user) {
      fetchSaved();
    } else if (!authLoading) {
      setLoading(false);
    }
  }, [user, authLoading]);

  async function handleCreateCollection(e: React.FormEvent) {
    e.preventDefault();
    if (!newCollectionName.trim()) return;
    setCreatingCollection(true);

    try {
      const res = await fetch("/api/wishlist-collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCollectionName.trim() }),
      });

      if (res.ok) {
        const data = await res.json();
        setCollections((prev) => [...prev, data.collection]);
        setNewCollectionName("");
        setShowCreateCollection(false);
      }
    } catch {
      // silently fail
    } finally {
      setCreatingCollection(false);
    }
  }

  async function handleMoveListing(listingId: string, collectionId: string | null) {
    setMoveDropdownOpen(null);
    try {
      await fetch("/api/wishlist-collections/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, collectionId }),
      });

      setSaved((prev) =>
        prev.map((l) =>
          l.id === listingId ? { ...l, collectionId } : l
        )
      );

      // Refresh collection counts
      const res = await fetch("/api/wishlist-collections");
      if (res.ok) {
        const data = await res.json();
        setCollections(data.collections || []);
      }
    } catch {
      // silently fail
    }
  }

  const filteredSaved = activeCollection
    ? saved.filter((l) => l.collectionId === activeCollection)
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
                href="/auth/signin"
                className="bg-gold-500 text-white px-6 py-3 rounded-xl font-semibold hover:bg-gold-600 transition-colors"
              >
                Sign In
              </Link>
            </div>
          )}

          {/* Loading */}
          {(authLoading || (user && loading)) && (
            <div className="flex items-center justify-center py-24">
              <Loader2 size={32} className="animate-spin text-gold-500" />
            </div>
          )}

          {/* Collection Tabs */}
          {user && !loading && saved.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
                <button
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
                    key={col.id}
                    onClick={() => setActiveCollection(col.id)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                      activeCollection === col.id
                        ? "bg-navy-700 text-white"
                        : "bg-cream-100 text-navy-500 hover:bg-cream-200"
                    }`}
                  >
                    {col.name}
                    <span className="ml-1 text-xs opacity-75">({col.count})</span>
                  </button>
                ))}

                {/* Create Collection Button */}
                {!showCreateCollection ? (
                  <button
                    onClick={() => setShowCreateCollection(true)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap bg-gold-50 text-gold-600 hover:bg-gold-100 transition-all"
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
                      autoFocus
                      value={newCollectionName}
                      onChange={(e) => setNewCollectionName(e.target.value)}
                      placeholder="Collection name"
                      className="px-3 py-2 rounded-full bg-white text-navy-700 placeholder:text-navy-300 outline-none text-sm border border-cream-300 focus:border-gold-500 w-40"
                    />
                    <button
                      type="submit"
                      disabled={creatingCollection || !newCollectionName.trim()}
                      className="p-2 bg-gold-500 hover:bg-gold-600 disabled:opacity-50 text-white rounded-full transition-colors"
                    >
                      {creatingCollection ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Check size={14} />
                      )}
                    </button>
                    <button
                      type="button"
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
          {user && !loading && saved.length === 0 && (
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
                className="bg-gold-500 text-white px-6 py-3 rounded-xl font-semibold hover:bg-gold-600 transition-colors"
              >
                Explore Listings
              </Link>
            </div>
          )}

          {/* Empty filtered state */}
          {user && !loading && saved.length > 0 && filteredSaved.length === 0 && activeCollection && (
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
                className="text-gold-500 font-semibold hover:text-gold-600 transition-colors"
              >
                View All Saved
              </button>
            </div>
          )}

          {/* Saved listings grid */}
          {user && !loading && filteredSaved.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-8">
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
                    image={null}
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
                        >
                          <ChevronDown size={14} />
                        </button>
                        {moveDropdownOpen === listing.id && (
                          <div className="absolute top-full right-0 mt-1 bg-white rounded-xl shadow-[var(--shadow-elevated)] z-50 min-w-[160px] overflow-hidden">
                            <p className="text-[10px] font-semibold text-navy-400 uppercase tracking-wide px-3 py-2 border-b border-cream-100">
                              Move to...
                            </p>
                            <button
                              onClick={() => handleMoveListing(listing.id, null)}
                              className={`w-full text-left px-3 py-2 text-xs hover:bg-cream-50 transition-colors ${
                                !listing.collectionId
                                  ? "text-gold-600 font-semibold"
                                  : "text-navy-600"
                              }`}
                            >
                              Unsorted
                              {!listing.collectionId && (
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
                                  listing.collectionId === col.id
                                    ? "text-gold-600 font-semibold"
                                    : "text-navy-600"
                                }`}
                              >
                                {col.name}
                                {listing.collectionId === col.id && (
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
                      onClick={async () => {
                        await toggle(listing.id);
                        setSaved((prev) =>
                          prev.filter((l) => l.id !== listing.id)
                        );
                      }}
                      className="w-8 h-8 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center text-navy-400 hover:text-red-500 hover:bg-white transition-colors shadow-sm"
                      aria-label="Remove from saved"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
