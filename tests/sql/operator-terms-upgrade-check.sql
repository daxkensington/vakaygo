\set ON_ERROR_STOP on
-- Run in one disposable database with migrations0000-0017 + the OLD09-06
-- booking-integrity fixture, then migration0018, then the default after phase:
-- psql <owned-test-db> -v before_upgrade=true -f tests/sql/operator-terms-upgrade-check.sql
-- psql <owned-test-db> -f drizzle/migrations/0018_operator_terms_revision.sql
-- psql <owned-test-db> -f tests/sql/operator-terms-upgrade-check.sql
DO $$ BEGIN
 IF current_database() NOT IN ('vakaygo_test','vakaygo_terms','vakaygo_terms_upgrade') THEN
   RAISE EXCEPTION 'Disposable operator-terms upgrade database required';
 END IF;
END $$;
\if :{?before_upgrade}
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.operator_terms_acceptances') IS NOT NULL THEN RAISE EXCEPTION 'Before phase requires pre0018 database'; END IF;
 IF NOT EXISTS(SELECT 1 FROM listing_onboarding WHERE terms_version='2026-09-06' AND terms_accepted_at IS NOT NULL)
   OR EXISTS(SELECT 1 FROM listing_onboarding WHERE terms_version='2026-10-27') THEN
   RAISE EXCEPTION 'Seed the original17 fixture with exact September6 consent before upgrade';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM bookings WHERE paid_at IS NOT NULL AND payment_id IS NOT NULL) THEN RAISE EXCEPTION 'A nonempty paid history fixture is required'; END IF;
END $$;
-- A synthetic unsettled historical ledger makes payout preservation non-vacuous.
INSERT INTO payouts(id,operator_id,amount,currency,status,period_start,period_end,booking_count,payment_reference)
 VALUES('75000000-0000-4000-8000-000000000099','10000000-0000-4000-8000-000000000001',42,'USD','pending',now()-interval '7 days',now(),1,'terms-upgrade-synthetic-history');
CREATE TABLE audit_operator_terms_upgrade_baseline AS
 SELECT (SELECT jsonb_agg(to_jsonb(n) ORDER BY n.listing_id) FROM listing_onboarding n) AS onboarding,
   (SELECT jsonb_agg(to_jsonb(b) ORDER BY b.id) FROM bookings b) AS bookings,
   (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM payouts p) AS payouts,
   (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM rejected_payment_refunds r) AS rejected_refunds,
   (SELECT jsonb_agg(to_jsonb(o) ORDER BY o.id) FROM booking_mail_outbox o) AS outbox,
   (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM operator_payout_profiles p) AS payout_profiles,
   (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM booking_provider_config c) AS provider_config,
   (SELECT jsonb_agg(to_jsonb(f) ORDER BY f.key) FROM feature_flags f) AS flags;
COMMIT;
\else
BEGIN;
DO $checks$
DECLARE saved audit_operator_terms_upgrade_baseline%ROWTYPE; acceptance jsonb; expected_count integer;
 target uuid; owner_id uuid; old_receipt jsonb; new_stamp timestamptz;
BEGIN
 SELECT * INTO STRICT saved FROM audit_operator_terms_upgrade_baseline;
 IF vakaygo_operator_terms_version()<>'2026-10-27' THEN RAISE EXCEPTION 'New terms policy version was not installed'; END IF;
 IF (SELECT jsonb_agg(to_jsonb(n) ORDER BY n.listing_id) FROM listing_onboarding n) IS DISTINCT FROM saved.onboarding
   OR (SELECT jsonb_agg(to_jsonb(b) ORDER BY b.id) FROM bookings b) IS DISTINCT FROM saved.bookings
   OR (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM payouts p) IS DISTINCT FROM saved.payouts
   OR (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM rejected_payment_refunds r) IS DISTINCT FROM saved.rejected_refunds
   OR (SELECT jsonb_agg(to_jsonb(o) ORDER BY o.id) FROM booking_mail_outbox o) IS DISTINCT FROM saved.outbox
   OR (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM operator_payout_profiles p) IS DISTINCT FROM saved.payout_profiles
   OR (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM booking_provider_config c) IS DISTINCT FROM saved.provider_config
   OR (SELECT jsonb_agg(to_jsonb(f) ORDER BY f.key) FROM feature_flags f) IS DISTINCT FROM saved.flags THEN
   RAISE EXCEPTION 'Upgrade changed current consent, activation, financial history, provider or launch configuration';
 END IF;
 SELECT count(*) INTO expected_count FROM jsonb_array_elements(saved.onboarding) n
   WHERE n->>'terms_version' IS NOT NULL AND n->>'terms_accepted_at' IS NOT NULL;
 IF (SELECT count(*) FROM operator_terms_acceptances)<>expected_count
   OR EXISTS(SELECT 1 FROM operator_terms_acceptances WHERE terms_version='2026-10-27' OR record_origin<>'observed_existing') THEN
   RAISE EXCEPTION 'Migration fabricated or relabeled acceptance instead of observing old evidence';
 END IF;
 FOR acceptance IN SELECT value FROM jsonb_array_elements(saved.onboarding) LOOP
   IF acceptance->>'terms_version' IS NULL OR acceptance->>'terms_accepted_at' IS NULL THEN CONTINUE; END IF;
   IF NOT EXISTS(SELECT 1 FROM operator_terms_acceptances r
     WHERE r.listing_id=(acceptance->>'listing_id')::uuid AND r.operator_id=(acceptance->>'operator_id')::uuid
       AND r.terms_version=acceptance->>'terms_version' AND r.accepted_at=(acceptance->>'terms_accepted_at')::timestamptz
       AND r.authority_accepted_at IS NOT DISTINCT FROM (acceptance->>'authority_accepted_at')::timestamptz
       AND r.business_legal_name IS NOT DISTINCT FROM acceptance->>'business_legal_name'
       AND r.business_country IS NOT DISTINCT FROM acceptance->>'business_country'
       AND r.business_address IS NOT DISTINCT FROM acceptance->>'business_address'
       AND r.representative_name IS NOT DISTINCT FROM acceptance->>'representative_name') THEN
     RAISE EXCEPTION 'Exact legacy acceptance context was lost';
   END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM listing_onboarding n WHERE n.terms_version='2026-09-06'
   AND (vakaygo_onboarding_complete(n.listing_id) OR vakaygo_listing_bookable(n.listing_id))) THEN
   RAISE EXCEPTION 'Old consent retained new-booking eligibility after upgrade';
 END IF;
 -- A later explicit save produces a separate receipt, never a relabeled backfill.
 SELECT listing_id,operator_id INTO target,owner_id FROM listing_onboarding WHERE terms_version='2026-09-06' ORDER BY listing_id LIMIT 1;
 SELECT to_jsonb(r) INTO old_receipt FROM operator_terms_acceptances r WHERE listing_id=target AND terms_version='2026-09-06';
 new_stamp:=clock_timestamp();
 UPDATE listing_onboarding SET terms_version=vakaygo_operator_terms_version(),terms_accepted_at=new_stamp,
   authority_accepted_at=new_stamp,activated_at=NULL WHERE listing_id=target;
 IF NOT EXISTS(SELECT 1 FROM operator_terms_acceptances WHERE listing_id=target AND operator_id=owner_id
   AND terms_version='2026-10-27' AND accepted_at=new_stamp AND record_origin='explicit_acceptance')
   OR NOT EXISTS(SELECT 1 FROM operator_terms_acceptances r WHERE to_jsonb(r)=old_receipt) THEN
   RAISE EXCEPTION 'Explicit new acceptance lost or relabeled legacy receipt';
 END IF;
 IF vakaygo_listing_bookable(target) OR EXISTS(SELECT 1 FROM listing_onboarding WHERE listing_id=target AND activated_at IS NOT NULL) THEN
   RAISE EXCEPTION 'Explicit acceptance automatically activated the listing';
 END IF;
 IF (SELECT jsonb_agg(to_jsonb(b) ORDER BY b.id) FROM bookings b) IS DISTINCT FROM saved.bookings
   OR (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM payouts p) IS DISTINCT FROM saved.payouts
   OR (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM rejected_payment_refunds r) IS DISTINCT FROM saved.rejected_refunds THEN
   RAISE EXCEPTION 'Explicit reacceptance rewrote historical financial records';
 END IF;
 RAISE NOTICE 'Operator terms upgrade: old evidence and financial history preserved; later explicit new receipt is separate and not activation';
END $checks$;
ROLLBACK;
\endif
