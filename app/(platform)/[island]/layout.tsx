import type { Metadata } from "next";
import { safeJsonLd } from "@/lib/json-ld";
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
  "st-vincent": "/images/islands/st-vincent.jpg",
  dominica: "/images/islands/dominica.jpg",
  "turks-and-caicos": "/images/islands/turks-and-caicos.jpg",
  "cayman-islands": "/images/islands/cayman-islands.jpg",
  bonaire: "/images/islands/bonaire.jpg",
  "st-kitts": "/images/islands/st-kitts.jpg",
  martinique: "/images/islands/martinique.jpg",
  guadeloupe: "/images/islands/guadeloupe.jpg",
  "us-virgin-islands": "/images/islands/us-virgin-islands.jpg",
  "british-virgin-islands": "/images/islands/british-virgin-islands.jpg",
  "puerto-rico": "/images/islands/puerto-rico.jpg",
  cartagena: "/images/islands/cartagena.jpg",
  medellin: "/images/islands/medellin.jpg",
  "cancun-riviera-maya": "/images/islands/cancun-riviera-maya.jpg",
  "los-cabos": "/images/islands/los-cabos.jpg",
  guanacaste: "/images/islands/guanacaste.jpg",
  "ambergris-caye": "/images/islands/ambergris-caye.jpg",
  santorini: "/images/islands/santorini.jpg",
  mykonos: "/images/islands/mykonos.jpg",
  crete: "/images/islands/crete.jpg",
  ibiza: "/images/islands/ibiza.jpg",
  mallorca: "/images/islands/mallorca.jpg",
  "amalfi-coast-capri": "/images/islands/amalfi-coast-capri.jpg",
  "hvar-split": "/images/islands/hvar-split.jpg",
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
  cartagena: { lat: 10.4236, lng: -75.5478 },
  medellin: { lat: 6.2088, lng: -75.5659 },
  "cancun-riviera-maya": { lat: 20.6296, lng: -87.0739 },
  "los-cabos": { lat: 22.8905, lng: -109.9167 },
  guanacaste: { lat: 10.2993, lng: -85.8371 },
  "ambergris-caye": { lat: 17.9214, lng: -87.9611 },
  santorini: { lat: 36.4167, lng: 25.4328 },
  mykonos: { lat: 37.4467, lng: 25.3289 },
  crete: { lat: 35.3387, lng: 25.1442 },
  ibiza: { lat: 38.9067, lng: 1.4206 },
  mallorca: { lat: 39.5696, lng: 2.6502 },
  "amalfi-coast-capri": { lat: 40.6333, lng: 14.6029 },
  "hvar-split": { lat: 43.1729, lng: 16.4411 },
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
      {/*
        next/image with priority on the hero emits its own preload
        targeting the optimized AVIF/WebP URL; preloading the raw JPG
        here would waste a round-trip on bytes the browser then ignores.
      */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
      {children}
    </>
  );
}
