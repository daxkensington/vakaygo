import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { GuidesContent } from "@/components/blog/guides-content";
import type { Metadata } from "next";

// ISR: rebuilt in the background at most hourly, so new posts/listings
// show up without a deploy.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Global Sun & Sea Travel Guides — Caribbean, Latin America & Mediterranean",
  description:
    "Expert destination guides, local culture insights, restaurant recommendations, and trip planning advice across 34 Caribbean, Latin American, and Mediterranean hubs.",
  openGraph: {
    title: "Global Sun & Sea Travel Guides | VakayGo",
    description:
      "Expert destination guides, local culture insights, restaurant recommendations, and trip planning advice across 34 coastal hubs.",
    url: "https://vakaygo.com/guides",
    type: "website",
  },
};

export default function GuidesPage() {
  return (
    <>
      <Header />
      <main id="main-content">
        {/* Hero */}
        <section className="relative pt-32 pb-16 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-teal-700 via-navy-700 to-navy-900" />
          <div className="absolute inset-0 bg-[url('/images/hero/caribbean-hero.jpg')] bg-cover bg-center opacity-20" />
          <div className="relative mx-auto max-w-4xl px-6 text-center">
            <p className="text-sm font-semibold text-gold-400 uppercase tracking-widest mb-4">
              34 Coastal Destinations
            </p>
            <h1
              className="text-4xl md:text-6xl font-bold text-white leading-tight"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Global Sun &amp; Sea
              <br />
              <span className="text-gold-400">Travel Guides &amp; Tips</span>
            </h1>
            <p className="mt-6 text-lg text-white/70 max-w-2xl mx-auto leading-relaxed">
              Insider knowledge from locals across the Caribbean, Latin America,
              and the Mediterranean. Everything you need to plan an authentic
              getaway with 0% guest booking fees.
            </p>
          </div>
        </section>

        <GuidesContent />
      </main>
      <Footer />
    </>
  );
}
