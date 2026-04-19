import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Explore Caribbean experiences",
  description:
    "Search 7,000+ stays, tours, dining, events, and local guides across 21 Caribbean islands. Filter by island, category, price, and more on VakayGo.",
  alternates: { canonical: "https://vakaygo.com/explore" },
};

export default function ExploreLayout({ children }: { children: React.ReactNode }) {
  return children;
}
