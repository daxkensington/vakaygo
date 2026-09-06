import Link from "next/link";

export function DirectoryNotice({ listingId }: { listingId?: string }) {
  return (
    <section className="rounded-2xl border border-cream-200 bg-white p-6 text-navy-700 shadow-sm">
      <h2 className="text-lg font-bold">Bookings are not available</h2>
      <p className="mt-3 text-sm leading-relaxed text-navy-600">
        VakayGo is currently a business directory. Bookings, reservations and payments will only become available after the business has verified its listing and completed onboarding.
      </p>
      {listingId && <Link href={`/operator/claim/${listingId}`} className="mt-5 inline-block font-semibold text-teal-700 underline">Own this business? Claim your listing</Link>}
    </section>
  );
}
