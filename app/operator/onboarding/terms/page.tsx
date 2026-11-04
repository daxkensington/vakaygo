import Link from "next/link";
import { OPERATED_BY } from "@/lib/brand";
import { OPERATOR_TERMS_FEES, OPERATOR_TERMS_VERSION, PREVIOUS_OPERATOR_TERMS_PATH } from "@/lib/operator-terms";

/** Proposed agreement revision: publish only after the documented business review. */
export default function OperatorTermsPage() {
  return <main className="mx-auto max-w-3xl space-y-6 p-6 md:p-8 text-navy-700">
    <Link href="/operator/listings" className="font-semibold text-gold-700">Back to your listings</Link>
    <h1 className="text-3xl font-bold">Operator terms</h1>
    <p className="font-semibold">Version {OPERATOR_TERMS_VERSION}</p>
    <p className="rounded-xl border border-gold-200 bg-gold-50 p-4">{OPERATED_BY} Review this revision before accepting it for your company. Acceptance alone does not enable bookings: ownership, company and listing setup, an approved payment route, current verification and explicit activation must also be complete.</p>
    <p><Link href={PREVIOUS_OPERATOR_TERMS_PATH} className="underline">Read the archived September 6, 2026 review draft</Link>. A previous acceptance does not count as acceptance of this revision.</p>
    <section className="space-y-2"><h2 className="text-xl font-bold">Company authority and listing information</h2>
      <p>You must have authority to represent the company and offer the services described. Claim verification uses a trusted business contact. Provide accurate company, representative and payout information, and maintain the listing&apos;s prices, service description, guest limits, location and cancellation policy.</p>
      <p>Publish the dates and capacity your company can fulfill. Unpublished or blocked dates are unavailable. Business ownership, onboarding and payment verification must remain valid; a restriction, expired verification or ownership change can pause new bookings.</p>
    </section>
    <section className="space-y-3"><h2 className="text-xl font-bold">Booking fees</h2>
      <p>The operator commission is calculated on the booking subtotal before promotions. The traveler service fee is currently zero for the categories below. The booking total and recorded operator earnings reflect applicable promotions and rounding. Accepting these terms does not purchase a subscription.</p>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Booking fee schedule for version {OPERATOR_TERMS_VERSION}</caption><thead><tr className="border-b border-cream-300"><th scope="col" className="p-3">Category</th><th scope="col" className="p-3">Operator commission</th><th scope="col" className="p-3">Traveler service fee</th></tr></thead><tbody>{OPERATOR_TERMS_FEES.map(fee => <tr key={fee.label} className="border-b border-cream-200"><th scope="row" className="p-3 font-normal">{fee.label}</th><td className="p-3">{fee.operatorPercent}%</td><td className="p-3">{fee.travelerPercent}%</td></tr>)}</tbody></table></div>
      <p>A table reservation request has no booking charge or operator commission. A separate priced dining booking uses the paid culinary booking rate. A request, inquiry or saved listing does not establish a paid reservation.</p>
      <h3 className="font-semibold">Promotions and recorded earnings</h3>
      <p>A promotion first reduces the platform&apos;s share. If the discount exceeds that share, it also reduces operator earnings. For example, a tour with a 100.00 subtotal and a 20.00 discount has an 80.00 traveler total and 80.00 recorded operator earnings, before any refund or external settlement costs. All amounts in that example use the same booking currency.</p>
      <p>Review the recorded amounts for each booking. A headline commission percentage, points balance or pending payout record is not a promise of money available to withdraw. Historical booking amounts, payment records and cancellation policies are not rewritten by this revision.</p>
    </section>
    <section className="space-y-2"><h2 className="text-xl font-bold">Payments and payouts</h2>
      <p>Traveler card payments use the secure VakayGo checkout offered for an eligible booking. Do not collect card or bank details in a listing message or contact form. PayPal, Wise and bank-wire payout profiles describe possible operator settlement routes; they are not traveler checkout methods.</p>
      <p>For a connected Stripe account, complete the required company, identity and bank-account checks. The account, country, payment capabilities and payout capabilities must remain supported and verified. Payment collection and bank payout are separate: provider availability, settlement rules and account restrictions affect when funds reach the bank.</p>
      <p>A company without a connected account may qualify for platform collection and separately reviewed settlement through an approved payout profile. This requires current verification and the company and tax certifications requested for that route. Submitting a profile or certification does not guarantee approval or country coverage.</p>
      <p>For platform collection, operator earnings are recorded for settlement review after paid service completion and the applicable release checks. A released, pending or processing record does not mean a transfer has been sent or received. Settlement is complete only after it has been confirmed and recorded. Review the recorded currency and settlement reference, and contact Partner Support about missing or failed settlement.</p>
      <p>Confirm the settlement route, currency, any external provider or bank costs, any currency conversion and the applicable minimum and processing arrangements with Partner Support. A profile setting, weekly job or dashboard estimate does not guarantee automatic transfer or a bank arrival date.</p>
    </section>
    <section className="space-y-2"><h2 className="text-xl font-bold">Cancellations and refunds</h2>
      <p>The listing&apos;s selected cancellation policy is recorded when a booking is created. Current traveler cancellation rules are:</p>
      <ul className="list-disc space-y-2 pl-6">
        <li>Flexible: full refund more than 24 hours before the start; none at 24 hours or less.</li>
        <li>Moderate: full refund more than five days before the start; 50% from five days to more than 24 hours before; none at 24 hours or less.</li>
        <li>Strict: 50% refund more than seven days before the start; none at seven days or less.</li>
        <li>Non-refundable: no refund for traveler cancellation or no-show.</li>
      </ul>
      <p>Operator cancellations and authorized administrative cancellations are processed as full refunds. Cooperate with required refunds and dispute review. Refunds may reverse the related operator transfer and platform fee; a pending refund is not a completed refund. A partial refund does not necessarily reverse the application fee. Failed refunds remain subject to support review.</p>
    </section>
    <section className="space-y-2"><h2 className="text-xl font-bold">Acceptance and later revisions</h2>
      <p>Accept the exact version displayed in your business dashboard. A material revision requires a new version and your company&apos;s explicit acceptance. New-booking and new-payment eligibility can remain closed until that acceptance and the other activation requirements are complete. Existing paid-booking, cancellation, refund and support records remain available.</p>
      <p>Contact <a href="mailto:bookings@vakaygo.com" className="font-semibold text-gold-700 underline">bookings@vakaygo.com</a> for questions about these terms, your settlement arrangements or an existing booking.</p>
    </section>
  </main>;
}
