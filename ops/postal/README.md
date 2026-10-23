# VakayGo owned outbound mail: prepared foundation

Decision, 2026-10-20: run **Postal 3.3.7 on a dedicated OVH Canada normal VPS**, using `hello@vakaygo.com` and `support@vakaygo.com` replies. Keep incoming mail at Migadu and existing transactional delivery at Resend. The application, permissions, schedule, permanent suppressions and reporting remain VakayGo's responsibility. Bookings and payments remain on VakayGo.

This branch is **not launch-ready**. It adds a standalone client and offline host configuration, based on the paused campaign candidate in PR68. It does not add a selectable Postal provider, schema changes, an event-ingestion route, credentials, DNS records or an active campaign. Do not enable the campaign merely because this package passes its local checks.

## Hosting decision

Use OVH **VPS-1 2027, normal Beauharnois (BHS/ca-east-bhs), Ubuntu 24.04**, 2 vCPU / 4 GB / 40 GB NVMe / one IPv4. The public Canadian catalog checked October 20 quotes C$7.30/month with no commitment and no setup fee. Budget **C$7.90/month before tax**, allowing C$0.60 standard backup without assuming its advertised 100% promotion. The C$6.20 teaser requires a 12-month commitment; do not substitute it for the monthly price. Recheck the actual cart, region, backup, tax and accepted contract before purchase. Availability is a point-in-time observation, not a reservation.

The earlier September OVH order was cancelled; no existing delivered spare server is verified. No new order, vendor enquiry or purchase has been made. A purchase needs Ian's expense authorization. Provision only a new dedicated mail host; do not reuse occupied application/payment servers.

Official [OVH SMTP documentation](https://docs.ovhcloud.com/en/guides/bare-metal-cloud/dedicated-servers/mail-sending-optimization) says port 25 is normally open for dedicated servers and VPS except Local Zones. Reverse DNS is self-service. The current [Canadian contract index](https://www.ovhcloud.com/en-ca/terms-and-conditions/contracts/) links VPS terms 4.1 (2025-04-10); the separately linked legacy 2015 terms contain different email restrictions. Current terms prohibit illegal/fraudulent use and allow anti-spam blocking. Our assessment is a hosting fit for legitimate, targeted mail; it is not a blanket permission for every directory contact. Keep the accepted order's applicable terms as launch evidence. Public source captures, current/legacy contract hashes and exact catalog/stock responses are in the separate host-qualification audit.

## What this package does

- Pins Postal, MariaDB and Caddy images by immutable digest. Postal 3.3.7 includes upstream security fixes; review future upgrades instead of fetching `latest`.
- Prepares distinct RSA2048 installation-signing and domain-DKIM keys plus database/Rails secrets offline. It refuses to overwrite any runtime directory and prints filenames only. Runtime files are git-ignored and private on Linux.
- Starts only the database by default. Web/control and mail delivery require distinct Compose profiles. Web/database/health listeners bind loopback; Caddy exposes only the two authenticated Postal API paths publicly. Administrative UI access is limited to one explicit IPv4 `/32`, default loopback through SSH.
- Supplies an initial-domain-key helper because pinned Postal generates RSA1024 domain keys by default. It only replaces a fresh, never-DNS-checked default key on a Development server; it is not a key-rotation tool.
- Supplies `server/postal-client.ts`: single-recipient structured submission, fixed HTTPS endpoint and sender, stable attempt correlation, strict acceptance/status matching, no submission retries, and pure pinned RSA/SHA256 signature verification. No API key is read from environment yet, and nothing imports this client into live dispatch.

## Prepare the dedicated host after purchase

Linux only; do not run this host-network stack on a shared server or Ian's desktop. Install current supported Docker Engine/Compose and Node using their official instructions. Apply OS updates, configure SSH access, verify the assigned IPv4 and retain an operator recovery path. Permit public TCP80/443 and, at delivery launch, inbound TCP25 for bounce traffic. Keep MariaDB, Rails and health ports private. Disable outbound IPv6 SMTP until its separate identity/DNS path is deliberately configured. Do not open an unauthenticated relay.

Place this directory at `/opt/vakaygo-postal`. Run preparation as root; the default admin restriction supports an SSH tunnel. For direct UI access use the operator's actual fixed IPv4, never a broad CIDR.

```sh
cd /opt/vakaygo-postal
node prepare.mjs /opt/vakaygo-postal/runtime
docker compose config --quiet
docker compose up -d database
docker compose run --rm runner postal initialize
docker compose run --rm -it runner postal make-user
```

Only after the new `postal.vakaygo.com` DNS and access rules are reviewed, start the control plane with `docker compose --profile control up -d`. No worker or SMTP process is started by these commands. Complete administrator setup interactively; never put passwords/API keys in shell arguments, tickets, audit output or Git. Password-reset/management notification delivery is intentionally unconfigured, not pointed at Migadu SMTP; retain the administrator login and recovery procedure before launch.

Create the organization and a **Development** server with a server-owned `vakaygo.com` sending domain. Leave worker off. Before performing DNS verification, import the prepared domain key using the exact server UUID from the UI:

```sh
docker compose run --rm -e VAKAYGO_POSTAL_SERVER_UUID \
  -v /opt/vakaygo-postal/import-domain-key.rb:/run/import-domain-key.rb:ro \
  runner bundle exec rails runner /run/import-domain-key.rb
```

The environment variable is the non-secret server UUID. Do not echo private keys. If the helper refuses, inspect the domain and its history; do not bypass its initial-only guard. Export only the public DKIM record, public webhook verification key and its SPKI SHA256 fingerprint for verification. Store the server API credential in the existing secret manager after its consumer/configuration exists.

## DNS changes to review, not execute yet

Use the newly assigned static IPv4 below. Keep records DNS-only where they are mail hosts. No AAAA record in the initial IPv4-only launch.

| Name | Planned record |
| --- | --- |
| `postal.vakaygo.com` | A to the new IPv4; OVH PTR of that IPv4 back to this exact name |
| `spf.postal.vakaygo.com` | TXT `v=spf1 ip4:NEW_IPV4 -all` |
| `rp.postal.vakaygo.com` | A to the new IPv4, MX10 `postal.vakaygo.com`, TXT `v=spf1 ip4:NEW_IPV4 -all` |
| `postal._domainkey.rp.postal.vakaygo.com` | Installation public-key TXT from `postal default-dkim-record`; confirm actual selector in the pinned UI |
| `postal-ABCDEF._domainkey.vakaygo.com` | Exact generated selector and RSA2048 public-key TXT shown for the sending domain; `ABCDEF` is a placeholder |
| `psrp.vakaygo.com` | CNAME to `rp.postal.vakaygo.com` for the custom return path |
| `vakaygo.com` SPF | Merge one `include:spf.postal.vakaygo.com` into the existing single record before its final `-all`; preserve all existing mechanisms |

The observed root SPF is `v=spf1 include:spf.tutanota.de include:amazonses.com include:spf.migadu.com -all`. The observed worst lookup path is 7 mechanisms; the flat Postal include would make 8. Recalculate against live DNS before publishing: included providers can change. Do not copy Postal's suggested whole-root SPF, introduce a second SPF record or remove existing senders.

Preserve root MX `aspmx1.migadu.com` / `aspmx2.migadu.com`, nameservers, website records, existing selectors and DMARC `v=DMARC1; p=quarantine; adkim=s`. Verify visible From `hello@vakaygo.com` is signed with **d=vakaygo.com**, the new selector and RSA2048; subdomain-only DKIM does not strictly align. Postal can fall back to signing its installation return-path domain on bad DNS; that must fail launch readiness. Wire SMTP MAIL FROM is the dedicated bounce return path, distinct from the stored message's From field. Test its SPF and relaxed alignment independently.

Do not add tracking-domain or route-domain DNS merely because they are present in configuration. Opens/click tracking stays off. Incoming support MX stays at Migadu; Postal SMTP is needed for its bounce domain, not for moving the inbox.

## Integration and launch gates still required

1. Reconcile the 70 historical invitations and every known bounce, opt-out and complaint into VakayGo's permanent suppression policy. Do not reset history when changing transport.
2. Add the Postal provider/credential/readiness contract to the campaign schema and adapter. Retain its shared atomic reservations, final dispatch check, recipient permission evidence, weekday 09:00–17:00 destination timezone, 6/hour and 10-minute spacing. Keep the existing reviewed 18/24/32/44/60 daily ramp and manual promotion. Unknown timezone or legal basis stays held.
3. Persist the numeric Postal message ID, token, server-returned Message-ID and stable attempt ID after acceptance. Bind status polls/events to that same recipient and attempt. Persist and deduplicate authenticated event UUIDs before state changes. Use only the pinned SHA256 signature key; reject the legacy SHA1 header. Never download an event-supplied key. Unknown send outcome requires reconciliation, not blind resend: Postal has no proven send-idempotency contract.
4. Implement and test delivery, bounce, delay and failure ingestion plus independent reconciliation. Postal has no built-in complaint webhook event: provide a tested mailbox-feedback/manual complaint ingestion path and sticky suppression before calling complaint health ready. Queue age, DNS, TLS, disk, backups, health and feedback failures must pause dispatch.
5. Verify port25 and forward/PTR publicly, IP reputation, HTTPS, domain authentication and bounce routing on the actual host. Use a Development server first. With explicit test recipients, prove header alignment, signed events, an unsubscribe and bounce/complaint suppression. SMTP acceptance is not evidence of inbox placement.
6. Review the applicable recipient-country requirements and exact approved initial cohort. Confirm VakayGo's real postal/contact identity and one-click opt-out in the message. Test scheduling and a restart/recovery without duplicate attempts. Get the project DRI's reviewed release, infrastructure/DNS approval and Ian's paid-host approval before activation.

Only after those gates may the server change to Live and the explicit delivery profile start. The first production cohort is a small business-hours pilot, followed by a review of delivery, replies, claims and **bookable listings/bookings**, not an automatic blast of the directory. Agent replies should investigate dates, guests, destination, availability and commission eligibility, and point every booking to VakayGo. They require their own reviewed workflow; this invitation client does not silently implement it.

To stop mail delivery, stop `worker` and `smtp` explicitly; leaving the control plane up allows investigation. Hold new submissions in VakayGo first. Preserve queued messages and reconcile uncertain attempts before restart. Never delete volumes/keys as a rollback. Back up the database and private runtime encrypted off-host; a VM snapshot alone is not proof of a recoverable mail queue. Record a restore test, disk alerts, retention policy and an operator who owns abuse/deliverability handling before launch.

## Local verification

```sh
node --test ops/postal/prepare.test.mjs
npx vitest run tests/unit/postal-client.test.ts
npm run typecheck
npx eslint server/postal-client.ts tests/unit/postal-client.test.ts ops/postal/prepare.mjs ops/postal/prepare.test.mjs
```

Use `--fixture` only with a fresh temporary directory for offline tests. It generates synthetic keys but starts nothing. Never print the generated config or Compose's interpolated runtime secrets into logs.

The review also ran `import-domain-key.test.rb` (nine initial-key guard cases), Ruby syntax checks and the generated configuration through the actual pinned Postal image, with networking disabled. This verifies the pinned config schema and Linux UID999/private-file modes without running Rails, SMTP or a worker. The pinned Caddy image validated the generated proxy configuration with networking disabled. These checks do not replace deployment acceptance on the allocated host.

Upstream references: [Postal prerequisites](https://docs.postalserver.io/getting-started/prerequisites/), [sending domains](https://docs.postalserver.io/features/sending-domains/), [DNS](https://docs.postalserver.io/getting-started/dns-configuration/), [API](https://docs.postalserver.io/developer/api/), [webhooks](https://docs.postalserver.io/developer/webhooks/), [pinned security release](https://github.com/postalserver/postal/releases/tag/3.3.7). Compose layout follows the MIT-licensed upstream install commit `451926cc78a1056e9f16dad6ec5c62d4f76d2445`; client behavior was checked against Postal commit `d038eaa8c763d3cafa797ccd6f773d53470bd336`. This local package has not been exercised on the proposed production host.
