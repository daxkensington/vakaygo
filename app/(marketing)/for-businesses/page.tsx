import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { ClaimFinder } from "@/components/business/claim-finder";
import { Search, BadgeCheck, PencilLine, ArrowRight } from "lucide-react";
export const metadata: Metadata = {
  title: { absolute: "Claim Your Business Listing — 0% Guest Fee & 85%–90% Payouts | VakayGo" },
  description: "Claim your VakayGo listing for free across 34 Caribbean, Latin American, and Mediterranean destinations. Keep 85%–90% of every booking with 0% guest fees and payouts via Wise, PayPal, or bank wire.",
  alternates: { canonical: "https://vakaygo.com/for-businesses" },
  openGraph: { title: "Your business. Your story. Keep 85%–90% on VakayGo.", description: "Find your listing, verify ownership in 60 seconds, and accept direct bookings with 0% guest fees and Wise, PayPal, or bank wire payouts.", url: "https://vakaygo.com/for-businesses" },
};
const steps = [
  { icon: Search, title: "Find your listing", text: "Search your business name across our 34 Caribbean, Latin American, and Mediterranean destinations. Start with your existing listing so travelers find one verified source of truth." },
  { icon: BadgeCheck, title: "Verify in 60 seconds", text: "Create a free operator account and verify ownership via your official business email or a 6-digit SMS/phone code sent to your business phone number on file." },
  { icon: PencilLine, title: "Keep 85%–90% of every booking", text: "Update your photos, pricing, and availability. When you enable bookings, travelers pay a 0% guest fee and you keep 85%–90% (saving up to 50% vs. 20%–30% legacy OTA commissions)." },
];
const faqs = [
  ["Is claiming my listing free?", "Yes. Claiming and managing your VakayGo listing is 100% free with zero monthly subscription fees. You only pay a 10%–15% commission when we deliver a confirmed booking."],
  ["How does VakayGo compare to Viator, GetYourGuide, and Expedia?", "Legacy OTAs charge operators 20%–30% commission (or mark up your retail rates). VakayGo charges 0% guest booking fees and only 10%–12% on stays, charters, and transfers (15% on tours and excursions), so you keep 85%–90% of every booking."],
  ["How do payouts work in the Caribbean, Latin America, and the Mediterranean?", "We support Stripe Connect, Wise, PayPal, and local/international USD or EUR bank wires ($100 minimum on manual wires so bank fees never eat into small payouts)."],
  ["Why is my business already on VakayGo?", "Initial directory profiles are created from verified public business records so travelers can discover local operators. Claiming gives the verified owner full control over photos, pricing, inquiries, and booking activation."],
  ["What if our phone number changed or we want to list a brand-new business?", "You can verify via your official business email domain, or contact support@vakaygo.com and our partner team will verify and activate your profile within 24 hours."],
];
export default function ForBusinessesPage() {
  return <><Header /><main className="bg-cream-50 pt-24 pb-20">
    <section className="mx-auto max-w-6xl px-6 py-12 md:py-20 grid gap-10 lg:grid-cols-2 lg:items-center">
      <div><p className="text-sm font-bold uppercase tracking-widest text-gold-700">Caribbean · Latin America · Mediterranean</p><h1 className="mt-4 text-4xl md:text-6xl font-bold leading-tight text-navy-800" style={{ fontFamily: "var(--font-display)" }}>Your business.<br />Your story.<br /><span className="text-gold-700">Keep 85%–90%.</span></h1>
      <p className="mt-6 max-w-lg text-lg leading-relaxed text-navy-500">Stop losing 25%–30% to legacy OTAs. Claim your free VakayGo listing, connect directly with high-intent travelers, and receive fast payouts via Wise, PayPal, or bank wire.</p>
      <p className="mt-5 text-sm font-semibold text-navy-700">100% Free to claim · 0% Guest booking fee · Wise, PayPal &amp; Bank Wire payouts</p></div>
      <ClaimFinder />
    </section>
    <section className="mx-auto max-w-6xl px-6 py-10"><h2 className="text-3xl font-bold text-navy-800">From listed to direct-booking partner</h2><div className="mt-8 grid gap-6 md:grid-cols-3">{steps.map((step, i) => <article key={step.title} className="rounded-2xl bg-white p-7 border border-cream-200"><step.icon className="text-gold-700" size={28} /><p className="mt-6 text-xs uppercase tracking-wider text-navy-400">Step {i + 1}</p><h3 className="mt-2 text-xl font-bold text-navy-800">{step.title}</h3><p className="mt-3 leading-relaxed text-navy-500">{step.text}</p></article>)}</div></section>
    <section className="mx-auto max-w-6xl px-6 py-10"><div className="rounded-3xl bg-navy-800 p-8 md:p-12 text-white"><h2 className="text-3xl font-bold">Why local operators switch to VakayGo</h2><p className="mt-4 max-w-3xl leading-relaxed text-white/80">Travelers pay <strong>0% booking fees</strong> and earn <strong>2% VakayCash</strong> toward their next trip on VakayGo—meaning higher conversion on your stays, boat charters, tours, and dining experiences while you keep <strong>85%–90%</strong> of every reservation.</p><p className="mt-4 text-sm text-white/70">Protected in-app messaging, anti-fraud escrow protection, and instant QR voucher verification included on every booking.</p></div></section>
    <section className="mx-auto max-w-3xl px-6 py-10"><h2 className="text-3xl font-bold text-navy-800">Questions about claiming &amp; payouts</h2><div className="mt-8 space-y-7">{faqs.map(([q, a]) => <article key={q}><h3 className="text-lg font-semibold text-navy-800">{q}</h3><p className="mt-2 leading-relaxed text-navy-500">{a}</p></article>)}</div><Link href="#find-listing" className="mt-10 inline-flex items-center gap-2 rounded-xl bg-gold-700 px-6 py-3 font-semibold text-white">Find my listing<ArrowRight size={18} /></Link><p className="mt-4 text-sm text-navy-500">Need help? <Link href="/contact" className="underline">Contact VakayGo Partner Support</Link>.</p></section>
  </main><Footer /></>;
}
