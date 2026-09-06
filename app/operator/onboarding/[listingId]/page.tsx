"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { COUNTRIES } from "@/lib/countries";

type Business = { legalName: string; country: string; address: string; representativeName: string };
type Step = "claim" | "business" | "representative" | "terms" | "listing" | "payments" | "activation";
type Onboarding = {
  listingId: string; state: string; eligible: boolean; reason: string; bookingsEnabled: boolean; canManage: boolean;
  listing: { title: string; slug: string; islandSlug: string }; requirements: Record<Step, boolean>;
  business: Business; termsVersion: string; allowedPaymentCountries: string[]; stripe: { connected: boolean }; activatedAt: string | null;
};
const steps: { key: Step; label: string }[] = [
  { key: "claim", label: "Business claim verified" }, { key: "business", label: "Legal business details" },
  { key: "representative", label: "Authorized representative" }, { key: "terms", label: "Terms accepted" },
  { key: "listing", label: "Listing information complete" }, { key: "payments", label: "Payments and payouts verified" },
  { key: "activation", label: "Onboarding finalized" },
];
const emptyBusiness: Business = { legalName: "", country: "", address: "", representativeName: "" };

export default function BusinessOnboardingPage({ params }: { params: Promise<{ listingId: string }> }) {
  const { listingId } = use(params);
  const router = useRouter();
  const [status, setStatus] = useState<Onboarding | null>(null);
  const [business, setBusiness] = useState<Business>(emptyBusiness);
  const [authority, setAuthority] = useState(false);
  const [terms, setTerms] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const endpoint = `/api/operator/onboarding/${encodeURIComponent(listingId)}`;
  const load = useCallback(async (refreshProvider = false, fillForm = false) => {
    const response = await fetch(endpoint + (refreshProvider ? "?refresh=1" : ""), { cache: "no-store" });
    if (response.status === 401) { router.replace(`/auth/signin?next=/operator/onboarding/${listingId}`); return; }
    const data = await response.json();
    if (!response.ok || data.canManage !== true) throw new Error(data.error || "Only the verified business owner can manage onboarding.");
    setStatus(data);
    if (fillForm) { setBusiness({ ...emptyBusiness, ...data.business }); setAuthority(data.requirements?.representative === true); setTerms(data.requirements?.terms === true); }
  }, [endpoint, listingId, router]);
  useEffect(() => {
    let active = true;
    // A return URL never proves completion. Read the provider state again.
    void load(true, true).catch(cause => { if (active) { setStatus(null); setError(cause instanceof Error ? cause.message : "Could not load onboarding."); } }).finally(() => { if (active) setLoading(false); });
    const refresh = () => { void load(true).catch(() => { setStatus(null); setError("Current verification status is unavailable. Please refresh before continuing."); }); };
    window.addEventListener("focus", refresh); window.addEventListener("pageshow", refresh);
    return () => { active = false; window.removeEventListener("focus", refresh); window.removeEventListener("pageshow", refresh); };
  }, [load]);

  async function perform(action: "save" | "connect" | "activate" | "refresh") {
    if (!status?.canManage) return;
    setBusy(true); setError(""); setMessage("");
    try {
      if (action === "refresh") { await load(true); setMessage("Verification status refreshed."); return; }
      const response = await fetch(action === "connect" ? "/api/payments/connect" : endpoint, {
        method: action === "save" ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "save" ? { business, authorityAccepted: authority, termsAccepted: terms, termsVersion: status.termsVersion } : action === "connect" ? { listingId } : { action: "activate" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "This step could not be completed.");
      if (action === "connect") {
        const url = new URL(data.url);
        if (url.protocol !== "https:" || url.hostname !== "connect.stripe.com") throw new Error("The secure onboarding link is unavailable.");
        window.location.href = url.href; return;
      }
      await load(false, action === "save");
      setMessage(action === "save" ? "Business information saved." : "Onboarding checks completed. Booking availability is shown below.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "This step could not be completed."); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="p-8" role="status"><Loader2 className="animate-spin" aria-label="Loading onboarding" /></div>;
  const allReady = status && steps.filter(step => step.key !== "activation").every(step => status.requirements[step.key] === true);
  const detailsChanged = !!status && ((Object.keys(emptyBusiness) as (keyof Business)[]).some(key => business[key] !== status.business[key])
    || authority !== status.requirements.representative || terms !== status.requirements.terms);
  const selectedCountryName = COUNTRIES.find(country => country.code === business.country)?.name;
  const paymentCountryAvailable = !!status?.allowedPaymentCountries?.includes(business.country);
  const canConnect = status && !detailsChanged && paymentCountryAvailable
    && status.business.country === business.country
    && ["claim", "business", "representative", "terms"].every(key => status.requirements[key as Step] === true);
  const inputClass = "mt-1 w-full rounded-xl border border-cream-300 bg-white p-3 text-navy-700";
  const buttonClass = "rounded-xl bg-gold-700 px-5 py-3 font-semibold text-white disabled:opacity-50";
  return <main className="mx-auto max-w-4xl p-6 md:p-8">
    <Link href="/operator/listings" className="text-sm font-semibold text-gold-700">Back to your listings</Link>
    <h1 className="mt-5 text-3xl font-bold text-navy-700">Business onboarding</h1>
    <p className="mt-2 text-navy-500">Verify your company, prepare the listing and complete secure payment onboarding.</p>
    {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}
    {message && <p role="status" className="mt-5 rounded-xl bg-teal-50 p-4 text-teal-800">{message}</p>}
    {status && <>
      <section className="mt-6 rounded-2xl border border-cream-200 bg-white p-6">
        <h2 className="text-xl font-bold text-navy-700">{status.listing.title}</h2>
        <p className="mt-2 text-sm text-navy-600">{status.eligible === true ? "This listing is eligible for online bookings." : status.bookingsEnabled !== true ? "Online bookings and payments are currently disabled. You can complete business setup while the listing remains information only." : "Bookings and payments remain unavailable until every required check is complete."}</p>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">{steps.map(step => <li key={step.key} className="flex items-center gap-2 text-sm text-navy-700">{status.requirements[step.key] === true ? <CheckCircle2 size={18} className="shrink-0 text-teal-700" aria-label="Complete" /> : <Circle size={18} className="shrink-0 text-navy-300" aria-label="Incomplete" />}{step.label}</li>)}</ul>
        {!status.requirements.claim && <Link className="mt-4 inline-block font-semibold text-gold-700" href={`/operator/claim/${listingId}`}>Verify the business claim</Link>}
      </section>
      <form className="mt-6 space-y-4 rounded-2xl border border-cream-200 bg-white p-6" onSubmit={event => { event.preventDefault(); void perform("save"); }}>
        <h2 className="text-xl font-bold text-navy-700">Company and representative</h2>
        <label className="block text-sm font-semibold text-navy-600">Legal company name<input required maxLength={200} value={business.legalName || ""} onChange={event => setBusiness({ ...business, legalName: event.target.value })} className={inputClass} /></label>
        <label className="block text-sm font-semibold text-navy-600">Country or territory of registration<select required aria-describedby="registration-country-help" value={business.country || ""} onChange={event => setBusiness({ ...business, country: event.target.value })} className={inputClass}><option value="">Select country or territory</option>{COUNTRIES.map(({ code, name }) => <option key={code} value={code}>{name}</option>)}</select></label>
        <p id="registration-country-help" className="text-sm text-navy-500">Choose where your company is legally registered. Your listing&apos;s destination and your customers&apos; countries may be different. Registering your company details does not enable bookings or payouts.</p>
        <label className="block text-sm font-semibold text-navy-600">Registered business address<textarea required maxLength={1000} value={business.address || ""} onChange={event => setBusiness({ ...business, address: event.target.value })} className={inputClass} rows={3} /></label>
        <label className="block text-sm font-semibold text-navy-600">Authorized representative&apos;s full name<input required maxLength={200} value={business.representativeName || ""} onChange={event => setBusiness({ ...business, representativeName: event.target.value })} className={inputClass} /></label>
        <label className="flex items-start gap-3 text-sm text-navy-600"><input type="checkbox" required checked={authority} onChange={event => setAuthority(event.target.checked)} className="mt-1" />I am authorized to represent this company and manage this listing.</label>
        <label className="flex items-start gap-3 text-sm text-navy-600"><input type="checkbox" required checked={terms} onChange={event => setTerms(event.target.checked)} className="mt-1" /><span>I have read and accept the <Link href="/operator/onboarding/terms" target="_blank" className="font-semibold text-gold-700 underline">operator terms review draft</Link> (version {status.termsVersion}). Payment services remain disabled pending final review.</span></label>
        <button disabled={busy || !status.requirements.claim} className={buttonClass}>Save company details</button>
      </form>
      <section className="mt-6 rounded-2xl border border-cream-200 bg-white p-6">
        <h2 className="text-xl font-bold text-navy-700">Listing and payments</h2>
        <p className="mt-2 text-sm text-navy-500">Complete the listing information and Stripe&apos;s company, identity and payout checks. Eligibility is verified automatically; returning from Stripe alone does not complete onboarding.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href={`/operator/listings/${listingId}`} className="rounded-xl border border-cream-300 px-5 py-3 font-semibold text-navy-700">Review listing details</Link>
          <button disabled={busy || !canConnect} aria-describedby="payment-country-status" onClick={() => void perform("connect")} className={buttonClass}>{status.stripe.connected ? "Continue secure payment setup" : "Start secure payment setup"}</button>
          <button disabled={busy} onClick={() => void perform("refresh")} className="rounded-xl border border-cream-300 px-5 py-3 font-semibold text-navy-700 disabled:opacity-50">Refresh verification status</button>
        </div>
        <p id="payment-country-status" className="mt-4 text-sm text-navy-500" aria-live="polite">{!selectedCountryName
          ? "Choose and save your company’s country or territory of registration to check payment setup availability."
          : !paymentCountryAvailable
            ? `Payment setup is not available for companies registered in ${selectedCountryName} yet. You can save your company details; this listing stays information only until all onboarding and payment checks are complete.`
            : detailsChanged
              ? "Save your company details before continuing to secure payment setup."
              : "Payment setup is available for your saved country of registration. Stripe must still verify your company, identity and payout account before bookings can be enabled."}</p>
      </section>
      <section className="mt-6 rounded-2xl border border-cream-200 bg-white p-6">
        <h2 className="text-xl font-bold text-navy-700">Finalize onboarding</h2>
        <p className="mt-2 text-sm text-navy-500">Every step is checked again before setup is finalized. Completing setup does not override a pause on platform bookings.</p>
        <button disabled={busy || !allReady} onClick={() => void perform("activate")} className={`mt-4 ${buttonClass}`}>{busy ? "Checking…" : "Check and finalize setup"}</button>
      </section>
    </>}
  </main>;
}
