import type { Metadata, Viewport } from "next";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
import { SavedProvider } from "@/lib/use-saved";
import { CurrencyProvider } from "@/lib/currency";
import { Analytics } from "@vercel/analytics/next";
import { GoogleAnalytics } from "@/components/analytics/google-analytics";
import { PromoBanner } from "@/components/layout/promo-banner";
import { EmailVerificationBanner } from "@/components/layout/email-verification-banner";
import { ScrollToTop } from "@/components/layout/scroll-to-top";
import { AIConcierge } from "@/components/chat/ai-concierge";
import { ServiceWorkerRegister } from "@/components/pwa/sw-register";
import { LocaleHtmlAttrs } from "@/components/layout/locale-html-attrs";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const dmSerif = DM_Serif_Display({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
});

export const viewport: Viewport = {
  // In the root export so /admin's own themeColor can override it — a hardcoded
  // <meta> in <head> always wins and could not be overridden per-route.
  themeColor: "#1A6B6A",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://vakaygo.com"),
  manifest: "/manifest.json",
  appleWebApp: { capable: true },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  title: {
    default: "VakayGo — Sun & Sea Travel Across the Caribbean, Latin America & Mediterranean",
    template: "%s | VakayGo",
  },
  description:
    "Discover 8,038+ verified stays, boat charters, tours, restaurants, and local businesses across 34 destinations in the Caribbean, Latin America, and the Mediterranean—with 0% guest booking fees.",
  keywords: [
    "Caribbean travel",
    "Mediterranean travel",
    "Latin America coastal travel",
    "island vacation",
    "Santorini boat charters",
    "Cartagena tours",
    "Cancun Riviera Maya excursions",
    "Amalfi Coast tours",
    "Ibiza yacht charters",
    "Grenada tours",
    "boutique coastal stays",
    "local experiences",
    "zero booking fee travel",
  ],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://vakaygo.com",
    siteName: "VakayGo",
    title: "VakayGo — Sun & Sea Travel Across the Caribbean, Latin America & Mediterranean",
    description:
      "Discover 8,038+ verified stays, boat charters, tours, restaurants, and local businesses across 34 destinations in the Caribbean, Latin America, and the Mediterranean—with 0% guest booking fees.",
    images: [
      {
        url: "https://vakaygo.com/images/hero/caribbean-hero.jpg",
        width: 1200,
        height: 630,
        alt: "VakayGo — Global Sun & Sea Travel Platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@vakaygo",
    title: "VakayGo — Sun & Sea Travel Across the Caribbean, Latin America & Mediterranean",
    description:
      "Discover 8,038+ verified stays, boat charters, tours, restaurants, and local businesses across 34 destinations in the Caribbean, Latin America, and the Mediterranean—with 0% guest booking fees.",
    images: ["https://vakaygo.com/images/hero/caribbean-hero.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // lang/dir are fixed up client-side by <LocaleHtmlAttrs/>; reading the
  // locale cookie here made every page dynamic (see that component).
  return (
    <html lang="en" dir="ltr" data-dir="ltr" data-scroll-behavior="smooth" className={`${dmSans.variable} ${dmSerif.variable}`}>
      <head>
        {/* manifest + theme-color moved to the metadata/viewport exports below.
            A hardcoded <link>/<meta> always wins (the browser takes the first),
            so /admin's own manifest and theme could never override these and the
            installed admin app got the customer manifest. */}
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className="min-h-screen flex flex-col">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:bg-gold-700 focus:text-white focus:px-4 focus:py-2 focus:rounded-xl focus:font-semibold">
          Skip to content
        </a>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "Organization",
                  "@id": "https://vakaygo.com/#organization",
                  name: "VakayGo",
                  url: "https://vakaygo.com",
                  description:
                    "Discover 8,038+ stays, tours, dining, events, and local experiences across 34 destinations in the Caribbean, Latin America, and the Mediterranean—with 0% guest booking fees.",
                  logo: {
                    "@type": "ImageObject",
                    url: "https://vakaygo.com/images/logo.jpg",
                  },
                  sameAs: [],
                },
                {
                  "@type": "WebSite",
                  "@id": "https://vakaygo.com/#website",
                  url: "https://vakaygo.com",
                  name: "VakayGo",
                  publisher: {
                    "@id": "https://vakaygo.com/#organization",
                  },
                  potentialAction: {
                    "@type": "SearchAction",
                    target: {
                      "@type": "EntryPoint",
                      urlTemplate:
                        "https://vakaygo.com/explore?q={search_term_string}",
                    },
                    "query-input": "required name=search_term_string",
                  },
                },
              ],
            }),
          }}
        />
        <LocaleHtmlAttrs />
        <AuthProvider><SavedProvider><CurrencyProvider><ScrollToTop /><div id="site-announcements"><PromoBanner /><EmailVerificationBanner /></div><div id="main-content">{children}</div></CurrencyProvider></SavedProvider></AuthProvider>
        <AIConcierge />
        <ServiceWorkerRegister />
        {process.env.VERCEL === "1" && <Analytics />}
        <GoogleAnalytics />
      </body>
    </html>
  );
}
