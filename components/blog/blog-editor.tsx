"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Save,
  Send,
  Archive,
  Eye,
  EyeOff,
  Loader2,
  ImageIcon,
  X,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";

type Island = {
  id: number;
  name: string;
  slug: string;
};

type PostData = {
  id?: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  coverImage: string;
  islandId: string;
  category: string;
  tags: string;
  status: string;
  metaTitle: string;
  metaDescription: string;
};

const CATEGORIES = [
  { value: "destination-guide", label: "Destination Guide" },
  { value: "travel-tips", label: "Travel Tips" },
  { value: "culture", label: "Culture" },
  { value: "food-drink", label: "Food & Drink" },
  { value: "adventure", label: "Adventure" },
  { value: "planning", label: "Trip Planning" },
];

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Simple markdown to HTML for preview
function markdownToHtml(md: string): string {
  if (/<[a-z][\s\S]*>/i.test(md)) return md;
  let html = md;
  html = html.replace(/^### (.*$)/gim, "<h3>$1</h3>");
  html = html.replace(/^## (.*$)/gim, "<h2>$1</h2>");
  html = html.replace(/^# (.*$)/gim, "<h1>$1</h1>");
  html = html.replace(/\*\*(.*?)\*\*/gim, "<strong>$1</strong>");
  html = html.replace(/\*(.*?)\*/gim, "<em>$1</em>");
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2">$1</a>');
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/gim, '<img src="$2" alt="$1" class="rounded-xl w-full my-4" />');
  html = html.replace(/^\s*[-*] (.*$)/gim, "<li>$1</li>");
  html = html.replace(/^> (.*$)/gim, "<blockquote>$1</blockquote>");
  html = html.split("\n\n").map((block) => {
    const t = block.trim();
    if (!t) return "";
    if (/^<(h[1-6]|ul|ol|blockquote|li|img|div|p|pre|table)/i.test(t)) return t;
    return `<p>${t}</p>`;
  }).join("\n");
  return html;
}

export function BlogEditor({
  initialData,
  isEdit = false,
}: {
  initialData?: PostData;
  isEdit?: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(false);
  const [islands, setIslands] = useState<Island[]>([]);
  const [slugManual, setSlugManual] = useState(!!isEdit);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [form, setForm] = useState<PostData>(
    initialData || {
      title: "",
      slug: "",
      excerpt: "",
      content: "",
      coverImage: "",
      islandId: "",
      category: "destination-guide",
      tags: "",
      status: "draft",
      metaTitle: "",
      metaDescription: "",
    }
  );

  useEffect(() => {
    fetch("/api/islands")
      .then((r) => r.json())
      .then((data) => setIslands(data.islands || data || []))
      .catch(() => {});
  }, []);

  const updateField = useCallback(
    (field: keyof PostData, value: string) => {
      setForm((prev) => {
        const updated = { ...prev, [field]: value };
        if (field === "title" && !slugManual) {
          updated.slug = slugify(value);
        }
        return updated;
      });
    },
    [slugManual]
  );

  const previewHtml = useMemo(() => markdownToHtml(form.content), [form.content]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.url) {
        setForm((prev) => ({ ...prev, coverImage: data.url }));
      }
    } catch {
      setError("Failed to upload image");
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSave = async (targetStatus?: string) => {
    setError("");
    const status = targetStatus || form.status;

    if (!form.title || !form.slug || !form.content || !form.category) {
      setError("Title, slug, content, and category are required.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        status,
        tags: form.tags
          ? form.tags.split(",").map((t) => t.trim()).filter(Boolean)
          : [],
        islandId: form.islandId || null,
      };

      let res: Response;
      if (isEdit && initialData?.slug) {
        res = await fetch(`/api/blog/${initialData.slug}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch("/api/blog", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save");
        return;
      }

      router.push("/admin/blog");
    } catch {
      setError("Failed to save post");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/blog"
            className="p-2 rounded-lg text-navy-400 hover:bg-cream-100 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1
            className="text-2xl font-bold text-navy-800"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {isEdit ? "Edit Post" : "New Post"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPreview(!preview)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white shadow-[var(--shadow-card)] text-sm font-medium text-navy-600 hover:bg-cream-50 transition-colors"
          >
            {preview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {preview ? "Edit" : "Preview"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main editor */}
        <div className="lg:col-span-2 space-y-6">
          {/* Title */}
          <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] p-5">
            <label className="block text-sm font-medium text-navy-600 mb-2">
              Title
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => updateField("title", e.target.value)}
              placeholder="Your guide title..."
              className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 placeholder:text-navy-300 focus:outline-none focus:ring-2 focus:ring-gold-400/50 text-lg font-medium"
            />

            <label className="block text-sm font-medium text-navy-600 mt-4 mb-2">
              Slug
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-navy-400">/guides/</span>
              <input
                type="text"
                value={form.slug}
                onChange={(e) => {
                  setSlugManual(true);
                  setForm((prev) => ({ ...prev, slug: slugify(e.target.value) }));
                }}
                className="flex-1 px-3 py-2 rounded-lg bg-cream-50 text-sm text-navy-700 focus:outline-none focus:ring-2 focus:ring-gold-400/50"
              />
            </div>

            <label className="block text-sm font-medium text-navy-600 mt-4 mb-2">
              Excerpt
            </label>
            <textarea
              value={form.excerpt}
              onChange={(e) => updateField("excerpt", e.target.value)}
              placeholder="Brief summary (shown on cards)..."
              rows={2}
              className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 placeholder:text-navy-300 focus:outline-none focus:ring-2 focus:ring-gold-400/50 text-sm resize-none"
            />
          </div>

          {/* Content */}
          <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] p-5">
            <label className="block text-sm font-medium text-navy-600 mb-2">
              Content {preview ? "(Preview)" : "(Markdown)"}
            </label>
            {preview ? (
              <div
                className="prose prose-lg max-w-none min-h-[400px] p-4 bg-cream-50 rounded-xl
                  prose-headings:text-navy-700 prose-p:text-navy-600 prose-a:text-gold-600
                  prose-strong:text-navy-700 prose-blockquote:border-gold-400 prose-blockquote:text-navy-500"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            ) : (
              <textarea
                value={form.content}
                onChange={(e) => updateField("content", e.target.value)}
                placeholder="Write your guide in Markdown...&#10;&#10;## Introduction&#10;&#10;Start writing here..."
                rows={20}
                className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 placeholder:text-navy-300 focus:outline-none focus:ring-2 focus:ring-gold-400/50 text-sm font-mono resize-y min-h-[400px]"
              />
            )}
          </div>

          {/* SEO */}
          <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] p-5">
            <h3 className="text-sm font-semibold text-navy-600 mb-4">SEO Settings</h3>
            <label className="block text-sm font-medium text-navy-600 mb-2">
              Meta Title
            </label>
            <input
              type="text"
              value={form.metaTitle}
              onChange={(e) => updateField("metaTitle", e.target.value)}
              placeholder="Custom SEO title (optional)"
              className="w-full px-4 py-2.5 rounded-xl bg-cream-50 text-sm text-navy-700 placeholder:text-navy-300 focus:outline-none focus:ring-2 focus:ring-gold-400/50"
            />
            <p className="text-xs text-navy-400 mt-1">
              {form.metaTitle.length}/256 characters
            </p>

            <label className="block text-sm font-medium text-navy-600 mt-4 mb-2">
              Meta Description
            </label>
            <textarea
              value={form.metaDescription}
              onChange={(e) => updateField("metaDescription", e.target.value)}
              placeholder="Custom SEO description (optional)"
              rows={2}
              className="w-full px-4 py-2.5 rounded-xl bg-cream-50 text-sm text-navy-700 placeholder:text-navy-300 focus:outline-none focus:ring-2 focus:ring-gold-400/50 resize-none"
            />
            <p className="text-xs text-navy-400 mt-1">
              {form.metaDescription.length}/512 characters
            </p>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Publish actions */}
          <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] p-5">
            <h3 className="text-sm font-semibold text-navy-600 mb-4">Publish</h3>
            <div className="space-y-3">
              <button
                onClick={() => handleSave("draft")}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-cream-100 text-navy-600 font-medium text-sm hover:bg-cream-200 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Draft
              </button>
              <button
                onClick={() => handleSave("published")}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gold-500 text-white font-medium text-sm hover:bg-gold-600 transition-colors shadow-[0_4px_15px_rgba(200,145,46,0.3)] disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Publish
              </button>
              {isEdit && (
                <button
                  onClick={() => handleSave("archived")}
                  disabled={saving}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-navy-100 text-navy-500 font-medium text-sm hover:bg-navy-200 transition-colors disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
                  Archive
                </button>
              )}
            </div>
          </div>

          {/* Cover image */}
          <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] p-5">
            <h3 className="text-sm font-semibold text-navy-600 mb-4">Cover Image</h3>
            {form.coverImage ? (
              <div className="relative">
                <img
                  src={form.coverImage}
                  alt="Cover"
                  className="w-full aspect-video rounded-xl object-cover"
                />
                <button
                  onClick={() => setForm((prev) => ({ ...prev, coverImage: "" }))}
                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/50 text-white hover:bg-black/70 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full aspect-video rounded-xl border-2 border-dashed border-cream-300 bg-cream-50 cursor-pointer hover:border-gold-400 transition-colors">
                {uploadingImage ? (
                  <Loader2 className="h-8 w-8 animate-spin text-gold-500" />
                ) : (
                  <>
                    <ImageIcon className="h-8 w-8 text-navy-300 mb-2" />
                    <span className="text-sm text-navy-400">Upload cover image</span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </label>
            )}
            <input
              type="text"
              value={form.coverImage}
              onChange={(e) => setForm((prev) => ({ ...prev, coverImage: e.target.value }))}
              placeholder="Or paste image URL..."
              className="w-full mt-3 px-3 py-2 rounded-lg bg-cream-50 text-xs text-navy-600 placeholder:text-navy-300 focus:outline-none focus:ring-2 focus:ring-gold-400/50"
            />
          </div>

          {/* Category */}
          <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] p-5">
            <h3 className="text-sm font-semibold text-navy-600 mb-4">Category</h3>
            <select
              value={form.category}
              onChange={(e) => updateField("category", e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-cream-50 text-sm text-navy-700 focus:outline-none focus:ring-2 focus:ring-gold-400/50"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          {/* Island */}
          <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] p-5">
            <h3 className="text-sm font-semibold text-navy-600 mb-4">Island (optional)</h3>
            <select
              value={form.islandId}
              onChange={(e) => updateField("islandId", e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-cream-50 text-sm text-navy-700 focus:outline-none focus:ring-2 focus:ring-gold-400/50"
            >
              <option value="">No island</option>
              {islands.map((island) => (
                <option key={island.id} value={island.id}>
                  {island.name}
                </option>
              ))}
            </select>
          </div>

          {/* Tags */}
          <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] p-5">
            <h3 className="text-sm font-semibold text-navy-600 mb-4">Tags</h3>
            <input
              type="text"
              value={form.tags}
              onChange={(e) => updateField("tags", e.target.value)}
              placeholder="beaches, snorkeling, tips..."
              className="w-full px-4 py-2.5 rounded-xl bg-cream-50 text-sm text-navy-700 placeholder:text-navy-300 focus:outline-none focus:ring-2 focus:ring-gold-400/50"
            />
            <p className="text-xs text-navy-400 mt-1">Comma-separated</p>
          </div>
        </div>
      </div>
    </div>
  );
}
