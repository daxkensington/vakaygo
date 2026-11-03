import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  InvalidOutreachEvent, parseResendOutreachEvent, recordOutreachProviderEvent, verifyResendOutreachWebhook,
} from "@/server/outreach-tracking";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 64 * 1024;

export async function POST(request: Request) {
  const secret = env.RESEND_WEBHOOK_SECRET;
  if (!secret || !env.RESEND_API_KEY) return NextResponse.json({ error: "Email tracking is not configured" }, { status: 503 });
  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");
  if (!id || !timestamp || !signature) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  if (Number(request.headers.get("content-length") || 0) > MAX_BODY_BYTES) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  let body: string;
  try { body = await request.text(); }
  catch { return NextResponse.json({ error: "Invalid payload" }, { status: 400 }); }
  if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  let payload: unknown;
  try { payload = verifyResendOutreachWebhook(body, { id, timestamp, signature }, secret); }
  catch { return NextResponse.json({ error: "Invalid signature" }, { status: 401 }); }
  try {
    const event = parseResendOutreachEvent(payload);
    if (!event) return NextResponse.json({ received: true, ignored: true });
    await recordOutreachProviderEvent(id, event, "resend");
    return NextResponse.json({ received: true });
  } catch (error) {
    if (error instanceof InvalidOutreachEvent) return NextResponse.json({ error: "Invalid email event" }, { status: 400 });
    logger.error("Outreach webhook persistence failed", { code: "OUTREACH_EVENT_PERSISTENCE" });
    return NextResponse.json({ error: "Email tracking unavailable; retry required" }, { status: 500 });
  }
}
