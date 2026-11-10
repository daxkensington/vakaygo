/**
 * One-off: clear the Google OAuth tokens that sign-in used to store.
 *
 * Until November 2026 the Google callback saved each person's access token,
 * refresh token and ID token in `accounts`. Nothing ever read them back; they
 * were standing credentials to people's Google identities with no use. The
 * callback no longer stores them (and clears a person's old ones the next
 * time they sign in). This clears the rest.
 *
 *   DATABASE_URL=... node scripts/purge-google-oauth-tokens.mjs            # dry run
 *   DATABASE_URL=... node scripts/purge-google-oauth-tokens.mjs --apply    # write
 *
 * The dry run reads only and prints counts, never a token. Applying sets
 * refresh_token, access_token, id_token, expires_at, token_type and scope to
 * NULL on provider = 'google' rows. The link itself (user_id, provider,
 * provider_account_id) is untouched, so everyone can still sign in with
 * Google. It cannot be undone: the tokens are not recoverable, which is the
 * point.
 */
import { neon } from "@neondatabase/serverless";

const APPLY = process.argv.includes("--apply");
const { DATABASE_URL } = process.env;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}
const sql = neon(DATABASE_URL);

const HAS_TOKEN = "(refresh_token IS NOT NULL OR access_token IS NOT NULL OR id_token IS NOT NULL)";

const [before] = await sql.query(
  `SELECT count(*)::int AS links,
          count(*) FILTER (WHERE ${HAS_TOKEN})::int AS with_tokens,
          count(refresh_token)::int AS refresh_tokens,
          count(access_token)::int AS access_tokens,
          count(id_token)::int AS id_tokens
     FROM accounts WHERE provider = 'google'`,
);
console.log("Google account links:", before.links);
console.log("  holding any token:", before.with_tokens);
console.log("  refresh tokens:", before.refresh_tokens, "| access tokens:", before.access_tokens, "| ID tokens:", before.id_tokens);

if (!APPLY) {
  console.log(before.with_tokens > 0
    ? `\nDry run. Re-run with --apply to clear tokens on ${before.with_tokens} link(s). Nothing was changed.`
    : "\nDry run. Nothing to clear.");
  process.exit(0);
}

const cleared = await sql.query(
  `UPDATE accounts
      SET refresh_token = NULL, access_token = NULL, id_token = NULL, expires_at = NULL, token_type = NULL, scope = NULL
    WHERE provider = 'google' AND (${HAS_TOKEN} OR expires_at IS NOT NULL OR token_type IS NOT NULL OR scope IS NOT NULL)
    RETURNING id`,
);
const [after] = await sql.query(
  `SELECT count(*)::int AS links, count(*) FILTER (WHERE ${HAS_TOKEN})::int AS with_tokens FROM accounts WHERE provider = 'google'`,
);
console.log(`\nCleared ${cleared.length} link(s). Links remaining: ${after.links}; still holding a token: ${after.with_tokens}.`);
if (after.links !== before.links || after.with_tokens !== 0) {
  console.error("Unexpected result: check the accounts table.");
  process.exit(1);
}
