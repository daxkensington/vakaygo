BEGIN;
DO $$
DECLARE owner_id uuid:=gen_random_uuid(); listing_a uuid:=gen_random_uuid(); listing_b uuid:=gen_random_uuid();
 attempt_a uuid:=gen_random_uuid(); attempt_b uuid:=gen_random_uuid(); island integer; denied boolean;
 target_email text:='tracking-business@audit.invalid'; digest text;
BEGIN
 INSERT INTO islands(slug,name,country,is_active) VALUES('tracking-audit','Tracking audit','Synthetic',true) RETURNING id INTO island;
 INSERT INTO users(id,email,role,email_verified) VALUES(owner_id,'tracking-owner@audit.invalid','operator',true);
 INSERT INTO listings(id,operator_id,island_id,type,status,title,slug) VALUES
 (listing_a,owner_id,island,'tour','active','Tracking audit A','tracking-audit-a'),
 (listing_b,owner_id,island,'tour','active','Tracking audit B','tracking-audit-b');
 INSERT INTO outreach_email_attempts(id,listing_id,recipient,campaign_key,idempotency_key)
 VALUES(attempt_a,listing_a,target_email,'tracking-audit','outreach:'||attempt_a);
 -- The same recipient cannot receive the same campaign through another profile.
 denied:=false;
 BEGIN
  INSERT INTO outreach_email_attempts(listing_id,recipient,campaign_key,idempotency_key)
  VALUES(listing_b,target_email,'tracking-audit','duplicate-recipient');
 EXCEPTION WHEN unique_violation THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Duplicate recipient/campaign reservation succeeded'; END IF;
 denied:=false;
 BEGIN
  INSERT INTO outreach_email_attempts(listing_id,recipient,campaign_key,idempotency_key)
  VALUES(listing_a,'different@audit.invalid','tracking-audit','duplicate-listing');
 EXCEPTION WHEN unique_violation THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Duplicate listing/campaign reservation succeeded'; END IF;
 digest:=encode(sha256(convert_to(target_email,'UTF8')),'hex');
 -- A correctly signed event can arrive before the API response is persisted.
 INSERT INTO outreach_email_events(provider,provider_event_id,provider_email_id,event_type,occurred_at,recipient_hash)
 VALUES('resend','tracking-orphan','tracking-email','email.bounced','2026-10-20T12:00:00Z',digest);
 IF vakaygo_apply_outreach_events('resend','tracking-email')<>0 OR EXISTS(SELECT 1 FROM outreach_email_suppressions WHERE recipient=target_email) THEN
  RAISE EXCEPTION 'Unknown provider email affected an outreach recipient';
 END IF;
 UPDATE outreach_email_attempts SET provider_email_id='tracking-email',state='accepted',accepted_at=now() WHERE id=attempt_a;
 IF vakaygo_apply_outreach_events('resend','tracking-email')<>1 THEN RAISE EXCEPTION 'Acceptance failed to reconcile the orphan'; END IF;
 IF NOT EXISTS(SELECT 1 FROM outreach_email_suppressions s WHERE s.recipient=target_email AND reason='bounce') THEN RAISE EXCEPTION 'Known bounce did not suppress'; END IF;
 IF NOT EXISTS(SELECT 1 FROM outreach_email_events WHERE provider='resend' AND provider_event_id='tracking-orphan' AND attempt_id=attempt_a) THEN RAISE EXCEPTION 'Reconciled event lost its attempt link'; END IF;
 -- Duplicate delivery cannot create another event or another suppression.
 INSERT INTO outreach_email_events(provider,provider_event_id,provider_email_id,event_type,occurred_at,recipient_hash)
 VALUES('resend','tracking-orphan','tracking-email','email.bounced','2026-10-20T12:00:00Z',digest)
 ON CONFLICT(provider,provider_event_id) DO NOTHING;
 IF vakaygo_apply_outreach_events('resend','tracking-email')<>0 THEN RAISE EXCEPTION 'Duplicate event reapplied'; END IF;
 -- Out-of-order delivery is historical evidence, never a reason to unsuppress.
 INSERT INTO outreach_email_events(provider,provider_event_id,provider_email_id,event_type,occurred_at,recipient_hash)
 VALUES('resend','tracking-old-delivery','tracking-email','email.delivered','2026-10-20T11:00:00Z',digest);
 PERFORM vakaygo_apply_outreach_events('resend','tracking-email');
 IF (SELECT last_event FROM outreach_email_attempts WHERE id=attempt_a)<>'email.bounced' OR
    NOT EXISTS(SELECT 1 FROM outreach_email_attempts WHERE id=attempt_a AND bounced_at IS NOT NULL AND delivered_at IS NOT NULL) OR
    NOT EXISTS(SELECT 1 FROM outreach_email_suppressions s WHERE s.recipient=target_email) THEN RAISE EXCEPTION 'Old delivery erased terminal evidence'; END IF;
 -- A valid signature alone does not allow a mismatched recipient to be affected.
 INSERT INTO outreach_email_events(provider,provider_event_id,provider_email_id,event_type,occurred_at,recipient_hash)
 VALUES('resend','tracking-wrong-recipient','tracking-email','email.complained','2026-10-20T13:00:00Z',encode(sha256(convert_to('other@audit.invalid','UTF8')),'hex'));
 PERFORM vakaygo_apply_outreach_events('resend','tracking-email');
 IF EXISTS(SELECT 1 FROM outreach_email_events WHERE provider='resend' AND provider_event_id='tracking-wrong-recipient' AND attempt_id IS NOT NULL) OR
    EXISTS(SELECT 1 FROM outreach_email_attempts WHERE id=attempt_a AND complained_at IS NOT NULL) THEN RAISE EXCEPTION 'Wrong recipient applied'; END IF;
 -- Provider IDs and event IDs are namespaced; global recipient suppression remains shared.
 INSERT INTO outreach_email_attempts(id,listing_id,recipient,campaign_key,idempotency_key,provider,provider_email_id,state,accepted_at)
 VALUES(attempt_b,listing_b,'second@audit.invalid','tracking-audit','outreach:'||attempt_b,'other','tracking-email','accepted',now());
 INSERT INTO outreach_email_events(provider,provider_event_id,provider_email_id,event_type,occurred_at,recipient_hash)
 VALUES('other','tracking-orphan','tracking-email','email.delivery_delayed','2026-10-20T13:00:00Z',encode(sha256(convert_to('second@audit.invalid','UTF8')),'hex'));
 PERFORM vakaygo_apply_outreach_events('other','tracking-email');
 IF NOT EXISTS(SELECT 1 FROM outreach_email_attempts WHERE id=attempt_b AND last_event='email.delivery_delayed' AND bounced_at IS NULL) OR
    EXISTS(SELECT 1 FROM outreach_email_suppressions WHERE recipient='second@audit.invalid') THEN RAISE EXCEPTION 'Provider collision or delay created a false bounce'; END IF;
 IF (SELECT last_event FROM outreach_email_attempts WHERE id=attempt_a)<>'email.bounced' THEN RAISE EXCEPTION 'Other provider changed the first attempt'; END IF;
 -- Tracking must not create booking, owner or financial state.
 IF EXISTS(SELECT 1 FROM listing_onboarding WHERE listing_id IN (listing_a,listing_b)) OR
    EXISTS(SELECT 1 FROM bookings WHERE listing_id IN (listing_a,listing_b)) THEN RAISE EXCEPTION 'Tracking mutated the booking/onboarding pipeline'; END IF;
END $$;
SELECT 'PASS: campaign recipient/listing deduplication, orphan reconciliation, event deduplication, provider scoping, recipient binding, delay handling and irreversible suppression';
ROLLBACK;
