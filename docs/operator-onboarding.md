# Operator onboarding: deployment and operations

VakayGo remains a directory until a listing has verified business ownership, complete onboarding, current provider approval, and explicit activation. Requests, free reservations, booking offers, and payments all require the same gate. An existing account, an approved legacy claim, or a Stripe return URL does not establish eligibility.

The directory-only production release is separate from this onboarding implementation. Do not enable bookings merely because the code or migrations have deployed. Migrations `0006`, `0007`, and `0008` have already been applied to staging and are immutable; corrections require a new migration.

## Country scope

The owner confirmed Canada as VakayGo’s registered country and wants all 21 listed Caribbean destinations, with worldwide expansion later. Worldwide business intake does not approve worldwide payments. Follow the [Caribbean payout setup brief](caribbean-payout-setup.md) for the actual inventory, territory exceptions, provider evaluation and unsent enquiry. Keep both provider country allowlists empty until the exact platform, funds flow and operator route are approved.

## Configuration and release order

1. Keep `BOOKINGS_ENABLED=false` and the database `feature_flags` key `booking_launch_enabled` false throughout deployment and initial verification. Neither defaults to enabled. Preserve both controls for an operational pause.
2. Review the migration journal and apply pending migrations in order to an isolated database first, then to the intended release database before its new runtime. Use `npm run db:migrate`, never `db:push`. The final runtime also requires `0008_secure_account_bootstrap`; verify its deployment explicitly. Keep a restore point and preserve historical financial records.
3. Configure a distinct `AUTH_SECRET`, `DATABASE_URL`, and exact HTTPS `NEXT_PUBLIC_APP_URL` for each hosted environment. Set the origin before building. If `APP_URL` overrides Connect return URLs, use that same origin. Request headers are not a trusted return origin.
4. Use the dedicated VakayGo Stripe platform. Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the actual `STRIPE_PLATFORM_ACCOUNT_ID`. A sandbox has its own account ID: do not substitute its parent live business ID. The key mode, retrieved platform identity, application configuration, and database configuration must agree. Preview uses test credentials only.
5. Populate the singleton `booking_provider_config` row (`id=true`) with the reviewed `environment` (`test` or `live`), `platform_account_id`, and JSON `allowed_countries` array. Its default null values and empty array keep bookings closed. Set `STRIPE_CONNECT_COUNTRIES` to the exact same set of uppercase two-letter country codes. Choose only countries supported and approved for this actual platform and mode; never change a business's real country to pass a check.
6. Configure `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and a dedicated `TWILIO_VERIFY_SERVICE_SID` for claim proof. Configure verified-email delivery through `RESEND_API_KEY`. Ordinary SMS sender configuration or a user-phone check does not prove business ownership.
7. Configure `CRON_SECRET`, register the scheduled workers below, and configure signed Stripe events. Complete the release evidence and terms review before deliberately enabling both launch controls. A listing still requires its own final activation; enabling the global controls cannot activate an incomplete listing.

The old production Stripe credentials belonged to another business. Review and close its outstanding hosted payment links while the original account remains accessible, and retain historical charge/refund references. One global Stripe client cannot reconcile two platform accounts at once. Pause bookings before a platform/key transition; never silently route new charges through a fallback platform account.

## Claim and onboarding evidence

The operator starts at `/operator/claim/[listingId]` with a currently authenticated, email-verified operator account. The claim challenge uses SMS or voice to an independently trusted business contact. Migration `0006` seeds eligible contact evidence from the original unclaimed Google Places listing, with a normalized E.164 phone and source reference. Operator-editable listing text, a phone supplied by the claimant, and legacy approval flags are not evidence.

Twilio Verify must approve the exact trusted phone through the configured account and service. Challenges expire after ten minutes, have bounded starts and attempts, and cannot be consumed by competing claimants. The verified provider evidence and ownership transfer are persisted transactionally. If there is no trusted contact, the number is ambiguous, or ownership has changed, keep the listing closed for support review; do not bypass the proof by editing approval or onboarding flags.

The canonical `listing_onboarding` row must bind the verified claim, current operator, and connected Stripe account. The operator completes real business details, accepts the versioned terms, publishes a valid listing and calendar, completes Stripe onboarding, and explicitly activates bookings. Listing setup requires a positive price and capacity, valid currency and pricing unit, cancellation policy, and usable date/notice rules. Every occupied booking date needs an explicit, unblocked calendar row with positive capacity; missing dates are unavailable. Calendar management remains available to its owner while public bookings are closed.

Provider approval requires the exact connected account and operator/listing metadata, matching country and platform/mode, submitted details, enabled charges and payouts, active card-payment and transfer capabilities, and no provider restriction. Readiness expires after fifteen minutes. Booking creation, acceptance, and checkout refresh provider state; returning from Stripe alone never enables a listing. A revoked or negatively reviewed account loses activation and cannot regain it from an old in-flight refresh.

## Terms are still a draft

`/operator/onboarding/terms` presents version `2026-09-06` as a draft awaiting business and legal review. Recorded draft acceptance does not authorize launch. Review the operating entity, permitted countries, fees, cancellation/refund responsibilities, and provider arrangements before offering bookings.

A material final revision needs a new terms version and renewed acceptance. Update the application constant, page, tests, and the database's required version through a new forward migration; do not edit applied `0006` or erase earlier acceptance and booking-policy snapshots.

## Workers, events, and pausing

All four workers below run every five minutes in `vercel.json` and require `Authorization: Bearer CRON_SECRET`. Confirm scheduler delivery in the deployed environment; a local mock or a configured schedule is not evidence that the worker ran.

| Worker | Responsibility | Investigate |
|---|---|---|
| `/api/cron/onboarding-readiness` | Refresh up to 50 activated provider accounts per run. Stale readiness closes the gate after 15 minutes. | Refresh failures, oldest check age approaching expiry, sustained backlog. |
| `/api/cron/checkout-safety` | Independently retry closure of persisted unpaid hosted links for ineligible, changed, or cancelled bookings, even while the global launch switch is off. | `failed > 0`, HTTP 503, or old open links. A missing/mismatched platform identity blocks expiry and must be corrected. |
| `/api/cron/booking-refunds` | Retry canonical cancellations and the separate rejected-payment refund ledger. | Pending age and `needsReview > 0`; failed/canceled refunds require support review. |
| `/api/cron/booking-mail` | Deliver the durable outbox with retry and stale-message checks. | Undelivered queue age, repeated attempts, sender/provider failures. |

The signed Stripe endpoint needs `account.updated`, `account.application.deauthorized`, `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`, `refund.created`, `refund.updated`, and `refund.failed`. Verify that connected-account events reach the endpoint with the intended signing secret. Account changes invalidate cached readiness before retrieving current provider state; deauthorization records durable revocation.

To pause, turn off both launch controls and keep checkout-safety, refunds, mail, and the correct provider credentials available. Existing links are expired only after verifying the actual platform and matching session metadata. Expiry failures remain retryable independently of activation. Checkout closure updates only the same session's closure marker; it cannot fabricate payment or overwrite a replacement link. Historical cancellations and refunds remain available. A paid event rejected by the final eligibility/date/identity checks goes to the durable rejected-payment refund flow instead of confirming a booking.

## Verification before launch

Run the repository's typecheck, lint baseline, translation check, unit/regression suites, isolated PostgreSQL integrity/concurrency/onboarding/account-bootstrap tests, production build, and browser checks against the exact release head. Focused coverage includes `tests/regression/business-onboarding.cjs`, `tests/regression/booking-eligibility.cjs`, `tests/regression/checkout-safety.cjs`, `tests/sql/onboarding-eligibility.sql`, `tests/sql/account-bootstrap.sql`, and `tests/e2e/booking-eligibility.spec.ts`.

Collect separate sandbox evidence using synthetic operators and listings: trusted-contact claim approval and replay/rate limits; competing claims; incorrect platform/mode/country; incomplete or stale provider requirements; terms/setup omissions; every occupied date and simultaneous capacity use; request acceptance and Checkout reuse; revocation with existing links; expiry failure followed by successful retry, including global pause; replaced-session races; duplicate, late, or mismatched paid events; and pending/failed refund recovery. Confirm information-only public cards, detail pages, calendar, AI, and direct APIs throughout each ineligible state.

Mocked and SQL checks establish application behavior, not live Stripe or Twilio readiness. Record the actual sandbox lifecycle result before launch; do not use real customer messages, charges, or refunds as smoke tests. The original audit's [refund lifecycle matrix](audit-remediation-2026-09.md#refund-lifecycle-release-checks) remains relevant, but every positive new-booking fixture must first satisfy verified ownership and complete onboarding. Retain the directory-only release until this evidence and the final business review are complete.
