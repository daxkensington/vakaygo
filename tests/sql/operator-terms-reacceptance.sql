\set ON_ERROR_STOP on
-- Synthetic PostgreSQL only. No provider or email transport is involved.
DO $$ BEGIN
 IF current_database() NOT IN ('vakaygo_test','vakaygo_terms','vakaygo_terms_upgrade') THEN
   RAISE EXCEPTION 'Disposable operator-terms test database required';
 END IF;
END $$;
BEGIN;
INSERT INTO islands(id,slug,name,country,timezone) VALUES(990018,'terms-reacceptance-fixture','Terms reacceptance fixture','Canada','America/Toronto');
INSERT INTO users(id,email,role,email_verified) VALUES
 ('71000000-0000-4000-8000-000000000001','terms-owner@example.invalid','operator',true),
 ('71000000-0000-4000-8000-000000000002','terms-traveler@example.invalid','traveler',true);
INSERT INTO listings(id,operator_id,island_id,type,title,slug,status,price_amount,price_currency,price_unit,max_guests,cancellation_policy) VALUES
 ('72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001',990018,'tour','Terms Stripe fixture','terms-stripe','active',100,'USD','person',4,'moderate'),
 ('72000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000001',990018,'tour','Terms direct fixture','terms-direct','active',100,'USD','person',4,'moderate');
INSERT INTO listing_trusted_contacts(listing_id,original_operator_id,phone,source,source_reference)
 SELECT id,operator_id,'+1246555720'||right(id::text,1),'synthetic','operator-terms-fixture'
 FROM listings WHERE island_id=990018;
INSERT INTO listing_claims(id,listing_id,operator_id,status,contact_name,contact_phone)
 SELECT ('73000000-0000-4000-8000-00000000000'||right(id::text,1))::uuid,id,operator_id,'approved','Synthetic owner','+1246555720'||right(id::text,1)
 FROM listings WHERE island_id=990018;
INSERT INTO listing_claim_verifications(id,listing_id,operator_id,claim_id,target_phone,service_sid,provider_account_id,provider_verification_id,status,provider_approved_at,verified_at)
 SELECT ('74000000-0000-4000-8000-00000000000'||right(l.id::text,1))::uuid,l.id,l.operator_id,c.id,'+1246555720'||right(l.id::text,1),'VA_terms_fixture','AC_terms_fixture','VE_terms_'||right(l.id::text,1),'verified',now(),now()
 FROM listings l JOIN listing_claims c ON c.listing_id=l.id WHERE l.island_id=990018;
UPDATE booking_provider_config SET environment='test',platform_account_id='acct_termsplatform',allowed_countries='["CA"]'::json WHERE id=true;
UPDATE feature_flags SET enabled=true WHERE key='booking_launch_enabled';
INSERT INTO listing_onboarding(listing_id,operator_id,verified_claim_id,business_legal_name,business_country,business_address,representative_name,authority_accepted_at,terms_version,terms_accepted_at,stripe_account_id,provider_environment,platform_account_id,provider_country,charges_enabled,payouts_enabled,details_submitted,card_payments_active,transfers_active,provider_checked_at,activated_at)
 SELECT l.id,l.operator_id,v.id,'Initial terms company',CASE WHEN right(l.id::text,1)='1' THEN 'CA' ELSE 'GD' END,'123 Synthetic Terms Road','Initial representative',now(),vakaygo_operator_terms_version(),now(),
   CASE WHEN right(l.id::text,1)='1' THEN 'acct_termsstripe' ELSE NULL END,'test','acct_termsplatform',CASE WHEN right(l.id::text,1)='1' THEN 'CA' ELSE 'GD' END,true,true,true,true,true,now(),now()
 FROM listings l JOIN listing_claim_verifications v ON v.listing_id=l.id WHERE l.island_id=990018;
INSERT INTO operator_payout_profiles(listing_id,operator_id,payout_method,payout_currency,w8ben_certified,w8ben_signed_at,status)
 VALUES('72000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000001','wise','USD',true,now(),'verified');
INSERT INTO availability(listing_id,date,spots,spots_remaining,is_blocked)
 SELECT l.id,current_date+offs,4,4,false FROM listings l CROSS JOIN generate_series(120,125) offs WHERE l.island_id=990018;

-- Paid history and pending checkout fixtures exist before reacceptance is required.
INSERT INTO bookings(id,booking_number,traveler_id,operator_id,listing_id,start_date,guest_count,subtotal,service_fee,total_amount,currency,payment_method)
 SELECT ('76000000-0000-4000-8000-00000000000'||right(id::text,1))::uuid,'terms-paid-'||right(id::text,1),'71000000-0000-4000-8000-000000000002',operator_id,id,current_date+120,1,100,0,100,'USD','card'
 FROM listings WHERE island_id=990018;
UPDATE bookings SET checkout_session_id='cs_terms_'||right(listing_id::text,1),checkout_stripe_account_id=CASE WHEN right(listing_id::text,1)='1' THEN 'acct_termsstripe' ELSE 'acct_termsplatform' END,
 payment_mode=CASE WHEN right(listing_id::text,1)='1' THEN 'destination' ELSE 'platform' END,operator_earnings_cents=8500
 WHERE booking_number LIKE 'terms-paid-%';
UPDATE bookings SET status='confirmed',payment_id='pi_terms_'||right(listing_id::text,1),paid_at=now() WHERE booking_number LIKE 'terms-paid-%';
INSERT INTO bookings(id,booking_number,traveler_id,operator_id,listing_id,start_date,guest_count,subtotal,service_fee,total_amount,currency,payment_method)
 SELECT ('77000000-0000-4000-8000-00000000000'||right(id::text,1))::uuid,'terms-pending-'||right(id::text,1),'71000000-0000-4000-8000-000000000002',operator_id,id,current_date+121,1,100,0,100,'USD','card'
 FROM listings WHERE island_id=990018;
INSERT INTO payouts(id,operator_id,amount,currency,status,period_start,period_end,booking_count,payment_reference)
 VALUES('75000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001',85,'USD','pending',now()-interval '7 days',now(),1,'manual-settlement-required');
UPDATE bookings SET payout_id='75000000-0000-4000-8000-000000000001' WHERE booking_number='terms-paid-2';

CREATE TEMP TABLE terms_history_before AS
 SELECT (SELECT jsonb_agg(to_jsonb(b) ORDER BY b.id) FROM bookings b) AS bookings,
   (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM payouts p) AS payouts,
   (SELECT jsonb_agg(to_jsonb(o) ORDER BY o.id) FROM booking_mail_outbox o) AS outbox,
   (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM operator_payout_profiles p) AS payout_profiles;

DO $checks$
DECLARE target uuid; old_receipt jsonb; before_provider jsonb; after_provider jsonb;
 candidate record; blocked boolean; activated boolean; accepted timestamptz; receipt_count integer;
 legacy_stamp timestamptz := '2026-09-10 10:00:00+00'; owner_id uuid := '71000000-0000-4000-8000-000000000001';
BEGIN
 IF vakaygo_operator_terms_version()<>'2026-10-27' THEN RAISE EXCEPTION 'Expected reviewed revision identifier'; END IF;
 FOR target IN SELECT id FROM listings WHERE island_id=990018 ORDER BY id LOOP
   IF NOT vakaygo_listing_bookable(target) THEN RAISE EXCEPTION 'Positive rail fixture is not bookable: %',target; END IF;
   SELECT to_jsonb(n)-ARRAY['terms_version','terms_accepted_at','authority_accepted_at','business_legal_name','representative_name','activated_at','updated_at'] INTO before_provider
     FROM listing_onboarding n WHERE listing_id=target;
   UPDATE listing_onboarding SET terms_version='2026-09-06',terms_accepted_at=legacy_stamp,authority_accepted_at=legacy_stamp-interval '1 minute',
     business_legal_name='Legacy terms company',representative_name='Legacy representative' WHERE listing_id=target;
   SELECT to_jsonb(r) INTO old_receipt FROM operator_terms_acceptances r
     WHERE listing_id=target AND terms_version='2026-09-06' AND accepted_at=legacy_stamp;
   IF old_receipt IS NULL THEN RAISE EXCEPTION 'Old exact consent was not preserved'; END IF;
   FOR candidate IN SELECT * FROM (VALUES
     ('legacy','2026-09-06'::text,legacy_stamp),
     ('missing version',NULL::text,legacy_stamp),
     ('missing timestamp','2026-10-27'::text,NULL::timestamptz),
     ('future version','2099-01-01'::text,legacy_stamp)
   ) AS cases(label,version,stamp) LOOP
     UPDATE listing_onboarding SET terms_version=candidate.version,terms_accepted_at=candidate.stamp WHERE listing_id=target;
     IF vakaygo_onboarding_complete(target) OR vakaygo_listing_bookable(target) OR vakaygo_activate_listing(target,owner_id) THEN
       RAISE EXCEPTION 'Rail % accepted % terms',target,candidate.label;
     END IF;
     blocked:=false;
     BEGIN
       INSERT INTO bookings(booking_number,traveler_id,operator_id,listing_id,start_date,guest_count,subtotal,service_fee,total_amount,currency,payment_method)
       VALUES('terms-must-reject','71000000-0000-4000-8000-000000000002',owner_id,target,current_date+122,1,100,0,100,'USD','card');
     EXCEPTION WHEN raise_exception THEN
       IF SQLERRM NOT LIKE 'VG_BOOKING:%' THEN RAISE; END IF; blocked:=true;
     END;
     IF NOT blocked THEN RAISE EXCEPTION 'New booking bypassed % terms on %',candidate.label,target; END IF;
     blocked:=false;
     BEGIN
       UPDATE bookings SET status='confirmed',payment_id='pi_terms_must_reject',paid_at=now()
       WHERE listing_id=target AND booking_number LIKE 'terms-pending-%';
     EXCEPTION WHEN raise_exception THEN
       IF SQLERRM NOT LIKE 'VG_BOOKING:%' THEN RAISE; END IF; blocked:=true;
     END;
     IF NOT blocked THEN RAISE EXCEPTION 'Pending payment bypassed % terms on %',candidate.label,target; END IF;
   END LOOP;

   -- Explicit acceptance is not activation. This mirrors saveOnboarding's reset.
   accepted:=clock_timestamp();
   UPDATE listing_onboarding SET terms_version=vakaygo_operator_terms_version(),terms_accepted_at=accepted,authority_accepted_at=accepted,
     business_legal_name='Current terms company',representative_name='Current representative',activated_at=NULL WHERE listing_id=target;
   IF NOT vakaygo_onboarding_complete(target) OR vakaygo_listing_bookable(target) THEN
     RAISE EXCEPTION 'New consent did not require separate activation for %',target;
   END IF;
   IF NOT EXISTS(SELECT 1 FROM operator_terms_acceptances WHERE listing_id=target AND operator_id=owner_id
     AND terms_version='2026-10-27' AND accepted_at=accepted AND record_origin='explicit_acceptance'
     AND business_legal_name='Current terms company' AND representative_name='Current representative') THEN
     RAISE EXCEPTION 'New exact acceptance receipt missing';
   END IF;
   IF NOT EXISTS(SELECT 1 FROM operator_terms_acceptances r WHERE to_jsonb(r)=old_receipt) THEN
     RAISE EXCEPTION 'Old receipt was relabeled or overwritten';
   END IF;
   IF EXISTS(SELECT 1 FROM operator_terms_acceptances WHERE listing_id=target AND terms_version='2026-10-27' AND accepted_at=legacy_stamp) THEN
     RAISE EXCEPTION 'Old timestamp was relabeled as new acceptance';
   END IF;
   SELECT count(*) INTO receipt_count FROM operator_terms_acceptances WHERE listing_id=target;
   activated:=vakaygo_activate_listing(target,owner_id);
   IF NOT activated OR NOT vakaygo_listing_bookable(target) THEN
     RAISE EXCEPTION 'Explicit activation did not restore ready rail %',target;
   END IF;
   UPDATE listing_onboarding SET updated_at=now() WHERE listing_id=target;
   IF (SELECT count(*) FROM operator_terms_acceptances WHERE listing_id=target)<>receipt_count THEN
     RAISE EXCEPTION 'Routine readiness update duplicated a consent receipt';
   END IF;
   SELECT to_jsonb(n)-ARRAY['terms_version','terms_accepted_at','authority_accepted_at','business_legal_name','representative_name','activated_at','updated_at'] INTO after_provider
     FROM listing_onboarding n WHERE listing_id=target;
   IF before_provider IS DISTINCT FROM after_provider THEN RAISE EXCEPTION 'Reacceptance changed payment or claim proof'; END IF;
 END LOOP;
 IF (SELECT jsonb_agg(to_jsonb(b) ORDER BY b.id) FROM bookings b) IS DISTINCT FROM (SELECT bookings FROM terms_history_before)
   OR (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM payouts p) IS DISTINCT FROM (SELECT payouts FROM terms_history_before)
   OR (SELECT jsonb_agg(to_jsonb(o) ORDER BY o.id) FROM booking_mail_outbox o) IS DISTINCT FROM (SELECT outbox FROM terms_history_before)
   OR (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM operator_payout_profiles p) IS DISTINCT FROM (SELECT payout_profiles FROM terms_history_before) THEN
   RAISE EXCEPTION 'Terms changes rewrote historical amounts, payment, payout, mail or profile records';
 END IF;

 -- Historical fulfillment/cancellation/refund/settlement remain possible on old terms.
 UPDATE listing_onboarding SET terms_version='2026-09-06',terms_accepted_at=legacy_stamp WHERE listing_id IN (SELECT id FROM listings WHERE island_id=990018);
 BEGIN
   UPDATE bookings SET status='completed' WHERE booking_number='terms-paid-2';
   UPDATE bookings SET status='cancelled',cancellation_requested_at=now(),cancellation_refund_cents=10000 WHERE booking_number='terms-paid-1';
   UPDATE bookings SET refund_id='re_terms_history',refund_status='pending' WHERE booking_number='terms-paid-1';
   UPDATE bookings SET refund_status='failed' WHERE booking_number='terms-paid-1';
   UPDATE payouts SET status='completed',paid_at=now(),payment_reference='terms-history-settlement' WHERE id='75000000-0000-4000-8000-000000000001';
   IF NOT EXISTS(SELECT 1 FROM bookings WHERE booking_number='terms-paid-1' AND status='cancelled' AND refund_status='failed'
     AND subtotal=100 AND total_amount=100 AND paid_at IS NOT NULL AND payment_id='pi_terms_1' AND cancellation_policy_snapshot='moderate')
     OR NOT EXISTS(SELECT 1 FROM bookings WHERE booking_number='terms-paid-2' AND status='completed' AND total_amount=100 AND paid_at IS NOT NULL)
     OR NOT EXISTS(SELECT 1 FROM payouts WHERE id='75000000-0000-4000-8000-000000000001' AND status='completed' AND amount=85 AND currency='USD') THEN
     RAISE EXCEPTION 'Historical service or financial support was blocked or repriced';
   END IF;
   RAISE EXCEPTION USING ERRCODE='PZ018',MESSAGE='restore historical support assertions';
 EXCEPTION WHEN SQLSTATE 'PZ018' THEN NULL;
 END;
 RAISE NOTICE 'Operator terms: both rails, exact consent receipts, separate activation and historical support passed';
END $checks$;
ROLLBACK;
