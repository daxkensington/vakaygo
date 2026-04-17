# Migrations

## Generating

```bash
npm run db:generate   # diff schema.ts against last snapshot, write a new migration
npm run db:migrate    # apply pending migrations to $DATABASE_URL
npm run db:studio     # browse the DB
```

`db:push` is for prototyping only — it skips the migration journal. **Never run it against production.**

## Current state (post-baseline, 2026-04-15)

The migration journal was reset to a single baseline migration that captures the entire current schema:

- `0000_abandoned_the_hunter.sql` — full schema baseline (47 tables, 9 enum types, all indexes/FKs)
- Hash: `24b371f10b8ef96d277c9b2e49c6e07072dda7a49d7f65cbcdefc190087f69d8`

The previous migration set is preserved in `drizzle/migrations-archive-2026-04-15/` for reference. It is not loaded by drizzle-kit.

### Why the reset

Before 2026-04-15 the journal had 4 entries but `drizzle.__drizzle_migrations` on prod only showed 2 applied — and the actual prod schema contained columns from many other migrations (applied via `db:push` over time). Tracking was unreliable. The baseline reset makes `meta/_journal.json` and `__drizzle_migrations` truthful again.

### How the reset was applied

The baseline was tested end-to-end against the `ci-test` Neon branch first:

```sql
INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
VALUES ('24b371f10b8ef96d277c9b2e49c6e07072dda7a49d7f65cbcdefc190087f69d8',
        extract(epoch from now()) * 1000);
```

After that, `npx drizzle-kit migrate` correctly skipped the baseline (hash matched) and reported success without recreating any tables. Branch data integrity verified (21 islands, 7231 listings, all intact).

### Production status

Applied to prod on 2026-04-15. `drizzle.__drizzle_migrations` now contains 3 rows; row id=3 carries the baseline hash. Insurance branch `pre-baseline-2026-04-15` (`br-raspy-meadow-amhz0c3t`) holds the pre-change state for ~24h.

Future `npm run db:migrate` runs are safe.

## Generating future migrations

After the prod baseline is applied, the workflow is normal:

```bash
# edit drizzle/schema.ts
npm run db:generate   # writes drizzle/migrations/0001_<name>.sql
npm run db:migrate    # applies it
```

## Rollback strategy

Drizzle does not generate down migrations. Rollback options:

1. **Neon Point-in-Time Restore** — preferred for prod incidents. Branch from a timestamp just before the bad migration and repoint `DATABASE_URL`.
2. **Manual inverse SQL** — for additive migrations, hand-write the inverse and apply.
3. **Forward fix** — for migrations that lose data, write a new forward migration that restores the schema.

Before any prod migration:

- Take a Neon branch (`neonctl branches create --name pre-<migration-tag>`).
- Run `db:migrate` against the branch first to verify.
- Apply to prod.
- Keep the branch around for 24h, then delete.
