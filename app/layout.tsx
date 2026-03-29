import type { Metadata } from "next";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
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
  title: "VakayGo — Your Caribbean Adventure Starts Here",
  description:
    "Discover stays, tours, dining, events, and experiences across the Caribbean islands. All in one place, powered by locals.",
  keywords: [
    "Caribbean travel",
    "Grenada tours",
    "island vacation",
    "Caribbean stays",
    "local experiences",
    "book Caribbean",
  ],
  openGraph: {
    title: "VakayGo — Your Caribbean Adventure Starts Here",
    description:
      "Discover stays, tours, dining, events, and experiences across the Caribbean islands.",
    url: "https://vakaygo.com",
    siteName: "VakayGo",
    type: "website",
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
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
