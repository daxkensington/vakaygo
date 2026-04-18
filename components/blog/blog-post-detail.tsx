"use client";

import { useMemo } from "react";
import DOMPurify from "isomorphic-dompurify";
import Link from "next/link";
import {
  Calendar,
  MapPin,
  ChevronRight,
  Share2,
  BookOpen,
  ArrowRight,
  Link2,
  Check,
  Globe,
} from "lucide-react";
import { useState } from "react";

type Post = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  coverImage: string | null;
  category: string;
  tags: string[] | null;
  status: string;
  publishedAt: Date | string | null;
  createdAt: Date | string | null;
  authorName: string | null;
  authorAvatar: string | null;
  islandId: number | null;
  islandName: string | null;
  islandSlug: string | null;
};

type RelatedPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  coverImage: string | null;
  category: string;
  publishedAt: Date | string | null;
  authorName: string | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  "destination-guide": "Destination Guides",
  "travel-tips": "Travel Tips",
  culture: "Culture",
  "food-drink": "Food & Drink",
  adventure: "Adventure",
  planning: "Trip Planning",
};

function formatDate(d: Date | string | null) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function extractHeadings(html: string) {
  const regex = /<h([23])[^>]*(?:id="([^"]*)")?[^>]*>(.*?)<\/h[23]>/gi;
  const headings: { level: number; text: string; id: string }[] = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
    const text = match[3].replace(/<[^>]*>/g, "");
    const id = match[2] || text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    headings.push({ level: parseInt(match[1]), text, id });
  }
  return headings;
}

function injectHeadingIds(html: string) {
  return html.replace(/<h([23])([^>]*)>(.*?)<\/h([23])>/gi, (match, level, attrs, text, closeLevel) => {
    if (/id="/.test(attrs)) return match;
    const plainText = text.replace(/<[^>]*>/g, "");
    const id = plainText.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return `<h${level} id="${id}"${attrs}>${text}</h${closeLevel}>`;
  });
}

function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "h1", "h2", "h3", "h4", "h5", "h6", "p", "br", "hr",
      "ul", "ol", "li", "a", "strong", "em", "b", "i", "u",
      "blockquote", "pre", "code", "img", "figure", "figcaption",
      "table", "thead", "tbody", "tr", "th", "td",
      "div", "span", "section", "article",
    ],
    ALLOWED_ATTR: ["href", "src", "alt", "title", "class", "id", "target", "rel", "width", "height"],
  });
}

// Simple markdown to HTML for common patterns
function markdownToHtml(md: string): string {
  // If content already has HTML tags, return as-is with heading IDs injected
  if (/<[a-z][\s\S]*>/i.test(md)) {
    return injectHeadingIds(md);
  }

  let html = md;

  // Headers
  html = html.replace(/^### (.*$)/gim, (_, t) => {
    const id = t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return `<h3 id="${id}">${t}</h3>`;
  });
  html = html.replace(/^## (.*$)/gim, (_, t) => {
    const id = t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return `<h2 id="${id}">${t}</h2>`;
  });
  html = html.replace(/^# (.*$)/gim, "<h1>$1</h1>");

  // Bold/italic
  html = html.replace(/\*\*\*(.*?)\*\*\*/gim, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*(.*?)\*\*/gim, "<strong>$1</strong>");
  html = html.replace(/\*(.*?)\*/gim, "<em>$1</em>");

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2" class="text-gold-600 underline hover:text-gold-700">$1</a>');

  // Images
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/gim, '<img src="$2" alt="$1" class="rounded-xl w-full my-6" />');

  // Unordered lists
  html = html.replace(/^\s*[-*] (.*$)/gim, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>\n?)+/gim, (match) => `<ul class="list-disc pl-6 space-y-1 my-4">${match}</ul>`);

  // Ordered lists
  html = html.replace(/^\s*\d+\. (.*$)/gim, "<li>$1</li>");

  // Blockquotes
  html = html.replace(/^> (.*$)/gim, '<blockquote class="border-l-4 border-gold-400 pl-4 italic text-navy-500 my-4">$1</blockquote>');

  // Inline code
  html = html.replace(/`([^`]+)`/gim, '<code class="bg-cream-100 px-1.5 py-0.5 rounded text-sm font-mono">$1</code>');

  // Paragraphs — wrap lines not already wrapped
  html = html
    .split("\n\n")
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      if (/^<(h[1-6]|ul|ol|blockquote|li|img|div|p|pre|table)/i.test(trimmed)) return trimmed;
      return `<p>${trimmed}</p>`;
    })
    .join("\n");

  // Line breaks within paragraphs
  html = html.replace(/(?<!\n)\n(?!\n)/g, "<br />");

  return html;
}

export function BlogPostDetail({
  post,
  related,
}: {
  post: Post;
  related: RelatedPost[];
}) {
  const [copied, setCopied] = useState(false);
  const contentHtml = useMemo(() => sanitizeHtml(markdownToHtml(post.content)), [post.content]);
  const headings = useMemo(() => extractHeadings(contentHtml), [contentHtml]);

  const postUrl = `https://vakaygo.com/guides/${post.slug}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(postUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <article>
      {/* Cover image hero */}
      <section className="relative pt-16">
        <div className="relative h-[50vh] min-h-[400px] max-h-[600px] bg-navy-800 overflow-hidden">
          {post.coverImage ? (
            <img
              src={post.coverImage}
              alt={post.title}
              className="w-full h-full object-cover opacity-60"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-teal-700 to-navy-800" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-navy-900/90 via-navy-900/40 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 px-6 pb-10">
            <div className="mx-auto max-w-3xl">
              {/* Breadcrumbs */}
              <nav className="flex items-center gap-2 text-xs text-white/60 mb-4" aria-label="Breadcrumb">
                <Link href="/" className="hover:text-white transition-colors">
                  Home
                </Link>
                <ChevronRight className="h-3 w-3" />
                <Link href="/guides" className="hover:text-white transition-colors">
                  Guides
                </Link>
                <ChevronRight className="h-3 w-3" />
                <Link
                  href={`/guides?category=${post.category}`}
                  className="hover:text-white transition-colors"
                >
                  {CATEGORY_LABELS[post.category] || post.category}
                </Link>
                <ChevronRight className="h-3 w-3" />
                <span className="text-white/80 truncate max-w-[200px]">
                  {post.title}
                </span>
              </nav>

              <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-gold-500/20 text-gold-400 mb-4">
                {CATEGORY_LABELS[post.category] || post.category}
              </span>
              <h1
                className="text-3xl md:text-5xl font-bold text-white leading-tight"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {post.title}
              </h1>
              <div className="mt-4 flex items-center gap-4 text-sm text-white/70">
                <div className="flex items-center gap-2">
                  {post.authorAvatar ? (
                    <img
                      src={post.authorAvatar}
                      alt=""
                      className="h-8 w-8 rounded-full object-cover ring-2 ring-white/20"
                    />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-gold-500/30 flex items-center justify-center text-gold-300 font-bold text-xs">
                      {post.authorName?.charAt(0) || "V"}
                    </div>
                  )}
                  <span className="font-medium text-white/90">
                    {post.authorName || "VakayGo"}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {formatDate(post.publishedAt)}
                </div>
                {post.islandName && (
                  <div className="flex items-center gap-1 text-teal-300">
                    <MapPin className="h-4 w-4" />
                    {post.islandName}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Content area */}
      <section className="py-12 bg-cream-50">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-col lg:flex-row gap-10">
            {/* Sidebar / TOC — desktop left */}
            {headings.length > 0 && (
              <aside className="hidden lg:block lg:w-64 shrink-0">
                <div className="sticky top-24">
                  <h4 className="text-xs font-semibold text-navy-400 uppercase tracking-widest mb-3">
                    Table of Contents
                  </h4>
                  <nav className="space-y-1">
                    {headings.map((h, i) => (
                      <a
                        key={i}
                        href={`#${h.id}`}
                        className={`block text-sm text-navy-500 hover:text-gold-600 transition-colors py-1 ${
                          h.level === 3 ? "pl-4" : ""
                        }`}
                      >
                        {h.text}
                      </a>
                    ))}
                  </nav>

                  {/* Share buttons */}
                  <div className="mt-8 pt-6 border-t border-cream-200">
                    <h4 className="text-xs font-semibold text-navy-400 uppercase tracking-widest mb-3">
                      Share
                    </h4>
                    <div className="flex gap-2">
                      <a
                        href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(postUrl)}&text=${encodeURIComponent(post.title)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-lg bg-white shadow-[var(--shadow-card)] text-navy-400 hover:text-blue-500 transition-colors"
                        aria-label="Share on Twitter"
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                      </a>
                      <a
                        href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(postUrl)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-lg bg-white shadow-[var(--shadow-card)] text-navy-400 hover:text-blue-700 transition-colors"
                        aria-label="Share on Facebook"
                      >
                        <Globe className="h-4 w-4" />
                      </a>
                      <button
                        onClick={handleCopyLink}
                        className="p-2 rounded-lg bg-white shadow-[var(--shadow-card)] text-navy-400 hover:text-gold-600 transition-colors"
                        aria-label="Copy link"
                      >
                        {copied ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Link2 className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </aside>
            )}

            {/* Main content */}
            <div className="flex-1 min-w-0 max-w-3xl mx-auto lg:mx-0">
              {/* Tags */}
              {post.tags && post.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-8">
                  {post.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1 rounded-full bg-white shadow-[var(--shadow-card)] text-xs font-medium text-navy-500"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Article content */}
              <div
                className="prose prose-lg max-w-none
                  prose-headings:font-bold prose-headings:text-navy-700 prose-headings:leading-snug
                  prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4
                  prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-3
                  prose-p:text-navy-600 prose-p:leading-relaxed
                  prose-a:text-gold-600 prose-a:no-underline hover:prose-a:underline
                  prose-strong:text-navy-700
                  prose-img:rounded-2xl prose-img:shadow-[var(--shadow-card)]
                  prose-blockquote:border-gold-400 prose-blockquote:text-navy-500
                  prose-li:text-navy-600
                "
                dangerouslySetInnerHTML={{ __html: contentHtml }}
              />

              {/* Mobile share buttons */}
              <div className="flex items-center gap-3 mt-8 pt-6 border-t border-cream-200 lg:hidden">
                <span className="text-sm font-medium text-navy-500">Share:</span>
                <a
                  href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(postUrl)}&text=${encodeURIComponent(post.title)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg bg-white shadow-[var(--shadow-card)] text-navy-400 hover:text-blue-500 transition-colors"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                </a>
                <a
                  href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(postUrl)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg bg-white shadow-[var(--shadow-card)] text-navy-400 hover:text-blue-700 transition-colors"
                >
                  <Globe className="h-4 w-4" />
                </a>
                <button
                  onClick={handleCopyLink}
                  className="p-2 rounded-lg bg-white shadow-[var(--shadow-card)] text-navy-400 hover:text-gold-600 transition-colors"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Link2 className="h-4 w-4" />
                  )}
                </button>
              </div>

              {/* Island CTA */}
              {post.islandName && post.islandSlug && (
                <div className="mt-10 bg-gradient-to-r from-teal-600 to-navy-700 rounded-2xl p-6 flex flex-col sm:flex-row items-center gap-4">
                  <div className="flex-1">
                    <h3
                      className="text-xl font-bold text-white"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      Explore {post.islandName} on VakayGo
                    </h3>
                    <p className="text-sm text-white/70 mt-1">
                      Find the best stays, tours, dining, and experiences.
                    </p>
                  </div>
                  <Link
                    href={`/${post.islandSlug}`}
                    className="shrink-0 flex items-center gap-2 bg-gold-700 text-white px-6 py-3 rounded-xl font-semibold text-sm hover:bg-gold-800 transition-colors"
                  >
                    Explore
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Related posts */}
      {related.length > 0 && (
        <section className="py-16 bg-white">
          <div className="mx-auto max-w-7xl px-6">
            <h2
              className="text-2xl font-bold text-navy-700 mb-8"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Related Guides
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {related.map((r) => (
                <Link
                  key={r.id}
                  href={`/guides/${r.slug}`}
                  className="group bg-cream-50 rounded-2xl overflow-hidden shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-elevated)] transition-all duration-300 hover:-translate-y-1"
                >
                  <div className="relative aspect-[16/10] bg-navy-100 overflow-hidden">
                    {r.coverImage ? (
                      <img
                        src={r.coverImage}
                        alt={r.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-teal-500/20 to-navy-500/20">
                        <BookOpen className="h-10 w-10 text-navy-300" />
                      </div>
                    )}
                  </div>
                  <div className="p-5">
                    <span className="text-xs font-semibold text-gold-600 uppercase tracking-wider">
                      {CATEGORY_LABELS[r.category] || r.category}
                    </span>
                    <h3 className="mt-1 text-lg font-bold text-navy-700 group-hover:text-gold-600 transition-colors line-clamp-2">
                      {r.title}
                    </h3>
                    <p className="mt-1 text-xs text-navy-400">
                      {formatDate(r.publishedAt)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </article>
  );
}
