# Listing invitation campaign

This release replaces the legacy invitation cron with a dedicated, default-paused
campaign. It does not activate bookings, approve claims, create availability,
change prices, or change provider accounts and DNS. All booking and payment paths
remain on VakayGo. Account and booking notification senders are separate.

## Release and activation

1. Review and apply migrations `0012_outreach_delivery_tracking` and
   `0013_outreach_campaign_controls` and `0014_sendcorex_outreach` before deploying this source. The singleton
   control starts paused. Check the actual serving database and migration hashes.
2. Reconcile historical invitation records and provider suppressions before any
   enablement or provider migration. This new ledger does not backfill the old
   mutable outreach notes or treat historical deliveries as current success.
   Import known bounced, complained, unsubscribed and provider-suppressed
   recipients into global suppression; reconcile delayed/unknown outcomes and
   exclude previously contacted recipients. Keep recipient addresses private.
3. Select a provider whose published policy permits the intended recipient basis.
   Resend requires explicit opt-in. No consent is inferred from a public email,
   website, listing, traveler interest or an unrelated inbound inquiry.
4. Configure a verified VakayGo sender, a real sender postal address, stable
   `AUTH_SECRET` (at least 32 characters), `RESEND_API_KEY`, and
   `RESEND_WEBHOOK_SECRET`. `OUTREACH_PROVIDER` defaults to `resend` and
   `OUTREACH_FROM_ADDRESS` defaults to `hello@vakaygo.com`.
5. Configure the enabled provider webhook at
   `https://vakaygo.com/api/webhooks/resend` for sent, delivered, delivery_delayed,
   bounced, complained, failed and suppressed events. Metadata validation checks
   the exact endpoint, event set and signing secret. Validate a signed event
   through the real deployment before enabling; local fixtures do not prove a
   live provider event reached the site.
6. Record the exact current listing recipient and permission evidence in the
   admin outreach panel. Review recipient jurisdiction and required lawful basis.
   Permissions are scoped to listing, address and provider. Revocation and global
   suppression always win; granting permission cannot clear a suppression.
7. Review the fresh health report and deliberately enable the campaign. Changing
   provider resets stage and health; further stages require separate review.

Mailforge and Infraforge policy records can be prepared while paused, including
country and documented policy review. This release has no transport or event
adapter for either provider and cannot enable them. Do not substitute their
credentials into the Resend adapter. Verify branded sender/DNS coexistence,
purchase terms, message identity, delivery evidence and reply routing before
implementing another adapter. Preserve existing inbound mail and website DNS.

### Sendcorex managed B2B transport

`OUTREACH_PROVIDER=sendcorex` selects a separate HTTPS marketing transport.
Sendcorex's published AUP permits unsolicited B2B, including selected public
business sources, subject to applicable law and prompt opt-out handling:
https://sendcorex.com/terms-condition#opt_aup . Record the relevant business,
source, recipient country, lawful basis and dated policy reference using
`business_outreach_permission`. A public address does not establish every
country's legal requirements. Resend still requires explicit opt-in.

Configure server-only `SENDCOREX_API_KEY`, `SENDCOREX_WEBHOOK_SECRET` (at least
32 characters) and `SENDCOREX_WEBHOOK_ID`. The key needs the six evaluation
scopes plus **View Webhooks & Deliveries** for readiness inspection. The existing
six-scope evaluation key has not been expanded or installed in production.
Register `https://vakaygo.com/api/webhooks/sendcorex` for all events, then verify
a real signed event against the deployed receiver before enabling the campaign.
The receiver checks the HMAC-SHA256 of the original body, bounds the payload,
deduplicates events and binds their recipient hash and provider ID to an attempt.
Do not reuse a Resend signing secret or log any API/signing secret.

Readiness requires a verified 2048-bit sender domain and an exact, active,
all-event webhook without failed deliveries, plus a durable signed-callback
proof for the configured webhook ID and signing-key hash. A configured secret
alone cannot enable sending. Current vendor docs use
`https://g.sendcorex.com/v1/domain`, `/v1/logs`, `/v1/feedback` and the older
`https://graph.sendcorex.com/v3.0/webhooks` metadata endpoint. The latter must
pass live acceptance; an unavailable/deprecated endpoint fails closed. Never
guess an alternative or treat an HTTP-200 command error as success.

Delivery logs reconcile accepted IDs and recipients. The feedback feed starts
at its 90-day retention boundary and pages through hard/soft bounces, blocks,
drops and complaints. Its database cursor advances with a compare-and-swap
only after all events are durable; interruptions replay safely. Five pages
per refresh bound work and hold sending while a backlog remains. Soft failures
and message policy blocks hold review without globally blacklisting a valid
address. Hard bounces, complaints and unsubscribes remain recipient-wide blocks
across provider changes. Historical suppressions still require reconciliation.

The send adapter never retries an uncertain result or switches to Resend/SMTP.
It records one returned ID only after confirming its exact recipient, and
includes VakayGo's own visible opt-out and RFC8058 one-click headers. A 5xx,
network failure or malformed success pauses the campaign for reconciliation.
Migration 0014 also pauses existing campaign controls, preserves stages and
permissions, and adds no prospect permissions or send jobs.

The owned-inbox test on 2026-10-21 reached Gmail Inbox with SPF, exact-domain
DKIM and strict DMARC passing. Its provider ID was
`12c5aa7d-d1f7-430f-ba47-ad98e5d3ee6c`. This proves that test's authentication
and placement; it does not validate live application callbacks, production
configuration, historical suppressions or a campaign audience. Keep sending
paused until those checks and a reviewed release are complete.

## Scheduling and holds

The cron runs every 10 minutes and attempts at most one eligible invitation. Sending
is limited to known destination time zones, Monday–Friday 09:00–17:00 local time.
Unknown destinations hold. Both scheduled and administrator sends use the same
reservation and final dispatch gates; `force` cannot bypass them.

Daily stages are 18, 24, 32, 44 and 60 per rolling 24 hours, with at most 6 per hour and at
least 10 minutes between reservations. Reservations count even when a later send
fails. A unique campaign/address and campaign/listing reservation prevents
duplicates. Provider requests carry a stable idempotency key.

Any complaint in 7 days, bounce rate at least 2%, uncertain transport, reservation
older than 20 minutes, unresolved delivery older than 24 hours, stale telemetry or
missing prerequisites holds sending. Recent bounces count even when the original
acceptance is older than 7 days; zero accepted messages cannot hide a bounce.
Provider rejection pauses the control. Never blindly retry an uncertain outcome.

Promotion requires at least 72 hours in the stage and at least 50 accepted messages
from that stage in the last 7 days, each aged 24 hours and delivered or bounced.
There must be zero complaints, bounce rate below 2%, and complete fresh evidence.
Promotion is manual and advances only one stage. These are internal cautious
limits, not a promise of inbox placement or a replacement for provider policy.

## Evidence and opt-out

Attempts, deduplicated signed events, provider observations and sticky recipient
suppressions are separate records. Poll observations are labeled with their
observation time; they do not invent historical delivery timestamps. Provider
acceptance and receiving-server delivery do not prove a human read the message.

Signed invitation links record visits (including scanners) and carry a seven-day
first-party continuation cookie. An approved claim is associated only after the
normal authenticated ownership verification. The invitation grants no ownership
authority. Association does not prove causation or a booking conversion. Replies
continue to be reviewed in InboxHQ; they are not automatically counted here.

New and legacy opt-out links block the recipient globally and revoke permissions
across providers, including after listing deletion or address change. Do not
clear or bypass those blocks during a provider switch.

## Rollback

Pause through the current admin control first and inspect outstanding attempts.
Retain all evidence and suppression tables. Do not redeploy the legacy invitation
cron as a rollback while its schedule remains active: that older code does not
honor this release's campaign pause. Any provider/DNS cutover needs its own
reviewed rollback plan and preserved original records.
