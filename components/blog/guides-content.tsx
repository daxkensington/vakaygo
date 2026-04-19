"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Search, ChevronLeft, ChevronRight, Loader2, BookOpen, MapPin, Calendar } from "lucide-react";

type BlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  coverImage: string | null;
  category: string;
  tags: string[] | null;
  publishedAt: string | null;
  authorName: string | null;
  authorAvatar: string | null;
  islandName: string | null;
  islandSlug: string | null;
};

const CATEGORIES = [
  { value: "", label: "All" },
  { value: "destination-guide", label: "Destination Guides" },
  { value: "travel-tips", label: "Travel Tips" },
  { value: "culture", label: "Culture" },
  { value: "food-drink", label: "Food & Drink" },
  { value: "adventure", label: "Adventure" },
  { value: "planning", label: "Trip Planning" },
];

const CATEGORY_COLORS: Record<string, string> = {
  "destination-guide": "bg-teal-500/10 text-teal-600",
  "travel-tips": "bg-gold-500/10 text-gold-700",
  culture: "bg-purple-500/10 text-purple-600",
  "food-drink": "bg-orange-500/10 text-orange-600",
  adventure: "bg-emerald-500/10 text-emerald-600",
  planning: "bg-blue-500/10 text-blue-600",
};

function formatCategoryLabel(cat: string) {
  const found = CATEGORIES.find((c) => c.value === cat);
  return found ? found.label : cat;
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function GuidesContent() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", page.toString());
      params.set("limit", "12");
      if (category) params.set("category", category);
      if (search) params.set("q", search);

      const res = await fetch(`/api/blog?${params}`);
      const data = await res.json();
      setPosts(data.posts || []);
      setTotalPages(data.totalPages || 1);
      setTotal(data.total || 0);
    } catch {
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, [page, category, search]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  };

  const handleCategoryChange = (cat: string) => {
    setCategory(cat);
    setPage(1);
  };

  return (
    <section className="py-12 bg-cream-50">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex flex-col lg:flex-row gap-10">
          {/* Main column */}
          <div className="flex-1 min-w-0">
            {/* Search bar */}
            <form onSubmit={handleSearch} className="mb-8">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-navy-300" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search guides..."
                  className="w-full pl-12 pr-4 py-3.5 rounded-2xl bg-white shadow-[var(--shadow-card)] text-navy-700 placeholder:text-navy-300 focus:outline-none focus:ring-2 focus:ring-gold-400/50 transition-shadow"
                />
              </div>
            </form>

            {/* Category tabs */}
            <div className="flex gap-2 flex-wrap mb-8">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => handleCategoryChange(cat.value)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                    category === cat.value
                      ? "bg-gold-700 text-white shadow-[0_4px_15px_rgba(200,145,46,0.3)]"
                      : "bg-white text-navy-500 shadow-[var(--shadow-card)] hover:bg-gold-50 hover:text-gold-700"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Results count */}
            {!loading && (
              <p className="text-sm text-navy-400 mb-6">
                {total} {total === 1 ? "guide" : "guides"} found
                {category && ` in ${formatCategoryLabel(category)}`}
                {search && ` matching "${search}"`}
              </p>
            )}

            {/* Posts grid */}
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-gold-500" />
              </div>
            ) : posts.length === 0 ? (
              <div className="text-center py-20">
                <BookOpen className="h-12 w-12 text-navy-200 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-navy-700 mb-2">
                  No guides found
                </h3>
                <p className="text-navy-400">
                  {search
                    ? "Try a different search term."
                    : "Check back soon for new travel guides."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {posts.map((post) => (
                  <Link
                    key={post.id}
                    href={`/guides/${post.slug}`}
                    className="group bg-white rounded-2xl overflow-hidden shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-elevated)] transition-all duration-300 hover:-translate-y-1"
                  >
                    {/* Cover image */}
                    <div className="relative aspect-[16/10] bg-navy-100 overflow-hidden">
                      {post.coverImage ? (
                        <img
                          src={post.coverImage}
                          alt={post.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-teal-500/20 to-navy-500/20">
                          <BookOpen className="h-10 w-10 text-navy-300" />
                        </div>
                      )}
                      {/* Category badge */}
                      <span
                        className={`absolute top-3 left-3 px-3 py-1 rounded-full text-xs font-semibold backdrop-blur-sm ${
                          CATEGORY_COLORS[post.category] || "bg-navy-500/10 text-navy-600"
                        }`}
                      >
                        {formatCategoryLabel(post.category)}
                      </span>
                    </div>

                    {/* Content */}
                    <div className="p-5">
                      <h2 className="text-lg font-bold text-navy-700 group-hover:text-gold-600 transition-colors line-clamp-2 leading-snug">
                        {post.title}
                      </h2>
                      {post.excerpt && (
                        <p className="mt-2 text-sm text-navy-400 line-clamp-2 leading-relaxed">
                          {post.excerpt}
                        </p>
                      )}
                      <div className="mt-4 flex items-center justify-between text-xs text-navy-400">
                        <div className="flex items-center gap-2">
                          {post.authorAvatar ? (
                            <img
                              src={post.authorAvatar}
                              alt=""
                              className="h-6 w-6 rounded-full object-cover"
                            />
                          ) : (
                            <div className="h-6 w-6 rounded-full bg-gold-100 flex items-center justify-center text-gold-700 font-bold text-[10px]">
                              {post.authorName?.charAt(0) || "V"}
                            </div>
                          )}
                          <span className="font-medium text-navy-500">
                            {post.authorName || "VakayGo"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {formatDate(post.publishedAt)}
                        </div>
                      </div>
                      {post.islandName && (
                        <div className="mt-3 flex items-center gap-1 text-xs text-teal-600">
                          <MapPin className="h-3.5 w-3.5" />
                          {post.islandName}
                        </div>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-10">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="flex items-center gap-1 px-4 py-2 rounded-xl bg-white shadow-[var(--shadow-card)] text-sm font-medium text-navy-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gold-50 transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </button>
                <span className="text-sm text-navy-500">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="flex items-center gap-1 px-4 py-2 rounded-xl bg-white shadow-[var(--shadow-card)] text-sm font-medium text-navy-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gold-50 transition-colors"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <aside className="lg:w-80 shrink-0 space-y-8">
            {/* Newsletter CTA */}
            <div className="bg-gradient-to-br from-teal-600 to-navy-700 rounded-2xl p-6 text-white">
              <h3 className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>
                Get Travel Tips
              </h3>
              <p className="mt-2 text-sm text-white/70 leading-relaxed">
                Subscribe for weekly Caribbean travel insights, deals, and
                destination guides straight to your inbox.
              </p>
              <div className="mt-4 space-y-3">
                <input
                  type="email"
                  placeholder="Your email"
                  className="w-full px-4 py-2.5 rounded-xl bg-white/10 backdrop-blur-sm text-white placeholder:text-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400/50"
                />
                <button className="w-full px-4 py-2.5 rounded-xl bg-gold-700 text-white text-sm font-semibold hover:bg-gold-800 transition-colors">
                  Subscribe
                </button>
              </div>
            </div>

            {/* Explore Islands CTA */}
            <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]">
              <h3 className="text-lg font-bold text-navy-700" style={{ fontFamily: "var(--font-display)" }}>
                Explore Islands
              </h3>
              <p className="mt-2 text-sm text-navy-400 leading-relaxed">
                Discover 21 Caribbean islands with local stays, tours, dining, and
                experiences.
              </p>
              <Link
                href="/islands"
                className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-gold-700 hover:text-gold-700 transition-colors"
              >
                Browse all islands
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>

            {/* Categories sidebar */}
            <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]">
              <h3 className="text-lg font-bold text-navy-700 mb-4" style={{ fontFamily: "var(--font-display)" }}>
                Categories
              </h3>
              <ul className="space-y-2">
                {CATEGORIES.filter((c) => c.value).map((cat) => (
                  <li key={cat.value}>
                    <button
                      onClick={() => handleCategoryChange(cat.value)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        category === cat.value
                          ? "bg-gold-50 text-gold-700 font-medium"
                          : "text-navy-500 hover:bg-cream-100"
                      }`}
                    >
                      {cat.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
