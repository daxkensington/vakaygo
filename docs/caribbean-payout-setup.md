# Caribbean payout setup — Canada platform

Status: preparation only, 6 September 2026. The owner confirmed Canada as VakayGo’s registered country and wants every listed Caribbean destination covered, with worldwide expansion later. No provider has approved all-country coverage for VakayGo. Production stays information only; both booking launch gates remain off.

## Recommended provider evaluation

Evaluate PayPal Enterprise Payouts (Hyperwallet) first and Payoneer Mass Payouts alongside it. This is a recommendation to obtain a program proposal, not a claim that either has accepted VakayGo or supports every required local bank route. PayPal’s Canadian offering includes API integration, hosted/embedded payee onboarding, verification and funding from other payment service providers. Its marketplace offering explicitly addresses tour operators and online travel agencies. [PayPal Canada](https://www.paypal.com/ca/enterprise/global-payouts), [Hyperwallet marketplaces](https://www.hyperwallet.com/marketplace-payouts/).

Payoneer explicitly offers travel/accommodation supplier payouts, seller onboarding and a mass-payout API. Its published country count is a network claim; actual currency and payout-method coverage must be confirmed with its partnerships team. [Payoneer marketplaces](https://www.payoneer.com/marketplace/).

Ask Stripe sales whether a suitable Canadian arrangement is available for the same 21-destination list; its documented standard setup does not cover the full list.

Before integration, obtain approval from both the customer-payment processor and the payout provider for the complete Canadian travel-marketplace funds flow: who sells the service, who collects funds, commission deductions, where funds wait, when suppliers are paid, and who funds refunds and chargebacks. A payout account alone does not approve collecting money on behalf of third-party operators. Stripe itself distinguishes Connect’s marketplace arrangement from decoupled payouts and their different compliance responsibilities. [Stripe cross-border payouts](https://docs.stripe.com/connect/cross-border-payouts).

## Current inventory and country evidence

The live [island directory](https://vakaygo.com/islands) and repository seed/flag catalog were checked on 6 September 2026. There are 21 destinations; they are service locations, not proof of an operator’s legal registration or bank location.

| Code | Listed destination | Current Canadian Stripe flow assessment |
|---|---|---|
| AG | Antigua and Barbuda | Alternative pending |
| AW | Aruba | Not supported as a Netherlands business; alternative pending |
| BB | Barbados | Alternative pending |
| BQ | Bonaire | Not supported as a Netherlands business; alternative pending |
| BS | Bahamas | Alternative pending |
| CW | Curaçao | Not supported as a Netherlands business; alternative pending |
| DM | Dominica | Alternative pending |
| DO | Dominican Republic | Alternative pending |
| GD | Grenada | Alternative pending |
| GP | Guadeloupe | Documented France account treatment; exact Connect and banking route pending |
| JM | Jamaica | Alternative pending |
| KN | Saint Kitts and Nevis | Alternative pending |
| KY | Cayman Islands | Not covered by UK business support; alternative pending |
| LC | Saint Lucia | Alternative pending |
| MQ | Martinique | Documented France account treatment; exact Connect and banking route pending |
| PR | Puerto Rico | Documented US business support; exact Connect and banking route pending |
| TC | Turks and Caicos Islands | Not covered by UK business support; alternative pending |
| TT | Trinidad and Tobago | Alternative pending |
| VC | Saint Vincent and the Grenadines | Alternative pending |
| VG | British Virgin Islands | Not covered by UK business support; alternative pending |
| VI | US Virgin Islands | Not covered by US business support; alternative pending |

Stripe’s current standard cross-border documentation covers Canadian platforms transferring to connected accounts in Canada, the US, UK, EEA and Switzerland. Outside those regions it directs platforms to sales to discuss alternatives, without promising approval. [Stripe cross-border payouts](https://docs.stripe.com/connect/cross-border-payouts).

Territories need individual treatment: Stripe explicitly supports Puerto Rico as a US business and Guadeloupe/Martinique as French businesses. It excludes the other listed US, British and Dutch territories from parent-country business support. This is account-location guidance, not VakayGo-specific Connect approval. Preserve the operator’s true territory in our records; implement a distinct, provider-documented account-country mapping only after confirmation. [Stripe territory rules](https://support.stripe.com/questions/stripe-availability-for-outlying-territories-of-supported-countries?locale=en-GB).

Read-only sandbox evidence confirms the dedicated VakayGo sandbox has country CA. Its country-spec API exposes 37 possible transfer destinations, but country-level specifications and sandbox responses do not establish live platform entitlements. No country was added to either approved allowlist. Do not use a wildcard or infer approval from a test account’s creation. [Country Specs](https://docs.stripe.com/api/country_specs/object), [Capability testing](https://docs.stripe.com/connect/account-capabilities).

## Concrete setup sequence

1. Prepare the Canadian legal entity name, registration documents, business address, owners/directors, authorized representative and matching bank account. Confirm expected first-year volume, average booking and supplier payout sizes, booking lead time and refund rate; these commercial figures are still unknown.
2. Obtain a written program proposal for all 21 rows. Require recipient legal-entity eligibility and bank-country coverage, payout currency, local transfer versus international wire, beneficiary requirements, settlement time, minimums, fees, FX markup, intermediary-bank costs and failed-payment handling. Require a clear supported/unsupported answer for each row.
3. Agree the full collection-to-payout design and travel underwriting with the payment processor and payout provider, including delayed fulfillment, cancellation, disputes, reserves and responsibility for customer funds. Do not change the existing Stripe charge flow until this design is approved.
4. Integrate provider-hosted business verification and bank setup after VakayGo’s listing-ownership claim. Store provider references and status events, not bank details in an ordinary onboarding text field. Bind the payee to the current verified owner and reverify changed ownership or bank details.
5. Implement payout scheduling, provider-specific readiness, durable ledger entries, idempotent requests, signed event processing, reconciliation, failure recovery and refund funding for the selected program. Existing Stripe destination-charge logic is not a drop-in implementation of separate mass payouts.
6. Test onboarding rejection, missing bank requirements, pending/failed/returned payouts, duplicate events, refunds and chargebacks in the provider sandbox. Then use provider-approved controlled live verification with explicit authorization. Record evidence for each required route.
7. Enable a listing only after claimed ownership, completed operator setup, approved recipient and payout route, valid availability, current provider readiness and explicit activation. Keep any gap information only. If the launch requirement is all 21 destinations together, wait until all 21 have approved and verified routes.

## Provider enquiry draft — not sent

Subject: Canadian travel marketplace — operator onboarding and bank payouts across 21 Caribbean destinations

VakayGo (vakaygo.com) is a Canadian travel and experiences marketplace preparing to launch. Listings remain information only until the business has proved ownership and completed onboarding. We need a program for collecting customer booking payments, retaining an agreed marketplace commission and paying verified local tour/activity/accommodation operators.

Please confirm whether you can onboard our Canadian operating entity for this business model and provide written coverage for suppliers legally registered and banked in each of the 21 destinations in the table above. Please distinguish local bank transfers from international wires and wallet-only routes, including supported currencies, fees/FX, minimums, settlement times, beneficiary verification and return handling.

We also need hosted or embedded supplier verification and bank onboarding, API status notifications, automatic payout scheduling, reconciliation, and an agreed method for refunds, chargebacks and reserves. Please describe acceptable funding from our card processor and whether you can support the complete marketplace funds flow or require a separately approved acquiring arrangement.

Our transaction-volume estimates, average booking/payout sizes and payout timing will be supplied after internal confirmation. Please identify program minimums, setup costs, underwriting requirements and any territories you cannot support. No consumer bookings or payments will launch before approval and verification.

No enquiry, signup, financial transaction or provider configuration change has been sent as part of this assessment.
