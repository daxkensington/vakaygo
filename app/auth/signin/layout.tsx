import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in to VakayGo",
  description: "Sign in to VakayGo to manage saved places, plan trips, record listing interest, or manage your business listing.",
  alternates: { canonical: "https://vakaygo.com/auth/signin" },
};

export default function SignInLayout({ children }: { children: React.ReactNode }) {
  return children;
}
