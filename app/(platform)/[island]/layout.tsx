import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getIslandBySlug } from "@/server/seo-queries";

type Props = {
  children: React.ReactNode;
  params: Promise<{ island: string }>;
};

const islandHeroPath: Record<string, string> = {
  grenada: "/images/islands/grenada.jpg",
  barbados: "/images/islands/barbados.jpg",
  jamaica: "/images/islands/jamaica.jpg",
  "trinidad-and-tobago": "/images/islands/trinidad.jpg",
  "st-lucia": "/images/islands/st-lucia.jpg",
  bahamas: "/images/islands/bahamas.jpg",
  aruba: "/images/islands/aruba.jpg",
  curacao: "/images/islands/curacao.jpg",
  "dominican-republic": "/images/islands/dominican-republic.jpg",
  antigua: "/images/islands/antigua.jpg",
};

const islandGeo: Record<string, { lat: number; lng: number }> = {
  grenada: { lat: 12.1165, lng: -61.679 },
  "trinidad-and-tobago": { lat: 10.6918, lng: -61.2225 },
  barbados: { lat: 13.1939, lng: -59.5432 },
  "st-lucia": { lat: 13.9094, lng: -60.9789 },
  "st-vincent": { lat: 13.2528, lng: -61.1971 },
  antigua: { lat: 17.0608, lng: -61.7964 },
  dominica: { lat: 15.415, lng: -61.371 },
  jamaica: { lat: 18.1096, lng: -77.2975 },
  bahamas: { lat: 25.0343, lng: -77.3963 },
  "turks-and-caicos": { lat: 21.694, lng: -71.7979 },
  "cayman-islands": { lat: 19.3133, lng: -81.2546 },
  aruba: { lat: 12.5211, lng: -69.9683 },
  curacao: { lat: 12.1696, lng: -68.99 },
  bonaire: { lat: 12.1443, lng: -68.2655 },
  "st-kitts": { lat: 17.3578, lng: -62.783 },
  martinique: { lat: 14.6415, lng: -61.0242 },
  guadeloupe: { lat: 16.265, lng: -61.551 },
  "us-virgin-islands": { lat: 18.3358, lng: -64.8963 },
  "british-virgin-islands": { lat: 18.4207, lng: -64.64 },
  "puerto-rico": { lat: 18.2208, lng: -66.5901 },
  "dominican-republic": { lat: 18.7357, lng: -70.1627 },
};

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { island: slug } = await params;
  const island = await getIslandBySlug(slug);
  if (!island) return { title: "Not Found" };

  // Use title.absolute so the chain "root template → [island] → [slug]"
  // resolves the same regardless of nesting depth (it doesn't otherwise
  // — template inheritance through nested segments was inconsistent).
  const title = `${island.name} — Caribbean Travel & Experiences | VakayGo`;
  const description =
    island.description ||
    `Explore stays, tours, dining, and experiences in ${island.name}. Book directly with verified local operators on VakayGo.`;
  const url = `https://vakaygo.com/${slug}`;

  return {
    title: { absolute: title },
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
// generateMetadata above set proper title/OG tags pre-hydration and
// emits TouristDestination JSON-LD without round-tripping through JS.
export default async function IslandLayout({ children, params }: Props) {
  const { island: slug } = await params;
  const island = await getIslandBySlug(slug);
  if (!island) notFound();

  const heroImg = `https://vakaygo.com${islandHeroPath[slug] || "/images/hero/caribbean-hero.jpg"}`;
  const geo = islandGeo[slug];
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "TouristDestination",
    name: island.name,
    description: island.description || undefined,
    url: `https://vakaygo.com/${slug}`,
    image: heroImg,
    containedInPlace: { "@type": "Place", name: "Caribbean" },
  };
  if (geo) {
    jsonLd.geo = {
      "@type": "GeoCoordinates",
      latitude: geo.lat,
      longitude: geo.lng,
    };
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {children}
    </>
  );
}
