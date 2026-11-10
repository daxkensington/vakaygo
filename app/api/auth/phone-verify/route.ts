import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import twilio from "twilio";
import { verifyCurrentSessionToken } from "@/server/session-validation";
import { PhoneVerificationError, UNSUPPORTED_SMS_DESTINATION, consumePhoneCode, finishPhoneSend, phoneStatus, reservePhoneCode, validPhone, type PhoneActor } from "@/server/phone-verification";
import { isAllowedSmsDestination } from "@/lib/phone-destinations";
import { budgetCaller, budgetRefusal, consumeUsageBudget } from "@/server/usage-budget";
import { logger } from "@/lib/logger";

const headers = { "Cache-Control": "private, no-store" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
async function actor(): Promise<PhoneActor> {
  const token = (await cookies()).get("session")?.value;
  const session = token ? await verifyCurrentSessionToken(token) : null;
  if (!session || session.sessionVersion === undefined) throw new PhoneVerificationError("Unauthorized", 401);
  return { ...session, sessionVersion: session.sessionVersion };
}
function failure(error: unknown) {
  if (error instanceof PhoneVerificationError) return json({ error: error.message }, error.status);
  logger.error("Phone verification unavailable");
  return json({ error: "Phone verification is temporarily unavailable. Please try again." }, 503);
}
function fence(value: unknown, current: PhoneActor) {
  if (value !== undefined && value !== null && value !== current.userId) throw new PhoneVerificationError("Your account changed. Reload before continuing.", 409);
}
async function body(request: Request) {
  const value = await request.json().catch(() => null);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PhoneVerificationError("Invalid verification request.");
  return value as Record<string, unknown>;
}
export async function GET(request?: Request) {
  try {
    const current = await actor();
    if (request) fence(new URL(request.url).searchParams.get("expectedUserId"), current);
    return json(await phoneStatus(current));
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const current = await actor(), data = await body(request);
    fence(data.expectedUserId, current);
    if (!validPhone(data.phone)) throw new PhoneVerificationError("Enter a phone number in international format, for example +14735551234.");
    if (!isAllowedSmsDestination(data.phone)) throw new PhoneVerificationError(UNSUPPORTED_SMS_DESTINATION);
    const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: auth, TWILIO_PHONE_NUMBER: from } = process.env;
    if (!sid || !auth || !from) return json({ error: "SMS service unavailable" }, 503);
    const challenge = await reservePhoneCode(current, data.phone);
    // Counted only for a text that is about to be sent: a daily limit per account
    // and a site-wide ceiling, shared by every instance (lib/usage-budget-policy.ts).
    const budget = await consumeUsageBudget("phone_sms", budgetCaller(request, current.userId));
    if (!budget.allowed) {
      await finishPhoneSend(current, challenge.id, false).catch(() => {});
      return budgetRefusal("phone_sms", budget);
    }
    try {
      await twilio(sid, auth, { timeout: 10_000, autoRetry: false }).messages.create({ body: `Your VakayGo verification code is: ${challenge.code}. It expires in 5 minutes.`, from, to: data.phone });
    } catch {
      await finishPhoneSend(current, challenge.id, false).catch(() => {});
      return json({ error: "Could not send the verification code. Please try again later." }, 503);
    }
    await finishPhoneSend(current, challenge.id, true);
    return json({ sent: true, userId: current.userId });
  } catch (error) { return failure(error); }
}
export async function PUT(request: Request) {
  try {
    const current = await actor(), data = await body(request);
    fence(data.expectedUserId, current);
    return json(await consumePhoneCode(current, data.code as string, data.phone));
  } catch (error) { return failure(error); }
}
