\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.invitation_visit(uuid,uuid) RETURNS TABLE(listing_id uuid) LANGUAGE sql VOLATILE AS $service$
-- SERVICE_VISIT_SQL
$service$;
CREATE FUNCTION pg_temp.attribute_approved(uuid,uuid,uuid) RETURNS void LANGUAGE sql VOLATILE AS $service$
-- SERVICE_APPROVE_SQL
$service$;
CREATE FUNCTION pg_temp.invitation_unsubscribe(uuid) RETURNS TABLE(listing_id uuid) LANGUAGE sql VOLATILE AS $service$
-- SERVICE_UNSUBSCRIBE_SQL
$service$;
CREATE FUNCTION pg_temp.legacy_mark(uuid,text) RETURNS void LANGUAGE sql VOLATILE AS $service$
-- LEGACY_MARK_SQL
$service$;
CREATE FUNCTION pg_temp.legacy_global(uuid) RETURNS void LANGUAGE sql VOLATILE AS $service$
-- LEGACY_GLOBAL_SQL
$service$;
DO $$
DECLARE owner_id uuid:=gen_random_uuid(); other_owner uuid:=gen_random_uuid();
 listing_a uuid:=gen_random_uuid(); listing_b uuid:=gen_random_uuid(); listing_deleted uuid:=gen_random_uuid();
 attempt_a uuid:=gen_random_uuid(); attempt_b uuid:=gen_random_uuid(); attempt_deleted uuid:=gen_random_uuid();
 claim_ident uuid:=gen_random_uuid(); verification_id uuid:=gen_random_uuid(); island integer; n integer;
 old_claimed_at timestamptz; bookings_before integer; outbox_before integer;
BEGIN
 SELECT count(*) INTO bookings_before FROM bookings;
 SELECT count(*) INTO outbox_before FROM booking_mail_outbox;
 INSERT INTO islands(slug,name,country,is_active) VALUES('attribution-audit','Attribution audit','Synthetic',true) RETURNING id INTO island;
 INSERT INTO users(id,email,role,email_verified) VALUES
 (owner_id,'attribution-owner@audit.invalid','operator',true),(other_owner,'attribution-other@audit.invalid','operator',true);
 INSERT INTO listings(id,operator_id,island_id,type,status,title,slug,type_data) VALUES
 (listing_a,owner_id,island,'tour','active','Attribution audit A','attribution-audit-a','{"email":"global-contact@audit.invalid"}'),
 (listing_b,other_owner,island,'tour','active','Attribution audit B','attribution-audit-b','{"email":"current-legacy@audit.invalid"}'),
 (listing_deleted,other_owner,island,'tour','active','Attribution deleted','attribution-deleted','{"email":"deleted-contact@audit.invalid"}');
 INSERT INTO outreach_email_attempts(id,listing_id,recipient,campaign_key,idempotency_key,reserved_at) VALUES
 (attempt_a,listing_a,'global-contact@audit.invalid','attribution-audit','attribution:'||attempt_a,now()-interval '2 days'),
 (attempt_b,listing_b,'tracked-legacy@audit.invalid','attribution-audit','attribution:'||attempt_b,now());
 -- A signed link is continuation only, not evidence that the provider accepted it.
 IF EXISTS(SELECT 1 FROM pg_temp.invitation_visit(attempt_a,listing_a)) THEN RAISE EXCEPTION 'Unaccepted invitation recorded a visit'; END IF;
 UPDATE outreach_email_attempts SET state='accepted',provider_email_id='attribution-provider-a',accepted_at=now()-interval '1 day' WHERE id=attempt_a;
 IF EXISTS(SELECT 1 FROM pg_temp.invitation_visit(attempt_a,listing_b)) THEN RAISE EXCEPTION 'Attempt context crossed listing boundary'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_temp.invitation_visit(attempt_a,listing_a)) THEN RAISE EXCEPTION 'Accepted matching invitation visit rejected'; END IF;
 PERFORM pg_temp.invitation_visit(attempt_a,listing_a);
 IF (SELECT count(*) FROM outreach_claim_attributions WHERE attempt_id=attempt_a)<>1 THEN RAISE EXCEPTION 'Repeated visit duplicated attribution'; END IF;
 UPDATE outreach_email_attempts SET state='accepted',provider_email_id='attribution-provider-b',accepted_at=now()-interval '31 days',reserved_at=now()-interval '31 days' WHERE id=attempt_b;
 IF EXISTS(SELECT 1 FROM pg_temp.invitation_visit(attempt_b,listing_b)) THEN RAISE EXCEPTION 'Expired invitation recorded a visit'; END IF;
 UPDATE outreach_email_attempts SET reserved_at=now(),accepted_at=now()+interval '1 day' WHERE id=attempt_b;
 IF EXISTS(SELECT 1 FROM pg_temp.invitation_visit(attempt_b,listing_b)) THEN RAISE EXCEPTION 'Future acceptance recorded a visit'; END IF;

 -- Synthetic proof exists only in this rollback fixture. The production query
 -- must still require approved claim, active trusted proof and verified owner.
 INSERT INTO listing_trusted_contacts(listing_id,original_operator_id,phone,source,source_reference)
 VALUES(listing_a,other_owner,'+12025550109','google-places','synthetic-attribution-fixture');
 INSERT INTO listing_claims(id,listing_id,operator_id,status,contact_name,contact_phone,created_at)
 VALUES(claim_ident,listing_a,owner_id,'pending','Synthetic owner','+12025550109',(now()-interval '12 hours') AT TIME ZONE 'UTC');
 INSERT INTO listing_claim_verifications(id,listing_id,operator_id,claim_id,target_phone,service_sid,provider_account_id,provider_verification_id,status,provider_approved_at,verified_at)
 VALUES(verification_id,listing_a,owner_id,claim_ident,'+12025550109','VA_SYNTHETIC','AC_SYNTHETIC','VE_SYNTHETIC','verified',now(),now());
 INSERT INTO listing_onboarding(listing_id,operator_id,verified_claim_id) VALUES(listing_a,owner_id,verification_id);
 PERFORM pg_temp.attribute_approved(attempt_a,listing_a,owner_id);
 IF EXISTS(SELECT 1 FROM outreach_claim_attributions WHERE attempt_id=attempt_a AND claimed_at IS NOT NULL) THEN RAISE EXCEPTION 'Pending claim attributed'; END IF;
 UPDATE listing_claims SET status='approved' WHERE id=claim_ident;
 UPDATE listing_claim_verifications SET status='pending',verified_at=NULL WHERE id=verification_id;
 PERFORM pg_temp.attribute_approved(attempt_a,listing_a,owner_id);
 IF EXISTS(SELECT 1 FROM outreach_claim_attributions WHERE attempt_id=attempt_a AND claimed_at IS NOT NULL) THEN RAISE EXCEPTION 'Unverified ownership attributed'; END IF;
 UPDATE listing_claim_verifications SET status='verified',verified_at=now() WHERE id=verification_id;
 UPDATE users SET email_verified=false WHERE id=owner_id;
 PERFORM pg_temp.attribute_approved(attempt_a,listing_a,owner_id);
 IF EXISTS(SELECT 1 FROM outreach_claim_attributions WHERE attempt_id=attempt_a AND claimed_at IS NOT NULL) THEN RAISE EXCEPTION 'Unverified account attributed'; END IF;
 UPDATE users SET email_verified=true WHERE id=owner_id;
 UPDATE listing_claims SET created_at=(now()-interval '2 days') AT TIME ZONE 'UTC' WHERE id=claim_ident;
 PERFORM pg_temp.attribute_approved(attempt_a,listing_a,owner_id);
 IF EXISTS(SELECT 1 FROM outreach_claim_attributions WHERE attempt_id=attempt_a AND claimed_at IS NOT NULL) THEN RAISE EXCEPTION 'Pre-invitation claim attributed'; END IF;
 UPDATE listing_claims SET created_at=(now()-interval '12 hours') AT TIME ZONE 'UTC' WHERE id=claim_ident;
 PERFORM pg_temp.attribute_approved(attempt_a,listing_a,other_owner);
 IF EXISTS(SELECT 1 FROM outreach_claim_attributions WHERE attempt_id=attempt_a AND claimed_at IS NOT NULL) THEN RAISE EXCEPTION 'Different operator attributed'; END IF;
 PERFORM pg_temp.attribute_approved(attempt_a,listing_b,owner_id);
 IF EXISTS(SELECT 1 FROM outreach_claim_attributions WHERE attempt_id=attempt_a AND claimed_at IS NOT NULL) THEN RAISE EXCEPTION 'Different listing attributed'; END IF;
 PERFORM pg_temp.attribute_approved(attempt_a,listing_a,owner_id);
 IF NOT EXISTS(SELECT 1 FROM outreach_claim_attributions x WHERE x.attempt_id=attempt_a AND x.claim_id=claim_ident AND x.operator_id=owner_id AND x.claimed_at IS NOT NULL) THEN RAISE EXCEPTION 'Verified post-invitation ownership not associated'; END IF;
 UPDATE outreach_claim_attributions SET claimed_at=now()-interval '1 hour' WHERE attempt_id=attempt_a;
 old_claimed_at:=now()-interval '1 hour';
 PERFORM pg_temp.attribute_approved(attempt_a,listing_a,owner_id);
 IF (SELECT claimed_at FROM outreach_claim_attributions WHERE attempt_id=attempt_a)<>old_claimed_at THEN RAISE EXCEPTION 'Replay rewrote the first confirmed association'; END IF;

 INSERT INTO outreach_recipient_consents(listing_id,recipient_email,provider,evidence) VALUES
 (listing_a,'global-contact@audit.invalid','resend','Synthetic explicit consent for attribution fixture'),
 (listing_a,'global-contact@audit.invalid','mailforge','Synthetic explicit consent for attribution fixture'),
 (listing_b,'global-contact@audit.invalid','infraforge','Synthetic explicit consent for attribution fixture');
 PERFORM pg_temp.invitation_unsubscribe(attempt_a);
 IF NOT EXISTS(SELECT 1 FROM outreach_email_suppressions WHERE recipient='global-contact@audit.invalid' AND reason='unsubscribe') OR
    EXISTS(SELECT 1 FROM outreach_recipient_consents WHERE recipient_email='global-contact@audit.invalid' AND revoked_at IS NULL) THEN RAISE EXCEPTION 'Opt-out did not span listings and providers'; END IF;
 IF (SELECT status FROM business_outreach WHERE listing_id=listing_a)<>'do_not_contact' THEN RAISE EXCEPTION 'Opt-out lost listing suppression'; END IF;
 IF NOT vakaygo_listing_claim_verified(listing_a) OR (SELECT operator_id FROM listings WHERE id=listing_a)<>owner_id THEN RAISE EXCEPTION 'Opt-out changed normal ownership'; END IF;

 INSERT INTO outreach_email_attempts(id,listing_id,recipient,campaign_key,idempotency_key,provider_email_id,state,accepted_at)
 VALUES(attempt_deleted,listing_deleted,'deleted-contact@audit.invalid','attribution-audit','attribution:'||attempt_deleted,'attribution-deleted-provider','accepted',now());
 INSERT INTO outreach_recipient_consents(listing_id,recipient_email,provider,evidence)
 VALUES(listing_b,'deleted-contact@audit.invalid','mailforge','Synthetic explicit consent for deleted listing fixture');
 DELETE FROM listings WHERE id=listing_deleted;
 IF NOT EXISTS(SELECT 1 FROM outreach_email_attempts WHERE id=attempt_deleted AND listing_id IS NULL) THEN RAISE EXCEPTION 'Deleted listing lost recipient opt-out provenance'; END IF;
 PERFORM pg_temp.invitation_unsubscribe(attempt_deleted);
 IF NOT EXISTS(SELECT 1 FROM outreach_email_suppressions WHERE recipient='deleted-contact@audit.invalid') OR
    EXISTS(SELECT 1 FROM outreach_recipient_consents WHERE recipient_email='deleted-contact@audit.invalid' AND revoked_at IS NULL) THEN RAISE EXCEPTION 'Deleted listing prevented global opt-out'; END IF;

 -- Legacy links cover current address, durable attempt address and old send
 -- notes. Those preferences remain global after switching provider/address.
 INSERT INTO business_outreach(listing_id,notes) VALUES(listing_b,'[2026-10-15] Claim invitation emailed to original-legacy@audit.invalid (cron, 0 interested).');
 INSERT INTO outreach_recipient_consents(listing_id,recipient_email,provider,evidence) VALUES
 (listing_b,'current-legacy@audit.invalid','resend','Synthetic explicit consent for legacy fixture'),
 (listing_b,'tracked-legacy@audit.invalid','mailforge','Synthetic explicit consent for legacy fixture'),
 (listing_a,'original-legacy@audit.invalid','infraforge','Synthetic explicit consent for legacy fixture'),
 (listing_b,'unrelated@audit.invalid','resend','Synthetic unrelated explicit consent remains active');
 PERFORM pg_temp.legacy_mark(listing_b,'[2026-10-20] Business opted out via 1-click unsubscribe link.');
 PERFORM pg_temp.legacy_global(listing_b);
 SELECT count(*) INTO n FROM outreach_email_suppressions WHERE recipient IN ('current-legacy@audit.invalid','tracked-legacy@audit.invalid','original-legacy@audit.invalid');
 IF n<>3 OR EXISTS(SELECT 1 FROM outreach_recipient_consents WHERE recipient_email IN ('current-legacy@audit.invalid','tracked-legacy@audit.invalid','original-legacy@audit.invalid') AND revoked_at IS NULL) THEN RAISE EXCEPTION 'Legacy opt-out missed a known address or provider'; END IF;
 IF EXISTS(SELECT 1 FROM outreach_email_suppressions WHERE recipient='unrelated@audit.invalid') OR NOT EXISTS(SELECT 1 FROM outreach_recipient_consents WHERE recipient_email='unrelated@audit.invalid' AND revoked_at IS NULL) THEN RAISE EXCEPTION 'Opt-out affected an unrelated recipient'; END IF;
 IF (SELECT count(*) FROM bookings)<>bookings_before OR (SELECT count(*) FROM booking_mail_outbox)<>outbox_before OR
    (SELECT count(*) FROM listing_claims WHERE id=claim_ident)<>1 OR (SELECT count(*) FROM listing_onboarding WHERE listing_id=listing_a)<>1 THEN RAISE EXCEPTION 'Attribution or opt-out changed booking/onboarding records'; END IF;
END $$;
SELECT 'PASS: accepted/expiring/listing-bound visits; authoritative post-send verified claims; immutable attribution; recipient-wide/provider-wide and deleted-listing opt-out; legacy address preservation; no booking/onboarding changes';
ROLLBACK;
