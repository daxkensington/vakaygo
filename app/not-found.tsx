import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-cream-50 flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 bg-gold-50 rounded-full flex items-center justify-center mx-auto mb-8">
          <Compass size={36} className="text-gold-500" />
        </div>
        <h1
          className="text-4xl font-bold text-navy-700"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Lost at sea?
        </h1>
        <p className="text-navy-400 mt-4 leading-relaxed">
          The page you&apos;re looking for doesn&apos;t exist. Maybe the tide
          took it, or maybe it never was. Either way, the Caribbean awaits.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8">
          <Link
            href="/"
            className="bg-gold-500 hover:bg-gold-600 text-white px-6 py-3 rounded-xl font-semibold transition-colors"
          >
            Go Home
          </Link>
          <Link
            href="/explore"
            className="bg-white text-navy-600 px-6 py-3 rounded-xl font-semibold shadow-sm hover:bg-cream-100 transition-colors"
          >
            Explore Listings
          </Link>
        </div>
      </div>
    </div>
  );
}
