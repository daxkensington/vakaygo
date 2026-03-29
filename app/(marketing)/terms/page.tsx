import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";

export default function TermsPage() {
  return (
    <>
      <Header />
      <main className="pt-24 pb-20 bg-cream-50 min-h-screen">
        <div className="mx-auto max-w-3xl px-6">
          <h1 className="text-3xl font-bold text-navy-700 mb-2" style={{ fontFamily: "var(--font-display)" }}>
            Terms of Service
          </h1>
          <p className="text-navy-400 mb-10">Last updated: March 2026</p>

          <div className="bg-white rounded-2xl p-8 md:p-10 shadow-[var(--shadow-card)]">
            <div className="space-y-8 text-navy-600 leading-relaxed text-[15px]">
              <section>
                <h2 className="text-xl font-bold text-navy-700 mb-3">1. Acceptance of Terms</h2>
                <p>By using VakayGo, you agree to these terms. VakayGo is a marketplace that connects travelers with local businesses across the Caribbean. We facilitate bookings but are not the provider of the experiences, accommodations, or services listed on our platform.</p>
              </section>

              <section>
                <h2 className="text-xl font-bold text-navy-700 mb-3">2. For Travelers</h2>
                <p>When you book on VakayGo, you enter into an agreement with the operator. A 6% service fee is added to your booking total. You are responsible for providing accurate information and meeting any requirements specified by the operator (age, fitness, documents).</p>
                <p className="mt-3"><strong>Cancellation:</strong> Free cancellation is available up to 24 hours before your experience start time for a full refund. Cancellations within 24 hours may incur a 50% fee. Trip protection (optional add-on) covers cancellation for any reason.</p>
              </section>

              <section>
                <h2 className="text-xl font-bold text-navy-700 mb-3">3. For Operators</h2>
                <p>Listing on VakayGo is free. We charge a 3% commission on completed bookings — the lowest in the travel industry. Operators are responsible for the accuracy of their listings, the quality of their services, and honoring confirmed bookings.</p>
                <p className="mt-3"><strong>Payouts:</strong> Operator earnings are paid weekly via bank transfer. VakayGo deducts the 3% commission before payout.</p>
              </section>

              <section>
                <h2 className="text-xl font-bold text-navy-700 mb-3">4. Reviews</h2>
                <p>Only travelers who completed a booking can leave reviews. Reviews must be honest and based on your actual experience. Operators can respond publicly to reviews. VakayGo reserves the right to remove reviews that violate our guidelines (threats, discrimination, spam).</p>
              </section>

              <section>
                <h2 className="text-xl font-bold text-navy-700 mb-3">5. Prohibited Conduct</h2>
                <p>Users may not: create fake listings or reviews, use the platform for illegal activities, harass other users, scrape or bulk-download content, or circumvent VakayGo&apos;s booking system to avoid fees.</p>
              </section>

              <section>
                <h2 className="text-xl font-bold text-navy-700 mb-3">6. Limitation of Liability</h2>
                <p>VakayGo is a marketplace platform. We are not liable for the quality, safety, or legality of listed experiences, the truth of listings, or the ability of operators to provide services. We do not guarantee that listings will result in bookings.</p>
              </section>

              <section>
                <h2 className="text-xl font-bold text-navy-700 mb-3">7. Intellectual Property</h2>
                <p>Content you upload (photos, descriptions, reviews) remains yours, but you grant VakayGo a license to display it on the platform. VakayGo&apos;s brand, design, and technology are our intellectual property.</p>
              </section>

              <section>
                <h2 className="text-xl font-bold text-navy-700 mb-3">8. Contact</h2>
                <p>Questions about these terms? Email us at <a href="mailto:hello@vakaygo.com" className="text-gold-500 font-medium">hello@vakaygo.com</a>.</p>
              </section>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
