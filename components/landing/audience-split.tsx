import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function AudienceSplit() {
  return (
    <section className="bg-white py-12 md:py-16">
      <div className="mx-auto grid max-w-7xl gap-6 px-6 md:grid-cols-2">
        <div id="join" className="scroll-mt-24 rounded-2xl bg-teal-800 p-6 md:p-8">
          <h2 className="text-2xl font-bold text-white" style={{ fontFamily: "var(--font-display)" }}>Keep your trip ideas together</h2>
          <p className="mt-3 text-sm leading-relaxed text-white/85">Create a free account to save places and plan your trip. You can browse the directory without signing up.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/auth/signup" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-white px-4 py-2 font-semibold text-teal-800 hover:bg-cream-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">Sign Up Free<ArrowRight size={16} aria-hidden="true" /></Link>
            <Link href="/explore" className="inline-flex min-h-11 items-center rounded-lg px-3 py-2 font-semibold text-white underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">Explore Listings</Link>
          </div>
        </div>
        <div id="for-businesses" className="scroll-mt-24 rounded-2xl bg-navy-800 p-6 md:p-8">
          <h2 className="text-2xl font-bold text-white" style={{ fontFamily: "var(--font-display)" }}>Is your business listed?</h2>
          <p className="mt-3 text-sm leading-relaxed text-white/85">Start a free claim for your existing listing. Verify ownership through a trusted business contact where supported, then manage traveler inquiries.</p>
          <p className="mt-2 text-sm leading-relaxed text-white/85">Claiming alone does not activate bookings or payments. Complete business setup and an approved payment route before requesting activation.</p>
          <Link prefetch={false} href="/for-businesses" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-gold-500 px-4 py-2 font-semibold text-navy-900 hover:bg-gold-400 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold-300">Claim your listing<ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
      </div>
    </section>
  );
}
