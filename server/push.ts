import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { pushSubscriptions } from "@/drizzle/schema";
import { eq } from "drizzle-orm";

/**
 * Send a push notification to all subscriptions for a given user.
 *
 * TODO: Actual push delivery requires the `web-push` npm package
 * (or manual VAPID/ECE encryption). Install it with:
 *   npm install web-push
 *   npm install -D @types/web-push
 *
 * Then implement the sending logic below using:
 *   import webpush from "web-push";
 *   webpush.setVapidDetails(
 *     "mailto:support@vakaygo.com",
 *     process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
 *     process.env.VAPID_PRIVATE_KEY!
 *   );
 *
 * Required env vars:
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY — base64url public key
 *   VAPID_PRIVATE_KEY — base64url private key
 *
 * Generate keys with: npx web-push generate-vapid-keys
 */
export async function sendPushNotification(params: {
  userId: string;
  title: string;
  body: string;
  url?: string;
}) {
  const db = drizzle(neon(process.env.DATABASE_URL!));

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, params.userId));

  if (subs.length === 0) return;

  const payload = JSON.stringify({
    title: params.title,
    body: params.body,
    url: params.url || "/explore",
  });

  // TODO: Replace this with actual web-push delivery.
  // Example with web-push package:
  //
  // for (const sub of subs) {
  //   try {
  //     await webpush.sendNotification(
  //       {
  //         endpoint: sub.endpoint,
  //         keys: { p256dh: sub.p256dh, auth: sub.auth },
  //       },
  //       payload
  //     );
  //   } catch (error: any) {
  //     // 410 Gone = subscription expired, clean it up
  //     if (error.statusCode === 410) {
  //       await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
  //     }
  //     console.error("Push send failed:", error);
  //   }
  // }

  console.log(
    `[Push] Would send to ${subs.length} subscription(s) for user ${params.userId}:`,
    payload
  );
}
