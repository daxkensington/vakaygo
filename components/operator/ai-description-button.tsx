"use client";

import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";

export function AIDescriptionButton({
  title,
  type,
  island,
  address,
  features,
  onGenerated,
}: {
  title: string;
  type: string;
  island?: string;
  address?: string;
  features?: string[];
  onGenerated: (description: string, headline: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleGenerate() {
    if (!title.trim()) {
      setError("Enter a title first");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/ai/generate-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, type, island, address, features }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Generation failed");
      }

      const data = await res.json();
      onGenerated(data.description, data.headline);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-start">
      <button
        type="button"
        onClick={handleGenerate}
        disabled={loading}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-gold-500 to-gold-600 hover:from-gold-600 hover:to-gold-700 disabled:opacity-60 text-white text-xs font-semibold rounded-lg transition-all shadow-sm"
      >
        {loading ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          <Sparkles size={12} />
        )}
        AI Generate
      </button>
      {error && (
        <span className="text-xs text-red-500 mt-1">{error}</span>
      )}
    </div>
  );
}
