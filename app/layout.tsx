import type { Metadata } from "next";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
import { SavedProvider } from "@/lib/use-saved";
import { Analytics } from "@vercel/analytics/next";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${dmSans.variable} ${dmSerif.variable}`}>
      <body className="min-h-screen flex flex-col">
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
                    url: "https://vakaygo.com/logo.png",
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
        <AuthProvider><SavedProvider>{children}</SavedProvider></AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}
