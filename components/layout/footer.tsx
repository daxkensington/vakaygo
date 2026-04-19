import { Globe, Mail, MessageCircle } from "lucide-react";

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
              Your whole trip, one tap. Discover stays, tours, dining, events,
              and experiences across the Caribbean — all powered by locals who
              know it best.
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
            <ul className="space-y-3 text-sm text-cream-300">
              <li><a href="/explore" className="inline-block py-2 hover:text-gold-400 transition-colors">Explore</a></li>
              <li><a href="/islands" className="inline-block py-2 hover:text-gold-400 transition-colors">Islands</a></li>
              <li><a href="/guides" className="inline-block py-2 hover:text-gold-400 transition-colors">Guides</a></li>
              <li><a href="/services" className="inline-block py-2 hover:text-gold-400 transition-colors">Services</a></li>
              <li><a href="/for-businesses" className="inline-block py-2 hover:text-gold-400 transition-colors">For Businesses</a></li>
              <li><a href="/for-restaurants" className="inline-block py-2 hover:text-gold-400 transition-colors">For Restaurants</a></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-white mb-4">Company</h3>
            <ul className="space-y-3 text-sm text-cream-300">
              <li><a href="/about" className="inline-block py-2 hover:text-gold-400 transition-colors">About</a></li>
              <li><a href="/privacy" className="inline-block py-2 hover:text-gold-400 transition-colors">Privacy Policy</a></li>
              <li><a href="/terms" className="inline-block py-2 hover:text-gold-400 transition-colors">Terms of Service</a></li>
              <li><a href="mailto:hello@vakaygo.com" className="inline-block py-2 hover:text-gold-400 transition-colors">Contact</a></li>
            </ul>
          </div>
        </div>

        {/* Popular Destinations */}
        <div className="mt-12 pt-8 border-t border-navy-600">
          <h3 className="font-semibold text-white mb-4">Popular Destinations</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-6 gap-y-2 text-sm text-cream-300">
            <a href="/things-to-do-in-grenada" className="inline-block py-2 hover:text-gold-400 transition-colors">Things to Do in Grenada</a>
            <a href="/things-to-do-in-barbados" className="inline-block py-2 hover:text-gold-400 transition-colors">Things to Do in Barbados</a>
            <a href="/things-to-do-in-jamaica" className="inline-block py-2 hover:text-gold-400 transition-colors">Things to Do in Jamaica</a>
            <a href="/things-to-do-in-st-lucia" className="inline-block py-2 hover:text-gold-400 transition-colors">Things to Do in St. Lucia</a>
            <a href="/things-to-do-in-bahamas" className="inline-block py-2 hover:text-gold-400 transition-colors">Things to Do in Bahamas</a>
            <a href="/things-to-do-in-aruba" className="inline-block py-2 hover:text-gold-400 transition-colors">Things to Do in Aruba</a>
            <a href="/best-restaurants-grenada" className="inline-block py-2 hover:text-gold-400 transition-colors">Best Restaurants in Grenada</a>
            <a href="/best-restaurants-barbados" className="inline-block py-2 hover:text-gold-400 transition-colors">Best Restaurants in Barbados</a>
            <a href="/best-restaurants-jamaica" className="inline-block py-2 hover:text-gold-400 transition-colors">Best Restaurants in Jamaica</a>
            <a href="/best-hotels-grenada" className="inline-block py-2 hover:text-gold-400 transition-colors">Best Hotels in Grenada</a>
            <a href="/best-hotels-barbados" className="inline-block py-2 hover:text-gold-400 transition-colors">Best Hotels in Barbados</a>
            <a href="/best-hotels-jamaica" className="inline-block py-2 hover:text-gold-400 transition-colors">Best Hotels in Jamaica</a>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-navy-600 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-cream-400">
            &copy; {new Date().getFullYear()} VakayGo. All rights reserved.
          </p>
          <p className="text-sm text-cream-400">
            Made with love in the Caribbean
          </p>
        </div>
      </div>
    </footer>
  );
}
