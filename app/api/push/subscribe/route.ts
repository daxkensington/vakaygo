import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { requireUser } from "@/server/admin-auth";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.error;
  if (!auth.emailVerified) return NextResponse.json({ error: "Verify your email before enabling notifications." }, { status: 403 });
  try {
    const { endpoint, keys } = await request.json();
    if (typeof endpoint !== "string" || !endpoint.startsWith("https://") || endpoint.length > 4000
      || typeof keys?.p256dh !== "string" || !keys.p256dh || keys.p256dh.length > 1000
      || typeof keys?.auth !== "string" || !keys.auth || keys.auth.length > 1000) {
      return NextResponse.json({ error: "Missing or invalid subscription data" }, { status: 400 });
    }
    const query = neon(process.env.DATABASE_URL!);
    const [row] = await query`SELECT vakaygo_set_push_subscription(${auth.userId}::uuid,${auth.sessionVersion},${endpoint},${keys.p256dh},${keys.auth}) AS saved`;
    if (!row?.saved) return NextResponse.json({ error: "Account changed. Sign in again." }, { status: 409 });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Push subscribe error", error);
    return NextResponse.json({ error: "Failed to save subscription" }, { status: 500 });
  }
}
export async function DELETE(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.error;
  try {
    const { endpoint } = await request.json();
    if (typeof endpoint !== "string" || !endpoint) return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
    const query = neon(process.env.DATABASE_URL!);
    await query`DELETE FROM push_subscriptions p WHERE p.user_id=${auth.userId}::uuid AND p.endpoint=${endpoint}
      AND EXISTS(SELECT 1 FROM users u WHERE u.id=p.user_id AND u.session_version=${auth.sessionVersion})`;
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Push unsubscribe error", error);
    return NextResponse.json({ error: "Failed to remove subscription" }, { status: 500 });
  }
}
