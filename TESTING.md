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

E2E tests need a real database. We use a dedicated Neon branch:

- **Branch name:** `ci-test`
- **Branch ID:** `br-purple-glade-ams5jrv3`
- **Project:** `vakaygo` (`flat-sun-10960001`)

To rotate or refresh the branch (e.g., to pick up new prod data), recreate it from `main` in the Neon dashboard or via the Neon MCP / CLI — keep the same name so existing local `.env.local` and the GitHub `DATABASE_URL_PREVIEW` secret continue to work.

### Local setup

Copy the connection string for `ci-test` from the Neon dashboard into `.env.local` as `DATABASE_URL`. **Do not commit it.**

### CI setup

The `e2e` and `lighthouse` jobs in `.github/workflows/ci.yml` read `secrets.DATABASE_URL_PREVIEW`. Add it as a GitHub repo secret with the `ci-test` branch URL.

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
