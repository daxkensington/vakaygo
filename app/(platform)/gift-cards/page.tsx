import Link from "next/link";
import { Header } from "@/components/layout/header";
export default function GiftCardsPage() {
  return <><Header/><main className="min-h-screen bg-cream-50 pt-28 pb-16 px-6"><div className="max-w-xl mx-auto bg-white rounded-2xl p-8">
    <h1 className="text-3xl font-bold text-navy-700">Gift cards</h1>
    <p className="mt-5 text-navy-600">New gift card purchases and online redemption are currently unavailable.</p>
    <p className="mt-4 text-navy-600">If you already have a VakayGo gift card, contact <a className="underline" href="mailto:bookings@vakaygo.com">bookings@vakaygo.com</a> for help with your balance and available options.</p>
    <Link href="/explore" className="inline-block mt-6 text-gold-700 font-semibold">Explore the islands</Link>
  </div></main></>;
}
