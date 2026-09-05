import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { Resend } from "resend";
import { CANCELLATION_POLICIES, cancellationPolicyKey } from "@/lib/cancellation";
import { formatBookingDateTime } from "@/lib/booking-time";
import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== "Bearer "+process.env.CRON_SECRET) return NextResponse.json({error:"Unauthorized"},{status:401});
  if (!process.env.RESEND_API_KEY) return NextResponse.json({error:"Email is not configured"},{status:503});
  const q = neon(process.env.DATABASE_URL!);
  const resend = new Resend(process.env.RESEND_API_KEY);
  const jobs = await q`UPDATE booking_mail_outbox SET locked_until=now()+interval '5 minutes', attempts=attempts+1 WHERE id IN
    (SELECT id FROM booking_mail_outbox WHERE delivered_at IS NULL AND available_at<=now() AND (locked_until IS NULL OR locked_until<now()) ORDER BY created_at LIMIT 20 FOR UPDATE SKIP LOCKED) RETURNING *`;
  let delivered=0, failed=0;
  for (const job of jobs) {
    try {
      const [b] = await q`SELECT b.*, l.title, l.type_data, u.email, u.name, u.phone, o.email AS operator_email
        FROM bookings b JOIN listings l ON l.id=b.listing_id JOIN users u ON u.id=b.traveler_id JOIN users o ON o.id=b.operator_id WHERE b.id=${job.booking_id}`;
      if (!b) throw new Error("Booking missing from outbox");
      const stale = (job.kind === "received" && b.status !== "pending") || (job.kind === "confirmed" && !["confirmed","completed"].includes(b.status));
      const recipient = job.recipient === "team" ? "bookings@vakaygo.com" : job.recipient === "operator" ? b.operator_email : b.email;
      if (!stale && !(job.recipient === "operator" && recipient.includes("unclaimed"))) {
        const request = ["requested","request_confirmed"].includes(job.kind);
        const heading = job.kind === "requested" ? "Request received — nothing confirmed or charged" : job.kind === "request_confirmed" ? "Business confirmed your request — arrange price and payment with the business" : job.kind === "confirmed" ? "Booking confirmed" : job.kind === "received" ? "Booking received — complete payment" : "Booking "+job.kind;
        const text = [heading, b.title, "Reference: "+b.booking_number, "When: "+formatBookingDateTime(b.start_date), "Guests: "+b.guest_count,
          request ? "VakayGo does not collect payment for this request." : "Booking total: "+b.total_amount+" "+b.currency,
          !request ? CANCELLATION_POLICIES[cancellationPolicyKey(b.cancellation_policy_snapshot)].summary : "",
          job.recipient === "team" ? "Traveler: "+b.name+" / "+b.email+" / "+(b.phone||"")+"\nNotes: "+(b.guest_notes||"")+"\nBusiness phone: "+(b.type_data?.phone||"") : "",
          b.cancellation_reason || "", "Manage your booking: https://vakaygo.com/bookings",
          "Reply to this email for help."].filter(Boolean).join("\n\n");
        const result = await resend.emails.send({from:"VakayGo <hello@vakaygo.com>",to:recipient,replyTo:"bookings@vakaygo.com",subject:heading+" — "+b.title,text},{idempotencyKey:"booking-mail-"+job.id});
        if (result.error) throw new Error(result.error.message);
      }
      await q`UPDATE booking_mail_outbox SET delivered_at=now(),locked_until=NULL WHERE id=${job.id}`;
      delivered++;
    } catch(error) {
      failed++;
      logger.error("Booking email remains queued",{jobId:job.id,error});
      await q`UPDATE booking_mail_outbox SET locked_until=NULL, available_at=now()+interval '10 minutes' WHERE id=${job.id}`;
    }
  }
  return NextResponse.json({delivered,failed});
}
