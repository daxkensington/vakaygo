import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in to VakayGo",
  description: "Sign in to your VakayGo account to book Caribbean experiences, manage trips, and more.",
  alternates: { canonical: "https://vakaygo.com/auth/signin" },
};

export default function SignInLayout({ children }: { children: React.ReactNode }) {
  return children;
}
