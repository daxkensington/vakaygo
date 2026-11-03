"use client";

import { useEffect, useState, type ComponentProps } from "react";
import { useParams } from "next/navigation";
import { BlogEditor } from "@/components/blog/blog-editor";
import { Loader2 } from "lucide-react";

type EditorData = NonNullable<ComponentProps<typeof BlogEditor>["initialData"]>;

type LoadResult = { id: string; post: EditorData } | { id: string; error: string };

export default function EditBlogPostPage() {
  const params = useParams();
  const id = params.id as string;
  // Each result records the post ID it was loaded for, so a stale result is
  // never shown for a different route ID.
  const [result, setResult] = useState<LoadResult | null>(null);
  const loading = !result || result.id !== id;

  useEffect(() => {
    const controller = new AbortController();

    async function fetchPost() {
      try {
        const res = await fetch(`/api/admin/blog/${id}`, {
          signal: controller.signal,
        });
        const data = await res.json();
        if (controller.signal.aborted) return;
        if (!res.ok) {
          setResult({ id, error: data.error || "Post not found" });
          return;
        }
        const p = data.post;
        setResult({
          id,
          post: {
            id: p.id,
            title: p.title,
            slug: p.slug,
            excerpt: p.excerpt || "",
            content: p.content,
            coverImage: p.coverImage || "",
            islandId: p.islandId ? String(p.islandId) : "",
            category: p.category,
            tags: Array.isArray(p.tags) ? p.tags.join(", ") : "",
            status: p.status,
            metaTitle: p.metaTitle || "",
            metaDescription: p.metaDescription || "",
          },
        });
      } catch {
        if (controller.signal.aborted) return;
        setResult({ id, error: "Failed to load post" });
      }
    }
    fetchPost();

    return () => controller.abort();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-gold-700" />
      </div>
    );
  }

  if ("error" in result) {
    return (
      <div className="text-center py-20">
        <p className="text-red-500 font-medium">{result.error}</p>
      </div>
    );
  }

  return <BlogEditor key={id} initialData={result.post} isEdit />;
}
