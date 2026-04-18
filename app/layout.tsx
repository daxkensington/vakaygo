import type { Metadata } from "next";
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
import { getLocale } from "next-intl/server";
import { rtlLocales, type Locale } from "@/i18n/config";
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

export const metadata: Metadata = {
  metadataBase: new URL("https://vakaygo.com"),
  title: {
    default: "VakayGo — Caribbean Travel Platform",
    template: "%s | VakayGo",
  },
  description:
    "Book stays, tours, dining, events, and transport across 21 Caribbean islands. The lowest commissions in the travel industry.",
  keywords: [
    "Caribbean travel",
    "island vacation",
    "Caribbean tours",
    "Caribbean hotels",
    "Grenada tours",
    "Caribbean stays",
    "Caribbean dining",
    "Caribbean events",
    "Caribbean transport",
    "book Caribbean",
    "local experiences",
    "Caribbean excursions",
    "VIP Caribbean",
  ],
  alternates: {
    canonical: "https://vakaygo.com",
    languages: {
      "en": "https://vakaygo.com",
      "es": "https://vakaygo.com",
      "fr": "https://vakaygo.com",
      "pt": "https://vakaygo.com",
      "nl": "https://vakaygo.com",
      "de": "https://vakaygo.com",
      "x-default": "https://vakaygo.com",
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://vakaygo.com",
    siteName: "VakayGo",
    title: "VakayGo — Caribbean Travel Platform",
    description:
      "Book stays, tours, dining, events, and transport across 21 Caribbean islands. The lowest commissions in the travel industry.",
    images: [
      {
        url: "https://vakaygo.com/images/hero/caribbean-hero.jpg",
        width: 1200,
        height: 630,
        alt: "VakayGo — Caribbean Travel Platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@vakaygo",
    title: "VakayGo — Caribbean Travel Platform",
    description:
      "Book stays, tours, dining, events, and transport across 21 Caribbean islands.",
    images: ["https://vakaygo.com/images/hero/caribbean-hero.jpg"],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale() as Locale;
  const dir = rtlLocales.includes(locale) ? "rtl" : "ltr";

  return (
    <html lang={locale} dir={dir} data-dir={dir} className={`${dmSans.variable} ${dmSerif.variable}`}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#1A6B6A" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className="min-h-screen flex flex-col">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:bg-gold-500 focus:text-white focus:px-4 focus:py-2 focus:rounded-xl focus:font-semibold">
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
                    "Discover stays, tours, dining, events, and experiences across the Caribbean islands. All in one place, powered by locals.",
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
        <AuthProvider><SavedProvider><CurrencyProvider><ScrollToTop /><PromoBanner /><EmailVerificationBanner /><div id="main-content">{children}</div></CurrencyProvider></SavedProvider></AuthProvider>
        <AIConcierge />
        <ServiceWorkerRegister />
        <Analytics />
        <GoogleAnalytics />
      </body>
    </html>
  );
}
