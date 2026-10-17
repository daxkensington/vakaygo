# Grenada domain attribution

The six-domain homepage pilot uses `utm_medium=referral`,
`utm_campaign=grenada_discovery` and an exact source hostname:

| Source | VakayGo destination |
| --- | --- |
| excursionsgrenada.com | /grenada/experiences |
| landfallexcursions.com | /grenada/experiences |
| landfalltours.com | /grenada/experiences |
| grenadajeepadventures.com | /grenada/experiences/jeep-tours |
| jeepgrenada.com | /grenada/experiences/jeep-tours |
| grenadasnorkeling.com | /grenada/experiences/snorkeling |

The redirect discards incoming query parameters and adds only those fixed tags.
The `#directory` fragment scrolls to the listing directory. Redirect success is
not evidence of an analytics visit or a booking.

## Existing reporting destination

On 2026-10-17, the existing GA4 property `557228979`, account `410567965`,
contained the active Vakaygo web stream `16057203168`, measurement ID
`G-HFRKQCBWR5`. This is a public measurement identifier, not a credential.
The property contains other business streams and historical local audit traffic.
The live stream's Enhanced Measurement already tracks browser history changes;
do not add duplicate manual pageview events.

Open Traffic acquisition and apply a **report filter** for Hostname matching
`^(www\.)?vakaygo\.com$`. Choose a window including the pilot's launch on
2026-10-17 and the property's reporting time zone. Inspect **Session campaign**
`grenada_discovery`, **Session source / medium**, sessions, engaged sessions and
the event count for each funnel event. Filter to the Vakaygo stream if combining
reports from multiple streams. Property-wide totals are not VakayGo totals.

Standard reports can take 24–48 hours to finish processing. Repeated domain
visits within one browser session do not establish six independently attributed
sessions. QA visits on production are test traffic; never report them as customer
growth. Missing rows immediately after launch do not establish zero referrals.

## Event meanings

| Event | Required evidence |
| --- | --- |
| `view_listing` | Listing detail rendered; existing event |
| `listing_interest_saved` | Successful save response explicitly confirms interest; never initial load, removal or failure |
| `booking_request_saved` | Successful booking API receipt with saved ID and request mode/status |
| `begin_checkout` | Successful checkout API receipt with an HTTPS checkout.stripe.com URL |
| `purchase` | Fresh successful authenticated booking read matches the original payment-return booking, paid timestamp and confirmed/completed status |

Interest is not an enquiry, availability request, reservation or payment.
Request events do not prove operator acceptance. Existing booking eligibility
and launch gates still govern all forms and checkout creation.

The purchase event uses the saved booking ID as `transaction_id`, recorded
currency and final discounted `totalAmount`. One purchased item represents the
whole booking charge, including bundled fees. This is **gross booking value**,
not VakayGo commission or net revenue. No names, emails, phones, dates, notes,
booking numbers or checkout URLs are added to the new event payloads.

Google initialization is restricted to the exact production hostnames. Local,
preview and other Vercel aliases do not initialize this GA stream. Early events
wait in memory (maximum 30, maximum age 60 seconds), then drain after the
existing Google configuration executes. No additional campaign storage,
cookies, consent changes, account changes or external fallback is introduced.

Delivery is best-effort: blocked scripts, expired/overflowed queues, navigation
before dispatch and visits without a verified payment return can lose events.
Same-document purchases are deduplicated in a bounded set; GA receives the
stable transaction ID across reloads. Refunds, offline purchases and customers
who never return from checkout require separate reconciliation. Browser
analytics must not be used as the financial ledger.

## Acceptance before expanding domains

1. Confirm the reviewed application build is live and the six redirect contracts
   still return the fixed campaign tags.
2. Check the active stream and production-only report filter. Capture the report
   window, source/campaign dimensions and processing status with the result.
3. Confirm real campaign rows and the relevant saved-interest/request events in
   the reporting destination. Local tests alone do not prove ingestion.
4. Reconcile any claimed purchases with actual paid records through an approved
   read-only process. Never create a customer booking or charge just for analytics.
5. Expand only after attribution evidence is established; do not purchase a paid
   analytics upgrade as a substitute for checking the existing GA stream.

References: [GA4 event definitions](https://developers.google.com/analytics/devguides/collection/ga4/reference/events),
[data freshness](https://support.google.com/analytics/answer/9333790),
[traffic acquisition](https://support.google.com/analytics/answer/12923437).
