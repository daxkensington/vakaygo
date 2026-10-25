import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { recordNudgeOptOut, verifyNudgeStopToken } from "@/server/onboarding-nudges";

export const dynamic = "force-dynamic";

/**
 * "Stop setup reminders" link from onboarding nudge emails.
 *
 * GET shows a confirmation with one button; POST records the opt-out. Mail
 * scanners and link previews follow GET, so a GET alone never changes state.
 */

function esc(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function page(title: string, message: string, options: { status?: number; token?: string } = {}) {
  const form = options.token
    ? `<form method="post" style="margin:0 0 16px"><input type="hidden" name="token" value="${esc(options.token)}">
         <button type="submit" style="background:#C8912E;color:#FFFFFF;border:0;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer">Stop setup reminders</button></form>`
    : "";
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(title)} | VakayGo</title></head>
<body style="margin:0;padding:48px 20px;background:#FEFCF7;font-family:'Helvetica Neue',Arial,sans-serif;color:#1C2333;text-align:center">
  <div style="max-width:480px;margin:0 auto;background:#FFFFFF;border:1px solid #EDE5D5;border-radius:20px;padding:36px 28px;box-shadow:0 2px 12px rgba(28,35,51,0.06)">
    <div style="font-size:24px;font-weight:bold;margin-bottom:16px">Vakay<span style="color:#C8912E">Go</span></div>
    <h1 style="font-size:20px;margin:0 0 12px">${esc(title)}</h1>
    <p style="font-size:15px;line-height:1.6;color:#4A4F73;margin:0 0 24px">${esc(message)}</p>
    ${form}
    <a href="/operator" style="display:inline-block;background:#1C2333;color:#FFFFFF;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:600">Open your dashboard</a>
  </div>
</body></html>`;
  return new NextResponse(html, { status: options.status ?? 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

const INVALID = page("This link is not valid", "The reminder link is incomplete or has changed. Reply to any VakayGo setup email and we will stop the reminders for you.", { status: 400 });

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") || "";
  if (!verifyNudgeStopToken(token)) return INVALID;
  return page("Stop setup reminders?", "You will no longer receive emails about finishing your listing setup. You can still finish any step from your dashboard whenever you like.", { token });
}

export async function POST(request: NextRequest) {
  let token = "";
  try {
    const form = await request.formData();
    token = String(form.get("token") || "");
  } catch {
    return INVALID;
  }
  const operatorId = verifyNudgeStopToken(token);
  if (!operatorId) return INVALID;
  try {
    await recordNudgeOptOut(operatorId);
    return page("Reminders stopped", "We will not email you about listing setup again. Your listing and your account are unchanged.");
  } catch (error) {
    logger.error("Onboarding nudge opt-out failed", { error });
    return page("Something went wrong", "We could not save your preference just now. Please try the link again in a few minutes or reply to the email.", { status: 503 });
  }
}
