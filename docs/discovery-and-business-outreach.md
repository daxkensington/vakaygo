# Discovery, claims and business outreach

## Directory launch

Bookings remain disabled. A traveler’s explicit interest is a separate record with no dates, guest counts, availability request, payment, booking row or email delivery. Verified email accounts can record one active signal per listing and withdraw it. Owners cannot signal interest in their own listings; administrators cannot add traveler demand. A database lock enforces a 20-listing daily limit across concurrent requests.

## Business workflow

1. Public business landing: /for-businesses. Search the existing catalog by name and check the address/destination before claiming. Restaurant-specific entry: /for-restaurants.
2. Ownership claims continue through the existing verified email and trusted business phone flow. Public-data flags do not establish ownership. Missing phone proof requires support; no administrator approval shortcut is introduced.
3. Customer interest automatically creates an opportunity in /admin/outreach. Reviewers see aggregate active demand, official website and the independently captured business phone when available. Customer names and contact details are excluded from the endpoint and invitation.
4. Review the contact source and applicable consent basis, complete the sender identity/address in the draft, and record the contact outcome. This release prepares drafts; it does not send email, SMS or WhatsApp messages.
5. Record opt-outs as Do not contact. That state cannot be reopened through this workflow and new interest never resets it. Concurrent reviewer updates use the exact database timestamp to avoid overwriting opt-outs.

The retired scripts/send-claim-emails.ts cannot send messages. A customer’s interest does not establish a business recipient’s consent to marketing. See [CRTC guidance on implied consent](https://crtc.gc.ca/eng/com500/guide.htm) before selecting an outreach channel and recipient.

## Search and answer visibility

- Listing business/WebPage structured data is present in the original HTML. It includes the actual country, available address/contact facts, valid coordinates and image URLs. Imported ratings, event schedules, offers and availability are not fabricated. JSON is escaped for safe script embedding.
- Listing bodies include short, visible answers about location, ownership verification and current booking availability. Opening hours remain in the HTML inside a native disclosure. Structured data describes the same available business facts.
- The server resolves the exact destination/slug pair and rejects inactive destinations and the excluded demo operator.
- The sitemap excludes the blog alias, private trip creation, inactive destinations and demo listings. Listing/article modification dates come from stored records; static and facet pages do not advertise an invented modification date on every request.
- The business and restaurant landing pages focus on claiming and maintaining accurate business details. Unsupported testimonials, competitor pricing, booking promises and payout claims were removed.

[Google’s AI search guidance](https://developers.google.com/search/docs/appearance/ai-features) applies the normal crawlability, indexing and helpful-content foundations to AI features. There is no guarantee of indexing, ranking, citations or rich results. Special AI files are not required. [Local business structured-data documentation](https://developers.google.com/search/docs/appearance/structured-data/local-business) describes supported business facts.

## Measurement and remaining setup

Use Google Search Console to monitor sitemap processing, listing index coverage and impressions/clicks for destination and business queries. Access to the verified property has not been established in this change. Compare periods after deployment, allowing time for recrawling.

Track business claims and completed ownership verifications alongside recorded demand and outreach outcomes. Prioritize original owner-supplied descriptions, current hours/contact details and photographs with clear usage rights. Avoid mass-producing destination pages merely to increase URL counts.

Business phone verification and account verification require their configured messaging providers. Payment applications remain deferred. Production rollout must include the required database migrations and preserve the booking launch pause; the preview uses the isolated staging database.

## Validation

Migration 0009 is additive; earlier migrations are immutable. SQL checks cover verified identity, stale sessions, self-interest, duplicate signals, withdrawal, suppression persistence, daily limits, inactive listings/destinations, account deletion, and absence of booking/email side effects. Browser tests exercise finder links, raw HTML schema, guest/origin/role restrictions, persisted interest and admin review/suppression. Unit tests cover safe schema serialization and interest UI error handling.
