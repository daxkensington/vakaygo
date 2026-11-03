import { NextResponse } from "next/server";
import { sendEmail } from "@/server/mail-client";

import { logger } from "@/lib/logger";
// Key comes only from the environment — never hardcode secrets in source.


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
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Please provide valid contact details" }, { status: 400 });
  }
  const fields = body as Record<string, unknown>;
  if (["name", "email", "category", "subject", "message"].some(key => typeof fields[key] !== "string")) {
    return NextResponse.json({ error: "Please provide valid contact details" }, { status: 400 });
  }
  if ((fields.name as string).length > 120 || (fields.email as string).length > 320 || (fields.category as string).length > 80 ||
    (fields.subject as string).length > 200 || (fields.message as string).length > 5000) {
    return NextResponse.json({ error: "One or more fields are too long" }, { status: 400 });
  }
  const name = (fields.name as string).trim();
  const email = (fields.email as string).trim();
  const category = (fields.category as string).trim();
  const subject = (fields.subject as string).trim();
  const message = (fields.message as string).trim();

  try {
    // Validate all fields
    if (!name || !email || !category || !subject || !message) {
      return NextResponse.json(
        { error: "All fields are required" },
        { status: 400 }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Please provide a valid email address" },
        { status: 400 }
      );
    }

    if (!VALID_CATEGORIES.some(value => value === category)) {
      return NextResponse.json(
        { error: "Invalid category" },
        { status: 400 }
      );
    }

    const eName = escapeHtml(name);
    const eEmail = escapeHtml(email);
    const eCategory = escapeHtml(category);
    const eSubject = escapeHtml(subject);
    const eMessage = escapeHtml(message);

    await sendEmail({
      from: FROM,
      to: "bookings@vakaygo.com",
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

    // Send a safe, static category-aware auto-reply to real domains (never echoing
    // untrusted subject/message text so it cannot be abused for spam content relay).
    const lowerEmail = email.toLowerCase();
    const isSyntheticTestAddress = lowerEmail.endsWith(".invalid") || lowerEmail.endsWith(".example");
    if (!isSyntheticTestAddress) {
      const isBusinessInquiry =
        category === "Partnership" ||
        category === "Operator Support" ||
        /\b(claim|listing|business|operator|partner|charter|tour|hotel|villa|restaurant|rental|add our|get listed)\b/i.test(
          `${subject} ${message}`
        );

      const autoReplyHtml = isBusinessInquiry
        ? `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FEFCF7;font-family:'Helvetica Neue',Arial,sans-serif;color:#1C2333">
<div style="max-width:560px;margin:0 auto;padding:36px 22px">
  <div style="text-align:center;margin-bottom:24px">
    <span style="font-size:24px;font-weight:bold;color:#1C2333">Vakay<span style="color:#C8912E">Go</span></span>
  </div>
  <div style="background:#1C2333;border-radius:16px;padding:28px 24px;text-align:center;margin-bottom:24px">
    <p style="color:#E8B84B;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin:0 0 8px">Business Directory</p>
    <h1 style="color:#FFFFFF;font-size:21px;margin:0">We received your business inquiry</h1>
  </div>
  <div style="background:#FFFFFF;border-radius:16px;padding:26px 24px;border:1px solid #EDE5D5">
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6">Hi there,</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3A405A">
      Thank you for reaching out to VakayGo! Our partner team has received your message and will follow up shortly.
      In the meantime, you can claim an existing directory page or create a brand-new business listing right away:
    </p>
    <div style="background:#FAF5E8;border-radius:12px;padding:18px;margin:18px 0">
      <p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#1C2333">Fastest ways to get started (100% free):</p>
      <ol style="margin:0;padding-left:18px;font-size:13.5px;line-height:1.7;color:#3A405A">
        <li><strong>Already in our directory?</strong> Search and claim your listing at <a href="https://vakaygo.com/for-businesses" style="color:#C8912E;font-weight:600">vakaygo.com/for-businesses</a>.</li>
        <li><strong>New business not listed yet?</strong> Create your free operator account and add your listing directly at <a href="https://vakaygo.com/auth/signup?role=operator&next=/operator/listings/new" style="color:#C8912E;font-weight:600">vakaygo.com/operator/listings/new</a>.</li>
        <li><strong>Booking setup:</strong> Claiming a listing is free. Bookings and payouts require completed business setup, an approved payment route, and listing activation.</li>
      </ol>
    </div>
    <p style="margin:16px 0 0;font-size:13.5px;line-height:1.6;color:#6E7491">
      Need help verifying ownership or updating a phone number on file? Just reply to this email with your business name, island, and official website, and our team will take care of it for you.
    </p>
  </div>
  <p style="text-align:center;color:#9A9DB0;font-size:11px;margin-top:22px">VakayGo Partner Support · <a href="https://vakaygo.com/for-businesses" style="color:#C8912E">vakaygo.com/for-businesses</a></p>
</div>
</body></html>`
        : `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FEFCF7;font-family:'Helvetica Neue',Arial,sans-serif;color:#1C2333">
<div style="max-width:560px;margin:0 auto;padding:36px 22px">
  <div style="text-align:center;margin-bottom:24px">
    <span style="font-size:24px;font-weight:bold;color:#1C2333">Vakay<span style="color:#C8912E">Go</span></span>
  </div>
  <div style="background:#1C2333;border-radius:16px;padding:28px 24px;text-align:center;margin-bottom:24px">
    <p style="color:#E8B84B;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin:0 0 8px">Support Confirmation</p>
    <h1 style="color:#FFFFFF;font-size:21px;margin:0">We received your message</h1>
  </div>
  <div style="background:#FFFFFF;border-radius:16px;padding:26px 24px;border:1px solid #EDE5D5">
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6">Hi there,</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3A405A">
      Thanks for contacting VakayGo (${eCategory}). Our team has received your inquiry and will reply by email as soon as possible.
    </p>
    <div style="background:#FAF5E8;border-radius:12px;padding:16px;margin:18px 0;font-size:13.5px;line-height:1.65;color:#3A405A">
      <strong>Helpful quick links:</strong>
      <ul style="margin:8px 0 0;padding-left:18px">
        <li>Explore our travel directory: <a href="https://vakaygo.com/explore" style="color:#C8912E">vakaygo.com/explore</a></li>
        <li>Manage your trips &amp; bookings: <a href="https://vakaygo.com/bookings" style="color:#C8912E">vakaygo.com/bookings</a></li>
        <li>Claim or add a business listing: <a href="https://vakaygo.com/for-businesses" style="color:#C8912E">vakaygo.com/for-businesses</a></li>
      </ul>
    </div>
    <p style="margin:0;font-size:13px;color:#6E7491">If you have any additional details to share, simply reply to this email.</p>
  </div>
  <p style="text-align:center;color:#9A9DB0;font-size:11px;margin-top:22px">VakayGo Support · <a href="https://vakaygo.com" style="color:#C8912E">vakaygo.com</a></p>
</div>
</body></html>`;

      await sendEmail({
        from: FROM,
        to: email,
        replyTo: "support@vakaygo.com",
        subject: isBusinessInquiry
          ? "Claiming or Adding Your Business on VakayGo — Next Steps"
          : "We received your message — VakayGo Support",
        html: autoReplyHtml,
      }).catch((autoErr) => {
        logger.error("Contact auto-reply failed", autoErr);
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Contact form error", error);
    return NextResponse.json(
      { error: "Failed to send message. Please try again." },
      { status: 503 }
    );
  }
}
