import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
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
import { SkipToContent } from "@/components/layout/skip-to-content";
import "./globals.css";

const dmSans = localFont({
  src: "./fonts/DMSans-latin.woff2",
  variable: "--font-dm-sans-latin",
  weight: "400 700",
  style: "normal",
  display: "swap",
  adjustFontFallback: false,
});

const dmSansExtended = localFont({
  src: "./fonts/DMSans-latin-ext.woff2",
  variable: "--font-dm-sans-latin-ext",
  weight: "400 700",
  style: "normal",
  display: "swap",
  adjustFontFallback: false,
  preload: false,
});

const dmSerif = localFont({
  src: "./fonts/DMSerifDisplay-latin.woff2",
  variable: "--font-dm-serif-latin",
  weight: "400",
  style: "normal",
  display: "swap",
  adjustFontFallback: false,
});

const dmSerifExtended = localFont({
  src: "./fonts/DMSerifDisplay-latin-ext.woff2",
  variable: "--font-dm-serif-latin-ext",
  weight: "400",
  style: "normal",
  display: "swap",
  adjustFontFallback: false,
  preload: false,
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
    "Explore local stays, boat charters, tours, restaurants, and businesses across 34 Caribbean, Latin American, and Mediterranean destinations. Save places and plan your trip for free.",
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
    "local travel planning",
  ],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://vakaygo.com",
    siteName: "VakayGo",
    title: "VakayGo — Sun & Sea Travel Across the Caribbean, Latin America & Mediterranean",
    description:
      "Explore local stays, boat charters, tours, restaurants, and businesses across 34 Caribbean, Latin American, and Mediterranean destinations. Save places and plan your trip for free.",
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
      "Explore local stays, boat charters, tours, restaurants, and businesses across 34 Caribbean, Latin American, and Mediterranean destinations. Save places and plan your trip for free.",
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
    <html lang="en" dir="ltr" data-dir="ltr" data-scroll-behavior="smooth" className={`${dmSans.variable} ${dmSansExtended.variable} ${dmSerif.variable} ${dmSerifExtended.variable}`}>
      <head>
        {/* manifest + theme-color moved to the metadata/viewport exports below.
            A hardcoded <link>/<meta> always wins (the browser takes the first),
            so /admin's own manifest and theme could never override these and the
            installed admin app got the customer manifest. */}
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className="min-h-screen flex flex-col">
        <SkipToContent />
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
                    "Discover stays, tours, dining, events, and local experiences across 34 Caribbean, Latin American, and Mediterranean destinations. Explore the directory and plan your trip.",
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
        <AuthProvider><SavedProvider><CurrencyProvider><ScrollToTop /><div id="site-announcements"><PromoBanner /><EmailVerificationBanner /></div><div id="main-content" tabIndex={-1}>{children}</div></CurrencyProvider></SavedProvider></AuthProvider>
        <AIConcierge />
        <ServiceWorkerRegister />
        {process.env.VERCEL === "1" && <Analytics />}
        <GoogleAnalytics />
      </body>
    </html>
  );
}
