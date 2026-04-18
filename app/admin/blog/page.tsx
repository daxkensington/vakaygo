"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Plus,
  Search,
  Loader2,
  BookOpen,
  Eye,
  Edit3,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Calendar,
  FileText,
  Archive,
} from "lucide-react";

type BlogPost = {
  id: string;
  slug: string;
  title: string;
  category: string;
  status: string;
  publishedAt: string | null;
  createdAt: string;
  authorName: string | null;
  islandName: string | null;
};

const STATUS_TABS = [
  { value: "", label: "All", icon: BookOpen },
  { value: "draft", label: "Drafts", icon: FileText },
  { value: "published", label: "Published", icon: Eye },
  { value: "archived", label: "Archived", icon: Archive },
];

const CATEGORY_LABELS: Record<string, string> = {
  "destination-guide": "Destination Guide",
  "travel-tips": "Travel Tips",
  culture: "Culture",
  "food-drink": "Food & Drink",
  adventure: "Adventure",
  planning: "Trip Planning",
};

const STATUS_BADGES: Record<string, string> = {
  draft: "bg-amber-100 text-amber-700",
  published: "bg-green-100 text-green-700",
  archived: "bg-navy-100 text-navy-500",
};

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function AdminBlogPage() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      // Use admin endpoint that returns all statuses
      const params = new URLSearchParams();
      params.set("page", page.toString());
      params.set("limit", "20");
      if (statusFilter) params.set("status", statusFilter);
      if (search) params.set("q", search);
      params.set("admin", "1");

      const res = await fetch(`/api/admin/blog?${params}`);
      const data = await res.json();
      setPosts(data.posts || []);
      setTotalPages(data.totalPages || 1);
      setTotal(data.total || 0);
    } catch {
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const handleDelete = async (slug: string) => {
    if (!confirm("Are you sure you want to delete this post?")) return;
    setDeleting(slug);
    try {
      const res = await fetch(`/api/blog/${slug}`, { method: "DELETE" });
      if (res.ok) fetchPosts();
    } catch {
      // ignore
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-navy-800" style={{ fontFamily: "var(--font-display)" }}>
            Blog Management
          </h1>
          <p className="text-sm text-navy-400 mt-1">{total} total posts</p>
        </div>
        <Link
          href="/admin/blog/new"
          className="inline-flex items-center gap-2 bg-gold-700 text-white px-5 py-2.5 rounded-xl font-medium text-sm hover:bg-gold-800 transition-colors shadow-[0_4px_15px_rgba(200,145,46,0.3)]"
        >
          <Plus className="h-4 w-4" />
          New Post
        </Link>
      </div>

      {/* Status tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => {
              setStatusFilter(tab.value);
              setPage(1);
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              statusFilter === tab.value
                ? "bg-navy-800 text-white shadow-[var(--shadow-elevated)]"
                : "bg-white text-navy-500 shadow-[var(--shadow-card)] hover:bg-cream-100"
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-navy-300" />
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search posts..."
          className="w-full sm:w-80 pl-10 pr-4 py-2.5 rounded-xl bg-white shadow-[var(--shadow-card)] text-sm text-navy-700 placeholder:text-navy-300 focus:outline-none focus:ring-2 focus:ring-gold-400/50"
        />
      </div>

      {/* Posts table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-gold-500" />
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl shadow-[var(--shadow-card)]">
          <BookOpen className="h-12 w-12 text-navy-200 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-navy-700 mb-2">No posts found</h3>
          <p className="text-navy-400 mb-6">Create your first blog post to get started.</p>
          <Link
            href="/admin/blog/new"
            className="inline-flex items-center gap-2 bg-gold-700 text-white px-5 py-2.5 rounded-xl font-medium text-sm hover:bg-gold-800 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create Post
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-cream-200 text-left">
                  <th className="px-5 py-3 font-semibold text-navy-500">Title</th>
                  <th className="px-5 py-3 font-semibold text-navy-500 hidden md:table-cell">Category</th>
                  <th className="px-5 py-3 font-semibold text-navy-500">Status</th>
                  <th className="px-5 py-3 font-semibold text-navy-500 hidden lg:table-cell">Date</th>
                  <th className="px-5 py-3 font-semibold text-navy-500 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((post) => (
                  <tr
                    key={post.id}
                    className="border-b border-cream-100 last:border-0 hover:bg-cream-50 transition-colors"
                  >
                    <td className="px-5 py-4">
                      <div>
                        <p className="font-medium text-navy-700 line-clamp-1">{post.title}</p>
                        <p className="text-xs text-navy-400 mt-0.5">/{post.slug}</p>
                      </div>
                    </td>
                    <td className="px-5 py-4 hidden md:table-cell">
                      <span className="text-navy-500">
                        {CATEGORY_LABELS[post.category] || post.category}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${
                          STATUS_BADGES[post.status] || "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {post.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 hidden lg:table-cell">
                      <div className="flex items-center gap-1 text-navy-400 text-xs">
                        <Calendar className="h-3.5 w-3.5" />
                        {post.status === "published"
                          ? formatDate(post.publishedAt)
                          : formatDate(post.createdAt)}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-2">
                        {post.status === "published" && (
                          <a
                            href={`/guides/${post.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 rounded-lg text-navy-400 hover:bg-cream-100 hover:text-teal-600 transition-colors"
                            title="View"
                          >
                            <Eye className="h-4 w-4" />
                          </a>
                        )}
                        <Link
                          href={`/admin/blog/${post.id}/edit`}
                          className="p-2 rounded-lg text-navy-400 hover:bg-cream-100 hover:text-gold-600 transition-colors"
                          title="Edit"
                        >
                          <Edit3 className="h-4 w-4" />
                        </Link>
                        <button
                          onClick={() => handleDelete(post.slug)}
                          disabled={deleting === post.slug}
                          className="p-2 rounded-lg text-navy-400 hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-50"
                          title="Delete"
                        >
                          {deleting === post.slug ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-4 border-t border-cream-200">
              <p className="text-xs text-navy-400">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 rounded-lg bg-cream-100 text-navy-500 disabled:opacity-40 hover:bg-cream-200 transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-2 rounded-lg bg-cream-100 text-navy-500 disabled:opacity-40 hover:bg-cream-200 transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
