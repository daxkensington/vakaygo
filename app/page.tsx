import type { Metadata } from "next";
export const metadata: Metadata = { alternates: { canonical: "https://vakaygo.com/" } };
import { Hero } from "@/components/landing/hero";
import { MapAiSpotlight } from "@/components/landing/map-ai-spotlight";
import { FeaturedListings } from "@/components/landing/featured-listings";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Categories } from "@/components/landing/categories";
import { IslandShowcase } from "@/components/landing/island-showcase";
import { AudienceSplit } from "@/components/landing/audience-split";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { PersonalizedHome } from "@/components/landing/personalized-home";

// ISR: static HTML at the CDN, refreshed hourly in the background.
export const revalidate = 3600;

export default function LandingPage() {
  const homepageJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "VakayGo — Global Sun & Sea Travel Platform",
    description:
      "Discover stays, boat charters, tours, restaurants, and local experiences across 34 Caribbean, Latin American, and Mediterranean destinations. Explore listings, save favorites, and plan your trip.",
    url: "https://vakaygo.com",
    isPartOf: { "@id": "https://vakaygo.com/#website" },
    about: {
      "@type": "Organization",
      "@id": "https://vakaygo.com/#organization",
      name: "VakayGo",
      areaServed: [
        { "@type": "Place", name: "Caribbean" },
        { "@type": "Place", name: "Latin America" },
        { "@type": "Place", name: "Mediterranean" },
      ],
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
        <PersonalizedHome />
        {/* These compact sections use normal layout so hash links do not
            depend on offscreen size estimates. Images remain lazy-loaded. */}
        <Categories />
        <IslandShowcase />
        <MapAiSpotlight />
        <HowItWorks />
        <AudienceSplit />
        {/* Delayed public recommendations follow the static anchor targets. */}
        <FeaturedListings />
      </main>
      <Footer />
    </>
  );
}
