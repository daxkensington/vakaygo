import Link from "next/link";
import { Globe, Mail, MessageCircle } from "lucide-react";
import { BUSINESS_MAILING_ADDRESS, OPERATING_BUSINESS } from "@/lib/brand";

export function Footer() {
  return (
    <footer className="bg-navy-700 text-cream-200 py-16">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
          <div className="md:col-span-2">
            <span className="text-2xl font-bold tracking-tight text-white">
              Vakay<span className="text-gold-400">Go</span>
            </span>
            <p className="mt-4 text-cream-300 max-w-md leading-relaxed">
              Your trip starts here. Discover stays, boat charters,
              tours, dining, and experiences across 34 Caribbean, Latin
              American, and Mediterranean destinations. Explore, save, and plan for free.
            </p>
            <div className="flex gap-4 mt-6">
              <a href="https://vakaygo.com" aria-label="VakayGo website" className="text-cream-300 hover:text-gold-400 transition-colors">
                <Globe size={20} />
              </a>
              <a href="https://wa.me/14734158665" aria-label="Contact us on WhatsApp" className="text-cream-300 hover:text-gold-400 transition-colors" target="_blank" rel="noopener noreferrer">
                <MessageCircle size={20} />
              </a>
              <a href="mailto:hello@vakaygo.com" aria-label="Email us" className="text-cream-300 hover:text-gold-400 transition-colors">
                <Mail size={20} />
              </a>
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-white mb-4">Platform</h3>
            <ul className="text-base text-cream-300">
              <li><Link prefetch={false} href="/explore" className="inline-block px-2 py-3 hover:text-gold-400 transition-colors">Explore</Link></li>
              <li><Link prefetch={false} href="/islands" className="inline-block px-2 py-3 hover:text-gold-400 transition-colors">Destinations</Link></li>
              <li><Link prefetch={false} href="/guides" className="inline-block px-2 py-3 hover:text-gold-400 transition-colors">Guides</Link></li>
              <li><Link prefetch={false} href="/services" className="inline-block px-2 py-3 hover:text-gold-400 transition-colors">Services</Link></li>
              <li><Link prefetch={false} href="/for-businesses" className="inline-block px-2 py-3 hover:text-gold-400 transition-colors">For Businesses</Link></li>
              <li><Link prefetch={false} href="/for-restaurants" className="inline-block px-2 py-3 hover:text-gold-400 transition-colors">For Restaurants</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-white mb-4">Company</h3>
            <ul className="text-base text-cream-300">
              <li><Link prefetch={false} href="/about" className="inline-block px-2 py-3 hover:text-gold-400 transition-colors">About</Link></li>
              <li><Link prefetch={false} href="/privacy" className="inline-block px-2 py-3 hover:text-gold-400 transition-colors">Privacy Policy</Link></li>
              <li><Link prefetch={false} href="/terms" className="inline-block px-2 py-3 hover:text-gold-400 transition-colors">Terms of Service</Link></li>
              <li><a href="mailto:hello@vakaygo.com" className="inline-block px-2 py-3 hover:text-gold-400 transition-colors">Contact</a></li>
            </ul>
          </div>
        </div>

        {/* Popular Destinations */}
        <div className="mt-12 pt-8 border-t border-navy-600">
          <h3 className="font-semibold text-white mb-4">Popular Destinations Across the Caribbean, Latin America &amp; Mediterranean</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-6 text-base text-cream-300">
            <Link prefetch={false} href="/things-to-do-in-grenada" className="inline-block px-2 py-3 hover:text-gold-400 transition-colors">Things to Do in Grenada</Link>
            <Link prefetch={false} href="/things-to-do-in-barbados" className="inline-block px-2 py-3 hover:text-gold-400 transition-colors">Things to Do in Barbados</Link>
            <Link prefetch={false} href="/things-to-do-in-jamaica" className="inline-block px-2 py-3 hover:text-gold-400 transition-colors">Things to Do in Jamaica</Link>
            <Link prefetch={false} href="/things-to-do-in-st-lucia" className="inline-block px-2 py-3 hover:text-gold-400 transition-colors">Things to Do in St. Lucia</Link>
            <Link prefetch={false} href="/things-to-do-in-bahamas" className="inline-block px-2 py-3 hover:text-gold-400 transition-colors">Things to Do in Bahamas</Link>
            <Link prefetch={false} href="/things-to-do-in-aruba" className="inline-block px-2 py-3 hover:text-gold-400 transition-colors">Things to Do in Aruba</Link>
            <Link prefetch={false} href="/things-to-do-in-cancun-riviera-maya" className="inline-block px-2 py-3 hover:text-gold-400 transition-colors">Things to Do in Cancún &amp; Tulum</Link>
            <Link prefetch={false} href="/things-to-do-in-los-cabos" className="inline-block px-2 py-3 hover:text-gold-400 transition-colors">Things to Do in Los Cabos</Link>
            <Link prefetch={false} href="/things-to-do-in-cartagena" className="inline-block px-2 py-3 hover:text-gold-400 transition-colors">Things to Do in Cartagena</Link>
            <Link prefetch={false} href="/things-to-do-in-santorini" className="inline-block px-2 py-3 hover:text-gold-400 transition-colors">Things to Do in Santorini</Link>
            <Link prefetch={false} href="/things-to-do-in-mykonos" className="inline-block px-2 py-3 hover:text-gold-400 transition-colors">Things to Do in Mykonos</Link>
            <Link prefetch={false} href="/things-to-do-in-ibiza" className="inline-block px-2 py-3 hover:text-gold-400 transition-colors">Things to Do in Ibiza</Link>
            <Link prefetch={false} href="/things-to-do-in-amalfi-coast-capri" className="inline-block px-2 py-3 hover:text-gold-400 transition-colors">Things to Do in Amalfi &amp; Capri</Link>
            <Link prefetch={false} href="/things-to-do-in-mallorca" className="inline-block px-2 py-3 hover:text-gold-400 transition-colors">Things to Do in Mallorca</Link>
            <Link prefetch={false} href="/things-to-do-in-hvar-split" className="inline-block px-2 py-3 hover:text-gold-400 transition-colors">Things to Do in Hvar &amp; Split</Link>
            <Link prefetch={false} href="/best-hotels-grenada" className="inline-block px-2 py-3 hover:text-gold-400 transition-colors">Best Hotels in Grenada</Link>
            <Link prefetch={false} href="/best-hotels-santorini" className="inline-block px-2 py-3 hover:text-gold-400 transition-colors">Best Hotels in Santorini</Link>
            <Link prefetch={false} href="/best-restaurants-cartagena" className="inline-block px-2 py-3 hover:text-gold-400 transition-colors">Best Restaurants in Cartagena</Link>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-navy-600 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-cream-400">
            &copy; {new Date().getFullYear()} VakayGo, operated by {OPERATING_BUSINESS}. All rights reserved. {BUSINESS_MAILING_ADDRESS}
          </p>
          <p className="text-sm text-cream-400">
            Born in the Caribbean · Live across 34 Global Sun &amp; Sea Destinations
          </p>
        </div>
      </div>
    </footer>
  );
}
