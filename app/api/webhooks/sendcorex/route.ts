import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { parseSendcorexWebhook, verifySendcorexWebhook } from "@/server/sendcorex-client";
import { recordOutreachProviderEvent } from "@/server/outreach-tracking";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 64 * 1024;
export async function POST(request: Request) {
  const secret = env.SENDCOREX_WEBHOOK_SECRET;
  if (!secret || secret.length < 32 || !env.SENDCOREX_API_KEY) return NextResponse.json({ error: "Email tracking is not configured" }, { status: 503 });
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
    return NextResponse.json({ received: true });
  } catch {
    logger.error("Sendcorex webhook persistence failed", { code: "OUTREACH_EVENT_PERSISTENCE" });
    return NextResponse.json({ error: "Email tracking unavailable; retry required" }, { status: 500 });
  }
}
