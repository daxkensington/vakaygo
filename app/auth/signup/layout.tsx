import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create your VakayGo account",
  description: "Sign up for VakayGo to book Caribbean stays, tours, dining, and experiences across 21 islands.",
  alternates: { canonical: "https://vakaygo.com/auth/signup" },
};

export default function SignUpLayout({ children }: { children: React.ReactNode }) {
  return children;
}
