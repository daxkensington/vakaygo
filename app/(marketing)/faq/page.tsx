"use client";

import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import Link from "next/link";
import { ChevronDown, ArrowRight, Search } from "lucide-react";
import { useState } from "react";

type FaqItem = { q: string; a: string };

const FAQ_DATA: Record<string, FaqItem[]> = {
  "For Travelers": [
    {
      q: "How do I book an experience?",
      a: "Browse listings on VakayGo, select the experience you want, choose your date and number of guests, then complete your booking with a secure payment. You'll receive an instant confirmation email with all the details.",
    },
    {
      q: "What is the cancellation policy?",
      a: "Most experiences offer free cancellation up to 24 hours before the scheduled time. Some operators may have stricter policies for high-demand experiences, which will be clearly stated on the listing page before you book.",
    },
    {
      q: "How does trip protection work?",
      a: "VakayGo offers optional trip protection at checkout that covers unforeseen cancellations, weather disruptions, and travel delays. If your experience is cancelled by the operator, you'll receive an automatic full refund regardless of protection status.",
    },
    {
      q: "Can I book as a guest without an account?",
      a: "Yes! You can complete a booking as a guest using just your email address. However, creating a free account lets you track bookings, save favorites, leave reviews, and access exclusive deals.",
    },
    {
      q: "How do I contact an operator?",
      a: "Each listing has a 'Message Operator' button that lets you ask questions before booking. After booking, you can communicate directly with your operator through the VakayGo messaging system in your dashboard.",
    },
  ],
  "For Operators": [
    {
      q: "How do I list my business?",
      a: "Sign up as an operator on VakayGo, complete your business profile, and create your first listing. Our team will review it within 24-48 hours. Once approved, your experience goes live and travelers can start booking.",
    },
    {
      q: "What are VakayGo's commission rates?",
      a: "VakayGo charges just 3-5% per booking — significantly lower than other platforms that take 20-30%. We believe in fair pricing that keeps more money in local communities and with the businesses that deserve it.",
    },
    {
      q: "How do payouts work?",
      a: "Payouts are processed automatically after each completed experience. Funds are transferred to your linked bank account or payment method within 3-5 business days. You can track all earnings in your operator dashboard.",
    },
    {
      q: "Can I manage my availability?",
      a: "Absolutely. Your operator dashboard has a full calendar where you can set available dates, block off time, adjust capacity per time slot, and set seasonal pricing. Changes take effect immediately.",
    },
    {
      q: "How do I respond to reviews?",
      a: "Navigate to the Reviews section in your operator dashboard. You can reply publicly to any review, which shows potential guests that you value feedback. We recommend responding within 48 hours for best engagement.",
    },
  ],
  "Bookings & Payments": [
    {
      q: "When am I charged?",
      a: "You're charged at the time of booking to secure your spot. For some experiences, a deposit may be taken upfront with the remainder due closer to the date — this will be clearly shown before you confirm.",
    },
    {
      q: "What payment methods are accepted?",
      a: "VakayGo accepts all major credit and debit cards (Visa, Mastercard, American Express), as well as digital wallets. We're continually adding more payment options to serve travelers worldwide.",
    },
    {
      q: "How do refunds work?",
      a: "If you cancel within the free cancellation window, you'll receive a full refund to your original payment method within 5-10 business days. Operator-cancelled bookings are always fully refunded automatically.",
    },
    {
      q: "What currency are prices shown in?",
      a: "Prices are displayed in USD by default, but you can change your preferred currency in your account settings. The final charge will be converted to your card's currency by your bank at their current exchange rate.",
    },
    {
      q: "Is my payment information secure?",
      a: "Yes. VakayGo uses industry-standard encryption and never stores your full card details on our servers. All transactions are processed through PCI-compliant payment providers to ensure your financial data is protected.",
    },
  ],
  "Account & Safety": [
    {
      q: "How do I create an account?",
      a: "Click 'Sign Up' on the VakayGo homepage, enter your name, email, and create a password — or sign up instantly with Google. It takes less than 30 seconds and gives you access to bookings, saved favorites, and more.",
    },
    {
      q: "How do I reset my password?",
      a: "Click 'Sign In', then 'Forgot Password'. Enter your email address and we'll send a secure reset link. The link expires after 1 hour for security. If you signed up with Google, use Google sign-in instead.",
    },
    {
      q: "How does VakayGo verify operators?",
      a: "Every operator goes through a verification process that includes identity confirmation, business license checks where applicable, and an initial quality review. We also monitor ongoing reviews and ratings to maintain standards.",
    },
    {
      q: "How can I delete my account?",
      a: "Go to Settings in your dashboard and select 'Delete Account'. Any active bookings must be completed or cancelled first. Your data will be permanently removed within 30 days per our privacy policy.",
    },
    {
      q: "What data does VakayGo collect?",
      a: "We collect only what's needed to provide our service: your profile information, booking history, and usage analytics. We never sell your data to third parties. Full details are available in our Privacy Policy.",
    },
  ],
};

const TABS = Object.keys(FAQ_DATA);

function AccordionItem({ item, isOpen, onToggle }: { item: FaqItem; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className="border-b border-navy-100 last:border-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between py-5 text-left group"
      >
        <span className="text-navy-700 font-medium pr-4 group-hover:text-gold-600 transition-colors">
          {item.q}
        </span>
        <ChevronDown
          size={20}
          className={`text-navy-300 shrink-0 transition-transform duration-300 ${
            isOpen ? "rotate-180 text-gold-500" : ""
          }`}
        />
      </button>
      <div
        className={`grid transition-all duration-300 ease-in-out ${
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <p className="pb-5 text-navy-400 leading-relaxed text-sm">
            {item.a}
          </p>
        </div>
      </div>
    </div>
  );
}

// Build FAQ JSON-LD structured data from all FAQ items
const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: Object.values(FAQ_DATA)
    .flat()
    .map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
};

export default function FaqPage() {
  const [activeTab, setActiveTab] = useState(TABS[0]);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const filteredItems = search.trim()
    ? Object.values(FAQ_DATA)
        .flat()
        .filter(
          (item) =>
            item.q.toLowerCase().includes(search.toLowerCase()) ||
            item.a.toLowerCase().includes(search.toLowerCase())
        )
    : FAQ_DATA[activeTab];

  return (
    <>
      <Header />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <main>
        {/* Hero */}
        <section className="relative pt-32 pb-20 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-navy-700 to-navy-900" />
          <div className="relative mx-auto max-w-4xl px-6 text-center">
            <h1
              className="text-4xl md:text-6xl font-bold text-white leading-tight"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Frequently Asked{" "}
              <span className="text-gold-400">Questions</span>
            </h1>
            <p className="mt-6 text-lg text-white/70 max-w-2xl mx-auto leading-relaxed">
              Find answers to common questions about booking experiences,
              managing your account, and using VakayGo.
            </p>

            {/* Search */}
            <div className="mt-10 max-w-lg mx-auto relative">
              <Search
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-navy-300"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setOpenIndex(null);
                }}
                placeholder="Search for a question..."
                className="w-full rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 pl-11 pr-4 py-3.5 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-gold-400/50 focus:bg-white/15 transition-all"
              />
            </div>
          </div>
        </section>

        {/* FAQ Content */}
        <section className="py-20 bg-cream-50">
          <div className="mx-auto max-w-3xl px-6">
            {/* Category Tabs */}
            {!search.trim() && (
              <div className="flex flex-wrap gap-2 mb-10 justify-center">
                {TABS.map((tab) => (
                  <button
                    key={tab}
                    onClick={() => {
                      setActiveTab(tab);
                      setOpenIndex(null);
                    }}
                    className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      activeTab === tab
                        ? "bg-gold-500 text-white shadow-[var(--shadow-card)]"
                        : "bg-white text-navy-400 hover:text-navy-600 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)]"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            )}

            {search.trim() && (
              <p className="text-navy-400 text-sm mb-6">
                {filteredItems.length} result{filteredItems.length !== 1 ? "s" : ""} for &ldquo;{search}&rdquo;
              </p>
            )}

            {/* Accordion */}
            <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] px-6 md:px-8">
              {filteredItems.length > 0 ? (
                filteredItems.map((item, i) => (
                  <AccordionItem
                    key={`${activeTab}-${i}-${item.q}`}
                    item={item}
                    isOpen={openIndex === i}
                    onToggle={() => setOpenIndex(openIndex === i ? null : i)}
                  />
                ))
              ) : (
                <div className="py-12 text-center">
                  <p className="text-navy-400 mb-2">No matching questions found.</p>
                  <p className="text-navy-300 text-sm">
                    Try a different search term or{" "}
                    <Link href="/contact" className="text-gold-700 font-semibold hover:text-gold-700">
                      contact us directly
                    </Link>
                    .
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Still Have Questions CTA */}
        <section className="py-20 bg-white">
          <div className="mx-auto max-w-2xl px-6 text-center">
            <h2
              className="text-3xl font-bold text-navy-700 mb-4"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Still have questions?
            </h2>
            <p className="text-navy-400 mb-8 leading-relaxed">
              Can&apos;t find what you&apos;re looking for? Our support team is
              ready to help with anything you need.
            </p>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 bg-gold-700 hover:bg-gold-800 text-white font-semibold px-8 py-3.5 rounded-xl transition-all shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] group"
            >
              Contact Support
              <ArrowRight
                size={18}
                className="group-hover:translate-x-0.5 transition-transform"
              />
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
