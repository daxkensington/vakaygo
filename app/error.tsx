"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream-50 px-4">
      <div className="w-full max-w-md text-center">
        {/* Warning icon */}
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gold-100">
          <AlertTriangle className="h-10 w-10 text-gold-700" />
        </div>

        {/* Heading */}
        <h1
          className="mb-3 text-3xl font-bold text-navy-800"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Something went wrong
        </h1>

        {/* Error message */}
        <p className="mb-8 text-navy-400 leading-relaxed">
          {error.message || "An unexpected error occurred. Please try again or return to the homepage."}
        </p>

        {/* Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={reset}
            className="w-full sm:w-auto rounded-xl bg-gold-700 px-8 py-3 font-semibold text-white transition-colors hover:bg-gold-800 shadow-[0_4px_20px_rgba(200,145,46,0.3)]"
          >
            Try Again
          </button>
          <Link
            href="/"
            className="w-full sm:w-auto rounded-xl bg-white px-8 py-3 font-semibold text-navy-700 transition-colors hover:bg-cream-100 shadow-[var(--shadow-card)]"
          >
            Go Home
          </Link>
        </div>

        {/* Branding */}
        <p
          className="mt-16 text-sm text-navy-300"
          style={{ fontFamily: "var(--font-display)" }}
        >
          VakayGo
        </p>
      </div>
    </div>
  );
}
