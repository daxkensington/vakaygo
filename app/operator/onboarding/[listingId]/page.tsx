"use client";

import { operatorFetch as fetch } from "@/lib/operator-session";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle, Loader2 } from "lucide-react";
import { COUNTRIES } from "@/lib/countries";
import { describeNextStep, describeWaiting, nextOnboardingStep, onlyDatesMissing, type ListingGaps, type OnboardingStage } from "@/lib/onboarding-nudges";

type Business = { legalName: string; country: string; address: string; representativeName: string };
type Step = "claim" | "business" | "representative" | "terms" | "listing" | "payments" | "activation";
type PayoutProfileSummary = {
  method: "paypal" | "wise" | "bank_wire";
  currency: string;
  status: "pending_review" | "verified" | "rejected";
  w8benCertified: boolean;
  revoked: boolean;
};
type Onboarding = {
  listingId: string; state: string; eligible: boolean; reason: string; bookingsEnabled: boolean; canManage: boolean;
  listing: { title: string; slug: string; islandSlug: string; status?: string }; requirements: Record<Step, boolean>;
  business: Business; termsVersion: string; allowedPaymentCountries: string[]; stripe: { connected: boolean };
  payoutProfile?: PayoutProfileSummary; activatedAt: string | null; listingGaps?: ListingGaps | null;
};
const steps: { key: Step; label: string }[] = [
  { key: "claim", label: "Business claim verified" }, { key: "business", label: "Legal business details" },
  { key: "representative", label: "Authorized representative" }, { key: "terms", label: "Terms accepted" },
  { key: "listing", label: "Listing information complete" }, { key: "payments", label: "Payments and payouts verified" },
  { key: "activation", label: "Onboarding finalized" },
];
const emptyBusiness: Business = { legalName: "", country: "", address: "", representativeName: "" };
const PAYOUT_METHODS = "Wise, PayPal or bank transfer";

/** Where on this page (or elsewhere) a stage is completed. */
function stageHref(stage: OnboardingStage, listingId: string, directPayouts: boolean, gaps?: ListingGaps | null) {
  const id = encodeURIComponent(listingId);
  switch (stage) {
    case "business_details": return "#company-details";
    case "listing_setup": return onlyDatesMissing(gaps) ? `/operator/listings/${id}/calendar` : `/operator/listings/${id}`;
    case "payout_setup": return directPayouts ? `/operator/payouts?listingId=${id}` : "#payments";
    case "payout_rejected": return `/operator/payouts?listingId=${id}`;
    case "activate": return "#finalize";
  }
}
function stepHref(step: Step, listingId: string, directPayouts: boolean, gaps?: ListingGaps | null) {
  const id = encodeURIComponent(listingId);
  switch (step) {
    case "claim": return `/operator/claim/${id}`;
    case "business": case "representative": case "terms": return "#company-details";
    case "listing": return onlyDatesMissing(gaps) ? `/operator/listings/${id}/calendar` : `/operator/listings/${id}`;
    case "payments": return directPayouts ? `/operator/payouts?listingId=${id}` : "#payments";
    case "activation": return "#finalize";
  }
}

export default function BusinessOnboardingPage({ params }: { params: Promise<{ listingId: string }> }) {
  const { listingId } = use(params);
  const [status, setStatus] = useState<Onboarding | null>(null);
  const [business, setBusiness] = useState<Business>(emptyBusiness);
  const [authority, setAuthority] = useState(false);
  const [terms, setTerms] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [statusCurrent, setStatusCurrent] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const requestSequence = useRef(0);
  const requestController = useRef<AbortController | null>(null);
  const formInitialized = useRef(false);
  const endpoint = `/api/operator/onboarding/${encodeURIComponent(listingId)}`;
  const load = useCallback(async (refreshProvider = false, fillForm = false) => {
    const request = ++requestSequence.current;
    requestController.current?.abort();
    const controller = new AbortController(); requestController.current = controller;
    setStatusCurrent(false); setRefreshing(true);
    try {
      const response = await fetch(endpoint + (refreshProvider ? "?refresh=1" : ""), { cache: "no-store", signal: controller.signal });
      if (controller.signal.aborted || request !== requestSequence.current) return false;
      if (response.status === 401) { setStatus(null); return false; }
      const data = await response.json();
      if (controller.signal.aborted || request !== requestSequence.current) return false;
      if (!response.ok || data.canManage !== true) {
        if (response.status === 403 || response.status === 404) setStatus(null);
        throw new Error(data.error || "Only the verified business owner can manage onboarding.");
      }
      if (data.listingId !== listingId || !data.business || !data.requirements || !data.listing || !data.stripe) throw new Error("Current verification status is unavailable. Please try again.");
      setStatus(data); setStatusCurrent(true); setError("");
      if (fillForm || !formInitialized.current) { setBusiness({ ...emptyBusiness, ...data.business }); setAuthority(data.requirements?.representative === true); setTerms(data.requirements?.terms === true); formInitialized.current = true; }
      return true;
    } catch (cause) {
      if (request === requestSequence.current && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load onboarding.");
      return false;
    } finally { if (!controller.signal.aborted && request === requestSequence.current) { setLoading(false); setRefreshing(false); } }
  }, [endpoint, listingId]);
  useEffect(() => {
    formInitialized.current = false; setLoading(true); setStatus(null);
    // A return URL never proves completion. Read the provider state again.
    void load(true, true);
    const refresh = () => { void load(true); };
    window.addEventListener("focus", refresh); window.addEventListener("pageshow", refresh);
    return () => { requestController.current?.abort(); window.removeEventListener("focus", refresh); window.removeEventListener("pageshow", refresh); };
  }, [load]);

  async function perform(action: "save" | "connect" | "activate" | "refresh") {
    if (!status?.canManage || !statusCurrent || busy || refreshing) return;
    setBusy(true); setError(""); setMessage("");
    try {
      if (action === "refresh") { if (await load(true)) setMessage("Verification status refreshed."); return; }
      const response = await fetch(action === "connect" ? "/api/payments/connect" : endpoint, {
        method: action === "save" ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "save" ? { business, authorityAccepted: authority, termsAccepted: terms, termsVersion: status.termsVersion } : action === "connect" ? { listingId } : { action: "activate" }),
      });
      const data = await response.json();
      if (response.status === 401) { setStatus(null); setStatusCurrent(false); return; }
      if (response.status === 403) { setStatus(null); setStatusCurrent(false); }
      if (!response.ok) throw new Error(data.error || "This step could not be completed.");
      if (action === "connect") {
        const url = new URL(data.url);
        if (url.protocol !== "https:" || url.hostname !== "connect.stripe.com") throw new Error("The secure onboarding link is unavailable.");
        window.location.href = url.href; return;
      }
      if (!await load(false, action === "save")) return;
      setMessage(action === "save" ? "Business information saved." : "Onboarding checks completed. Booking availability is shown below.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "This step could not be completed."); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="p-8" role="status"><Loader2 className="animate-spin" aria-label="Loading onboarding" /></div>;
  const allReady = statusCurrent && status && steps.filter(step => step.key !== "activation").every(step => status.requirements[step.key] === true);
  const detailsChanged = !!status && ((Object.keys(emptyBusiness) as (keyof Business)[]).some(key => business[key] !== status.business[key])
    || authority !== status.requirements.representative || terms !== status.requirements.terms);
  const selectedCountryName = COUNTRIES.find(country => country.code === business.country)?.name;
  // Stripe is only possible for a saved registration country the platform supports; everyone else is paid directly.
  const savedCountry = status?.business.country || "";
  const savedCountryName = COUNTRIES.find(country => country.code === savedCountry)?.name;
  const stripeAvailable = !!savedCountry && !!status?.allowedPaymentCountries?.includes(savedCountry);
  const directPayouts = !!savedCountry && !stripeAvailable;
  const paymentCountryAvailable = !!status?.allowedPaymentCountries?.includes(business.country);
  const canConnect = statusCurrent && status && !detailsChanged && paymentCountryAvailable
    && status.business.country === business.country
    && ["claim", "business", "representative", "terms"].every(key => status.requirements[key as Step] === true);
  const payout = status?.payoutProfile;
  const payoutVerified = !!payout && payout.status === "verified" && !payout.revoked;
  const payoutPending = !!payout && payout.status === "pending_review" && !payout.revoked;
  const payoutNeedsUpdate = !!payout && !payoutVerified && !payoutPending;
  const nextStep = status ? nextOnboardingStep({
    requirements: { ...status.requirements, payments: status.requirements.payments || (payoutVerified && payout.w8benCertified) },
    listingStatus: status.listing.status || (status.reason === "listing_incomplete" && status.requirements.listing ? "pending_review" : "active"),
    payoutProfileStatus: payout?.status ?? null,
    payoutProfileRevoked: payout?.revoked === true,
    stripeConnected: status.stripe.connected,
    suspended: status.reason === "suspended",
  }) : null;
  const gaps = status?.listingGaps ?? null;
  const nextContent = nextStep ? describeNextStep(nextStep, { listingId, stripeConnected: !!status?.stripe.connected, listingGaps: gaps }) : null;
  const waitingText = nextStep ? describeWaiting(nextStep) : null;
  const inputClass = "mt-1 w-full rounded-xl border border-cream-300 bg-white p-3 text-navy-700";
  const buttonClass = "rounded-xl bg-gold-700 px-5 py-3 font-semibold text-white disabled:opacity-50";
  const secondaryClass = "rounded-xl border border-cream-300 px-5 py-3 font-semibold text-navy-700 disabled:opacity-50";
  const payoutsHref = `/operator/payouts?listingId=${encodeURIComponent(listingId)}`;
  return <main className="mx-auto max-w-4xl p-6 md:p-8">
    <Link href="/operator/listings" className="text-sm font-semibold text-gold-700">Back to your listings</Link>
    <h1 className="mt-5 text-3xl font-bold text-navy-700">Business onboarding</h1>
    <p className="mt-2 text-navy-500">Verify your company, prepare the listing and tell us how you want to be paid. Travelers can book once every step is complete.</p>
    {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}
    {(error || !status) && <button type="button" disabled={busy || refreshing} onClick={() => void load(true)} className="mt-4 rounded-xl border border-cream-300 px-5 py-3 font-semibold text-navy-700 disabled:opacity-50">{refreshing ? "Refreshing status…" : "Try loading status again"}</button>}
    {message && <p role="status" className="mt-5 rounded-xl bg-teal-50 p-4 text-teal-800">{message}</p>}
    {status && <>
      <section className="mt-6 rounded-2xl border border-cream-200 bg-white p-6">
        <h2 className="text-xl font-bold text-navy-700">{status.listing.title}</h2>
        <p className="mt-2 text-sm text-navy-600">{!statusCurrent ? "Current verification status is unavailable or refreshing. Your company details are preserved; refresh status before continuing setup." : status.eligible === true ? "This listing is eligible for online bookings." : status.bookingsEnabled !== true ? "Online bookings and payments are currently disabled. You can complete business setup while the listing remains information only." : "Bookings and payments remain unavailable until every required check is complete."}</p>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">{steps.map(step => {
          const done = status.requirements[step.key] === true;
          return <li key={step.key} className="flex items-center gap-2 text-sm text-navy-700">
            {done ? <CheckCircle2 size={18} className="shrink-0 text-teal-700" aria-label="Complete" /> : <Circle size={18} className="shrink-0 text-navy-300" aria-label="Incomplete" />}
            {done || step.key === "activation" ? step.label : <a href={stepHref(step.key, listingId, directPayouts, gaps)} className="font-medium text-gold-800 underline-offset-2 hover:underline">{step.label}</a>}
          </li>;
        })}</ul>
        {statusCurrent && nextContent && nextStep?.kind === "stage" && (
          <div data-testid="next-step" className="mt-5 flex flex-col gap-3 rounded-xl border border-gold-200 bg-gold-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gold-800">Next step</p>
              <p className="mt-1 font-semibold text-navy-700">{nextContent.title}</p>
              <p className="mt-1 text-sm text-navy-600">{nextContent.detail}</p>
            </div>
            <a href={stageHref(nextStep.stage, listingId, directPayouts, gaps)} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-gold-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gold-600">{nextContent.actionLabel}<ArrowRight size={16} aria-hidden="true" /></a>
          </div>
        )}
        {statusCurrent && waitingText && (
          <p data-testid="next-step" className="mt-5 rounded-xl border border-teal-200 bg-teal-50/70 p-4 text-sm text-navy-700"><span className="font-semibold">Waiting on VakayGo.</span> {waitingText}</p>
        )}
        {statusCurrent && nextStep?.kind === "done" && (
          <p data-testid="next-step" className="mt-5 rounded-xl border border-teal-200 bg-teal-50/70 p-4 text-sm text-navy-700"><span className="font-semibold">Setup complete.</span> Every onboarding step is finished for this listing.</p>
        )}
        {!status.requirements.claim && <Link className="mt-4 inline-block font-semibold text-gold-700" href={`/operator/claim/${listingId}`}>Verify the business claim</Link>}
      </section>
      <form id="company-details" className="mt-6 space-y-4 rounded-2xl border border-cream-200 bg-white p-6" onSubmit={event => { event.preventDefault(); void perform("save"); }}>
        <h2 className="text-xl font-bold text-navy-700">Company and representative</h2>
        {!(status.requirements.business && status.requirements.representative && status.requirements.terms) && <p className="text-sm text-navy-500">Fill in the company details, confirm you can represent it and accept the operator terms, then save. This is the first step and takes about three minutes.</p>}
        <label className="block text-sm font-semibold text-navy-600">Legal company name<input disabled={busy} required maxLength={200} value={business.legalName || ""} onChange={event => setBusiness({ ...business, legalName: event.target.value })} className={inputClass} /></label>
        <label className="block text-sm font-semibold text-navy-600">Country or territory of registration<select disabled={busy} required aria-describedby="registration-country-help" value={business.country || ""} onChange={event => setBusiness({ ...business, country: event.target.value })} className={inputClass}><option value="">Select country or territory</option>{COUNTRIES.map(({ code, name }) => <option key={code} value={code}>{name}</option>)}</select></label>
        <p id="registration-country-help" className="text-sm text-navy-500">Choose where your company is legally registered. Your listing&apos;s destination and your customers&apos; countries may be different. Registering your company details does not enable bookings or payouts.</p>
        <label className="block text-sm font-semibold text-navy-600">Registered business address<textarea disabled={busy} required maxLength={1000} value={business.address || ""} onChange={event => setBusiness({ ...business, address: event.target.value })} className={inputClass} rows={3} /></label>
        <label className="block text-sm font-semibold text-navy-600">Authorized representative&apos;s full name<input disabled={busy} required maxLength={200} value={business.representativeName || ""} onChange={event => setBusiness({ ...business, representativeName: event.target.value })} className={inputClass} /></label>
        <label className="flex items-start gap-3 text-sm text-navy-600"><input disabled={busy} type="checkbox" required checked={authority} onChange={event => setAuthority(event.target.checked)} className="mt-1" />I am authorized to represent this company and manage this listing.</label>
        <label className="flex items-start gap-3 text-sm text-navy-600"><input disabled={busy} type="checkbox" required checked={terms} onChange={event => setTerms(event.target.checked)} className="mt-1" /><span>I have read and accept the <Link href="/operator/onboarding/terms" target="_blank" className="font-semibold text-gold-700 underline">operator terms review draft</Link> (version {status.termsVersion}). Payment services remain disabled pending final review.</span></label>
        <button disabled={busy || refreshing || !statusCurrent || !status.requirements.claim} className={buttonClass}>Save company details</button>
      </form>
      <section id="payments" className="mt-6 rounded-2xl border border-cream-200 bg-white p-6">
        <h2 className="text-xl font-bold text-navy-700">Listing and payments</h2>
        <p className="mt-2 text-sm text-navy-500">{!savedCountry
          ? "Save your company's country or territory of registration above to see how you will be paid."
          : directPayouts
            ? `Companies registered in ${savedCountryName || savedCountry} are paid directly by VakayGo: after each completed booking we send your earnings by ${PAYOUT_METHODS}, in USD, EUR or a supported local currency. Submit your payout details and sign the W-8BEN form once; we verify them within two business days. No Stripe account is needed.`
            : "Complete the listing information and Stripe's company, identity and payout checks. Eligibility is verified automatically; returning from Stripe alone does not complete onboarding."}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href={`/operator/listings/${listingId}`} className={status.requirements.listing || onlyDatesMissing(gaps) ? secondaryClass : buttonClass}>{status.requirements.listing || onlyDatesMissing(gaps) ? "Review listing details" : "Set price, capacity and open dates"}</Link>
          <Link href={`/operator/listings/${encodeURIComponent(listingId)}/calendar`} className={!status.requirements.listing && onlyDatesMissing(gaps) ? buttonClass : secondaryClass}>{!status.requirements.listing && onlyDatesMissing(gaps) ? "Open your dates in the calendar" : "Open dates and calendar"}</Link>
          {directPayouts && (
            <Link href={payoutsHref} className={payoutVerified ? secondaryClass : buttonClass}>{payout ? "Review payout details" : `Set up payouts (${PAYOUT_METHODS})`}</Link>
          )}
          {(stripeAvailable || status.stripe.connected) && (
            <button disabled={busy || !canConnect} aria-describedby="payment-country-status" onClick={() => void perform("connect")} className={buttonClass}>{status.stripe.connected ? "Continue secure payment setup" : "Start secure payment setup"}</button>
          )}
          {stripeAvailable && !status.stripe.connected && (
            <Link href={payoutsHref} className="rounded-xl border border-gold-300 bg-gold-50 px-5 py-3 font-semibold text-gold-800">Prefer {PAYOUT_METHODS}?</Link>
          )}
          <button disabled={busy || refreshing} onClick={() => void load(true).then(fresh => { if (fresh) setMessage("Verification status refreshed."); })} className={secondaryClass}>Refresh verification status</button>
        </div>
        <p id="payment-country-status" className="mt-4 text-sm text-navy-500" aria-live="polite">{!savedCountry
          ? "Choose and save your company's country or territory of registration to see your payout options."
          : directPayouts
            ? detailsChanged && business.country !== savedCountry
              ? `Save your company details to update your payout options for ${selectedCountryName || "the selected country"}.`
              : payoutVerified
                ? "Payouts verified. Finish any remaining step and finalize setup below."
                : payoutPending
                  ? "Your payout details are with our team for verification, usually within two business days. Nothing more is needed from you for this step."
                  : payoutNeedsUpdate
                    ? "Your payout details need an update. Open payout settings and review the note from our team."
                    : "Next: add your payout details. Until they are verified, this listing stays information only."
            : detailsChanged
              ? "Save your company details before continuing to secure payment setup."
              : "Payment setup is available for your saved country of registration. Stripe must still verify your company, identity and payout account before bookings can be enabled."}</p>
        {payout && (
          <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50/70 p-4 text-sm text-navy-700">
            <span className="font-semibold">Direct payout profile ({payout.method === "bank_wire" ? "Bank transfer" : payout.method === "paypal" ? "PayPal" : "Wise"} · {payout.currency}):</span>{" "}
            {payoutVerified
              ? "Verified for platform-escrow bookings (Form W-8BEN on file)."
              : payoutPending
                ? "Submitted and awaiting compliance verification."
                : "Requires updates in payout settings."}
          </div>
        )}
      </section>
      <section id="finalize" className="mt-6 rounded-2xl border border-cream-200 bg-white p-6">
        <h2 className="text-xl font-bold text-navy-700">Finalize onboarding</h2>
        <p className="mt-2 text-sm text-navy-500">Every step is checked again before setup is finalized. Completing setup does not override a pause on platform bookings.</p>
        <button disabled={busy || !allReady} onClick={() => void perform("activate")} className={`mt-4 ${buttonClass}`}>{busy ? "Checking…" : "Check and finalize setup"}</button>
      </section>
    </>}
  </main>;
}
