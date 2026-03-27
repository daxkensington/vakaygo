import { Hero } from "@/components/landing/hero";
import { ValueProps } from "@/components/landing/value-props";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Categories } from "@/components/landing/categories";
import { AudienceSplit } from "@/components/landing/audience-split";
import { Roadmap } from "@/components/landing/roadmap";
import { WaitlistSection } from "@/components/landing/waitlist-section";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";

export default function LandingPage() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <ValueProps />
        <HowItWorks />
        <Categories />
        <AudienceSplit />
        <Roadmap />
        <WaitlistSection />
      </main>
      <Footer />
    </>
  );
}
