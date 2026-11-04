import { createHash, timingSafeEqual } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { env } from "@/lib/env";
import { OUTREACH_CAMPAIGN_KEY, checkCampaignSendingWindow, getOutreachPrerequisites } from "@/lib/outreach-campaign-policy";
import { normalizeOutreachRecipient, parseResendOutreachEvent, recordOutreachAccepted, recordOutreachFailure, recordOutreachProviderEvent, suppressOutreachRecipient } from "@/server/outreach-tracking";
import { SendcorexClient, SendcorexError } from "@/server/sendcorex-client";
import { refreshSendcorexTelemetry } from "@/server/sendcorex-telemetry";

const REQUIRED_EVENTS = ["email.sent", "email.delivered", "email.bounced", "email.complained", "email.delivery_delayed", "email.failed", "email.suppressed"];
const CAMPAIGN_ORIGIN = "https://vakaygo.com";
const PROVIDER_METADATA_PAGE_LIMIT = 100;
const PROVIDER_METADATA_MAX_PAGES = 5;
type ProviderMetadata = { id: string; name?: string; status?: string; endpoint?: string };

async function providerGet(path: string, signal: AbortSignal) {
  const response = await fetch(`https://api.resend.com${path}`, { method: "GET", redirect: "error", signal,
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` } });
  if (!response.ok) throw new Error("provider_read_unavailable");
  return response.json();
}

async function providerMetadata(path: "/domains" | "/webhooks", signal: AbortSignal): Promise<ProviderMetadata[]> {
  const items: ProviderMetadata[] = [];
  const seen = new Set<string>();
  let after: string | undefined;
  for (let page = 0; page < PROVIDER_METADATA_MAX_PAGES; page++) {
    const query = new URLSearchParams({ limit: String(PROVIDER_METADATA_PAGE_LIMIT) });
    if (after) query.set("after", after);
    const result = await providerGet(`${path}?${query}`, signal);
    if (!Array.isArray(result.data) || typeof result.has_more !== "boolean" || result.data.length > PROVIDER_METADATA_PAGE_LIMIT) throw new Error("provider_metadata_invalid");
    for (const item of result.data) {
      if (!item || typeof item.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(item.id) || seen.has(item.id)) throw new Error("provider_metadata_cursor_invalid");
      seen.add(item.id);
      items.push(item);
    }
    if (!result.has_more) return items;
    // Resend's next-page cursor is the current page's last object ID.
    // Empty, repeated or over-bound pages never establish readiness.
    after = result.data.at(-1)?.id;
    if (!after) throw new Error("provider_metadata_cursor_missing");
  }
  throw new Error("provider_metadata_incomplete");
}

function webhookSecretMatches(observed: unknown): boolean {
  const configured = env.RESEND_WEBHOOK_SECRET;
  if (typeof observed !== "string" || !observed || typeof configured !== "string" || !configured) return false;
  const expected = Buffer.from(configured);
  const actual = Buffer.from(observed);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Provider observations reconcile missed webhooks; no message is sent here. */
export async function refreshOutreachTelemetry(): Promise<{ ready: boolean; reasons: string[] }> {
  const sql = neon(env.DATABASE_URL);
  const prerequisites = getOutreachPrerequisites();
  const reasons = [...prerequisites.reasons];
  const signal = AbortSignal.timeout(20_000);
  if (prerequisites.ready) {
    try {
      if (prerequisites.provider === "sendcorex") await refreshSendcorexTelemetry(prerequisites.from);
      else {
      const domains = await providerMetadata("/domains", signal);
      const domainName = prerequisites.from.split("@")[1].toLowerCase();
      const domain = domains.find(item => item.name === domainName && item.status === "verified");
      if (!domain) reasons.push("sender_domain_unverified_or_incomplete");
      const webhooks = await providerMetadata("/webhooks", signal);
      const webhook = webhooks.find(item => item.endpoint === `${CAMPAIGN_ORIGIN}/api/webhooks/resend` && item.status === "enabled");
      if (!webhook) reasons.push("campaign_webhook_missing");
      else {
        const detail = await providerGet(`/webhooks/${encodeURIComponent(webhook.id)}`, signal);
        if (detail.id !== webhook.id || detail.endpoint !== `${CAMPAIGN_ORIGIN}/api/webhooks/resend` || detail.status !== "enabled" || !Array.isArray(detail.events) || REQUIRED_EVENTS.some(event => !detail.events.includes(event))) reasons.push("campaign_webhook_events_incomplete");
        if (!webhookSecretMatches(detail.signing_secret)) reasons.push("campaign_webhook_secret_mismatch");
      }
      const pending = await sql.query(`SELECT id,recipient,provider_email_id FROM outreach_email_attempts
        WHERE provider='resend' AND campaign_key=$1 AND provider_email_id IS NOT NULL AND accepted_at>now()-interval '7 days'
        ORDER BY last_polled_at ASC NULLS FIRST,id LIMIT 5`, [OUTREACH_CAMPAIGN_KEY]);
      for (const attempt of pending) {
        const observation = await providerGet(`/emails/${encodeURIComponent(attempt.provider_email_id)}`, signal);
        if (observation.id !== attempt.provider_email_id || !Array.isArray(observation.to) || observation.to.length !== 1 || normalizeOutreachRecipient(observation.to[0]) !== attempt.recipient) throw new Error("provider_recipient_mismatch");
        const status = observation.last_event;
        if (!REQUIRED_EVENTS.includes(`email.${status}`) && !["opened", "clicked"].includes(status)) { reasons.push("provider_status_unknown"); continue; }
        // This is an observation time, explicitly stored as provider_poll,
        // rather than inventing a historical provider event timestamp.
        const event = parseResendOutreachEvent({ type: `email.${status}`, created_at: new Date().toISOString(), data: { email_id: observation.id, to: observation.to } });
        if (event) await recordOutreachProviderEvent(`poll_${observation.id}_${status}`, event, "resend", "provider_poll");
        await sql.query("UPDATE outreach_email_attempts SET last_polled_at=now() WHERE id=$1::uuid AND provider='resend'", [attempt.id]);
      }
      }
    } catch { reasons.push("provider_telemetry_unavailable"); }
  }
  const ready = reasons.length === 0;
  // Compare selected provider: health from one provider never enables another.
  await sql.query(`UPDATE outreach_campaign_control SET health_checked_at=now(),health_ready=$1,health_reason=$2
    WHERE id=true AND provider=$3`, [ready, [...new Set(reasons)].join(",") || "provider_metadata_verified", prerequisites.provider]);
  return { ready, reasons: [...new Set(reasons)] };
}

type Invitation = { listingId: string; recipient: string; islandSlug: string; islandCountry?: string;
  buildMessage: (attemptId: string) => { subject: string; text: string; html: string } };

/** All callers, including administrator and interest paths, use the same gate. */
export async function deliverClaimInvitation(input: Invitation): Promise<{ sent: boolean; email?: string; reason?: string; attemptId?: string }> {
  const prerequisites = getOutreachPrerequisites();
  if (!prerequisites.ready) return { sent: false, reason: prerequisites.reasons[0] };
  const recipient = normalizeOutreachRecipient(input.recipient);
  if (!recipient) return { sent: false, reason: "invalid_recipient" };
  if (!checkCampaignSendingWindow(input.islandSlug).allowed) return { sent: false, email: recipient, reason: "outside_local_business_hours" };
  const sql = neon(env.DATABASE_URL);
  const [reservation] = await sql.query("SELECT * FROM vakaygo_reserve_outreach_attempt($1::uuid,$2,$3)", [input.listingId, recipient, OUTREACH_CAMPAIGN_KEY]);
  if (!reservation?.attempt_id) return { sent: false, email: recipient, reason: reservation?.reason || "reservation_unavailable" };
  const attemptId = String(reservation.attempt_id);
  try {
    const [eligible] = await sql.query(`SELECT a.id FROM outreach_email_attempts a JOIN outreach_campaign_control c ON c.id=true
      JOIN listings l ON l.id=a.listing_id JOIN islands i ON i.id=l.island_id
      WHERE a.id=$1::uuid AND a.state='reserved' AND c.enabled=true AND c.provider=a.provider
        AND c.health_ready AND c.health_checked_at>now()-interval '20 minutes' AND c.health_checked_at<=now()
        AND l.status='active' AND i.is_active AND i.slug=$2 AND lower(btrim(l.type_data->>'email'))=a.recipient
        AND NOT vakaygo_listing_claim_verified(l.id)
        AND EXISTS(SELECT 1 FROM outreach_recipient_consents p WHERE p.listing_id=a.listing_id AND p.recipient_email=a.recipient AND p.provider=a.provider AND vakaygo_outreach_permission_allowed(p.provider,p.permission_kind) AND p.revoked_at IS NULL AND p.granted_at<=now())
        AND NOT EXISTS(SELECT 1 FROM outreach_email_suppressions s WHERE s.recipient=a.recipient)
        AND NOT EXISTS(SELECT 1 FROM business_outreach b WHERE b.listing_id=l.id AND (b.status='do_not_contact' OR b.contacted_at IS NOT NULL))
        AND NOT EXISTS(SELECT 1 FROM outreach_email_attempts h WHERE h.campaign_key=a.campaign_key
          AND (h.state='uncertain' OR (h.state='reserved' AND h.reserved_at<now()-interval '20 minutes')))
        AND NOT EXISTS(SELECT 1 FROM outreach_email_attempts h WHERE h.campaign_key=a.campaign_key AND h.provider=a.provider
          AND h.complained_at>=now()-interval '7 days')
        AND NOT EXISTS(SELECT 1 FROM outreach_email_attempts h WHERE h.campaign_key=a.campaign_key AND h.provider=a.provider
          AND h.provider='sendcorex' AND h.accepted_at IS NOT NULL AND h.failed_at>=now()-interval '7 days')
        AND NOT EXISTS(SELECT 1 FROM (
          SELECT count(*) FILTER(WHERE h.bounced_at>=now()-interval '7 days') AS bounced,
            count(*) FILTER(WHERE h.accepted_at>=now()-interval '7 days') AS accepted
          FROM outreach_email_attempts h WHERE h.campaign_key=a.campaign_key AND h.provider=a.provider
        ) health WHERE bounced>0 AND (accepted=0 OR bounced::numeric/greatest(accepted,1)>=0.02))
        AND NOT EXISTS(SELECT 1 FROM outreach_email_attempts h WHERE h.campaign_key=a.campaign_key AND h.provider=a.provider
          AND h.accepted_at<now()-interval '24 hours' AND h.delivered_at IS NULL AND h.bounced_at IS NULL
          AND h.suppressed_at IS NULL AND h.failed_at IS NULL)`, [attemptId, input.islandSlug]);
    if (!eligible || !checkCampaignSendingWindow(input.islandSlug).allowed || !getOutreachPrerequisites().ready) {
      await recordOutreachFailure(attemptId, "dispatch_gate_changed", { uncertain: false });
      return { sent: false, email: recipient, reason: "dispatch_gate_changed", attemptId };
    }
    const message = input.buildMessage(attemptId);
    const { unsubscribeInvitationUrl } = await import("@/server/outreach-attribution");
    const unsubscribe = unsubscribeInvitationUrl(attemptId);
    if (prerequisites.provider === "sendcorex") {
      try {
        const providerId = await new SendcorexClient(env.SENDCOREX_API_KEY || "", AbortSignal.timeout(20_000)).send({
          from: prerequisites.from, to: recipient, subject: message.subject, html: message.html, unsubscribe,
        });
        if (!await recordOutreachAccepted(attemptId, providerId, "sendcorex")) throw new SendcorexError("sendcorex_acceptance_unconfirmed");
        return { sent: true, email: recipient, attemptId };
      } catch (error) {
        const failure = error instanceof SendcorexError ? error : new SendcorexError("sendcorex_outcome_unconfirmed");
        await recordOutreachFailure(attemptId, failure.code, { uncertain: failure.uncertain });
        await sql.query(`UPDATE outreach_campaign_control SET enabled=false,health_ready=false,health_reason='provider_request_rejected',
          pause_reason='Provider outcome requires review before resuming.',version=version+1,updated_at=now()
          WHERE id=true AND provider='sendcorex'`);
        return { sent: false, email: recipient, reason: failure.code, attemptId };
      }
    }
    const response = await fetch("https://api.resend.com/emails", { method: "POST", redirect: "error", signal: AbortSignal.timeout(20_000),
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `outreach:${attemptId}` },
      body: JSON.stringify({ from: `VakayGo <${prerequisites.from}>`, to: recipient, reply_to: "support@vakaygo.com",
        subject: message.subject, text: message.text, html: message.html,
        tags: [{ name: "campaign", value: OUTREACH_CAMPAIGN_KEY }, { name: "attempt", value: attemptId }],
        headers: { "List-Unsubscribe": `<${unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } }) });
    if (!response.ok) {
      await recordOutreachFailure(attemptId, "provider_request_rejected", { uncertain: response.status >= 500 || response.status === 409 });
      await sql.query(`UPDATE outreach_campaign_control SET enabled=false,health_ready=false,health_reason='provider_request_rejected',
        pause_reason='Provider rejected a campaign request; review the recorded attempt before resuming.',version=version+1,updated_at=now()
        WHERE id=true AND provider='resend'`);
      return { sent: false, email: recipient, reason: "provider_request_rejected", attemptId };
    }
    const accepted = await response.json();
    if (typeof accepted.id !== "string" || !await recordOutreachAccepted(attemptId, accepted.id)) throw new Error("acceptance_unconfirmed");
    return { sent: true, email: recipient, attemptId };
  } catch {
    await recordOutreachFailure(attemptId, "transport_outcome_unconfirmed").catch(() => undefined);
    return { sent: false, email: recipient, reason: "transport_outcome_unconfirmed", attemptId };
  }
}

/** Retain explicit historical blocks during provider migration, never retry them. */
export async function preserveCampaignSuppression(recipient: string, reason: "bounce" | "provider_suppressed") {
  const normalized = normalizeOutreachRecipient(recipient);
  if (!normalized) throw new Error("invalid_recipient");
  await suppressOutreachRecipient(normalized, reason);
  return createHash("sha256").update(normalized).digest("hex");
}
