"use client";

export default function OfflinePage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-900 to-slate-950 px-4">
      <div className="text-center max-w-md">
        <div className="text-7xl mb-6" aria-hidden="true">
          🏝️
        </div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl md:text-4xl text-white mb-3">
          You&apos;re offline
        </h1>
        <p className="text-slate-400 text-lg mb-8">
          It looks like you&apos;ve lost your connection. Check your internet and
          try again — the Caribbean isn&apos;t going anywhere.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 bg-teal-500 hover:bg-teal-600 text-white font-semibold rounded-2xl px-6 py-3 transition-colors"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182"
            />
          </svg>
          Try again
        </button>
      </div>
    </main>
  );
}
