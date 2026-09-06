import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create your VakayGo account",
  description: "Create a VakayGo account to explore Caribbean listings, save places and plan trips. Business owners can start a free listing claim.",
  alternates: { canonical: "https://vakaygo.com/auth/signup" },
};

export default function SignUpLayout({ children }: { children: React.ReactNode }) {
  return children;
}
