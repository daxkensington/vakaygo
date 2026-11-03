import { neon } from "@neondatabase/serverless";
import { createHash } from "node:crypto";
import { env } from "@/lib/env";
import { OUTREACH_CAMPAIGN_KEY } from "@/lib/outreach-campaign-policy";
import { recordOutreachProviderEvent } from "@/server/outreach-tracking";
import { SendcorexClient, SendcorexError, parseSendcorexFeedback, parseSendcorexLog, sendcorexEventId } from "@/server/sendcorex-client";

export async function refreshSendcorexTelemetry(from: string): Promise<void> {
  const sql = neon(env.DATABASE_URL);
  const client = new SendcorexClient(env.SENDCOREX_API_KEY || "", AbortSignal.timeout(20_000));
  await client.verifySetup(from, env.SENDCOREX_WEBHOOK_ID || "");
  const proofs = await sql.query(`SELECT provider FROM outreach_webhook_proofs
    WHERE provider='sendcorex' AND webhook_id=$1 AND secret_hash=$2`,
  [env.SENDCOREX_WEBHOOK_ID, createHash("sha256").update(env.SENDCOREX_WEBHOOK_SECRET || "").digest("hex")]);
  if (proofs.length !== 1) throw new SendcorexError("sendcorex_live_webhook_unverified");
  const pending = await sql.query(`SELECT id,recipient,provider_email_id FROM outreach_email_attempts
    WHERE provider='sendcorex' AND campaign_key=$1 AND provider_email_id IS NOT NULL AND accepted_at>now()-interval '7 days'
    ORDER BY last_polled_at ASC NULLS FIRST,id LIMIT 5`, [OUTREACH_CAMPAIGN_KEY]);
  const logs = await client.logs(pending.map(row => row.provider_email_id));
  for (const log of logs) {
    const attempt = pending.find(row => row.provider_email_id === log.id);
    if (!attempt) throw new SendcorexError("sendcorex_logs_mismatch");
    const event = parseSendcorexLog(log, attempt.recipient);
    await recordOutreachProviderEvent(`poll_${event.providerEmailId}_${event.eventType}`, event, "sendcorex", "provider_poll");
  }
  for (const attempt of pending) await sql.query("UPDATE outreach_email_attempts SET last_polled_at=now() WHERE id=$1::uuid AND provider='sendcorex'", [attempt.id]);
  const [saved] = await sql.query("SELECT cursor FROM outreach_provider_cursors WHERE provider='sendcorex'");
  let cursor: string | undefined = saved?.cursor;
  for (let page = 0; page < 5; page++) {
    const data = await client.command("feedback", "list_feedback", { ...(cursor ? { cursor } : {}), limit: 500 });
    if (!Array.isArray(data.events) || data.events.length > 500 || typeof data.has_more !== "boolean") throw new SendcorexError("sendcorex_feedback_incomplete");
    // Live empty accounts return null despite the documented always-present
    // cursor. Keep starting at the retention boundary until a first event.
    const emptyInitialFeed = !cursor && data.events.length === 0 && !data.has_more && data.next_cursor === null;
    if (!emptyInitialFeed && (typeof data.next_cursor !== "string" || !data.next_cursor || data.next_cursor.length > 2048 || (data.has_more && data.next_cursor === cursor))) throw new SendcorexError("sendcorex_feedback_incomplete");
    for (const item of data.events) {
      const event = parseSendcorexFeedback(item);
      await recordOutreachProviderEvent(sendcorexEventId(event), event, "sendcorex", "provider_poll");
    }
    // Advance only after every event is durable. CAS prevents a concurrent old
    // poll from rewinding a newer cursor; replay after an interruption is safe.
    if (emptyInitialFeed) {
      // No cursor has been issued and no event was skipped.
    } else if (cursor) {
      const updated = await sql.query("UPDATE outreach_provider_cursors SET cursor=$2,updated_at=now() WHERE provider='sendcorex' AND cursor=$1 RETURNING provider", [cursor, data.next_cursor]);
      if (updated.length !== 1) throw new SendcorexError("sendcorex_feedback_poll_conflict");
    } else {
      const inserted = await sql.query("INSERT INTO outreach_provider_cursors(provider,cursor) VALUES('sendcorex',$1) ON CONFLICT DO NOTHING RETURNING provider", [data.next_cursor]);
      if (inserted.length !== 1) throw new SendcorexError("sendcorex_feedback_poll_conflict");
    }
    if (!emptyInitialFeed) cursor = data.next_cursor as string;
    if (!data.has_more) {
      const failures = await sql.query("SELECT id FROM outreach_email_attempts WHERE provider='sendcorex' AND campaign_key=$1 AND accepted_at IS NOT NULL AND failed_at>=now()-interval '7 days' LIMIT 1", [OUTREACH_CAMPAIGN_KEY]);
      if (failures.length) throw new SendcorexError("sendcorex_failure_review_required");
      return;
    }
  }
  throw new SendcorexError("sendcorex_feedback_catchup_required");
}
