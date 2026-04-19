import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Frequently Asked Questions",
  description:
    "Answers to common questions about booking, payments, cancellations, and listing your Caribbean business on VakayGo.",
  alternates: { canonical: "https://vakaygo.com/faq" },
};

export default function FaqLayout({ children }: { children: React.ReactNode }) {
  return children;
}
