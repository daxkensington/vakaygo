"use client";
import { useEffect, useState, type ComponentProps } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { BookingWidget } from "@/components/listings/booking-widget";
type Listing = ComponentProps<typeof BookingWidget>["listing"] & { title: string; typeData?: { unclaimed?: boolean } };
export default function BookingPage() {
  const { island, slug } = useParams<{island:string;slug:string}>();
  const [listing,setListing] = useState<Listing | null>(null);
  const [error,setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    fetch("/api/listings/"+encodeURIComponent(slug),{signal:abort.signal})
      .then(async r => { if(!r.ok) throw new Error("This listing is unavailable"); return r.json(); })
      .then(data => setListing(data.listing))
      .catch(e => {if(e.name !== "AbortError")setError("This listing is unavailable");});
    return () => abort.abort();
  },[slug]);
  return <><Header /><main className="min-h-screen bg-cream-50 px-6 pt-24 pb-12"><div className="max-w-xl mx-auto">
    <Link href={"/"+island+"/"+slug} className="text-gold-700">Back to listing</Link>
    <h1 className="text-2xl font-bold text-navy-700 my-6">{listing ? "Book "+listing.title : "Booking"}</h1>
    {error ? <p role="alert">{error}</p> : listing ? <BookingWidget listing={listing} unclaimed={listing.typeData?.unclaimed === true} /> : <p role="status">Loading listing…</p>}
  </div></main></>;
}
