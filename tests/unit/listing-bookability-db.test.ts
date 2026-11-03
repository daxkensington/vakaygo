// @vitest-environment node
import { neon } from "@neondatabase/serverless";
import { PgDialect } from "drizzle-orm/pg-core";
import { expect, it } from "vitest";
import { currentListingBookable } from "@/server/listing-bookability-sql";

it.skipIf(process.env.VAKAYGO_DISCOVERY_DB_TESTS !== "true")("matches canonical readiness through activation and live revocations in isolated PostgreSQL", async () => {
  const url = new URL(process.env.DATABASE_URL || "http://invalid");
  const local = url.hostname === "127.0.0.1" && url.port === "5498";
  const hosted = process.env.CI === "true" && process.env.VAKAYGO_CI_DATABASE_PROXY === "1"
    && ["127.0.0.1", "localhost"].includes(url.hostname) && url.port === "5432";
  if ((!local && !hosted) || url.pathname !== "/vakaygo_test" || url.username !== "audit")
    throw new Error("Owned audit or hosted disposable PostgreSQL required");
  const expression = new PgDialect().sqlToQuery(currentListingBookable());
  expect(expression.params).toEqual([]);
  const db = neon(process.env.DATABASE_URL!);
  // A subtransaction rolls back every fixture and simulated configuration change.
  // Assertions use the actual production helper and the actual canonical function.
  await db.query(`DO $audit$
  DECLARE target uuid := '94100000-0000-4000-8000-000000000001';
    actor uuid := '94000000-0000-4000-8000-000000000001';
    claim uuid := '94200000-0000-4000-8000-000000000001';
    proof uuid := '94300000-0000-4000-8000-000000000001';
    canonical boolean; guarded boolean; change_sql text;
  BEGIN BEGIN
    INSERT INTO islands(id,slug,name,country) VALUES(994101,'bookability-guard-fixture','Bookability guard fixture','Canada');
    INSERT INTO users(id,email,name,role,email_verified) VALUES(actor,'bookability-guard@example.invalid','Synthetic guard owner','operator',true);
    INSERT INTO listings(id,operator_id,island_id,type,title,slug,status,price_amount,price_currency,price_unit,max_guests,cancellation_policy)
      VALUES(target,actor,994101,'tour','Synthetic guard listing','bookability-guard-target','active',50,'USD','person',4,'moderate');
    SELECT vakaygo_listing_bookable(target),${expression.sql} INTO canonical,guarded FROM listings WHERE id=target;
    IF canonical OR guarded THEN RAISE EXCEPTION 'Unactivated import became bookable'; END IF;
    INSERT INTO listing_claims(id,listing_id,operator_id,contact_name,contact_phone,status)
      VALUES(claim,target,actor,'Synthetic owner','+12465559401','approved');
    INSERT INTO listing_trusted_contacts(listing_id,original_operator_id,phone,source,source_reference)
      VALUES(target,actor,'+12465559401','synthetic','guard-fixture');
    INSERT INTO listing_claim_verifications(id,listing_id,operator_id,claim_id,target_phone,service_sid,provider_account_id,provider_verification_id,status,provider_approved_at,verified_at)
      VALUES(proof,target,actor,claim,'+12465559401','VA_guard','AC_guard','VE_guard','verified',now(),now());
    INSERT INTO listing_onboarding(listing_id,operator_id,verified_claim_id,business_legal_name,business_country,business_address,representative_name,
      authority_accepted_at,terms_version,terms_accepted_at,stripe_account_id,provider_environment,platform_account_id,provider_country,
      charges_enabled,payouts_enabled,details_submitted,card_payments_active,transfers_active,provider_checked_at)
      VALUES(target,actor,proof,'Synthetic guard company','CA','123 Synthetic Road','Synthetic owner',now(),'2026-10-27',now(),
        'acct_guardoperator','test','acct_guardplatform','CA',true,true,true,true,true,now());
    INSERT INTO availability(listing_id,date,spots,spots_remaining,is_blocked) VALUES(target,current_date+100,4,4,false);
    UPDATE booking_provider_config SET environment='test',platform_account_id='acct_guardplatform',allowed_countries='["CA"]';
    UPDATE feature_flags SET enabled=true WHERE key='booking_launch_enabled';
    SELECT vakaygo_listing_bookable(target),${expression.sql} INTO canonical,guarded FROM listings WHERE id=target;
    IF canonical OR guarded THEN RAISE EXCEPTION 'Completed but unactivated listing became bookable'; END IF;
    UPDATE listing_onboarding SET activated_at=now() WHERE listing_id=target;
    SELECT vakaygo_listing_bookable(target),${expression.sql} INTO canonical,guarded FROM listings WHERE id=target;
    IF canonical IS DISTINCT FROM true OR guarded IS DISTINCT FROM true THEN RAISE EXCEPTION 'Ready activated listing was lost'; END IF;
    FOREACH change_sql IN ARRAY ARRAY[
      'UPDATE feature_flags SET enabled=false WHERE key=''booking_launch_enabled''',
      'UPDATE listing_onboarding SET activated_at=NULL WHERE listing_id='''||target||'''',
      'UPDATE listing_onboarding SET suspended_at=now() WHERE listing_id='''||target||'''',
      'UPDATE listing_onboarding SET provider_checked_at=now()-interval ''16 minutes'' WHERE listing_id='''||target||'''',
      'UPDATE listing_onboarding SET provider_revoked_at=now() WHERE listing_id='''||target||'''',
      'UPDATE listing_onboarding SET charges_enabled=false WHERE listing_id='''||target||'''',
      'UPDATE listing_claim_verifications SET status=''revoked'' WHERE id='''||proof||'''',
      'UPDATE listings SET status=''paused'' WHERE id='''||target||'''',
      'UPDATE availability SET is_blocked=true WHERE listing_id='''||target||''''
    ] LOOP BEGIN
      EXECUTE change_sql;
      SELECT vakaygo_listing_bookable(target),${expression.sql} INTO canonical,guarded FROM listings WHERE id=target;
      IF canonical IS DISTINCT FROM false OR guarded IS DISTINCT FROM canonical THEN
        RAISE EXCEPTION 'Guard diverged or bypassed current readiness: %',change_sql;
      END IF;
      RAISE EXCEPTION USING ERRCODE='PZ001',MESSAGE='restore synthetic readiness';
    EXCEPTION WHEN SQLSTATE 'PZ001' THEN NULL; END; END LOOP;
    RAISE EXCEPTION USING ERRCODE='PZ002',MESSAGE='rollback synthetic guard fixture';
  EXCEPTION WHEN SQLSTATE 'PZ002' THEN NULL; END; END $audit$`, []);
  expect(await db`SELECT id FROM listings WHERE id='94100000-0000-4000-8000-000000000001'`).toEqual([]);
});
