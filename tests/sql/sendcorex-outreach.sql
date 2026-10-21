\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE island integer; owner_id uuid:=gen_random_uuid(); listing_id uuid:=gen_random_uuid();
 ident uuid; result record; address text:='sc-'||gen_random_uuid()||'@audit.invalid';
 email_id text:='sc-'||gen_random_uuid();
BEGIN
 IF current_database()<>'vakaygo_test' THEN RAISE EXCEPTION 'Isolated database required'; END IF;
 IF (SELECT enabled FROM outreach_campaign_control) THEN RAISE EXCEPTION 'Migration enabled outreach'; END IF;
 IF vakaygo_outreach_permission_allowed('resend','business_outreach_permission') THEN RAISE EXCEPTION 'Resend policy broadened'; END IF;
 IF NOT vakaygo_outreach_permission_allowed('sendcorex','business_outreach_permission') THEN RAISE EXCEPTION 'Sendcorex B2B policy missing'; END IF;
 INSERT INTO islands(slug,name,country,is_active) VALUES('sc-'||gen_random_uuid(),'Synthetic Sendcorex','Synthetic',true) RETURNING id INTO island;
 INSERT INTO users(id,email,role,email_verified) VALUES(owner_id,'owner-'||address,'operator',true);
 INSERT INTO listings(id,operator_id,island_id,type,status,title,slug,type_data) VALUES(listing_id,owner_id,island,'tour','active','Synthetic Sendcorex','sc-'||gen_random_uuid(),json_build_object('email',address));
 UPDATE outreach_campaign_control SET provider='sendcorex',enabled=true,health_ready=true,health_checked_at=now();
 SELECT * INTO result FROM vakaygo_reserve_outreach_attempt(listing_id,address,'listing-claims-v2');
 IF result.reason<>'recipient_permission_missing' THEN RAISE EXCEPTION 'Sent without a reviewed recipient'; END IF;
 INSERT INTO outreach_recipient_consents(listing_id,recipient_email,provider,permission_kind,recipient_country,policy_reference,evidence)
 VALUES(listing_id,address,'sendcorex','business_outreach_permission','GD','Synthetic dated provider and jurisdiction review','Synthetic public business source and relevant recipient review');
 SELECT * INTO result FROM vakaygo_reserve_outreach_attempt(listing_id,address,'listing-claims-v2');
 ident:=result.attempt_id;
 IF ident IS NULL OR result.reason IS NOT NULL THEN RAISE EXCEPTION 'Reviewed B2B reservation refused: %',result.reason; END IF;
 UPDATE outreach_email_attempts SET state='accepted',accepted_at=now(),provider_email_id=email_id WHERE id=ident;
 INSERT INTO outreach_email_events(provider,provider_event_id,provider_email_id,event_type,occurred_at,recipient_hash)
 VALUES('sendcorex','sc_unsubscribe_fixture',email_id,'email.unsubscribed',now(),encode(sha256(convert_to(address,'UTF8')),'hex'));
 PERFORM vakaygo_apply_outreach_events('sendcorex',email_id);
 IF NOT EXISTS(SELECT 1 FROM outreach_email_suppressions WHERE recipient=address AND reason='unsubscribe' AND provider='sendcorex') THEN RAISE EXCEPTION 'Unsubscribe was not globally durable'; END IF;
 IF NOT EXISTS(SELECT 1 FROM outreach_email_attempts WHERE id=ident AND suppressed_at IS NOT NULL) THEN RAISE EXCEPTION 'Unsubscribe not applied to bound attempt'; END IF;
 IF vakaygo_apply_outreach_events('sendcorex',email_id)<>0 THEN RAISE EXCEPTION 'Duplicate event applied twice'; END IF;
 IF (SELECT count(*) FROM outreach_email_suppressions WHERE recipient=address)<>1 THEN RAISE EXCEPTION 'Duplicate suppression'; END IF;
END $$;
ROLLBACK;
