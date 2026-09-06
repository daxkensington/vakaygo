\set ON_ERROR_STOP on
INSERT INTO islands(id,slug,name,country,timezone) VALUES(900001,'audit-island','Audit island','Grenada','America/Grenada');
INSERT INTO users(id,email,role,email_verified) VALUES('10000000-0000-4000-8000-000000000001','audit-operator@example.invalid','operator',true),('10000000-0000-4000-8000-000000000002','audit-traveler@example.invalid','traveler',true);
INSERT INTO listings(id,operator_id,island_id,type,title,slug,status,price_amount,price_currency,price_unit,max_guests,cancellation_policy)
 VALUES('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',900001,'tour','Audit tour','audit-tour','active',65,'USD','person',2,'moderate');
INSERT INTO availability(listing_id,date,spots,is_blocked) VALUES('20000000-0000-4000-8000-000000000001','2099-12-01',2,true);
-- Synthetic positive evidence for inventory/refund tests; never use this fixture to onboard a real company.
INSERT INTO availability(listing_id,date,spots,spots_remaining,is_blocked)
 SELECT '20000000-0000-4000-8000-000000000001',d,2,2,false FROM generate_series(date '2099-12-02',date '2099-12-31',interval '1 day') d;
INSERT INTO users(id,email,role) VALUES('10000000-0000-4000-8000-000000000003','unclaimed@vakaygo.com','operator');
INSERT INTO listing_trusted_contacts(listing_id,original_operator_id,phone,source,source_reference)
 VALUES('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','+14735550100','google-places','synthetic-independent-source');
INSERT INTO listing_claims(id,listing_id,operator_id,status,contact_name,contact_phone)
 VALUES('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','approved','Synthetic operator','+14735550100');
INSERT INTO listing_claim_verifications(id,listing_id,operator_id,claim_id,target_phone,service_sid,provider_account_id,provider_verification_id,status,provider_approved_at,verified_at)
 VALUES('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','+14735550100','VA_sql_fixture','AC_sql_fixture','VE_sql_fixture','verified',now(),now());
UPDATE booking_provider_config SET environment='test',platform_account_id='acct_sqlplatform',allowed_countries='["CA"]'::json WHERE id=true;
UPDATE feature_flags SET enabled=true WHERE key='booking_launch_enabled';
INSERT INTO listing_onboarding(listing_id,operator_id,verified_claim_id,business_legal_name,business_country,business_address,representative_name,authority_accepted_at,terms_version,terms_accepted_at,stripe_account_id,provider_environment,platform_account_id,provider_country,charges_enabled,payouts_enabled,details_submitted,card_payments_active,transfers_active,provider_checked_at,activated_at)
 VALUES('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','Synthetic company','CA','Synthetic address for database tests','Synthetic representative',now(),'2026-09-06',now(),'acct_sqloperator','test','acct_sqlplatform','CA',true,true,true,true,true,now(),now());

CREATE FUNCTION audit_book(n text, d date, guests integer DEFAULT 1) RETURNS void LANGUAGE sql AS $$
 INSERT INTO bookings(booking_number,traveler_id,operator_id,listing_id,start_date,guest_count,subtotal,service_fee,total_amount,currency,payment_method)
 VALUES(n,'10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',d,guests,65*guests,6.5*guests,71.5*guests,'USD','card');
$$;
DO $$ BEGIN
 BEGIN PERFORM audit_book('blocked','2099-12-01'); RAISE EXCEPTION 'Expected blocked rejection'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'VG_BOOKING:%available%' THEN RAISE; END IF; END;
 BEGIN PERFORM audit_book('zero','2099-12-02',0); RAISE EXCEPTION 'Expected guest rejection'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'VG_BOOKING:%available%' THEN RAISE; END IF; END;
 PERFORM audit_book('hold','2099-12-02',2);
 BEGIN PERFORM audit_book('oversold','2099-12-02'); RAISE EXCEPTION 'Expected capacity rejection'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'VG_BOOKING:%availabl%' THEN RAISE; END IF; END;
 IF (SELECT count(*) FROM booking_mail_outbox o JOIN bookings b ON b.id=o.booking_id WHERE b.booking_number='hold')<>2 THEN RAISE EXCEPTION 'Creation must atomically queue traveler and operator mail'; END IF;
 UPDATE listings SET cancellation_policy='strict' WHERE slug='audit-tour';
 IF (SELECT cancellation_policy_snapshot FROM bookings WHERE booking_number='hold')<>'moderate' THEN RAISE EXCEPTION 'Booking policy changed after listing edit'; END IF;
 UPDATE bookings SET payment_id='pi_sql_original' WHERE booking_number='hold';
 UPDATE bookings SET status='cancelled' WHERE booking_number='hold';
 PERFORM audit_book('released','2099-12-02');
END $$;
-- One seat for the independent concurrent-reservation check.
UPDATE availability SET spots=1,spots_remaining=1 WHERE listing_id='20000000-0000-4000-8000-000000000001' AND date='2099-12-03';

-- Requests do not reserve inventory, but accepting one must reserve it atomically.
INSERT INTO bookings(booking_number,traveler_id,operator_id,listing_id,status,start_date,guest_count,subtotal,total_amount)
 SELECT n,'10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','requested','2099-12-04',2,999,999
 FROM unnest(ARRAY['request-one','request-two']) n;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM bookings WHERE booking_number LIKE 'request-%' AND (total_amount<>0 OR payment_method<>'none')) THEN RAISE EXCEPTION 'Requests must not charge'; END IF;
 UPDATE bookings SET status='confirmed' WHERE booking_number='request-one';
 BEGIN UPDATE bookings SET status='confirmed' WHERE booking_number='request-two'; RAISE EXCEPTION 'Expected request confirmation capacity rejection'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'VG_BOOKING:%availabl%' THEN RAISE; END IF; END;
END $$;

-- Public fixture for rendered listing and keyboard-gallery checks.
UPDATE islands SET is_active=true WHERE id=900001;
INSERT INTO media(listing_id,url,alt,sort_order,is_primary) VALUES
 ('20000000-0000-4000-8000-000000000001','/images/sections/value-local.jpg','Audit photo one',0,true),
 ('20000000-0000-4000-8000-000000000001','/images/sections/value-travel.jpg','Audit photo two',1,false),
 ('20000000-0000-4000-8000-000000000001','/images/sections/value-explore.jpg','Audit photo three',2,false);

-- Rejected payments retain independent identities and cannot corrupt a booking's paid charge.
DO $$
DECLARE target_booking uuid;
BEGIN
 SELECT id INTO target_booking FROM bookings WHERE booking_number='hold';
 UPDATE bookings SET payment_id='pi_sql_original' WHERE id=target_booking;
 INSERT INTO rejected_payment_refunds(booking_id,checkout_session_id,payment_id,amount_cents,currency,refund_id,refund_status)
 VALUES(target_booking,'cs_sql_extra','pi_sql_extra',7150,'USD','re_sql_extra','pending');
 BEGIN
  INSERT INTO rejected_payment_refunds(booking_id,checkout_session_id,payment_id,amount_cents,currency)
  VALUES(target_booking,'cs_sql_extra','pi_sql_other',7150,'USD');
  RAISE EXCEPTION 'Expected unique checkout session';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 BEGIN
  INSERT INTO rejected_payment_refunds(booking_id,checkout_session_id,payment_id,amount_cents,currency)
  VALUES(target_booking,'cs_sql_other','pi_sql_extra',7150,'USD');
  RAISE EXCEPTION 'Expected unique payment identity';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 BEGIN
  INSERT INTO rejected_payment_refunds(booking_id,checkout_session_id,payment_id,amount_cents,currency,refund_id)
  VALUES(target_booking,'cs_sql_other','pi_sql_other',7150,'USD','re_sql_extra');
  RAISE EXCEPTION 'Expected unique refund identity';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 BEGIN
  INSERT INTO rejected_payment_refunds(booking_id,checkout_session_id,payment_id,amount_cents,currency)
  VALUES(target_booking,'cs_sql_zero','pi_sql_zero',0,'USD');
  RAISE EXCEPTION 'Expected positive refund amount';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  INSERT INTO rejected_payment_refunds(booking_id,checkout_session_id,payment_id,amount_cents,currency)
  VALUES('ffffffff-ffff-4fff-8fff-ffffffffffff','cs_sql_missing','pi_sql_missing',7150,'USD');
  RAISE EXCEPTION 'Expected booking foreign key';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 UPDATE rejected_payment_refunds SET refund_status='failed' WHERE payment_id='pi_sql_extra';
 UPDATE rejected_payment_refunds SET refund_status='pending'
 WHERE payment_id='pi_sql_extra' AND coalesce(refund_status,'') NOT IN ('failed','canceled') AND coalesce(refund_status,'')<>'succeeded';
 IF (SELECT refund_status FROM rejected_payment_refunds WHERE payment_id='pi_sql_extra')<>'failed'
 THEN RAISE EXCEPTION 'Delayed response overwrote terminal refund failure'; END IF;
 IF (SELECT payment_id FROM bookings WHERE id=target_booking)<>'pi_sql_original'
 THEN RAISE EXCEPTION 'Rejected payment replaced canonical payment'; END IF;
END $$;

-- Failures correct previously delivered success mail and include partial refunds.
DO $$
DECLARE target_booking uuid; prior_delivery timestamp := timestamp '2026-09-06 00:00:00';
BEGIN
 PERFORM audit_book('refund-full','2099-12-05');
 SELECT id INTO target_booking FROM bookings WHERE booking_number='refund-full';
 UPDATE bookings SET status='confirmed',payment_id='pi_mail_full',paid_at=now() WHERE id=target_booking;
 UPDATE bookings SET status='cancelled',cancellation_requested_at=now(),cancellation_refund_cents=7150 WHERE id=target_booking;
 UPDATE bookings SET status='refunded',refund_id='re_mail_full',refund_status='succeeded' WHERE id=target_booking;
 UPDATE booking_mail_outbox SET delivered_at=prior_delivery WHERE booking_id=target_booking AND kind IN ('cancelled','refunded');
 UPDATE bookings SET status='cancelled',refund_status='failed' WHERE id=target_booking;
 IF (SELECT string_agg(recipient,',' ORDER BY recipient) FROM booking_mail_outbox
     WHERE booking_id=target_booking AND kind='refund_failed' AND delivered_at IS NULL)
     IS DISTINCT FROM 'operator,team,traveler'
 THEN RAISE EXCEPTION 'A failed full refund must queue distinct traveler, operator and support notifications'; END IF;
 IF (SELECT count(*) FROM booking_mail_outbox WHERE booking_id=target_booking
     AND kind IN ('cancelled','refunded') AND delivered_at=prior_delivery)<>4
 THEN RAISE EXCEPTION 'Failure must preserve previously delivered cancellation and refund mail'; END IF;
 IF NOT EXISTS(SELECT 1 FROM bookings WHERE id=target_booking AND status='cancelled'
     AND payment_id='pi_mail_full' AND refund_id='re_mail_full' AND cancellation_refund_cents=7150)
 THEN RAISE EXCEPTION 'Failure notification changed canonical payment or refund intent'; END IF;

 UPDATE booking_mail_outbox SET delivered_at=prior_delivery WHERE booking_id=target_booking AND kind='refund_failed';
 UPDATE bookings SET refund_status='failed' WHERE id=target_booking;
 UPDATE bookings SET refund_status='canceled' WHERE id=target_booking;
 UPDATE bookings SET updated_at=now() WHERE id=target_booking;
 IF (SELECT count(*) FROM booking_mail_outbox WHERE booking_id=target_booking AND kind='refund_failed')<>3
     OR (SELECT count(*) FROM booking_mail_outbox WHERE booking_id=target_booking AND kind='refund_failed' AND delivered_at=prior_delivery)<>3
 THEN RAISE EXCEPTION 'Duplicate failure updates must not recreate delivered notifications'; END IF;

 PERFORM audit_book('refund-partial','2099-12-06');
 SELECT id INTO target_booking FROM bookings WHERE booking_number='refund-partial';
 UPDATE bookings SET status='confirmed',payment_id='pi_mail_partial',paid_at=now() WHERE id=target_booking;
 UPDATE bookings SET status='cancelled',cancellation_requested_at=now(),cancellation_refund_cents=3575,
     refund_id='re_mail_partial',refund_status='pending' WHERE id=target_booking;
 UPDATE booking_mail_outbox SET delivered_at=prior_delivery WHERE booking_id=target_booking AND kind='cancelled';
 UPDATE bookings SET refund_status='failed' WHERE id=target_booking;
 IF (SELECT string_agg(recipient,',' ORDER BY recipient) FROM booking_mail_outbox
     WHERE booking_id=target_booking AND kind='refund_failed' AND delivered_at IS NULL)
     IS DISTINCT FROM 'operator,team,traveler'
 THEN RAISE EXCEPTION 'A partial refund failure must notify even without a booking status change'; END IF;
 IF NOT EXISTS(SELECT 1 FROM bookings WHERE id=target_booking AND status='cancelled' AND cancellation_refund_cents=3575)
     OR (SELECT count(*) FROM booking_mail_outbox WHERE booking_id=target_booking AND kind='cancelled' AND delivered_at=prior_delivery)<>2
 THEN RAISE EXCEPTION 'Partial failure must preserve cancellation state and prior mail'; END IF;

 PERFORM audit_book('refund-immediate-failure','2099-12-07');
 SELECT id INTO target_booking FROM bookings WHERE booking_number='refund-immediate-failure';
 UPDATE bookings SET status='confirmed',payment_id='pi_mail_immediate',paid_at=now() WHERE id=target_booking;
 UPDATE bookings SET status='cancelled',cancellation_requested_at=now(),cancellation_refund_cents=7150 WHERE id=target_booking;
 UPDATE bookings SET refund_id='re_mail_immediate',refund_status='canceled' WHERE id=target_booking;
 IF (SELECT count(*) FROM booking_mail_outbox WHERE booking_id=target_booking AND kind='refund_failed')<>3
 THEN RAISE EXCEPTION 'The first persisted refund failure must queue notifications from a NULL prior status'; END IF;

 PERFORM audit_book('refund-no-intent','2099-12-08');
 SELECT id INTO target_booking FROM bookings WHERE booking_number='refund-no-intent';
 UPDATE bookings SET payment_id='pi_mail_untracked',refund_id='re_mail_untracked',refund_status='failed' WHERE id=target_booking;
 IF EXISTS(SELECT 1 FROM booking_mail_outbox WHERE booking_id=target_booking AND kind='refund_failed')
 THEN RAISE EXCEPTION 'Untracked manual refunds must not create canonical cancellation notifications'; END IF;
END $$;
