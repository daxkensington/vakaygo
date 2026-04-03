import { Resend } from "resend";

const resend = new Resend(
  process.env.RESEND_API_KEY || "re_9veHwfmR_EfQt6FpKGS8MwUJgJcejmPDz"
);

const FROM = "VakayGo <hello@vakaygo.com>";

export async function sendBookingConfirmation(params: {
  to: string;
  travelerName: string;
  bookingNumber: string;
  listingTitle: string;
  startDate: string;
  guestCount: number;
  totalAmount: string;
}) {
  const { to, travelerName, bookingNumber, listingTitle, startDate, guestCount, totalAmount } = params;

  await resend.emails.send({
    from: FROM,
    to,
    subject: `Booking Confirmed — ${listingTitle}`,
    html: `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FEFCF7;font-family:'Helvetica Neue',Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:40px 24px">
  <div style="text-align:center;margin-bottom:24px">
    <span style="font-size:24px;font-weight:bold;color:#1C2333">Vakay<span style="color:#C8912E">Go</span></span>
  </div>
  <div style="background:#1A6B6A;border-radius:16px;padding:32px;text-align:center;margin-bottom:24px">
    <p style="color:white;font-size:14px;margin:0 0 8px">Booking Confirmed</p>
    <h1 style="color:white;font-size:22px;margin:0">${listingTitle}</h1>
  </div>
  <div style="background:white;border-radius:16px;padding:24px;box-shadow:0 2px 12px rgba(28,35,51,0.08)">
    <p style="color:#1C2333;margin:0 0 16px">Hi ${travelerName},</p>
    <p style="color:#4A4F73;margin:0 0 16px;line-height:1.6">Your booking has been confirmed! Here are your details:</p>
    <div style="background:#F5EDD8;border-radius:12px;padding:16px;margin-bottom:16px">
      <table style="width:100%;font-size:14px;color:#4A4F73">
        <tr><td style="padding:4px 0;font-weight:600;color:#1C2333">Booking #</td><td style="text-align:right">${bookingNumber}</td></tr>
        <tr><td style="padding:4px 0;font-weight:600;color:#1C2333">Date</td><td style="text-align:right">${new Date(startDate).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</td></tr>
        <tr><td style="padding:4px 0;font-weight:600;color:#1C2333">Guests</td><td style="text-align:right">${guestCount}</td></tr>
        <tr><td style="padding:4px 0;font-weight:600;color:#1C2333">Total</td><td style="text-align:right;color:#1A6B6A;font-weight:700">$${totalAmount}</td></tr>
      </table>
    </div>
    <p style="color:#9A9DB0;font-size:12px;margin:16px 0 0;line-height:1.5">Free cancellation up to 24 hours before your experience. Manage your booking at <a href="https://vakaygo.com/bookings" style="color:#C8912E">vakaygo.com/bookings</a></p>
  </div>
  <p style="text-align:center;color:#9A9DB0;font-size:11px;margin-top:24px">VakayGo · Caribbean Travel Platform · <a href="https://vakaygo.com" style="color:#C8912E">vakaygo.com</a></p>
</div>
</body></html>`.trim(),
  });
}

export async function sendBookingNotificationToOperator(params: {
  to: string;
  operatorName: string;
  bookingNumber: string;
  listingTitle: string;
  travelerName: string;
  startDate: string;
  guestCount: number;
  subtotal: string;
}) {
  const { to, operatorName, bookingNumber, listingTitle, travelerName, startDate, guestCount, subtotal } = params;

  await resend.emails.send({
    from: FROM,
    to,
    subject: `New Booking — ${listingTitle} (#${bookingNumber})`,
    html: `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FEFCF7;font-family:'Helvetica Neue',Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:40px 24px">
  <div style="text-align:center;margin-bottom:24px">
    <span style="font-size:24px;font-weight:bold;color:#1C2333">Vakay<span style="color:#C8912E">Go</span></span>
  </div>
  <div style="background:#C8912E;border-radius:16px;padding:32px;text-align:center;margin-bottom:24px">
    <p style="color:white;font-size:14px;margin:0 0 8px">New Booking Received!</p>
    <h1 style="color:white;font-size:22px;margin:0">${listingTitle}</h1>
  </div>
  <div style="background:white;border-radius:16px;padding:24px;box-shadow:0 2px 12px rgba(28,35,51,0.08)">
    <p style="color:#1C2333;margin:0 0 16px">Hi ${operatorName},</p>
    <p style="color:#4A4F73;margin:0 0 16px;line-height:1.6">Great news — you have a new booking from <strong>${travelerName}</strong>!</p>
    <div style="background:#F5EDD8;border-radius:12px;padding:16px;margin-bottom:16px">
      <table style="width:100%;font-size:14px;color:#4A4F73">
        <tr><td style="padding:4px 0;font-weight:600;color:#1C2333">Booking #</td><td style="text-align:right">${bookingNumber}</td></tr>
        <tr><td style="padding:4px 0;font-weight:600;color:#1C2333">Traveler</td><td style="text-align:right">${travelerName}</td></tr>
        <tr><td style="padding:4px 0;font-weight:600;color:#1C2333">Date</td><td style="text-align:right">${new Date(startDate).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</td></tr>
        <tr><td style="padding:4px 0;font-weight:600;color:#1C2333">Guests</td><td style="text-align:right">${guestCount}</td></tr>
        <tr><td style="padding:4px 0;font-weight:600;color:#1C2333">Your Earnings</td><td style="text-align:right;color:#1A6B6A;font-weight:700">$${subtotal}</td></tr>
      </table>
    </div>
    <div style="text-align:center;margin:24px 0 16px">
      <a href="https://vakaygo.com/operator/bookings" style="display:inline-block;background:#C8912E;color:white;padding:12px 32px;border-radius:12px;font-weight:600;text-decoration:none">View Booking</a>
    </div>
  </div>
  <p style="text-align:center;color:#9A9DB0;font-size:11px;margin-top:24px">VakayGo · Caribbean Travel Platform</p>
</div>
</body></html>`.trim(),
  });
}

export async function sendBookingCancellation(params: {
  to: string;
  travelerName: string;
  bookingNumber: string;
  listingTitle: string;
  reason?: string;
}) {
  const { to, travelerName, bookingNumber, listingTitle, reason } = params;

  await resend.emails.send({
    from: FROM,
    to,
    subject: `Booking Update — ${listingTitle}`,
    html: `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FEFCF7;font-family:'Helvetica Neue',Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:40px 24px">
  <div style="text-align:center;margin-bottom:24px">
    <span style="font-size:24px;font-weight:bold;color:#1C2333">Vakay<span style="color:#C8912E">Go</span></span>
  </div>
  <div style="background:#D94F4F;border-radius:16px;padding:32px;text-align:center;margin-bottom:24px">
    <p style="color:white;font-size:14px;margin:0 0 8px">Booking Update</p>
    <h1 style="color:white;font-size:22px;margin:0">${listingTitle}</h1>
  </div>
  <div style="background:white;border-radius:16px;padding:24px;box-shadow:0 2px 12px rgba(28,35,51,0.08)">
    <p style="color:#1C2333;margin:0 0 16px">Hi ${travelerName},</p>
    <p style="color:#4A4F73;margin:0 0 16px;line-height:1.6">Unfortunately, your booking <strong>#${bookingNumber}</strong> for <strong>${listingTitle}</strong> has been declined by the operator.</p>
    ${reason ? `<p style="color:#4A4F73;margin:0 0 16px;line-height:1.6"><strong>Reason:</strong> ${reason}</p>` : ""}
    <p style="color:#4A4F73;margin:0 0 16px;line-height:1.6">If you were charged, a full refund will be processed automatically. We encourage you to browse other options on VakayGo.</p>
    <div style="text-align:center;margin:24px 0 16px">
      <a href="https://vakaygo.com/explore" style="display:inline-block;background:#C8912E;color:white;padding:12px 32px;border-radius:12px;font-weight:600;text-decoration:none">Explore More</a>
    </div>
  </div>
  <p style="text-align:center;color:#9A9DB0;font-size:11px;margin-top:24px">VakayGo · Caribbean Travel Platform · <a href="https://vakaygo.com" style="color:#C8912E">vakaygo.com</a></p>
</div>
</body></html>`.trim(),
  });
}

export async function sendReviewRequest(params: {
  to: string;
  travelerName: string;
  listingTitle: string;
  listingSlug: string;
  islandSlug: string;
}) {
  const { to, travelerName, listingTitle, listingSlug, islandSlug } = params;

  await resend.emails.send({
    from: FROM,
    to,
    subject: `How was ${listingTitle}?`,
    html: `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FEFCF7;font-family:'Helvetica Neue',Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:40px 24px">
  <div style="text-align:center;margin-bottom:24px">
    <span style="font-size:24px;font-weight:bold;color:#1C2333">Vakay<span style="color:#C8912E">Go</span></span>
  </div>
  <div style="background:white;border-radius:16px;padding:32px;box-shadow:0 2px 12px rgba(28,35,51,0.08);text-align:center">
    <p style="font-size:32px;margin:0 0 16px">⭐</p>
    <h2 style="color:#1C2333;font-size:20px;margin:0 0 8px">How was your experience?</h2>
    <p style="color:#4A4F73;margin:0 0 24px;line-height:1.6">Hi ${travelerName}, we'd love to hear about your time at <strong>${listingTitle}</strong>. Your review helps other travelers and supports local businesses.</p>
    <a href="https://vakaygo.com/${islandSlug}/${listingSlug}" style="display:inline-block;background:#C8912E;color:white;padding:14px 40px;border-radius:12px;font-weight:600;text-decoration:none">Leave a Review</a>
  </div>
  <p style="text-align:center;color:#9A9DB0;font-size:11px;margin-top:24px">VakayGo · Caribbean Travel Platform</p>
</div>
</body></html>`.trim(),
  });
}

export async function sendNewReviewNotification(params: {
  to: string;
  operatorName: string;
  listingTitle: string;
  rating: number;
  travelerName: string;
  comment: string;
}) {
  const { to, operatorName, listingTitle, rating, travelerName, comment } = params;

  const stars = "★".repeat(rating) + "☆".repeat(5 - rating);

  await resend.emails.send({
    from: FROM,
    to,
    subject: `New ${rating}★ Review on ${listingTitle}`,
    html: `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FEFCF7;font-family:'Helvetica Neue',Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:40px 24px">
  <div style="text-align:center;margin-bottom:24px">
    <span style="font-size:24px;font-weight:bold;color:#1C2333">Vakay<span style="color:#C8912E">Go</span></span>
  </div>
  <div style="background:#1A6B6A;border-radius:16px;padding:32px;text-align:center;margin-bottom:24px">
    <p style="color:white;font-size:14px;margin:0 0 8px">New Review</p>
    <h1 style="color:white;font-size:22px;margin:0">${listingTitle}</h1>
  </div>
  <div style="background:white;border-radius:16px;padding:24px;box-shadow:0 2px 12px rgba(28,35,51,0.08)">
    <p style="color:#1C2333;margin:0 0 16px">Hi ${operatorName},</p>
    <p style="color:#4A4F73;margin:0 0 16px;line-height:1.6"><strong>${travelerName}</strong> left a review on <strong>${listingTitle}</strong>:</p>
    <div style="background:#F5EDD8;border-radius:12px;padding:16px;margin-bottom:16px">
      <p style="color:#C8912E;font-size:20px;margin:0 0 8px;letter-spacing:2px">${stars}</p>
      <p style="color:#4A4F73;margin:0;line-height:1.6;font-style:italic">"${comment || "No comment provided."}"</p>
    </div>
    <div style="text-align:center;margin:24px 0 16px">
      <a href="https://vakaygo.com/operator/reviews" style="display:inline-block;background:#C8912E;color:white;padding:12px 32px;border-radius:12px;font-weight:600;text-decoration:none">View & Reply</a>
    </div>
  </div>
  <p style="text-align:center;color:#9A9DB0;font-size:11px;margin-top:24px">VakayGo · Caribbean Travel Platform</p>
</div>
</body></html>`.trim(),
  });
}

export async function sendWelcomeEmail(params: {
  to: string;
  name: string;
}) {
  const { to, name } = params;

  await resend.emails.send({
    from: FROM,
    to,
    subject: "Welcome to VakayGo!",
    html: `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FEFCF7;font-family:'Helvetica Neue',Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:40px 24px">
  <div style="text-align:center;margin-bottom:24px">
    <span style="font-size:24px;font-weight:bold;color:#1C2333">Vakay<span style="color:#C8912E">Go</span></span>
  </div>
  <div style="background:linear-gradient(135deg,#1A6B6A,#1C2333);border-radius:16px;padding:40px 32px;text-align:center;margin-bottom:24px">
    <p style="font-size:36px;margin:0 0 12px">🌴</p>
    <h1 style="color:white;font-size:24px;margin:0">Welcome to VakayGo!</h1>
  </div>
  <div style="background:white;border-radius:16px;padding:24px;box-shadow:0 2px 12px rgba(28,35,51,0.08)">
    <p style="color:#1C2333;margin:0 0 16px">Hi ${name},</p>
    <p style="color:#4A4F73;margin:0 0 16px;line-height:1.6">Thanks for joining VakayGo — the Caribbean travel platform connecting you with the best stays, tours, dining, events, and transport across the islands.</p>
    <p style="color:#4A4F73;margin:0 0 24px;line-height:1.6">Start exploring and book your next island adventure today.</p>
    <div style="text-align:center;margin-bottom:16px">
      <a href="https://vakaygo.com/explore" style="display:inline-block;background:#C8912E;color:white;padding:14px 40px;border-radius:12px;font-weight:600;text-decoration:none">Start Exploring</a>
    </div>
  </div>
  <p style="text-align:center;color:#9A9DB0;font-size:11px;margin-top:24px">VakayGo · Caribbean Travel Platform · <a href="https://vakaygo.com" style="color:#C8912E">vakaygo.com</a></p>
</div>
</body></html>`.trim(),
  });
}

export async function sendVerificationEmail(params: {
  to: string;
  name: string;
  token: string;
}) {
  const { to, name, token } = params;
  const verifyUrl = `https://vakaygo.com/api/auth/verify-email/confirm?token=${token}`;

  await resend.emails.send({
    from: FROM,
    to,
    subject: "Verify your email — VakayGo",
    html: `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FEFCF7;font-family:'Helvetica Neue',Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:40px 24px">
  <div style="text-align:center;margin-bottom:24px">
    <span style="font-size:24px;font-weight:bold;color:#1C2333">Vakay<span style="color:#C8912E">Go</span></span>
  </div>
  <div style="background:linear-gradient(135deg,#1A6B6A,#1C2333);border-radius:16px;padding:40px 32px;text-align:center;margin-bottom:24px">
    <h1 style="color:white;font-size:24px;margin:0">Verify Your Email</h1>
  </div>
  <div style="background:white;border-radius:16px;padding:24px;box-shadow:0 2px 12px rgba(28,35,51,0.08)">
    <p style="color:#1C2333;margin:0 0 16px">Hi ${name},</p>
    <p style="color:#4A4F73;margin:0 0 24px;line-height:1.6">Please verify your email address to unlock all features on VakayGo, including bookings, messaging, and trip planning.</p>
    <div style="text-align:center;margin-bottom:16px">
      <a href="${verifyUrl}" style="display:inline-block;background:#C8912E;color:white;padding:14px 40px;border-radius:12px;font-weight:600;text-decoration:none">Verify Email</a>
    </div>
    <p style="color:#9A9DB0;font-size:12px;margin:16px 0 0;line-height:1.5;text-align:center">This link expires in 24 hours. If you didn't create an account on VakayGo, you can safely ignore this email.</p>
  </div>
  <p style="text-align:center;color:#9A9DB0;font-size:11px;margin-top:24px">VakayGo · Caribbean Travel Platform · <a href="https://vakaygo.com" style="color:#C8912E">vakaygo.com</a></p>
</div>
</body></html>`.trim(),
  });
}
