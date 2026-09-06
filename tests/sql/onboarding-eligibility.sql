\set ON_ERROR_STOP on
-- Runs only after the isolated, synthetic booking-integrity fixture.
DO $checks$
DECLARE change_sql text; before_bookings integer; before_mail integer; denied boolean;
BEGIN
 IF NOT vakaygo_listing_bookable('20000000-0000-4000-8000-000000000001') THEN
   RAISE EXCEPTION 'Positive synthetic fixture must be ready before testing revocation';
 END IF;
 SELECT count(*) INTO before_bookings FROM bookings;
 SELECT count(*) INTO before_mail FROM booking_mail_outbox;
 FOREACH change_sql IN ARRAY ARRAY[
   $$UPDATE feature_flags SET enabled=false WHERE key='booking_launch_enabled'$$,
   $$UPDATE listing_claim_verifications SET status='pending'$$,
   $$UPDATE listing_claim_verifications SET revoked_at=now()$$,
   $$UPDATE listing_claim_verifications SET verified_at=NULL$$,
   $$UPDATE listing_onboarding SET operator_id='10000000-0000-4000-8000-000000000002'$$,
   $$UPDATE listing_onboarding SET business_legal_name=NULL$$,
   $$UPDATE listing_onboarding SET authority_accepted_at=NULL$$,
   $$UPDATE listing_onboarding SET terms_version='old-version'$$,
   $$UPDATE listing_onboarding SET terms_accepted_at=NULL$$,
   $$UPDATE listing_onboarding SET activated_at=NULL$$,
   $$UPDATE listing_onboarding SET suspended_at=now()$$,
   $$UPDATE listing_onboarding SET stripe_account_id=NULL$$,
   $$UPDATE listing_onboarding SET provider_environment='live'$$,
   $$UPDATE listing_onboarding SET platform_account_id='acct_unrelated'$$,
   $$UPDATE listing_onboarding SET provider_country='GD'$$,
   $$UPDATE listing_onboarding SET charges_enabled=false$$,
   $$UPDATE listing_onboarding SET payouts_enabled=false$$,
   $$UPDATE listing_onboarding SET details_submitted=false$$,
   $$UPDATE listing_onboarding SET card_payments_active=false$$,
   $$UPDATE listing_onboarding SET transfers_active=false$$,
   $$UPDATE listing_onboarding SET provider_revoked_at=now()$$,
   $$UPDATE listing_onboarding SET provider_checked_at=now()-interval '16 minutes'$$,
   $$UPDATE listing_onboarding SET provider_checked_at=now()+interval '1 minute'$$,
   $$UPDATE booking_provider_config SET allowed_countries='[]'$$,
   $$UPDATE booking_provider_config SET platform_account_id='acct_otherplatform'$$,
   $$UPDATE listings SET status='paused' WHERE slug='audit-tour'$$,
   $$UPDATE listings SET operator_id='10000000-0000-4000-8000-000000000002' WHERE slug='audit-tour'$$,
   $$UPDATE availability SET is_blocked=true$$
 ] LOOP
   BEGIN
     EXECUTE change_sql;
     IF vakaygo_listing_bookable('20000000-0000-4000-8000-000000000001') THEN
       RAISE EXCEPTION 'Readiness incorrectly survives %',change_sql;
     END IF;
     denied := false;
     BEGIN
       PERFORM audit_book('must-not-create','2099-12-20');
     EXCEPTION WHEN raise_exception THEN
       IF SQLERRM NOT LIKE 'VG_BOOKING:%' THEN RAISE; END IF;
       denied := true;
     END;
     IF NOT denied THEN RAISE EXCEPTION 'Booking bypassed eligibility: %',change_sql; END IF;
     denied := false;
     BEGIN
       INSERT INTO bookings(booking_number,traveler_id,operator_id,listing_id,status,start_date,guest_count,subtotal,total_amount)
       VALUES('must-not-request','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','requested','2099-12-20',1,0,0);
     EXCEPTION WHEN raise_exception THEN
       IF SQLERRM NOT LIKE 'VG_BOOKING:%' THEN RAISE; END IF;
       denied := true;
     END;
     IF NOT denied THEN RAISE EXCEPTION 'Request bypassed eligibility: %',change_sql; END IF;
     IF (SELECT count(*) FROM bookings)<>before_bookings OR (SELECT count(*) FROM booking_mail_outbox)<>before_mail THEN
       RAISE EXCEPTION 'Closed booking changed records or notification queue';
     END IF;
     -- Roll back each simulated revocation while preserving assertion failures.
     RAISE EXCEPTION USING ERRCODE='PZ001',MESSAGE='restore synthetic readiness';
   EXCEPTION WHEN SQLSTATE 'PZ001' THEN NULL;
   END;
 END LOOP;
END $checks$;

DO $$ BEGIN
 BEGIN
   PERFORM audit_book('unpublished-date','2099-11-30');
   RAISE EXCEPTION 'Missing calendar row must not imply availability';
 EXCEPTION WHEN raise_exception THEN
   IF SQLERRM NOT LIKE 'VG_BOOKING:%available%' THEN RAISE; END IF;
 END;
 BEGIN
   UPDATE listing_onboarding SET suspended_at=now();
   -- Existing cancellations and tracked refund updates remain possible.
   UPDATE bookings SET status='cancelled',refund_status='failed' WHERE booking_number='refund-full';
   RAISE EXCEPTION USING ERRCODE='PZ001',MESSAGE='restore historical fixture';
 EXCEPTION WHEN SQLSTATE 'PZ001' THEN NULL;
 END;
END $$;
