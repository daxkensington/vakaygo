import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { parseSendcorexWebhook, verifySendcorexWebhook } from "@/server/sendcorex-client";
import { recordOutreachProviderEvent } from "@/server/outreach-tracking";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 64 * 1024;
export async function POST(request: Request) {
  const secret = env.SENDCOREX_WEBHOOK_SECRET;
  if (!secret || secret.length < 32 || !env.SENDCOREX_API_KEY || !env.SENDCOREX_WEBHOOK_ID) return NextResponse.json({ error: "Email tracking is not configured" }, { status: 503 });
  if (Number(request.headers.get("content-length") || 0) > MAX_BODY_BYTES) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  let raw: string;
  try { raw = await request.text(); } catch { return NextResponse.json({ error: "Invalid payload" }, { status: 400 }); }
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  try { verifySendcorexWebhook(raw, request.headers.get("x-webhook-signature"), secret); }
  catch { return NextResponse.json({ error: "Invalid signature" }, { status: 401 }); }
  let event;
  try { event = parseSendcorexWebhook(JSON.parse(raw)); }
  catch { return NextResponse.json({ error: "Invalid email event" }, { status: 400 }); }
  if (!event) return NextResponse.json({ received: true, ignored: true });
  try {
    await recordOutreachProviderEvent(`sc_${createHash("sha256").update(raw).digest("hex")}`, event, "sendcorex");
    // A configured secret alone is not proof of a working provider callback.
    // Readiness requires a signed event persisted for this ID and key hash.
    await neon(env.DATABASE_URL).query(`INSERT INTO outreach_webhook_proofs(provider,webhook_id,secret_hash)
      VALUES('sendcorex',$1,$2) ON CONFLICT(provider) DO UPDATE SET webhook_id=excluded.webhook_id,
      secret_hash=excluded.secret_hash,verified_at=now()`,
    [env.SENDCOREX_WEBHOOK_ID, createHash("sha256").update(secret).digest("hex")]);
    return NextResponse.json({ received: true });
  } catch {
    logger.error("Sendcorex webhook persistence failed", { code: "OUTREACH_EVENT_PERSISTENCE" });
    return NextResponse.json({ error: "Email tracking unavailable; retry required" }, { status: 500 });
  }
}
