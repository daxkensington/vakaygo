\set ON_ERROR_STOP on
BEGIN;
-- This fixture invokes the real migration0013 function. All ordinary cases are rolled back.
CREATE FUNCTION pg_temp.expect_reservation_denied(target uuid,email text,expected text,campaign text DEFAULT 'listing-claims-v2')
RETURNS void LANGUAGE plpgsql AS $$
DECLARE result record; before_count bigint;
BEGIN
 SELECT count(*) INTO before_count FROM outreach_email_attempts;
 SELECT * INTO result FROM vakaygo_reserve_outreach_attempt(target,email,campaign);
 IF result.attempt_id IS NOT NULL OR result.reason IS DISTINCT FROM expected THEN
  RAISE EXCEPTION 'Expected refusal %, observed %',expected,result.reason;
 END IF;
 IF (SELECT count(*) FROM outreach_email_attempts)<>before_count THEN RAISE EXCEPTION 'Refused reservation wrote an attempt'; END IF;
END $$;
CREATE FUNCTION pg_temp.expect_reservation_allowed(target uuid,email text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE result record;
BEGIN
 SELECT * INTO result FROM vakaygo_reserve_outreach_attempt(target,email,'listing-claims-v2');
 IF result.attempt_id IS NULL OR result.reason IS NOT NULL THEN RAISE EXCEPTION 'Expected reservation, observed %',result.reason; END IF;
 IF NOT EXISTS(SELECT 1 FROM outreach_email_attempts WHERE id=result.attempt_id AND listing_id=target AND recipient=email AND state='reserved' AND campaign_key='listing-claims-v2' AND idempotency_key='outreach:'||result.attempt_id) THEN RAISE EXCEPTION 'Reservation did not persist its bound identity'; END IF;
 RETURN result.attempt_id;
END $$;
DO $$
DECLARE owner_id uuid:=gen_random_uuid(); listing_a uuid:=gen_random_uuid(); listing_b uuid:=gen_random_uuid();
 claim_id uuid:=gen_random_uuid(); verification_id uuid:=gen_random_uuid(); island integer;
 tag text:='reserve-'||gen_random_uuid()||'-'; email_a text; email_b text; ident uuid;
BEGIN
 IF current_database()<>'vakaygo_test' THEN RAISE EXCEPTION 'Isolated fixture database required'; END IF;
 IF EXISTS(SELECT 1 FROM outreach_email_attempts WHERE campaign_key='listing-claims-v2') THEN RAISE EXCEPTION 'Campaign fixture must start without committed campaign attempts'; END IF;
 IF NOT EXISTS(SELECT 1 FROM outreach_campaign_control WHERE id=true AND NOT enabled AND provider='resend' AND stage=0) THEN RAISE EXCEPTION 'Migration did not default to paused stage0'; END IF;
 email_a:=tag||'a@audit.invalid';email_b:=tag||'b@audit.invalid';
 INSERT INTO islands(slug,name,country,is_active) VALUES(tag||'island','Reservation audit','Synthetic',true) RETURNING id INTO island;
 INSERT INTO users(id,email,role,email_verified) VALUES(owner_id,tag||'owner@audit.invalid','operator',true);
 INSERT INTO listings(id,operator_id,island_id,type,status,title,slug,type_data) VALUES
 (listing_a,owner_id,island,'tour','active','Reservation audit A',tag||'a',json_build_object('email',email_a)),
 (listing_b,owner_id,island,'tour','active','Reservation audit B',tag||'b',json_build_object('email',email_b));
 PERFORM pg_temp.expect_reservation_denied(listing_a,email_a,'campaign_paused');
 UPDATE outreach_campaign_control SET enabled=true,health_ready=true,health_checked_at=now(),health_reason='synthetic_ready' WHERE id=true;
 PERFORM pg_temp.expect_reservation_denied(listing_a,email_a,'recipient_permission_missing');
 INSERT INTO outreach_recipient_consents(listing_id,recipient_email,evidence) VALUES
 (listing_a,email_a,'Synthetic explicit opt-in receipt for reservation fixture'),
 (listing_b,email_b,'Synthetic explicit opt-in receipt for reservation fixture');
 UPDATE outreach_recipient_consents SET revoked_at=now() WHERE listing_id=listing_a;
 PERFORM pg_temp.expect_reservation_denied(listing_a,email_a,'recipient_permission_missing');
 UPDATE outreach_recipient_consents SET revoked_at=NULL,granted_at=now()+interval '1 day' WHERE listing_id=listing_a;
 PERFORM pg_temp.expect_reservation_denied(listing_a,email_a,'recipient_permission_missing');
 UPDATE outreach_recipient_consents SET granted_at=now() WHERE listing_id=listing_a;
 INSERT INTO business_outreach(listing_id,status,notes) VALUES(listing_a,'do_not_contact','Synthetic opt-out');
 PERFORM pg_temp.expect_reservation_denied(listing_a,email_a,'already_contacted_or_suppressed');
 UPDATE business_outreach SET status='contacted',contacted_at=now() WHERE listing_id=listing_a;
 PERFORM pg_temp.expect_reservation_denied(listing_a,email_a,'already_contacted_or_suppressed');
 DELETE FROM business_outreach WHERE listing_id=listing_a;
 INSERT INTO outreach_email_suppressions(recipient,reason) VALUES(email_a,'manual');
 PERFORM pg_temp.expect_reservation_denied(listing_a,email_a,'suppressed');
 DELETE FROM outreach_email_suppressions WHERE recipient=email_a;
 UPDATE listings SET status='paused' WHERE id=listing_a;
 PERFORM pg_temp.expect_reservation_denied(listing_a,email_a,'listing_not_eligible');
 UPDATE listings SET status='active' WHERE id=listing_a;
 UPDATE islands SET is_active=false WHERE id=island;
 PERFORM pg_temp.expect_reservation_denied(listing_a,email_a,'listing_not_eligible');
 UPDATE islands SET is_active=true WHERE id=island;
 UPDATE listings SET type_data=json_build_object('email',tag||'changed@audit.invalid') WHERE id=listing_a;
 PERFORM pg_temp.expect_reservation_denied(listing_a,email_a,'listing_not_eligible');
 UPDATE listings SET type_data=json_build_object('email',email_a) WHERE id=listing_a;
 -- An actually verified claim/profile is ineligible, without changing booking gates.
 INSERT INTO listing_claims(id,listing_id,operator_id,contact_name,contact_phone,status,reviewed_at)
 VALUES(claim_id,listing_a,owner_id,'Synthetic owner','+14735550123','approved',now());
 INSERT INTO listing_trusted_contacts(listing_id,original_operator_id,phone,source,source_reference)
 VALUES(listing_a,owner_id,'+14735550123','operator-created','synthetic reservation fixture');
 INSERT INTO listing_claim_verifications(id,listing_id,operator_id,claim_id,target_phone,service_sid,provider_account_id,provider_verification_id,status,provider_approved_at,verified_at)
 VALUES(verification_id,listing_a,owner_id,claim_id,'+14735550123','VA11111111111111111111111111111111','AC11111111111111111111111111111111','VE11111111111111111111111111111111','verified',now(),now());
 INSERT INTO listing_onboarding(listing_id,operator_id,verified_claim_id) VALUES(listing_a,owner_id,verification_id);
 IF NOT vakaygo_listing_claim_verified(listing_a) THEN RAISE EXCEPTION 'Synthetic claimed profile is incomplete'; END IF;
 PERFORM pg_temp.expect_reservation_denied(listing_a,email_a,'listing_not_eligible');
 DELETE FROM listing_onboarding WHERE listing_id=listing_a;
 DELETE FROM listing_claim_verifications WHERE id=verification_id;
 DELETE FROM listing_claims WHERE id=claim_id;
 DELETE FROM listing_trusted_contacts WHERE listing_id=listing_a;
 UPDATE outreach_campaign_control SET provider='mailforge' WHERE id=true;
 PERFORM pg_temp.expect_reservation_denied(listing_a,email_a,'provider_adapter_not_configured');
 UPDATE outreach_campaign_control SET provider='resend',health_ready=false WHERE id=true;
 PERFORM pg_temp.expect_reservation_denied(listing_a,email_a,'telemetry_unavailable');
 UPDATE outreach_campaign_control SET health_ready=true,health_checked_at=now()-interval '21 minutes' WHERE id=true;
 PERFORM pg_temp.expect_reservation_denied(listing_a,email_a,'telemetry_unavailable');
 UPDATE outreach_campaign_control SET health_checked_at=now()+interval '2 minutes' WHERE id=true;
 PERFORM pg_temp.expect_reservation_denied(listing_a,email_a,'telemetry_unavailable');
 UPDATE outreach_campaign_control SET health_checked_at=now() WHERE id=true;
 PERFORM pg_temp.expect_reservation_denied(listing_a,upper(email_a),'invalid_request');
 PERFORM pg_temp.expect_reservation_denied(listing_a,email_a,'invalid_request','wrong-campaign');
 -- Campaign namespace isolation and durable listing/recipient deduplication.
 INSERT INTO outreach_email_attempts(listing_id,recipient,campaign_key,idempotency_key,state)
 VALUES(listing_a,email_a,'reservation-other',tag||'other','failed');
 ident:=pg_temp.expect_reservation_allowed(listing_a,email_a);
 PERFORM pg_temp.expect_reservation_denied(listing_a,email_a,'already_reserved');
 UPDATE listings SET type_data=json_build_object('email',email_a) WHERE id=listing_b;
 INSERT INTO outreach_recipient_consents(listing_id,recipient_email,evidence) VALUES(listing_b,email_a,'Synthetic second profile sharing an opted-in address');
 PERFORM pg_temp.expect_reservation_denied(listing_b,email_a,'already_reserved');
 UPDATE listings SET type_data=json_build_object('email',email_b) WHERE id=listing_b;
 DELETE FROM outreach_email_attempts WHERE recipient LIKE tag||'%';
 -- Rolling24h cap counts reservations, including known failed sends.
 INSERT INTO outreach_email_attempts(recipient,campaign_key,idempotency_key,state,reserved_at)
 SELECT tag||n||'@audit.invalid','listing-claims-v2',tag||'day-'||n,'failed',now()-interval '2 hours' FROM generate_series(1,18)n;
 PERFORM pg_temp.expect_reservation_denied(listing_a,email_a,'daily_cap');
 DELETE FROM outreach_email_attempts WHERE recipient=tag||'18@audit.invalid';
 ident:=pg_temp.expect_reservation_allowed(listing_a,email_a);
 PERFORM pg_temp.expect_reservation_denied(listing_b,email_b,'daily_cap');
 DELETE FROM outreach_email_attempts WHERE recipient LIKE tag||'%';
 INSERT INTO outreach_email_attempts(recipient,campaign_key,idempotency_key,state,reserved_at)
 SELECT tag||n||'@audit.invalid','listing-claims-v2',tag||'old-'||n,'failed',now()-interval '24 hours' FROM generate_series(1,18)n;
 ident:=pg_temp.expect_reservation_allowed(listing_a,email_a);
 DELETE FROM outreach_email_attempts WHERE recipient LIKE tag||'%';
 -- Rollinghour cap and exact ten-minute spacing boundary.
 INSERT INTO outreach_email_attempts(recipient,campaign_key,idempotency_key,state,reserved_at)
 SELECT tag||n||'@audit.invalid','listing-claims-v2',tag||'hour-'||n,'failed',now()-interval '20 minutes' FROM generate_series(1,6)n;
 PERFORM pg_temp.expect_reservation_denied(listing_a,email_a,'hourly_cap');
 DELETE FROM outreach_email_attempts WHERE recipient=tag||'6@audit.invalid';
 ident:=pg_temp.expect_reservation_allowed(listing_a,email_a);
 PERFORM pg_temp.expect_reservation_denied(listing_b,email_b,'hourly_cap');
 DELETE FROM outreach_email_attempts WHERE recipient LIKE tag||'%';
 INSERT INTO outreach_email_attempts(recipient,campaign_key,idempotency_key,state,reserved_at)
 VALUES(tag||'spacing@audit.invalid','listing-claims-v2',tag||'spacing','failed',now()-interval '5 minutes');
 PERFORM pg_temp.expect_reservation_denied(listing_a,email_a,'minimum_interval');
 UPDATE outreach_email_attempts SET reserved_at=now()-interval '10 minutes' WHERE recipient=tag||'spacing@audit.invalid';
 ident:=pg_temp.expect_reservation_allowed(listing_a,email_a);
 DELETE FROM outreach_email_attempts WHERE recipient LIKE tag||'%';
 -- Delivery/reputation holds are checked by the actual reservation function.
 INSERT INTO outreach_email_attempts(recipient,campaign_key,idempotency_key,state,reserved_at)
 VALUES(tag||'uncertain@audit.invalid','listing-claims-v2',tag||'uncertain','uncertain',now()-interval '2 hours');
 PERFORM pg_temp.expect_reservation_denied(listing_a,email_a,'uncertain_transport_hold');
 UPDATE outreach_email_attempts SET state='reserved',reserved_at=now()-interval '21 minutes' WHERE recipient=tag||'uncertain@audit.invalid';
 PERFORM pg_temp.expect_reservation_denied(listing_a,email_a,'uncertain_transport_hold');
 DELETE FROM outreach_email_attempts WHERE recipient LIKE tag||'%';
 INSERT INTO outreach_email_attempts(recipient,campaign_key,idempotency_key,provider_email_id,state,reserved_at,accepted_at,complained_at,delivered_at)
 VALUES(tag||'complaint@audit.invalid','listing-claims-v2',tag||'complaint',tag||'provider-complaint','accepted',now()-interval '26 hours',now()-interval '25 hours',now(),now()-interval '24 hours');
 PERFORM pg_temp.expect_reservation_denied(listing_a,email_a,'complaint_hold');
 DELETE FROM outreach_email_attempts WHERE recipient LIKE tag||'%';
 INSERT INTO outreach_email_attempts(recipient,campaign_key,idempotency_key,provider_email_id,state,reserved_at,accepted_at,delivered_at,bounced_at)
 SELECT tag||n||'@audit.invalid','listing-claims-v2',tag||'bounce-'||n,tag||'provider-bounce-'||n,'accepted',now()-interval '26 hours',now()-interval '25 hours',now()-interval '24 hours',CASE WHEN n=1 THEN now() ELSE NULL END FROM generate_series(1,50)n;
 PERFORM pg_temp.expect_reservation_denied(listing_a,email_a,'bounce_rate_hold');
 UPDATE outreach_email_attempts SET bounced_at=NULL WHERE recipient=tag||'1@audit.invalid';
 INSERT INTO outreach_email_attempts(recipient,campaign_key,idempotency_key,provider_email_id,state,reserved_at,accepted_at,bounced_at)
 VALUES(tag||'late-bounce@audit.invalid','listing-claims-v2',tag||'late-bounce',tag||'provider-late-bounce','accepted',now()-interval '8 days',now()-interval '8 days',now());
 PERFORM pg_temp.expect_reservation_denied(listing_a,email_a,'bounce_rate_hold');
 INSERT INTO outreach_email_attempts(recipient,campaign_key,idempotency_key,provider_email_id,state,reserved_at,accepted_at,delivered_at)
 VALUES(tag||'51@audit.invalid','listing-claims-v2',tag||'bounce-51',tag||'provider-bounce-51','accepted',now()-interval '26 hours',now()-interval '25 hours',now()-interval '24 hours');
 ident:=pg_temp.expect_reservation_allowed(listing_a,email_a);
 DELETE FROM outreach_email_attempts WHERE recipient LIKE tag||'%';
 INSERT INTO outreach_email_attempts(recipient,campaign_key,idempotency_key,provider_email_id,state,reserved_at,accepted_at,bounced_at)
 VALUES(tag||'zero-denominator@audit.invalid','listing-claims-v2',tag||'zero-denominator',tag||'provider-zero-denominator','accepted',now()-interval '8 days',now()-interval '8 days',now());
 PERFORM pg_temp.expect_reservation_denied(listing_a,email_a,'bounce_rate_hold');
 DELETE FROM outreach_email_attempts WHERE recipient LIKE tag||'%';
 INSERT INTO outreach_email_attempts(recipient,campaign_key,idempotency_key,provider_email_id,state,reserved_at,accepted_at)
 VALUES(tag||'overdue@audit.invalid','listing-claims-v2',tag||'overdue',tag||'provider-overdue','accepted',now()-interval '26 hours',now()-interval '25 hours');
 PERFORM pg_temp.expect_reservation_denied(listing_a,email_a,'unresolved_delivery_hold');
 IF EXISTS(SELECT 1 FROM bookings WHERE listing_id IN(listing_a,listing_b)) OR EXISTS(SELECT 1 FROM listing_onboarding WHERE listing_id IN(listing_a,listing_b)) THEN RAISE EXCEPTION 'Reservation altered booking/onboarding state'; END IF;
END $$;
SELECT 'PASS: actual reservation SQL; default pause, consent/revocation, opt-out, recipient suppression, listing/claim/email eligibility, provider/health isolation, namespace dedupe, rolling18/day6/hour10-minute caps and negative-signal holds';
ROLLBACK;
