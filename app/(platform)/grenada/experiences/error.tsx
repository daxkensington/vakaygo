"use client";

import Link from "next/link";

export default function ExperiencesError({ retry }: { retry: () => void }) {
  return <main className="min-h-screen bg-cream-50 px-6 py-28 text-navy-700">
    <div className="mx-auto max-w-xl rounded-2xl border border-cream-200 bg-white p-8">
      <h1 className="text-2xl font-bold">The activity directory could not load</h1>
      <p className="mt-3 text-navy-500">Please try again in a moment.</p>
      <button onClick={() => retry()} className="mt-6 rounded-full bg-gold-700 px-5 py-3 font-semibold text-white hover:bg-gold-800">Try again</button>
      <Link href="/grenada" className="ml-5 inline-block py-3 font-semibold text-gold-700">Back to Grenada</Link>
    </div>
  </main>;
}
