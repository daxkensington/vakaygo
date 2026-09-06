# September 2026 audit remediation

Branch: `codex/audit-remediation-2026-09-05` · [PR #1](https://github.com/daxkensington/vakaygo/pull/1)

These changes address the 21 findings in the September 5 audit. They are not deployed merely because this document is present. Production requires migration 0004, working mail and refund workers, and the release checks below.

## Changes by finding

| Finding | Change | Remaining limitation |
|---|---|---|
| VG-01: Google bypasses TOTP | Verified Google email required; accounts with TOTP use password sign-in and their second factor. | Google-to-TOTP challenge flow is deferred; Google cannot bypass TOTP. |
| VG-02: cancellation skips refunds | All three cancellation endpoints call one service; refund amount is saved before Stripe; a scheduled worker retries interrupted refunds and refreshes pending provider status. | Historical cancellations need reconciliation. Ended bookings require support review. |
| VG-03: payment replay and late events | Persisted checkout session, stable Stripe request key, amount/currency/payment checks, conditional status transitions, late-payment refund. | Checkout links can expire before the 48-hour unpaid booking hold. Legacy sessions need review. |
| VG-04: booking inventory | Validate dates/guests/status; PostgreSQL listing lock protects every occupied day and accepting requests. Promotions use a locked usage record. | Listings with price overrides or pricing rules use price requests until authoritative variable-price quotes exist. Capacity falls back conservatively to listing limits. |
| VG-05: misleading deposit/gift controls | Unsupported checkout options removed and API rejects them. | Full deposit plans and gift redemption remain unavailable. |
| VG-06: gift purchase false success | New purchases/redemption disabled with an honest unavailable page. Balance lookup retained. | Reconcile pre-existing gift payments/cards manually before reopening. |
| VG-07: conflicting cancellation terms | One versioned definition drives text and calculations; new bookings snapshot policy. | Existing bookings lack the terms shown at purchase; do not rewrite them automatically. |
| VG-08: unfulfilled protection fee | Protection upsell removed and API rejects insurance selections; protection page describes actual support. | Historical fees require review; no new insurance entitlement is invented. |
| VG-09: priced unclaimed requests | Requests store zero collected amount and can be confirmed without fabricating payment. | Price/payment arranged with the business outside VakayGo. |
| VG-10: false payout completion | Ledger entries remain pending; no paid date without settlement evidence; single-day trips release after their service day. | Platform settlement and legacy earnings remain manual; destination charges must not be transferred twice. |
| VG-11: alternate booking flow | Dedicated booking page uses the shared booking widget. | Payment confirmation comes from the webhook. |
| VG-12: demo/trust claims | Known demonstration inventory paused by migration and rejected by API; broad verification badges/copy removed from key surfaces. | Listing-specific verification and historical content still need an evidence-based operational process. |
| VG-13: canonical metadata | Homepage-only canonical removed from root; public pages get their own canonical; private/utility pages noindex; blog index redirects to guides. | Search recrawling is external to deployment. |
| VG-14: nonfunctional language switch | Inactive selector hidden; document remains English/LTR without cookie hydration mutation. | Real translated routes are deferred. |
| VG-15: blocked public operators API | Permission matching respects route segments. | Public profile data remains read-only. |
| VG-16: accessibility | Gallery keyboard/focus/dialog handling, sign-in labels, page/card heading structure, banner contrast/landmark. | Automated checks supplement, but do not replace, assistive-technology testing. |
| VG-17: mobile navigation | Islands, Map, Services, currency and visible Explore access restored. | — |
| VG-18: ineffective CI | Lint cannot gain errors beyond the explicit legacy baseline; typecheck, unit, real SQL/concurrency, build, browser and Lighthouse jobs run on PRs and primary branches. | Existing lint debt is tracked, not represented as zero errors. Lighthouse requires performance/best-practices ≥90 and accessibility/SEO ≥95; granular optimization diagnostics warn, while console and accessibility failures still block. |
| VG-19: unreliable email | Booking state changes atomically enqueue delivery; leased worker retries and checks Resend errors with idempotency keys. | At-least-once delivery: provider idempotency retention is finite. CRON_SECRET and Resend must be configured. |
| VG-20: map counts | Counts derive from the filtered dataset. | — |
| VG-21: zero-price directory | Unknown prices shown as price on request; request confirmations show no collected payment. | — |

## Dependency security updates

The September 6 npm audit initially reported 42 affected dependency entries (16 high). The branch updates Next.js, its matching lint/analyzer packages, Drizzle ORM and compatible transitive dependencies. The current production-only npm audit reports **zero known vulnerabilities**. Four moderate development-tool findings remain in the deprecated esbuild loader used by drizzle-kit; npm's suggested automatic resolution downgrades drizzle-kit across incompatible versions, so it is not applied. Do not expose those development servers publicly.

Primary references: [Next.js proxy advisory](https://github.com/vercel/next.js/security/advisories/GHSA-6gpp-xcg3-4w24), [Drizzle identifier escaping advisory](https://github.com/drizzle-team/drizzle-orm/security/advisories/GHSA-gpj5-g38j-94v9), [sharp/libvips advisory](https://github.com/lovell/sharp/security/advisories/GHSA-f88m-g3jw-g9cj).

## Required release sequence

1. Review the exact branch head and all CI results. The isolated CI database contains synthetic accounts and inventory only.
2. Select the VakayGo Neon project. Create a branch/restore point immediately before the production migration. Do not use `db:push`.
3. Apply `npm run db:migrate` to an isolated branch copied from production. Confirm the migration journal and run read-only count checks below. The migration adds columns/outbox/triggers and pauses the known demo account; it does not rewrite historical financial records.
4. Configure Preview DATABASE_URL for that isolated branch, a distinct AUTH_SECRET, and preview application URL. Use test Stripe credentials only if payment tests are enabled. Production credentials must not be copied into preview.
5. Verify public desktop/mobile pages, a synthetic reservation and cancellation, request acceptance, and Stripe test-mode lifecycle. Verify worker retry behavior without mailing real customers.
6. Ensure Production has CRON_SECRET and RESEND_API_KEY, and Vercel scheduled jobs authenticate successfully. Without the worker, booking mail remains queued.
7. During a controlled release, apply the tested migration to production, then deploy this branch. The new runtime cannot precede its schema. Migration triggers may briefly overlap with the old runtime; monitor duplicate legacy inline emails during that window.
8. Verify production health, canonical tags, public operator profile response, and cron delivery/queue age. Avoid real charges or refund actions as smoke tests.

### Read-only migration checks

```sql
SELECT status, count(*) FROM listings GROUP BY status ORDER BY status;
SELECT status, count(*) FROM bookings GROUP BY status ORDER BY status;
SELECT count(*) AS undelivered,
       min(created_at) AS oldest,
       max(attempts) AS most_attempts
FROM booking_mail_outbox WHERE delivered_at IS NULL;
SELECT count(*) AS legacy_paid_without_settlement_snapshot
FROM bookings WHERE paid_at IS NOT NULL AND operator_earnings_cents IS NULL;
SELECT count(*) AS paid_cancelled_needing_review
FROM bookings WHERE status='cancelled' AND paid_at IS NOT NULL
  AND cancellation_requested_at IS NULL;
```

Compare counts before and after; only active demo listings should move to paused during migration. These aggregate checks do not establish that historical charges were correct.

## Historical reconciliation

Do not automatically backfill payments, refund amounts, gift balances, insurance coverage or payout completion. Compare actual Stripe charge/refund/transfer records with booking IDs and amounts first. Review:

- Paid bookings already cancelled/refunded or associated with multiple checkout/payment IDs.
- Gift-card PaymentIntents and inactive cards created before purchases were disabled.
- Bookings charged protection fees or displaying deposit/gift reductions that were never applied.
- Legacy cancellation terms where displayed copy differed from the old calculation.
- Payout rows marked complete without an actual transfer/settlement reference, with special care for destination charges.
- Open legacy checkout sessions lacking the new persisted session ID.

Record reviewed outcomes and obtain the appropriate business decision before moving money.

## Rollback

The migration is additive except for pausing known demo inventory. Prefer a forward correction. A code rollback alone leaves the new database triggers active; do not assume the old runtime is fully compatible. Restoring a pre-release Neon branch after new bookings arrive can lose those writes, so reconcile them before any restore. Preserve financial evidence and the outbox.
