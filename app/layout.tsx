import type { Metadata } from "next";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
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
      <body className="min-h-screen flex flex-col">{children}</body>
    </html>
  );
}
