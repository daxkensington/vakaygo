import { NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(
  process.env.RESEND_API_KEY || "re_9veHwfmR_EfQt6FpKGS8MwUJgJcejmPDz"
);

const FROM = "VakayGo <hello@vakaygo.com>";

const VALID_CATEGORIES = [
  "General",
  "Booking Help",
  "Operator Support",
  "Technical Issue",
  "Partnership",
  "Other",
] as const;

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

    if (typeof email !== "string" || !email.includes("@")) {
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

    // Send support email to VakayGo
    await resend.emails.send({
      from: FROM,
      to: "hello@vakaygo.com",
      replyTo: email,
      subject: `[${category}] ${subject}`,
      html: `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FEFCF7;font-family:'Helvetica Neue',Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:40px 24px">
  <div style="text-align:center;margin-bottom:24px">
    <span style="font-size:24px;font-weight:bold;color:#1C2333">Vakay<span style="color:#C8912E">Go</span></span>
  </div>
  <div style="background:#1C2333;border-radius:16px;padding:32px;text-align:center;margin-bottom:24px">
    <p style="color:#C8912E;font-size:14px;margin:0 0 8px">${category}</p>
    <h1 style="color:white;font-size:22px;margin:0">${subject}</h1>
  </div>
  <div style="background:white;border-radius:16px;padding:24px;box-shadow:0 2px 12px rgba(28,35,51,0.08)">
    <div style="background:#F5EDD8;border-radius:12px;padding:16px;margin-bottom:16px">
      <table style="width:100%;font-size:14px;color:#4A4F73">
        <tr><td style="padding:4px 0;font-weight:600;color:#1C2333">From</td><td style="text-align:right">${name}</td></tr>
        <tr><td style="padding:4px 0;font-weight:600;color:#1C2333">Email</td><td style="text-align:right"><a href="mailto:${email}" style="color:#C8912E">${email}</a></td></tr>
        <tr><td style="padding:4px 0;font-weight:600;color:#1C2333">Category</td><td style="text-align:right">${category}</td></tr>
      </table>
    </div>
    <p style="color:#1C2333;font-weight:600;margin:0 0 8px">Message:</p>
    <p style="color:#4A4F73;margin:0;line-height:1.6;white-space:pre-wrap">${message}</p>
  </div>
  <p style="text-align:center;color:#9A9DB0;font-size:11px;margin-top:24px">VakayGo Support · <a href="https://vakaygo.com" style="color:#C8912E">vakaygo.com</a></p>
</div>
</body></html>`.trim(),
    });

    // Send confirmation email to submitter
    await resend.emails.send({
      from: FROM,
      to: email,
      subject: `We received your message — ${subject}`,
      html: `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FEFCF7;font-family:'Helvetica Neue',Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:40px 24px">
  <div style="text-align:center;margin-bottom:24px">
    <span style="font-size:24px;font-weight:bold;color:#1C2333">Vakay<span style="color:#C8912E">Go</span></span>
  </div>
  <div style="background:linear-gradient(135deg,#1A6B6A,#1C2333);border-radius:16px;padding:32px;text-align:center;margin-bottom:24px">
    <p style="font-size:32px;margin:0 0 8px">&#x2709;</p>
    <h1 style="color:white;font-size:22px;margin:0">Message Received!</h1>
  </div>
  <div style="background:white;border-radius:16px;padding:24px;box-shadow:0 2px 12px rgba(28,35,51,0.08)">
    <p style="color:#1C2333;margin:0 0 16px">Hi ${name},</p>
    <p style="color:#4A4F73;margin:0 0 16px;line-height:1.6">Thanks for reaching out! We've received your message and our team will get back to you within <strong>24 hours</strong>.</p>
    <div style="background:#F5EDD8;border-radius:12px;padding:16px;margin-bottom:16px">
      <p style="color:#1C2333;font-weight:600;font-size:14px;margin:0 0 8px">Your message summary:</p>
      <p style="color:#4A4F73;font-size:14px;margin:0"><strong>Subject:</strong> ${subject}</p>
      <p style="color:#4A4F73;font-size:14px;margin:4px 0 0"><strong>Category:</strong> ${category}</p>
    </div>
    <p style="color:#9A9DB0;font-size:12px;margin:16px 0 0;line-height:1.5">In the meantime, you might find answers in our <a href="https://vakaygo.com/faq" style="color:#C8912E">FAQ section</a>. Please don't reply to this email directly.</p>
  </div>
  <p style="text-align:center;color:#9A9DB0;font-size:11px;margin-top:24px">VakayGo · Caribbean Travel Platform · <a href="https://vakaygo.com" style="color:#C8912E">vakaygo.com</a></p>
</div>
</body></html>`.trim(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Contact form error:", error);
    return NextResponse.json(
      { error: "Failed to send message. Please try again." },
      { status: 500 }
    );
  }
}
