import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { OPERATED_BY } from "@/lib/brand";

export default function TermsPage() {
  return (
    <>
      <Header />
      <main className="pt-24 pb-20 bg-cream-50 min-h-screen">
        <div className="mx-auto max-w-3xl px-6">
          <h1 className="text-3xl font-bold text-navy-700 mb-2" style={{ fontFamily: "var(--font-display)" }}>
            Terms of Service
          </h1>
          <p className="text-navy-400 mb-10">Last updated: October 2026</p>

          <div className="bg-white rounded-2xl p-8 md:p-10 shadow-[var(--shadow-card)]">
            <div className="space-y-8 text-navy-600 leading-relaxed text-[15px]">
              <section>
                <h2 className="text-xl font-bold text-navy-700 mb-3">1. Acceptance of Terms &amp; Intermediary Role</h2>
                <p>By using VakayGo, you agree to these terms. {OPERATED_BY} VakayGo is an online marketplace that connects travelers with independent local businesses (&ldquo;Operators&rdquo;) across the Caribbean and global leisure destinations. VakayGo acts solely as an intermediary and limited payment-collection agent for Operators and is not the supplier, owner, or operator of any accommodation, excursion, transport, dining, or other service listed on the platform.</p>
              </section>

              <section>
                <h2 className="text-xl font-bold text-navy-700 mb-3">2. For Travelers ($0 Guest Booking Fees &amp; VakayCash)</h2>
                <p>When you book on VakayGo, you enter into a direct contract with the Operator. VakayGo charges <strong>$0 guest booking fees (0% traveler service fee)</strong> on standard bookings, and eligible completed bookings earn <strong>2% VakayCash</strong> travel credit (2 points per $1 spent; 100 points = $1.00 credit toward future VakayGo bookings).</p>
                <p className="mt-3">You are responsible for providing accurate guest information and meeting any age, health, fitness, or travel-document requirements specified by the Operator.</p>
                <p className="mt-3"><strong>Cancellation:</strong> Traveler cancellations follow the specific cancellation policy (Flexible, Moderate, Strict, or Non-Refundable) displayed on the listing and saved with your booking at checkout. If an Operator cancels a confirmed paid booking, you receive a full refund.</p>
                <p className="mt-3"><strong>Currency:</strong> You can browse estimated prices in 8 currencies (USD, EUR, GBP, CAD, XCD, BBD, JMD, TTD) using the currency selector. Checkout is processed in the listing&apos;s settlement currency displayed at payment.</p>
              </section>

              <section>
                <h2 className="text-xl font-bold text-navy-700 mb-3">3. For Operators (Commissions &amp; Payouts)</h2>
                <p>Claiming and managing a listing on VakayGo is free. VakayGo deducts an all-in marketplace commission only on completed paid bookings:</p>
                <ul className="mt-3 space-y-1 list-disc list-inside text-navy-500">
                  <li><strong>Stays &amp; Pre-Paid Culinary Experiences:</strong> 12% operator commission (Operator keeps 88%)</li>
                  <li><strong>Tours, Excursions, Charters, Transfers, Transport, VIP, Guides &amp; Spa:</strong> 15% operator commission (Operator keeps 85%)</li>
                  <li><strong>Events &amp; Ticketed Nightlife:</strong> 10% organizer commission (Organizer keeps 90%)</li>
                  <li><strong>Dining Table Reservations:</strong> 0% booking commission ($0/mo Starter, $39/mo Essential, $79/mo Pro)</li>
                </ul>
                <p className="mt-3">Operators on paid Partner Pro or Business subscription plans receive reduced commission rates as specified in their plan tier. Operators are responsible for listing accuracy, service quality, insurance, licensing, and honoring confirmed bookings.</p>
                <p className="mt-3"><strong>Payouts:</strong> Operator earnings are settled weekly after booking completion via Stripe Connect, PayPal, or verified Caribbean bank transfer (subject to a $100 USD equivalent minimum batch threshold for manual bank wire settlements).</p>
              </section>

              <section>
                <h2 className="text-xl font-bold text-navy-700 mb-3">4. Taxes, VAT &amp; Occupancy Levies</h2>
                <p><strong>Operator Tax Responsibility:</strong> Each Operator is solely responsible for determining, collecting, reporting, and remitting all applicable local taxes—including Value Added Tax (VAT), General Consumption Tax (GCT), hotel room occupancy taxes, tourism enhancement levies, and income taxes—to the appropriate tax authorities. Unless a separate tax line is explicitly itemized at checkout, all prices listed by Operators on VakayGo must be inclusive of all applicable local taxes.</p>
                <p className="mt-3"><strong>Pass-Through Taxes &amp; Marketplace Facilitator Jurisdictions:</strong> Where VakayGo is required by local law (or configured by the Operator) to collect occupancy, sales, or consumption taxes separately at checkout, such taxes are charged to the Traveler in addition to the listing price and remitted to the taxing authority or passed through to the Operator. VakayGo&apos;s taxable revenue consists strictly of its retained marketplace commission and subscription fees, never the gross booking subtotal collected on behalf of Operators.</p>
              </section>

              <section>
                <h2 className="text-xl font-bold text-navy-700 mb-3">5. Reviews</h2>
                <p>Only travelers who completed a booking can leave reviews. Reviews must be honest and based on your actual experience. Operators can respond publicly to reviews. VakayGo reserves the right to remove reviews that violate our guidelines (threats, discrimination, spam).</p>
              </section>

              <section>
                <h2 className="text-xl font-bold text-navy-700 mb-3">6. Anti-Circumvention &amp; Prohibited Conduct</h2>
                <p>To protect travelers and operators under the VakayGo Guarantee, direct contact details are unlocked only after a booking is confirmed and paid. Users and Operators may not share phone numbers, email addresses, external payment links, or off-platform messaging handles prior to booking confirmation, nor circumvent VakayGo&apos;s checkout system to avoid marketplace commissions.</p>
              </section>

              <section>
                <h2 className="text-xl font-bold text-navy-700 mb-3">7. Limitation of Liability</h2>
                <p>VakayGo is a marketplace platform. We are not liable for the quality, safety, or legality of listed experiences, the truth of listings, or the ability of operators to provide services. We do not guarantee that listings will result in bookings.</p>
              </section>

              <section>
                <h2 className="text-xl font-bold text-navy-700 mb-3">8. Intellectual Property</h2>
                <p>Content you upload (photos, descriptions, reviews) remains yours, but you grant VakayGo a license to display it on the platform. VakayGo&apos;s brand, design, and technology are our intellectual property.</p>
              </section>

              <section>
                <h2 className="text-xl font-bold text-navy-700 mb-3">9. Contact</h2>
                <p>Questions about these terms? Email us at <a href="mailto:hello@vakaygo.com" className="text-gold-700 font-medium">hello@vakaygo.com</a>.</p>
              </section>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
