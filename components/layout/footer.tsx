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
              <a href="#" className="text-cream-300 hover:text-gold-400 transition-colors">
                <Globe size={20} />
              </a>
              <a href="#" className="text-cream-300 hover:text-gold-400 transition-colors">
                <MessageCircle size={20} />
              </a>
              <a href="mailto:hello@vakaygo.com" className="text-cream-300 hover:text-gold-400 transition-colors">
                <Mail size={20} />
              </a>
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-white mb-4">Platform</h4>
            <ul className="space-y-3 text-sm text-cream-300">
              <li><a href="#how-it-works" className="hover:text-gold-400 transition-colors">How It Works</a></li>
              <li><a href="#categories" className="hover:text-gold-400 transition-colors">Explore</a></li>
              <li><a href="#for-businesses" className="hover:text-gold-400 transition-colors">For Businesses</a></li>
              <li><a href="#waitlist" className="hover:text-gold-400 transition-colors">Join Waitlist</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-white mb-4">Company</h4>
            <ul className="space-y-3 text-sm text-cream-300">
              <li><a href="#" className="hover:text-gold-400 transition-colors">About</a></li>
              <li><a href="#" className="hover:text-gold-400 transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-gold-400 transition-colors">Terms of Service</a></li>
              <li><a href="mailto:hello@vakaygo.com" className="hover:text-gold-400 transition-colors">Contact</a></li>
            </ul>
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
