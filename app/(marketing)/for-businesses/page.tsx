import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { ClaimFinder } from "@/components/business/claim-finder";
import { Search, BadgeCheck, PencilLine, ArrowRight } from "lucide-react";
export const metadata: Metadata = {
  title: "Claim Your Caribbean Business Listing | VakayGo",
  description: "Find and claim your VakayGo business listing for free. Verify ownership, update your business information, and help travelers discover you across the Caribbean.",
  alternates: { canonical: "https://vakaygo.com/for-businesses" },
  openGraph: { title: "Your business. Your story. Claim it on VakayGo.", description: "Find your listing, verify ownership, and keep your Caribbean business information up to date.", url: "https://vakaygo.com/for-businesses" },
};
const steps = [
  { icon: Search, title: "Find your listing", text: "Search your business name and confirm the destination and address. Start with your existing listing so travelers find one clear source of information." },
  { icon: BadgeCheck, title: "Verify ownership", text: "Create a business account and verify your email. Where supported, verify access to the business phone number already on file. If that number is unavailable, contact us for help." },
  { icon: PencilLine, title: "Make it yours", text: "After your claim is verified, review your description, contact details, photos and hours. Keep the details accurate so travelers can make informed decisions." },
];
const faqs = [
  ["Is claiming my listing free?", "Yes. Claiming an existing VakayGo listing is free. You can verify ownership and manage your business information without enabling payments."],
  ["Why is my business already on VakayGo?", "Some directory listings are created from publicly available business information. An unclaimed listing does not mean the business has partnered with VakayGo. Claiming lets the verified owner manage its information."],
  ["Does claiming automatically enable bookings?", "No. VakayGo is currently operating as a directory. Booking and payment features stay unavailable until business onboarding is complete and VakayGo enables bookings for that listing."],
  ["What happens when a traveler shows interest?", "A signed-in traveler can record interest in a listing. VakayGo uses these signals to prioritize business outreach. Interest does not reserve anything, request availability, or create a payment obligation."],
  ["What if the phone number is wrong or the listing is already claimed?", "Contact VakayGo with the listing link and explain what needs correcting. Do not create a duplicate listing or use someone else’s verification code."],
];
export default function ForBusinessesPage() {
  return <><Header /><main className="bg-cream-50 pt-24 pb-20">
    <section className="mx-auto max-w-6xl px-6 py-12 md:py-20 grid gap-10 lg:grid-cols-2 lg:items-center">
      <div><p className="text-sm font-bold uppercase tracking-widest text-gold-700">For Caribbean businesses</p><h1 className="mt-4 text-4xl md:text-6xl font-bold leading-tight text-navy-800" style={{ fontFamily: "var(--font-display)" }}>Your business.<br />Your story.<br /><span className="text-gold-700">Claim it.</span></h1>
      <p className="mt-6 max-w-lg text-lg leading-relaxed text-navy-500">Help travelers find accurate information about your business. Claim your VakayGo listing, verify ownership, and bring your local knowledge to the page.</p>
      <p className="mt-5 text-sm font-semibold text-navy-700">Free to claim · Ownership verification · You control your details</p></div>
      <ClaimFinder />
    </section>
    <section className="mx-auto max-w-6xl px-6 py-10"><h2 className="text-3xl font-bold text-navy-800">From listed to represented</h2><div className="mt-8 grid gap-6 md:grid-cols-3">{steps.map((step, i) => <article key={step.title} className="rounded-2xl bg-white p-7 border border-cream-200"><step.icon className="text-gold-700" size={28} /><p className="mt-6 text-xs uppercase tracking-wider text-navy-400">Step {i + 1}</p><h3 className="mt-2 text-xl font-bold text-navy-800">{step.title}</h3><p className="mt-3 leading-relaxed text-navy-500">{step.text}</p></article>)}</div></section>
    <section className="mx-auto max-w-6xl px-6 py-10"><div className="rounded-3xl bg-navy-800 p-8 md:p-12 text-white"><h2 className="text-3xl font-bold">Turn discovery into a connection</h2><p className="mt-4 max-w-3xl leading-relaxed text-white/80">Travelers are exploring places to stay, eat and experience. A clear description, useful photos, current hours and reliable contact details help them understand what you offer. When visitors record interest, our team can invite the business to claim its listing.</p><p className="mt-4 text-sm text-white/70">We are building VakayGo in stages. Listings and traveler interest are available during the directory launch; bookings and payments require separate onboarding and activation.</p></div></section>
    <section className="mx-auto max-w-3xl px-6 py-10"><h2 className="text-3xl font-bold text-navy-800">Questions about claiming</h2><div className="mt-8 space-y-7">{faqs.map(([q, a]) => <article key={q}><h3 className="text-lg font-semibold text-navy-800">{q}</h3><p className="mt-2 leading-relaxed text-navy-500">{a}</p></article>)}</div><Link href="#find-listing" className="mt-10 inline-flex items-center gap-2 rounded-xl bg-gold-700 px-6 py-3 font-semibold text-white">Find my listing<ArrowRight size={18} /></Link><p className="mt-4 text-sm text-navy-500">Need help? <Link href="/contact" className="underline">Contact VakayGo</Link>.</p></section>
  </main><Footer /></>;
}
