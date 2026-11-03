import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Compass, MapPin, Search } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ImageWithFallback } from "@/components/shared/image-fallback";
import { safeJsonLd } from "@/lib/json-ld";
import { GRENADA_EXPERIENCE_TOPICS, type GrenadaExperienceTopic } from "@/lib/grenada-experiences";
import { grenadaExperiencePath, parseGrenadaExperienceRoute } from "@/lib/grenada-experience-routes";
import { getGrenadaExperiences } from "@/server/grenada-experiences";

export const revalidate = 3600;

type Props = { params: Promise<{ segments?: string[] }> };

const planningQuestions: Record<GrenadaExperienceTopic, string[]> = {
  "boat-trips": ["Is the trip private or shared, and which vessel will run it?", "What are the departure point, duration and included costs?", "How are weather changes and cancellations handled?"],
  "jet-ski": ["Is this a guided trip or a rental?", "What experience, age and equipment requirements apply?", "How are riding time, route changes and cancellations handled?"],
  "jeep-tours": ["Which stops and pickup location are confirmed?", "How much time is spent driving and walking?", "Are admission costs, food and drinks included?"],
  snorkeling: ["Does the activity depart by boat or from shore?", "Are a guide and suitable equipment included?", "What swimming requirements and cancellation terms apply?"],
  hiking: ["What are the route, duration and walking requirements?", "Is guiding included, and what access arrangements are needed?", "What should you bring, and how are route changes handled?"],
  waterfalls: ["Which waterfalls and access arrangements are confirmed?", "How much walking is involved, and is swimming part of the activity?", "Are admission costs, transport and guiding included?"],
};

async function loadPage(params: Props["params"]) {
  const { segments } = await params;
  const route = parseGrenadaExperienceRoute(segments);
  if (!route) notFound();
  const data = await getGrenadaExperiences(route.topic, route.page);
  if (!data.island || (route.page > 1 && route.page > data.totalPages)) notFound();
  return { route, data };
}

export function generateStaticParams() {
  return [
    { segments: [] },
    ...GRENADA_EXPERIENCE_TOPICS.map(topic => ({ segments: [topic.slug] })),
  ];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { route, data } = await loadPage(params);
  const label = data.topic ? `${data.topic.title} in Grenada` : "Grenada tours, excursions and guides";
  const title = `${label}${route.page > 1 ? ` — Page ${route.page}` : ""} | VakayGo`;
  const description = data.topic?.description ?? "Explore Grenada's directory of tours, excursions and local guides. Compare listed options and check each listing for current services and booking availability.";
  const url = `https://vakaygo.com${grenadaExperiencePath(route.topic, route.page)}`;
  return {
    title: { absolute: title }, description,
    alternates: { canonical: url },
    robots: { index: data.totalCount > 0 && route.page === 1, follow: true },
    openGraph: { title, description, url, type: "website", siteName: "VakayGo", images: [{ url: `https://vakaygo.com/api/og?title=${encodeURIComponent(label)}&subtitle=Explore%20the%20Grenada%20directory`, width: 1200, height: 630, alt: label }] },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function GrenadaExperiencesPage({ params }: Props) {
  const { route, data } = await loadPage(params);
  const currentPath = grenadaExperiencePath(route.topic, route.page);
  const heading = data.topic ? `${data.topic.title} in Grenada` : "Find your next Grenada experience";
  const start = data.totalCount === 0 ? 0 : (route.page - 1) * data.pageSize + 1;
  const end = start === 0 ? 0 : start + data.listings.length - 1;
  const questions = route.topic ? planningQuestions[route.topic] : ["Which business provides the activity, and what exactly is included?", "Are your preferred dates, pickup and total price confirmed?", "What are the cancellation terms and current booking status?"];
  const structured = {
    "@context": "https://schema.org", "@type": "CollectionPage",
    "@id": `https://vakaygo.com${currentPath}#webpage`, url: `https://vakaygo.com${currentPath}`, name: heading,
    mainEntity: { "@type": "ItemList", numberOfItems: data.listings.length, itemListElement: data.listings.map((listing, index) => ({ "@type": "ListItem", position: start + index, name: listing.title, url: `https://vakaygo.com/grenada/${encodeURIComponent(listing.slug)}` })) },
  };
  return <>
    <Header />
    <main className="min-h-screen bg-cream-50 pt-24">
      <script id="grenada-experiences-jsonld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(structured) }} />
      <div className="mx-auto max-w-7xl px-5 pb-5 md:px-8">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Grenada", href: "/grenada" }, ...(data.topic ? [{ label: "Experiences", href: grenadaExperiencePath() }, { label: data.topic.title }] : [{ label: "Experiences" }])]} />
      </div>
      <section className="bg-navy-800 text-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 md:grid-cols-[1.5fr_1fr] md:px-8 md:py-16">
          <div>
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-gold-300">Grenada · Tours, excursions & guides</p>
            <h1 className="max-w-3xl text-4xl font-bold leading-tight md:text-5xl" style={{ fontFamily: "var(--font-display)" }}>{heading}</h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/80">{data.topic?.description ?? "Explore independent businesses and activities in the Grenada directory. Browse by interest, compare your shortlist and open a listing for its current details."}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href="#directory" className="inline-flex items-center gap-2 rounded-full bg-gold-700 px-5 py-3 font-semibold text-white hover:bg-gold-800">Browse listings <ArrowRight size={17} /></a>
              <Link href="/trips/new?island=grenada" className="rounded-full border border-white/30 px-5 py-3 font-semibold hover:bg-white/10">Plan a trip</Link>
            </div>
          </div>
          <div className="self-center rounded-2xl border border-white/15 bg-white/5 p-6">
            <Compass size={28} className="mb-4 text-gold-300" aria-hidden="true" />
            <h2 className="text-xl font-bold">Choose the right experience</h2>
            <p className="mt-3 leading-relaxed text-white/80">Each listing shows whether online booking is available. Before making plans, check the provider, experience, dates and total price.</p>
            <Link href="/explore?island=grenada" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-gold-300 hover:text-white"><Search size={16} /> Search the Grenada directory</Link>
          </div>
        </div>
      </section>
      <div className="mx-auto max-w-7xl px-5 py-8 md:px-8">
        <nav aria-label="Grenada activity categories" className="flex flex-wrap gap-2">
          <Link href={grenadaExperiencePath()} aria-current={!route.topic ? "page" : undefined} className={`rounded-full border px-4 py-2 text-sm font-semibold ${!route.topic ? "border-navy-700 bg-navy-700 text-white" : "border-cream-300 bg-white text-navy-600 hover:border-gold-500"}`}>All experiences</Link>
          {data.topics.map(topic => <Link key={topic.slug} href={grenadaExperiencePath(topic.slug)} aria-current={route.topic === topic.slug ? "page" : undefined} className={`rounded-full border px-4 py-2 text-sm font-semibold ${route.topic === topic.slug ? "border-navy-700 bg-navy-700 text-white" : "border-cream-300 bg-white text-navy-600 hover:border-gold-500"}`}>{topic.title} <span className={route.topic === topic.slug ? "text-white/70" : "text-navy-400"}>({topic.count})</span></Link>)}
        </nav>
        <section id="directory" className="scroll-mt-28 pt-10" aria-labelledby="directory-heading">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <h2 id="directory-heading" className="text-2xl font-bold text-navy-700">{data.topic?.title ?? "Explore the directory"}</h2>
            <p className="text-sm text-navy-500">Showing {start}–{end} of {data.totalCount} listings</p>
          </div>
          {data.listings.length > 0 ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {data.listings.map(listing => <Link key={listing.id} href={`/grenada/${encodeURIComponent(listing.slug)}`} className="group overflow-hidden rounded-2xl border border-cream-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-md">
              <ImageWithFallback src={listing.image} type={listing.type} alt="" className="aspect-[16/10] w-full" />
              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">{listing.type === "guide" ? "Guide" : listing.type === "excursion" ? "Excursion" : "Tour"}</p>
                <h3 className="mt-2 text-xl font-bold leading-snug text-navy-700 group-hover:text-gold-700">{listing.title}</h3>
                <p className="mt-3 flex items-center gap-1.5 text-sm text-navy-500"><MapPin size={14} aria-hidden="true" />{listing.parish ? `${listing.parish}, Grenada` : "Grenada"}</p>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-gold-700">View listing <ArrowRight size={15} aria-hidden="true" /></span>
              </div>
            </Link>)}
          </div> : <div className="rounded-2xl border border-cream-200 bg-white p-8 text-navy-600"><h3 className="text-lg font-semibold">No listings are currently shown for this activity</h3><p className="mt-2">Try another activity or browse the full Grenada directory.</p><Link href="/explore?island=grenada" className="mt-4 inline-block font-semibold text-gold-700">Explore Grenada →</Link></div>}
          {data.totalPages > 1 && <nav aria-label="Experience listing pages" className="mt-8 flex flex-wrap items-center justify-center gap-5 text-sm font-semibold text-navy-600">
            {route.page > 1 && <Link rel="prev" href={grenadaExperiencePath(route.topic, route.page - 1)} className="rounded-full border border-cream-300 bg-white px-5 py-3 hover:border-gold-500">← Previous</Link>}
            <span>Page {route.page} of {data.totalPages}</span>
            {route.page < data.totalPages && <Link rel="next" href={grenadaExperiencePath(route.topic, route.page + 1)} className="rounded-full border border-cream-300 bg-white px-5 py-3 hover:border-gold-500">Next →</Link>}
          </nav>}
          {route.page === data.totalPages && data.totalCount > data.totalPages * data.pageSize && <p className="mt-6 text-center text-sm text-navy-500">For more results, choose an activity or <Link href="/explore?island=grenada" className="font-semibold text-gold-700">search the Grenada directory</Link>.</p>}
        </section>
        <section className="mt-12 rounded-2xl border border-cream-200 bg-white p-6 md:p-8" aria-labelledby="planning-questions-heading">
          <h2 id="planning-questions-heading" className="text-2xl font-bold text-navy-700">Questions to ask before you choose</h2>
          <ul className="mt-5 grid gap-4 text-navy-600 md:grid-cols-3">{questions.map((question, index) => <li key={question} className="rounded-xl bg-cream-50 p-4"><span className="mb-2 block text-sm font-bold text-gold-700">0{index + 1}</span>{question}</li>)}</ul>
          <p className="mt-5 text-sm leading-relaxed text-navy-500">Current visitor access, opening hours, admission costs and reservation requirements need confirmation with the business or an official visitor source.</p>
        </section>
      </div>
    </main>
    <Footer />
  </>;
}
