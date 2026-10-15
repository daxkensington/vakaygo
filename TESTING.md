# Testing

## Unit tests (vitest)

```bash
npm test          # interactive watch
npm test -- --run # one-shot (CI)
```

44 tests across `tests/unit/**`. Adding a new file? Place it as `tests/unit/<name>.test.ts` — the config picks it up automatically.

## E2E tests (Playwright)

```bash
npm run test:e2e
```

`playwright.config.ts` boots `npm run dev` and points tests at `http://localhost:3000`. Set `BASE_URL` to point at a deployed preview instead.

E2E tests need a real database. Locally, use the Neon `vercel-preview` branch — the same copy-on-write branch Vercel previews and local builds use (see `CLAUDE.md`):

- **Branch name:** `vercel-preview`
- **Branch ID:** `br-broad-lake-am17nibq`
- **Project:** `vakaygo` (`flat-sun-10960001`)

The old `ci-test` branch (`br-purple-glade-ams5jrv3`) is archived. Do not recreate it or point anything at it.

### Local setup

Copy the connection string for `vercel-preview` from the Neon dashboard into `.env.local` as `DATABASE_URL`. **Do not commit it.**

### CI setup

CI pipelines use their own throwaway Postgres and must not target the archived `ci-test` branch. The earlier advice to keep `ci-test` alive so `DATABASE_URL_PREVIEW` continues to work no longer applies — do not set `DATABASE_URL_PREVIEW` (or any other secret) to a `ci-test` URL.

## Lighthouse CI

```bash
npx lhci autorun
```

`lighthouserc.json` defines the targets and thresholds. Runs against a local production build (`npm run start`).

Thresholds (current):

| Category        | Min  | Severity |
| --------------- | ---- | -------- |
| Performance     | 0.70 | warn     |
| Accessibility   | 0.90 | error    |
| Best Practices  | 0.85 | warn     |
| SEO             | 0.95 | error    |
