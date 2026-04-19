"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { BlogEditor } from "@/components/blog/blog-editor";
import { Loader2 } from "lucide-react";

export default function EditBlogPostPage() {
  const params = useParams();
  const id = params.id as string;
  const [loading, setLoading] = useState(true);
  const [postData, setPostData] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchPost() {
      try {
        const res = await fetch(`/api/admin/blog/${id}`);
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Post not found");
          return;
        }
        const p = data.post;
        setPostData({
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
        });
      } catch {
        setError("Failed to load post");
      } finally {
        setLoading(false);
      }
    }
    fetchPost();
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
