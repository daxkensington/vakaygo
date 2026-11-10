import type { Metadata } from "next";
import { staticPageMetadata } from "@/lib/page-metadata";

export const metadata: Metadata = staticPageMetadata(
  "/faq",
  "Frequently Asked Questions",
  "Answers to common questions about booking, payments, cancellations, and listing your Caribbean business on VakayGo.",
);

export default function FaqLayout({ children }: { children: React.ReactNode }) {
  return children;
}
