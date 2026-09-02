# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Next.js Version Warning

This uses **Next.js 16.2.1** with breaking changes from earlier versions. Read `node_modules/next/dist/docs/` before writing code. Heed deprecation notices.

## Commands

```bash
npm run dev           # Start dev server (Turbopack)
npm run build         # Production build
npm run lint          # ESLint
npm run typecheck     # tsc --noEmit
npm run check:i18n    # Verify i18n key coverage across all 7 locales
npm test              # Vitest (unit tests)
npm run test:e2e      # Playwright (e2e tests)
npm run analyze       # Bundle analyzer

# Database
npm run db:generate   # Generate migration from schema.ts changes
npm run db:migrate    # Apply pending migrations
npm run db:studio     # Browse DB in browser
# db:push is prototyping only — NEVER run against production

# Run a single test
npx vitest run tests/unit/session.test.ts
npx playwright test tests/e2e/homepage.spec.ts
```

## Architecture

**Caribbean travel marketplace** — 7,100+ listings across 21 islands covering stays, tours, dining, excursions, events, transport, transfers, VIP, spas, and local guides.

### Stack
- Next.js 16 App Router + React 19, Tailwind v4, shadcn/ui
- Neon Postgres (serverless) + Drizzle ORM — schema in `drizzle/schema.ts`
- jose-based JWT auth (NOT next-auth) — `server/admin-auth.ts`
- Vercel deploy, Sentry, next-intl (7 locales), Mapbox GL JS
- Stripe Connect, Resend email, Twilio SMS, Vercel Blob storage

### Route Groups
- `app/(platform)/` — Traveler-facing: explore, islands, bookings, trips, profile
- `app/(marketing)/` — SEO pages: blog, guides, FAQ, about, for-businesses, things-to-do-in-[island]
- `app/admin/` — Admin dashboard
- `app/operator/` — Operator dashboard (business owners)
- `app/api/` — 90+ API routes

### Critical Shared Modules
- **`lib/env.ts`** — Zod-validated env vars. `DATABASE_URL` and `AUTH_SECRET` are required. Import `env` from here, not `process.env`.
- **`lib/logger.ts`** — Structured logging. Routes to Sentry in prod, console in dev. Use `logger.{debug,info,warn,error}`.
- **`server/admin-auth.ts`** — `requireUser()`, `requireAdmin()`, `requireOperator()`, `assertListingOwnership()`, `createSessionToken()`, `verifySessionToken()`, `setSessionCookie()`, `clearSessionCookie()`.
- **`lib/rate-limit.ts`** — Token-bucket rate limiter. Already wired in `proxy.ts` for all `/api/*`.
- **`lib/pricing.ts`** — Category-specific fee rates (traveler + operator). Each listing type has its own rates.
- **`lib/image-utils.ts`** — `getImageUrl()` routes external images through `/api/images/proxy`. Always use this for Google Places, Facebook CDN, and Yelp CDN URLs.

### Security Layer
`proxy.ts` is the Next.js middleware. It:
1. Applies security headers (CSP, HSTS, etc.) to every response
2. Rate-limits all `/api/*` requests
3. Blocks unauthorized access to `/api/admin/*` and `/api/operator/*` before routes run
4. Per-handler auth checks remain as defense-in-depth

### Database
- Schema: `drizzle/schema.ts` — 47 tables, 10 listing types, 3 user roles
- Migrations baseline was reset on 2026-04-15. See `drizzle/MIGRATIONS.md` for full context.
- All API routes create a fresh `drizzle(neon(DATABASE_URL))` per request (serverless pattern)
- Listing `typeData` is a flexible JSON column storing Google Place IDs, phone, website, hours, menus, and more

### Listing Types
`stay | tour | dining | event | transport | guide | excursion | transfer | vip | spa`

When adding a new type, update: schema enum, all UI type configs (listing-card, explore tabs, island page, detail page, search autocomplete, categories, image-fallback, OG route), pricing.ts, AI tool enums in chat/smart-search/trips, operator new listing form, admin pages.

### Image Pipeline
- Google Places photos are proxied through `/api/images/proxy` which appends the API key server-side
- Photo references expire ~30 days; `/api/cron/refresh-photos` runs weekly to refresh them
- `components/shared/image-fallback.tsx` shows a gradient placeholder when images fail to load
- Enrichment scripts in `scripts/` for batch photo/price/menu/description discovery

### i18n
7 locales: `en`, `es`, `fr`, `pt`, `nl`, `de`, `ar` (with RTL). Message files in `messages/`. Config in `i18n/config.ts`. Run `npm run check:i18n` to verify key coverage.

**As of 2026-09-02 no component consumes the messages** (zero `useTranslations` callers). The next-intl request config was removed from `next.config.ts` because its `cookies()`/`headers()` read made every page dynamic; `<html lang/dir>` is now set client-side by `components/layout/locale-html-attrs.tsx` from the `locale` cookie. If you wire real translations back in, do NOT reintroduce a server-side cookie read in the root layout — put the locale in the URL instead, or the whole site loses CDN caching again.

### Rendering & caching
- Public pages (home, `/[island]`, `/[island]/[slug]`, `/islands`, guides, blog, best-*/things-to-do-*) are **ISR with `revalidate = 3600`**. First hit renders and caches at the CDN; the rest are HITs. Verify with `curl -sI https://vakaygo.com/grenada | grep -i x-vercel-cache`.
- Nothing per-user may be rendered on the server in those routes — auth/saved/currency all hydrate client-side via `/api/*`. A `cookies()`/`headers()`/`searchParams` read in a server component silently flips the route back to dynamic (`no-store`).
- Operator/admin edits that must show immediately should call `revalidatePath("/<island>/<slug>")`.
- Listing images render through `next/image` via `components/shared/image-fallback.tsx` (Blob/Unsplash/Google hosts only; other hosts fall back to `<img>`). Add any new image host to BOTH `next.config.ts` remotePatterns and `OPTIMIZABLE_HOSTS` there.
- Search (`GET /api/listings?q=`) goes through `lib/search-terms.ts`: stemmed AND-terms across title/headline/description/cuisine/typeData.
- **`/explore` is server-rendered but dynamic** (it reads `searchParams`). The first 24 cards come from `server/listings-search.ts#getExploreData` (`unstable_cache`, 1h, tag `listings`) and proxy.ts sets `Vercel-CDN-Cache-Control: s-maxage=3600` on `/explore` so the CDN caches each URL anyway. Filters are parsed ONCE in `lib/listing-filters.ts` — the page, `/api/listings` and `/api/listings/count` all use it, so never add a filter to one without the others. Only island/type combos are indexable; anything narrower is `noindex` with a canonical back to its island/type page.

## Build Gotchas

- **`app/sitemap.ts` queries the DB at build time.** Building locally without a valid `DATABASE_URL` fails at sitemap prerender. Use the Neon `ci-test` branch URL for local builds.
- **mapbox-gl is ~1.73 MB.** It's lazy-loaded only on `/explore`, `/map`, and listing detail pages. Never import map components into homepage/landing — it regresses LCP.
- **CSP uses `unsafe-inline`/`unsafe-eval`** because nonce-based CSP forces all pages into dynamic rendering (kills CDN caching for 7k+ listings). Mitigation: experimental SRI in `next.config.ts`.
- **Don't reintroduce:** `next-auth`, `@auth/drizzle-adapter`, `superjson`, `leaflet`, `react-leaflet` — all removed as dead deps.

## Cron Jobs (vercel.json)

| Cron | Schedule | Purpose |
|------|----------|---------|
| ical-sync | Daily 6am UTC | Sync listings with iCal import URLs |
| payouts | Mondays 8am UTC | Process operator payouts |
| escrow-release | Every 6h | Release escrow for completed bookings |
| refresh-photos | Sundays 3am UTC | Refresh expired Google Places photo refs |
| enrich-listings | Wednesdays 4am UTC | Pull Google Places data for listings missing info |
| abandoned-bookings | Every 2h | Send reminders for abandoned bookings |
| weekly-report | Mondays 8am UTC | Send operator weekly reports |
| price-alerts | Daily 9am UTC | Notify travelers of price drops |
| tax-documents | Jan 15 8am UTC | Generate annual tax documents |

## Data Enrichment Scripts

Reusable scripts in `scripts/` for batch data operations:
- `discover-photos.ts` — Multi-source photo discovery (Google, website, Facebook, Yelp)
- `discover-prices.ts` — Price scraping from business websites
- `discover-menus.ts` — 7-strategy menu finder (link crawling, PDF detection, JSON-LD, Google search, text parsing)
- `enrich-descriptions.ts` — Description enrichment from Google editorial summaries + website meta
- `enrich-from-google.ts` — Deep Google Places pull (price_level, phones, websites, hours, serves_*)
- `audit-photos.ts` — Verify photo/business name match, find dead URLs
- `refresh-photos.ts` — Refresh expired Google Places photo references
- `find-missing-websites.ts` — Discover websites via Google Places API

All scripts accept `--limit`, `--type`, `--dry-run`, `--concurrency` flags. Run with: `DATABASE_URL=... npx tsx scripts/<name>.ts`
