import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getIslandBySlug } from "@/server/seo-queries";

type Props = {
  children: React.ReactNode;
  params: Promise<{ island: string }>;
};

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { island: slug } = await params;
  const island = await getIslandBySlug(slug);
  if (!island) return { title: "Not Found" };

  const title = `${island.name} — Caribbean Travel & Experiences | VakayGo`;
  const description =
    island.description ||
    `Explore stays, tours, dining, and experiences in ${island.name}. Book directly with verified local operators on VakayGo.`;
  const url = `https://vakaygo.com/${slug}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "website",
      siteName: "VakayGo",
      images: [
        {
          url: `https://vakaygo.com/api/og?title=${encodeURIComponent(island.name)}&subtitle=${encodeURIComponent("Caribbean Travel & Experiences")}`,
          width: 1200,
          height: 630,
          alt: island.name,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

// Server-side gate: invalid island slugs 404 instead of rendering the
// client component's "Island not found" UI with a 200 status. Also lets
// generateMetadata above set proper title/OG tags pre-hydration.
export default async function IslandLayout({ children, params }: Props) {
  const { island: slug } = await params;
  const island = await getIslandBySlug(slug);
  if (!island) notFound();
  return children;
}
