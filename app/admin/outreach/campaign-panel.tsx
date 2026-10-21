"use client";

import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { COUNTRIES } from "@/lib/countries";
import { OUTREACH_PERMISSION_PROVIDERS, type CampaignAdminAction, type CampaignPermission, type CampaignReport, type OutreachPermissionProvider } from "@/lib/outreach-campaign-admin";

const ENDPOINT = "/api/admin/outreach/campaign";
const inputClass = "mt-1 w-full rounded-lg border border-cream-300 bg-white px-3 py-2 text-sm font-normal";
const buttonClass = "rounded-lg border border-cream-300 bg-white px-4 py-2 text-sm font-semibold text-navy-700 disabled:opacity-40";
async function saveAction(action: CampaignAdminAction) {
  const response = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not save the campaign review.");
}

export function OutreachPermissionForm({ listingId, title, email, onSaved }: { listingId: string; title: string; email: string | null; onSaved: () => void }) {
  const id = useId();
  const [provider, setProvider] = useState<OutreachPermissionProvider>("resend");
  const [kind, setKind] = useState<"explicit_opt_in" | "business_outreach_permission">("explicit_opt_in");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!email) return;
    const form = event.currentTarget, values = new FormData(form);
    setBusy(true); setMessage("");
    try {
      await saveAction({ action: "grant_consent", listingId, recipientEmail: email, expectedListingEmail: email, provider, permissionKind: kind,
        evidence: String(values.get("evidence") || ""), recipientCountry: String(values.get("country") || "") || null, policyReference: String(values.get("policyReference") || "") || null });
      setMessage("Permission review recorded. This did not send an email."); form.reset(); onSaved(); window.dispatchEvent(new Event("outreach-campaign-updated"));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not record permission."); }
    finally { setBusy(false); }
  }
  return <details className="mt-4 rounded-xl border border-cream-200 p-4"><summary className="cursor-pointer text-sm font-semibold text-navy-700">Review email permission for {title}</summary>
    <p className="mt-3 text-sm text-navy-500">A public email address, traveler interest or an unrelated inbound form does not grant email permission. Record the recipient’s specific opt-in, or a documented country and provider policy review for business outreach. This cannot remove a suppression.</p>
    {!email ? <p className="mt-3 text-sm text-navy-600">Save a verified business email on the listing before recording permission.</p> : <form onSubmit={submit} className="mt-4 space-y-3">
      <p className="text-sm text-navy-700">Reviewed recipient: <strong>{email}</strong></p><div className="grid gap-3 sm:grid-cols-2">
        <label htmlFor={id + "-provider"} className="text-sm font-semibold text-navy-700">Provider<select id={id + "-provider"} value={provider} disabled={busy} onChange={event => { const next = event.target.value as OutreachPermissionProvider; setProvider(next); if (next === "resend") setKind("explicit_opt_in"); }} className={inputClass}>{OUTREACH_PERMISSION_PROVIDERS.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <label htmlFor={id + "-kind"} className="text-sm font-semibold text-navy-700">Permission basis<select id={id + "-kind"} value={kind} disabled={busy} onChange={event => setKind(event.target.value as typeof kind)} className={inputClass}><option value="explicit_opt_in">Recipient’s explicit opt-in</option><option value="business_outreach_permission" disabled={provider === "resend"}>Reviewed business outreach permission</option></select></label></div>
      {!["resend", "sendcorex"].includes(provider) && <p className="text-sm text-navy-500">This records evidence for a future provider. Sending stays blocked until its transport, signed events and sender setup are validated.</p>}
      <label htmlFor={id + "-evidence"} className="block text-sm font-semibold text-navy-700">Recipient and listing permission evidence<textarea id={id + "-evidence"} name="evidence" required minLength={20} maxLength={2000} rows={3} disabled={busy} placeholder="Date, channel, what this recipient agreed to receive and the evidence reference. For business outreach, record the specific lawful basis and review." className={inputClass} /></label>
      <div className="grid gap-3 sm:grid-cols-2"><label htmlFor={id + "-country"} className="text-sm font-semibold text-navy-700">Recipient country {kind === "business_outreach_permission" ? "(required)" : "(if known)"}<select id={id + "-country"} name="country" required={kind === "business_outreach_permission"} disabled={busy} className={inputClass} defaultValue=""><option value="">Select country</option>{COUNTRIES.map(country => <option key={country.code} value={country.code}>{country.name}</option>)}</select></label>
        <label htmlFor={id + "-policy"} className="text-sm font-semibold text-navy-700">Policy review reference {kind === "business_outreach_permission" ? "(required)" : "(optional)"}<textarea id={id + "-policy"} name="policyReference" required={kind === "business_outreach_permission"} minLength={kind === "business_outreach_permission" ? 20 : undefined} maxLength={2000} rows={2} disabled={busy} placeholder="Dated review reference and applicable country/provider policy." className={inputClass} /></label></div>
      <button disabled={busy} className={buttonClass}>{busy ? "Recording…" : "Record reviewed permission"}</button></form>}
    {message && <p role="status" className="mt-3 text-sm text-navy-600">{message}</p>}</details>;
}

function PermissionRow({ permission, onSaved }: { permission: CampaignPermission; onSaved: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function revoke(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const reason = String(new FormData(event.currentTarget).get("reason") || "");
    try { await saveAction({ action: "revoke_consent", consentId: permission.id, reason }); onSaved(); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not revoke permission."); }
    finally { setBusy(false); }
  }
  return <li className="border-t border-cream-200 py-3 text-sm text-navy-600"><p className="font-semibold">{permission.listingTitle} · {permission.recipientEmail}</p>
    <p>{permission.provider} · {permission.permissionKind.replaceAll("_", " ")}{permission.recipientCountry ? ` · ${permission.recipientCountry}` : ""} · {permission.revokedAt ? "Revoked" : permission.suppressed ? "Suppressed" : "Recorded"}</p>
    <details className="mt-2"><summary className="cursor-pointer">Review evidence and history</summary><p className="mt-2 whitespace-pre-wrap break-words">{permission.evidence}</p>{permission.policyReference && <p className="mt-2 whitespace-pre-wrap break-words">Policy reference: {permission.policyReference}</p>}<p className="mt-2 text-xs">Recorded {new Date(permission.grantedAt).toLocaleString()} · Admin {permission.grantedBy}</p>
      {permission.revokedAt ? <p className="mt-2">Revoked {new Date(permission.revokedAt).toLocaleString()}: {permission.revocationReason}</p> : <form onSubmit={revoke} className="mt-3 flex flex-wrap gap-2"><input name="reason" required minLength={5} maxLength={500} aria-label={"Revocation reason for " + permission.listingTitle} placeholder="Reason for revoking permission" disabled={busy} className="min-w-48 flex-1 rounded-lg border border-cream-300 px-3 py-2" /><button disabled={busy} className={buttonClass}>Revoke permission</button></form>}</details>{error && <p role="alert" className="mt-2 text-red-700">{error}</p>}</li>;
}

export function CampaignPanel() {
  const [report, setReport] = useState<CampaignReport | null>(null), [error, setError] = useState("");
  const [busy, setBusy] = useState(false), [revision, setRevision] = useState(0), [provider, setProvider] = useState("");
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    fetch(ENDPOINT, { cache: "no-store", signal: controller.signal }).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not load campaign reporting."); return data; })
      .then(data => { if (!controller.signal.aborted) { setReport(data); setError(""); } }).catch(error => { if (!controller.signal.aborted) { setReport(null); setError(error.message || "Could not load campaign reporting."); } });
    return () => controller.abort();
  }, [revision]);
  useEffect(() => { window.addEventListener("outreach-campaign-updated", refresh); return () => window.removeEventListener("outreach-campaign-updated", refresh); }, [refresh]);
  async function change(action: CampaignAdminAction) {
    setBusy(true); setError("");
    try { await saveAction(action); refresh(); } catch (error) { setError(error instanceof Error ? error.message : "Could not update campaign controls."); } finally { setBusy(false); }
  }
  const reasons = report ? [...new Set([...report.prerequisites.reasons, ...report.health.reasons])] : [];
  return <section aria-label="Campaign controls and delivery reporting" className="mt-6 rounded-2xl border border-cream-300 bg-white p-5 sm:p-7">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold text-navy-800">Claim invitation campaign</h2><button type="button" onClick={refresh} className={buttonClass}>Refresh report</button></div>{error && <p role="alert" className="mt-3 text-red-700">{error}</p>}
    {!report ? <p role="status" className="mt-3 text-navy-500">{error ? "Campaign controls are unavailable." : "Loading campaign report…"}</p> : <>
      <p className="mt-3 font-semibold text-navy-700">{report.control.enabled ? "Enabled" : "Paused"} · {report.control.provider} · Stage {report.control.stage + 1} of {report.caps.length} · {report.caps[report.control.stage]} invitations per rolling 24 hours</p>
      <p className="mt-2 text-sm text-navy-500">At most 6 per hour, spaced at least 10 minutes apart, during each recipient’s business hours. Permission and suppression checks apply to every send. All customer bookings and payments stay on VakayGo.</p>
      {report.control.pauseReason && <p className="mt-2 text-sm text-navy-600">Pause reason: {report.control.pauseReason}</p>}
      {reasons.length > 0 && <div role="status" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><p className="font-semibold">Sending gates need review</p><ul className="mt-1 list-inside list-disc">{reasons.map(reason => <li key={reason}>{reason.replaceAll("_", " ")}</li>)}</ul></div>}
      <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busy || report.control.enabled || !report.health.ready} onClick={() => change({ action: "enable", expectedVersion: report.control.version })} className={buttonClass}>Enable reviewed campaign</button><button type="button" disabled={busy || !report.control.enabled} onClick={() => change({ action: "pause", expectedVersion: report.control.version, reason: "Paused by an administrator for review." })} className={buttonClass}>Pause campaign</button><button type="button" disabled={busy || !report.health.nextStageAllowed || report.control.stage >= report.caps.length - 1} onClick={() => change({ action: "request_stage", expectedVersion: report.control.version, stage: report.control.stage + 1 })} className={buttonClass}>Request next stage{report.control.stage < report.caps.length - 1 ? ` (${report.caps[report.control.stage + 1]}/day)` : ""}</button></div>
      <p className="mt-2 text-xs text-navy-500">A stage increase requires at least 3 days of observation and 50 accepted messages from this stage in the last week, aged at least 24 hours, each delivered or bounced. Bounce rate must stay below 2%, with zero complaints and a healthy event feed. Stages never increase automatically.</p>
      {!report.health.nextStageAllowed && report.health.promotionReasons?.length ? <p className="mt-2 text-xs text-navy-500">Next stage: {report.health.promotionReasons.map(reason => reason.replaceAll("_", " ")).join(", ")}.</p> : null}
      <div className="mt-4 flex flex-wrap items-end gap-2"><label className="text-sm font-semibold text-navy-700">Provider for reviewed campaign<select value={provider || report.control.provider} disabled={busy || report.control.enabled} onChange={event => setProvider(event.target.value)} className={inputClass}>{OUTREACH_PERMISSION_PROVIDERS.map(value => <option key={value}>{value}</option>)}</select></label><button type="button" disabled={busy || report.control.enabled || !provider || provider === report.control.provider} onClick={() => change({ action: "select_provider", expectedVersion: report.control.version, provider: provider as OutreachPermissionProvider })} className={buttonClass}>Select while paused</button></div>
      <p className="mt-2 text-xs text-navy-500">Changing provider resets stage and health validation. Future providers cannot be enabled until a validated transport and event adapter is available.</p>
      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">{[
        ["Reserved, last 24h", report.metrics.reserved24h], ["Accepted, 7 days", report.metrics.accepted], ["Delivered, 7 days", report.metrics.delivered], ["Bounced, 7 days", report.metrics.bounced], ["Complaints, 7 days", report.metrics.complained], ["Failed, 7 days", report.metrics.failed], ["Uncertain / stale", report.metrics.uncertain], ["Observed opens, 7 days", report.metrics.opened], ["Observed clicks, 7 days", report.metrics.clicked], ["Mature stage sample", report.metrics.matureAccepted], ["Resolved mature sample", report.metrics.matureResolved], ["Recorded active permissions", report.metrics.activePermissions], ["Suppressed recipients", report.metrics.suppressions], ["Link visits (includes scanners)", report.metrics.linkVisits], ["Approved claims linked to invitations", report.metrics.approvedClaimsFromLinks],
      ].map(([label, value]) => <div key={label} className="rounded-lg bg-cream-50 p-3"><dt className="text-navy-500">{label}</dt><dd className="mt-1 text-lg font-bold text-navy-800">{value}</dd></div>)}</dl>
      <p className="mt-3 text-xs text-navy-500">Accepted means the provider accepted the message; delivered means a receiving mail server accepted it. Opens and clicks can include scanners or proxies. Link visits can also include automated scanners or forwarded links; linked claims show association, not booking conversions or proof that email caused a claim. Replies are reviewed in InboxHQ. These metrics cover the new rollout ledger; historical outreach notes are not backfilled.</p>
      <details className="mt-5"><summary className="cursor-pointer font-semibold text-navy-700">Latest permission reviews ({report.permissions.length}, maximum 50)</summary><ul className="mt-3">{report.permissions.map(permission => <PermissionRow key={permission.id} permission={permission} onSaved={refresh} />)}</ul>{report.permissions.length === 0 && <p className="mt-3 text-sm text-navy-500">No permission evidence recorded. Review a business below to record its recipient and listing permission.</p>}</details>
    </>}
  </section>;
}
