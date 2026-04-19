import { Hero } from "@/components/landing/hero";
import { StatsBar } from "@/components/landing/stats-bar";
import { ValueProps } from "@/components/landing/value-props";
import { FeaturedListings } from "@/components/landing/featured-listings";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Categories } from "@/components/landing/categories";
import { IslandShowcase } from "@/components/landing/island-showcase";
import { AudienceSplit } from "@/components/landing/audience-split";
import { Roadmap } from "@/components/landing/roadmap";
import { WaitlistSection } from "@/components/landing/waitlist-section";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { PersonalizedHome } from "@/components/landing/personalized-home";

export default function LandingPage() {
  const homepageJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "VakayGo — Caribbean Travel Platform",
    description:
      "Book stays, tours, dining, events, and transport across 21 Caribbean islands. The lowest commissions in the travel industry.",
    url: "https://vakaygo.com",
    isPartOf: { "@id": "https://vakaygo.com/#website" },
    about: {
      "@type": "TravelAgency",
      name: "VakayGo",
      areaServed: {
        "@type": "Place",
        name: "Caribbean",
      },
      priceRange: "$-$$$$",
    },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: "https://vakaygo.com",
        },
      ],
    },
  };

  return (
    <>
      <Header />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homepageJsonLd) }}
      />
      <main>
        <Hero />
        {/* Every section below is offscreen at first paint. Wrapping in
            .defer-offscreen applies content-visibility:auto so the
            browser skips their layout+paint until scroll nears them —
            cuts mobile main-thread Style & Layout work by ~60% on the
            landing page (was the ceiling keeping mobile LCP at ~4s). */}
        <div className="defer-offscreen">
          <PersonalizedHome />
        </div>
        <div className="defer-offscreen">
          <StatsBar />
        </div>
        <div className="defer-offscreen">
          <FeaturedListings />
        </div>
        <div className="defer-offscreen">
          <ValueProps />
        </div>
        <div className="defer-offscreen">
          <HowItWorks />
        </div>
        <div className="defer-offscreen">
          <Categories />
        </div>
        <div className="defer-offscreen">
          <IslandShowcase />
        </div>
        <div className="defer-offscreen">
          <AudienceSplit />
        </div>
        <div className="defer-offscreen">
          <Roadmap />
        </div>
        <div className="defer-offscreen">
          <WaitlistSection />
        </div>
      </main>
      <Footer />
    </>
  );
}
