"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { BlogEditor } from "@/components/blog/blog-editor";
import { Loader2 } from "lucide-react";

type FetchResult = {
  id: string;
  post: any;
  error: string;
};

export default function EditBlogPostPage() {
  const params = useParams();
  const id = params.id as string;
  // Results are tagged with the id they belong to, so a change of id
  // immediately shows loading with no stale post or error.
  const [result, setResult] = useState<FetchResult | null>(null);
  const current = result?.id === id ? result : null;
  const loading = current === null;
  const postData = current?.post ?? null;
  const error = current?.error ?? "";

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
          setResult({ id, post: null, error: data.error || "Post not found" });
          return;
        }
        const p = data.post;
        setResult({
          id,
          error: "",
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
        setResult({ id, post: null, error: "Failed to load post" });
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

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-red-500 font-medium">{error}</p>
      </div>
    );
  }

  return <BlogEditor initialData={postData} isEdit />;
}
