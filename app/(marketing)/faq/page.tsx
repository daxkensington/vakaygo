"use client";

import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import Link from "next/link";
import { ChevronDown, ArrowRight, Search } from "lucide-react";
import { useId, useState } from "react";

type FaqItem = { q: string; a: string };

const FAQ_DATA: Record<string, FaqItem[]> = {
  "For Travelers": [
    {
      q: "How do I book an experience?",
      a: "VakayGo is currently a directory. Online bookings and payments are disabled. Browse and save places or sign in to record interest. Messaging is available for businesses with verified ownership where supported. Recording interest or sending a message does not create a reservation.",
    },
    {
      q: "What is the cancellation policy?",
      a: "For arrangements made directly with a business, ask that business about its cancellation terms before agreeing. If you already have a VakayGo booking, review the policy recorded with that booking and contact support if you need help.",
    },
    {
      q: "How does trip protection work?",
      a: "Trip protection is not currently available through VakayGo. A directory listing, traveler interest or message does not provide insurance or confirm a booking. Ask the business about any arrangements you make directly with it.",
    },
    {
      q: "Can I book as a guest without an account?",
      a: "Guests can browse the directory and plan which places to explore. VakayGo bookings are currently unavailable. Sign in and verify your email to record interest or use available messaging features; neither action creates a booking.",
    },
    {
      q: "How do I contact an operator?",
      a: "In-app messaging is available only for listings with current verified ownership and requires a signed-in, email-verified account. Unclaimed listings support recording interest rather than messaging. Direct operator contact details may be restricted. Interest and messages do not reserve a service; contact VakayGo support if you need help with a listing.",
    },
  ],
  "For Operators": [
    {
      q: "How do I list my business?",
      a: "Start at For Businesses and search for your existing listing. Create a business account, verify your inbox and prove ownership through a trusted business email or phone where supported. Contact VakayGo if the listing or trusted contact needs review. A verified claim lets the owner manage the listing; it does not enable bookings or payments, and no review deadline is guaranteed.",
    },
    {
      q: "What are VakayGo's commission rates?",
      a: "Claiming an existing VakayGo listing is free. Online bookings and payments are currently disabled. Future booking fees and payment arrangements require final business and provider review before launch.",
    },
    {
      q: "How do payouts work?",
      a: "Listing claims and traveler interest do not create earnings or payouts. Payment services require separate business onboarding, approval for the actual company country and payout route, current provider verification and explicit activation. Directory launch does not establish payout availability or timing.",
    },
    {
      q: "Can I manage my availability?",
      a: "Owners can manage their listing's dates, blocked days and capacity from the calendar in the operator dashboard. Calendar updates alone do not enable online bookings; ownership, onboarding, payment and launch checks must also be complete.",
    },
    {
      q: "How do I respond to reviews?",
      a: "Use the Reviews section of your operator dashboard for reviews associated with your business account. If you cannot access a listing, contact VakayGo with its link so ownership can be reviewed.",
    },
  ],
  "Bookings & Payments": [
    {
      q: "When am I charged?",
      a: "Online bookings and payments are currently disabled. Browsing, recording interest or sending a message does not authorize a payment. If you arrange a service directly with a business, confirm its prices and payment terms with that business.",
    },
    {
      q: "What payment methods are accepted?",
      a: "VakayGo is not accepting new booking payments during the directory launch. Ask the business which methods it accepts for a service you arrange directly. Future VakayGo payment methods depend on the approved provider and company country.",
    },
    {
      q: "How do refunds work?",
      a: "For a service arranged directly with a business, contact that business about refunds. For an existing VakayGo booking, use its recorded cancellation policy and refund status and contact support if needed. A pending refund is not evidence that money has reached your account.",
    },
    {
      q: "What currency are prices shown in?",
      a: "Prices use USD by default. Displayed currency conversions are estimates; check current prices, currency and any additional costs directly with the business. A directory price is not a payment quote or a confirmed reservation.",
    },
    {
      q: "Is my payment information secure?",
      a: "Online payment setup is currently unavailable during the directory launch. Do not put card or bank details in a listing message or contact form. Any future payment setup must use the approved provider's secure flow.",
    },
  ],
  "Account & Safety": [
    {
      q: "How do I create an account?",
      a: "Choose Sign Up and use your email or Google sign-in where available. Confirm your inbox before recording traveler interest or claiming a business. Creating an account does not verify a business or enable bookings.",
    },
    {
      q: "How do I reset my password?",
      a: "On Sign In, choose Email me a sign-in link to recover access through your inbox. If your account requires its password or two-factor method, use that secure sign-in method or contact support for help. Google accounts can use Google sign-in where available. Never send your password or verification codes to support.",
    },
    {
      q: "How does VakayGo verify operators?",
      a: "An unclaimed directory listing does not mean the business has partnered with VakayGo. Business claims require a verified account and proof through an independently trusted business contact. A verified claim shows ownership proof; it is not a guarantee of service quality or booking eligibility.",
    },
    {
      q: "How can I delete my account?",
      a: "Review the account options in your profile settings or contact VakayGo for help with your account and data. See the Privacy Policy for the applicable process. Keep the details of any existing bookings when asking for support.",
    },
    {
      q: "What data does VakayGo collect?",
      a: "See the Privacy Policy for how account information, saved items, traveler interest and messages are handled. The listing-interest feature counts interest privately and may share totals with the business; it does not share your name or contact details through that feature.",
    },
  ],
};

const TABS = Object.keys(FAQ_DATA);

function AccordionItem({ item, isOpen, onToggle }: { item: FaqItem; isOpen: boolean; onToggle: () => void }) {
  const id = useId();
  return (
    <div className="border-b border-navy-100 last:border-0">
      <button
        id={`${id}-question`}
        aria-expanded={isOpen}
        aria-controls={id}
        onClick={onToggle}
        className="w-full flex items-center justify-between py-5 text-left group"
      >
        <span className="text-navy-700 font-medium pr-4 group-hover:text-gold-600 transition-colors">
          {item.q}
        </span>
        <ChevronDown
          size={20}
          className={`text-navy-300 shrink-0 transition-transform duration-300 ${
            isOpen ? "rotate-180 text-gold-700" : ""
          }`}
        />
      </button>
      <div
        id={id}
        role="region"
        aria-labelledby={`${id}-question`}
        hidden={!isOpen}
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
  const searchTerm = search.trim().toLowerCase();

  const filteredItems = searchTerm
    ? Object.values(FAQ_DATA)
        .flat()
        .filter(
          (item) =>
            item.q.toLowerCase().includes(searchTerm) ||
            item.a.toLowerCase().includes(searchTerm)
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
              Find answers to common questions about the directory, business claims,
              managing your account, and using VakayGo.
            </p>

            {/* Search */}
            <div className="mt-10 max-w-lg mx-auto relative">
              <Search
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-navy-300"
              />
              <input
                aria-label="Search frequently asked questions"
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
                    aria-pressed={activeTab === tab}
                    key={tab}
                    onClick={() => {
                      setActiveTab(tab);
                      setOpenIndex(null);
                    }}
                    className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      activeTab === tab
                        ? "bg-gold-700 text-white shadow-[var(--shadow-card)]"
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
