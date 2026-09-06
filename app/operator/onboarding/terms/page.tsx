import Link from "next/link";

const fees = [
  ["Stays", "3%", "9%"], ["Tours and excursions", "5%", "10%"], ["Dining", "0%", "0%"],
  ["Events", "3%", "5%"], ["Transfers", "4%", "8%"], ["Transport", "5%", "8%"],
  ["Guides, VIP and spa services", "5%", "10%"],
];

/** This version is a fixed review draft; fee changes require a new accepted version. */
export default function OperatorTermsPage() {
  return <main className="mx-auto max-w-3xl space-y-6 p-6 md:p-8 text-navy-700">
    <Link href="/operator/listings" className="font-semibold text-gold-700">Back to your listings</Link>
    <h1 className="text-3xl font-bold">Operator terms — review draft</h1>
    <p className="font-semibold">Version 2026-09-06</p>
    <p className="rounded-xl border border-gold-200 bg-gold-50 p-4">Draft awaiting business and legal review. Online bookings and payments remain disabled. Completing onboarding or recording acceptance of this draft does not launch payment services or authorize bookings.</p>
    <section className="space-y-2"><h2 className="text-xl font-bold">Company authority and listing information</h2>
      <p>You must have authority to represent the company and offer the services described. Claim verification uses a trusted business contact. Provide accurate legal company, representative and payout information, and maintain the listing&apos;s prices, service description, guest limits, location and cancellation policy.</p>
      <p>Publish the dates and capacity your company can fulfill. Unpublished or blocked dates are unavailable. Business ownership, onboarding and payment verification must remain valid; a restriction or ownership change can pause new bookings.</p>
    </section>
    <section className="space-y-3"><h2 className="text-xl font-bold">Booking fees</h2>
      <p>These rates describe the current booking fee schedule. The operator commission is deducted from the booking subtotal; the traveler service fee is added to that subtotal. The booking total and recorded operator earnings reflect applicable promotions and rounding. No separate subscription purchase is authorized by accepting this draft.</p>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-cream-300"><th className="p-3">Category</th><th className="p-3">Operator commission</th><th className="p-3">Traveler service fee</th></tr></thead><tbody>{fees.map(([type, operator, traveler]) => <tr key={type} className="border-b border-cream-200"><td className="p-3">{type}</td><td className="p-3">{operator}</td><td className="p-3">{traveler}</td></tr>)}</tbody></table></div>
    </section>
    <section className="space-y-2"><h2 className="text-xl font-bold">Payments and payouts</h2>
      <p>Complete Stripe&apos;s required company, identity and bank-account checks. Payment and payout eligibility must be verified before the listing can accept bookings. If the configured payment service does not support the company&apos;s country, the listing remains information only.</p>
      <p>When payment services are enabled, eligible bookings use the verified connected account. Payout timing depends on the payment provider&apos;s availability, account restrictions and settlement schedule. A pending earnings or payout record is not evidence that money has reached your bank. Provide accurate bank details and respond to verification or dispute requests.</p>
    </section>
    <section className="space-y-2"><h2 className="text-xl font-bold">Cancellations and refunds</h2>
      <p>The listing&apos;s selected cancellation policy is recorded when a booking is created. Current traveler cancellation rules are:</p>
      <ul className="list-disc space-y-2 pl-6">
        <li>Flexible: full refund more than 24 hours before the start; none at 24 hours or less.</li>
        <li>Moderate: full refund more than five days before the start; 50% from five days to more than 24 hours before; none at 24 hours or less.</li>
        <li>Strict: 50% refund more than seven days before the start; none at seven days or less.</li>
        <li>Non-refundable: no refund for traveler cancellation or no-show.</li>
      </ul>
      <p>Operator cancellations and authorized administrative cancellations are processed as full refunds. Cooperate with required refunds and dispute review. Refunds may reverse the related operator transfer and platform fee; a pending refund is not a completed refund. Failed refunds remain subject to support review.</p>
    </section>
    <section className="space-y-2"><h2 className="text-xl font-bold">Before payment launch</h2>
      <p>The operating entity, supported countries, final commercial terms, provider configuration and applicable legal requirements must be reviewed before launch. Material revisions require a new terms version and renewed acceptance. This draft does not change existing travelers&apos; cancellation, refund or support access.</p>
      <p>Contact <a href="mailto:bookings@vakaygo.com" className="font-semibold text-gold-700 underline">bookings@vakaygo.com</a> for questions about this draft or an existing booking.</p>
    </section>
  </main>;
}
