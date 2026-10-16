import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { ClaimFinder } from "@/components/business/claim-finder";
import { Search, BadgeCheck, PencilLine, ArrowRight } from "lucide-react";
export const metadata: Metadata = {
  title: { absolute: "Claim Your Business Listing for Free | VakayGo" },
  description: "Find your business across 34 Caribbean, Latin American, and Mediterranean destinations. Start a free ownership claim and manage your directory profile. Online bookings and payments are not available yet.",
  alternates: { canonical: "https://vakaygo.com/for-businesses" },
  openGraph: { title: "Your business. Your story. Your listing on VakayGo.", description: "Find your listing, verify ownership through a trusted business contact, and manage your profile for free. Claiming does not activate bookings or payments.", url: "https://vakaygo.com/for-businesses" },
};
const steps = [
  { icon: Search, title: "Find your listing", text: "Search your business name across our 34 Caribbean, Latin American, and Mediterranean destinations. Check the name and location before starting a claim." },
  { icon: BadgeCheck, title: "Verify ownership", text: "Create a business account, confirm your inbox, and prove ownership through a trusted business email or phone where supported. Contact support if your business contact needs review; no review deadline is guaranteed." },
  { icon: PencilLine, title: "Manage your profile", text: "After your claim is verified, update your business information and photos and manage available traveler inquiries. Claiming a listing does not enable bookings or payments." },
];
const faqs = [
  ["Is claiming my listing free?", "Yes. Starting a claim and managing your directory profile are free. Online bookings and payments are not available yet; future commercial terms require separate review before launch."],
  ["Can travelers book with us through VakayGo?", "Not during the current directory launch. Travelers can discover and save places, record interest, and use available messaging with businesses that have verified ownership. Interest and messages do not create reservations."],
  ["Are payouts available?", "Directory claims and traveler interest do not create earnings or payouts. Any future booking or payout service requires separate business onboarding, provider approval for the actual company and country, and explicit activation."],
  ["Why is my business already on VakayGo?", "Directory profiles may be created from public business information. A listing does not mean the business has partnered with VakayGo. A verified ownership claim lets the owner manage its profile; it is not a guarantee of service quality."],
  ["What if our contact changed or we want to list a new business?", "Start a business account or contact VakayGo with the listing link and the details that need review. Support may request further ownership proof. Never send passwords or verification codes, and allow time for review."],
];
export default function ForBusinessesPage() {
  return <><Header /><main className="bg-cream-50 pt-24 pb-20">
    <section className="mx-auto max-w-6xl px-6 py-12 md:py-20 grid gap-10 lg:grid-cols-2 lg:items-center">
      <div><p className="text-sm font-bold uppercase tracking-widest text-gold-700">Caribbean · Latin America · Mediterranean</p><h1 className="mt-4 text-4xl md:text-6xl font-bold leading-tight text-navy-800" style={{ fontFamily: "var(--font-display)" }}>Your business.<br />Your story.<br /><span className="text-gold-700">Your listing.</span></h1>
      <p className="mt-6 max-w-lg text-lg leading-relaxed text-navy-500">Help travelers discover your business. Find your existing VakayGo listing, prove ownership through a trusted contact, and manage your directory profile for free.</p>
      <p className="mt-5 text-sm font-semibold text-navy-700">Free to claim and manage · Online bookings and payments are not available yet</p></div>
      <ClaimFinder />
    </section>
    <section className="mx-auto max-w-6xl px-6 py-10"><h2 className="text-3xl font-bold text-navy-800">From directory listing to owner-managed profile</h2><div className="mt-8 grid gap-6 md:grid-cols-3">{steps.map((step, i) => <article key={step.title} className="rounded-2xl bg-white p-7 border border-cream-200"><step.icon className="text-gold-700" size={28} /><p className="mt-6 text-xs uppercase tracking-wider text-navy-400">Step {i + 1}</p><h3 className="mt-2 text-xl font-bold text-navy-800">{step.title}</h3><p className="mt-3 leading-relaxed text-navy-500">{step.text}</p></article>)}</div></section>
    <section className="mx-auto max-w-6xl px-6 py-10"><div className="rounded-3xl bg-navy-800 p-8 md:p-12 text-white"><h2 className="text-3xl font-bold">Give travelers a clearer picture</h2><p className="mt-4 max-w-3xl leading-relaxed text-white/80">An owner-managed profile helps travelers find accurate photos, locations, and business information. Verified ownership also supports available in-app inquiries, so you can answer questions about your business.</p><p className="mt-4 text-sm text-white/70">A verified claim is ownership proof. It does not activate bookings, payment protection, rewards, or payouts.</p></div></section>
    <section className="mx-auto max-w-3xl px-6 py-10"><h2 className="text-3xl font-bold text-navy-800">Questions about claiming &amp; managing your listing</h2><div className="mt-8 space-y-7">{faqs.map(([q, a]) => <article key={q}><h3 className="text-lg font-semibold text-navy-800">{q}</h3><p className="mt-2 leading-relaxed text-navy-500">{a}</p></article>)}</div><Link href="#find-listing" className="mt-10 inline-flex items-center gap-2 rounded-xl bg-gold-700 px-6 py-3 font-semibold text-white">Find my listing<ArrowRight size={18} /></Link><p className="mt-4 text-sm text-navy-500">Need help? <Link href="/contact" className="underline">Contact VakayGo Partner Support</Link>.</p></section>
  </main><Footer /></>;
}
