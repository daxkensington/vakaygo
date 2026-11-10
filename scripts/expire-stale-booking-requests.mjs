/**
 * One-off: close booking REQUESTS whose requested date has already passed.
 *
 * Until November 2026 nothing closed an unanswered request, so requests made in
 * August and September 2026 for dates long gone still read "Request sent". The
 * traveler's bookings page now labels them "Not confirmed" on its own; this
 * script (or the cron, once the feature flag `booking_request_expiry_enabled`
 * is on) records that in the database.
 *
 *   DATABASE_URL=... node scripts/expire-stale-booking-requests.mjs            # dry run (default)
 *   DATABASE_URL=... node scripts/expire-stale-booking-requests.mjs --apply    # write
 *
 * The dry run only reads. It prints booking numbers, dates and listing titles,
 * never a traveler's name or email.
 *
 * --apply sets status='cancelled' with the reason below on every unpaid
 * `requested` booking whose start date is in the past. That status change makes
 * the database queue a cancellation email to each traveler (booking_mail_outbox),
 * which the booking-mail cron then sends, so review the dry run and the email
 * wording before applying. Requests for future dates are left alone.
 *
 * The rule and the reason text mirror lib/booking-request-expiry.ts
 * (tests/unit/booking-request-expiry.test.ts keeps them in step).
 */
import { neon } from "@neondatabase/serverless";

const APPLY = process.argv.includes("--apply");
const REASON = "Request expired — the business did not confirm before the requested date";

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const sql = neon(DATABASE_URL);

const rows = await sql.query(
  `SELECT b.id, b.booking_number, b.start_date, b.created_at, b.guest_count, l.title, i.slug AS island,
          (b.start_date <= now()) AS past
     FROM bookings b
     JOIN listings l ON l.id = b.listing_id
     JOIN islands i ON i.id = l.island_id
    WHERE b.status = 'requested' AND b.paid_at IS NULL
    ORDER BY b.start_date`
);

const past = rows.filter((row) => row.past);
const future = rows.filter((row) => !row.past);
const day = (value) => new Date(value).toISOString().slice(0, 10);

console.log(`${rows.length} unpaid requests: ${past.length} past-dated (would be closed), ${future.length} still in the future (left alone).`);
for (const row of past) {
  console.log(`  close  #${row.booking_number}  date ${day(row.start_date)}  requested ${day(row.created_at)}  ${row.guest_count} guest(s)  ${row.island}: ${row.title}`);
}
for (const row of future) {
  console.log(`  keep   #${row.booking_number}  date ${day(row.start_date)}  requested ${day(row.created_at)}  ${row.guest_count} guest(s)  ${row.island}: ${row.title}`);
}

if (!APPLY) {
  console.log("\nDry run: nothing was changed. Re-run with --apply to close the past-dated requests.");
  process.exit(0);
}

let closed = 0;
for (const row of past) {
  // Compare-and-set: a request answered or paid since the read is left alone.
  const updated = await sql.query(
    `UPDATE bookings SET status = 'cancelled', cancellation_reason = $2, updated_at = now()
      WHERE id = $1::uuid AND status = 'requested' AND paid_at IS NULL AND start_date <= now()
      RETURNING id`,
    [row.id, REASON]
  );
  if (updated.length) closed += 1;
}
console.log(`\nClosed ${closed} of ${past.length} past-dated requests. Each traveler has a cancellation email queued.`);
