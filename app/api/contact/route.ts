import { NextResponse } from "next/server";
import { Resend } from "resend";

import { logger } from "@/lib/logger";
// Key comes only from the environment — never hardcode secrets in source.
const resend = new Resend(process.env.RESEND_API_KEY || "");

const FROM = "VakayGo <hello@vakaygo.com>";

const VALID_CATEGORIES = [
  "General",
  "Booking Help",
  "Operator Support",
  "Technical Issue",
  "Partnership",
  "Other",
] as const;

/** Escape user input before interpolating into the notification email HTML. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function POST(request: Request) {
  try {
    const { name, email, category, subject, message } = await request.json();

    // Validate all fields
    if (!name || !email || !category || !subject || !message) {
      return NextResponse.json(
        { error: "All fields are required" },
        { status: 400 }
      );
    }

    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Please provide a valid email address" },
        { status: 400 }
      );
    }

    if (!VALID_CATEGORIES.includes(category)) {
      return NextResponse.json(
        { error: "Invalid category" },
        { status: 400 }
      );
    }

    // Length caps — prevent oversized payloads / abuse.
    if (
      typeof name !== "string" || name.length > 120 ||
      typeof subject !== "string" || subject.length > 200 ||
      typeof message !== "string" || message.length > 5000 ||
      email.length > 320
    ) {
      return NextResponse.json(
        { error: "One or more fields are too long" },
        { status: 400 }
      );
    }

    const eName = escapeHtml(name);
    const eEmail = escapeHtml(email);
    const eCategory = escapeHtml(category);
    const eSubject = escapeHtml(subject);
    const eMessage = escapeHtml(message);

    // Send the support notification to VakayGo only. We deliberately do NOT
    // send a "confirmation" email back to the submitter: this endpoint is
    // unauthenticated, so doing so would turn it into an open email relay
    // (spam amplification) to any attacker-chosen address.
    await resend.emails.send({
      from: FROM,
      to: "hello@vakaygo.com",
      replyTo: email,
      subject: `[${eCategory}] ${eSubject}`,
      html: `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FEFCF7;font-family:'Helvetica Neue',Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:40px 24px">
  <div style="text-align:center;margin-bottom:24px">
    <span style="font-size:24px;font-weight:bold;color:#1C2333">Vakay<span style="color:#C8912E">Go</span></span>
  </div>
  <div style="background:#1C2333;border-radius:16px;padding:32px;text-align:center;margin-bottom:24px">
    <p style="color:#C8912E;font-size:14px;margin:0 0 8px">${eCategory}</p>
    <h1 style="color:white;font-size:22px;margin:0">${eSubject}</h1>
  </div>
  <div style="background:white;border-radius:16px;padding:24px;box-shadow:0 2px 12px rgba(28,35,51,0.08)">
    <div style="background:#F5EDD8;border-radius:12px;padding:16px;margin-bottom:16px">
      <table style="width:100%;font-size:14px;color:#4A4F73">
        <tr><td style="padding:4px 0;font-weight:600;color:#1C2333">From</td><td style="text-align:right">${eName}</td></tr>
        <tr><td style="padding:4px 0;font-weight:600;color:#1C2333">Email</td><td style="text-align:right">${eEmail}</td></tr>
        <tr><td style="padding:4px 0;font-weight:600;color:#1C2333">Category</td><td style="text-align:right">${eCategory}</td></tr>
      </table>
    </div>
    <p style="color:#1C2333;font-weight:600;margin:0 0 8px">Message:</p>
    <p style="color:#4A4F73;margin:0;line-height:1.6;white-space:pre-wrap">${eMessage}</p>
  </div>
  <p style="text-align:center;color:#9A9DB0;font-size:11px;margin-top:24px">VakayGo Support · <a href="https://vakaygo.com" style="color:#C8912E">vakaygo.com</a></p>
</div>
</body></html>`.trim(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Contact form error", error);
    return NextResponse.json(
      { error: "Failed to send message. Please try again." },
      { status: 500 }
    );
  }
}
