import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { GuidesContent } from "@/components/blog/guides-content";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Caribbean Travel Guides & Tips",
  description:
    "Expert Caribbean travel guides, destination tips, local culture insights, food recommendations, and trip planning advice from VakayGo.",
  openGraph: {
    title: "Caribbean Travel Guides & Tips | VakayGo",
    description:
      "Expert Caribbean travel guides, destination tips, local culture insights, food recommendations, and trip planning advice.",
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
              Travel Guides
            </p>
            <h1
              className="text-4xl md:text-6xl font-bold text-white leading-tight"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Caribbean Travel
              <br />
              <span className="text-gold-400">Guides & Tips</span>
            </h1>
            <p className="mt-6 text-lg text-white/70 max-w-2xl mx-auto leading-relaxed">
              Insider knowledge from locals and seasoned travelers. Everything you
              need to plan the perfect Caribbean getaway.
            </p>
          </div>
        </section>

        <GuidesContent />
      </main>
      <Footer />
    </>
  );
}
