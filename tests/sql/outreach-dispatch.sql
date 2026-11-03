\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.dispatch_eligible(uuid,text) RETURNS boolean LANGUAGE sql VOLATILE AS $service$
SELECT EXISTS(
-- SERVICE_DISPATCH_SQL
)
$service$;
CREATE FUNCTION pg_temp.expect_dispatch(target uuid,destination text,expected boolean,label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF pg_temp.dispatch_eligible(target,destination) IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Dispatch assertion failed: %',label; END IF;
END $$;
DO $$
DECLARE owner_id uuid:=gen_random_uuid(); target_listing uuid:=gen_random_uuid(); target_island integer; ident uuid; health_id uuid:=gen_random_uuid();
 tag text:='dispatch-'||gen_random_uuid()||'-'; target_email text; target_slug text;
BEGIN
 IF current_database()<>'vakaygo_test' OR current_user<>'audit' THEN RAISE EXCEPTION 'Owned isolated fixture required'; END IF;
 IF EXISTS(SELECT 1 FROM outreach_email_attempts WHERE campaign_key='listing-claims-v2') THEN RAISE EXCEPTION 'Expected empty campaign fixture'; END IF;
 target_email:=tag||'target@audit.invalid'; target_slug:=tag||'island';
 INSERT INTO islands(slug,name,country,is_active) VALUES(target_slug,'Synthetic dispatch audit','Synthetic',true) RETURNING id INTO target_island;
 INSERT INTO users(id,email,role,email_verified) VALUES(owner_id,tag||'owner@audit.invalid','operator',true);
 INSERT INTO listings(id,operator_id,island_id,type,status,title,slug,type_data) VALUES(target_listing,owner_id,target_island,'tour','active','Synthetic dispatch audit',tag||'listing',json_build_object('email',target_email));
 INSERT INTO outreach_recipient_consents(listing_id,recipient_email,evidence) VALUES(target_listing,target_email,'Synthetic explicit opt-in evidence for dispatch gate fixture');
 UPDATE outreach_campaign_control SET enabled=true,health_ready=true,health_checked_at=now() WHERE id=true;
 SELECT attempt_id INTO ident FROM vakaygo_reserve_outreach_attempt(target_listing,target_email,'listing-claims-v2');
 IF ident IS NULL THEN RAISE EXCEPTION 'Baseline reservation failed'; END IF;
 PERFORM pg_temp.expect_dispatch(ident,target_slug,true,'baseline permitted');
 PERFORM pg_temp.expect_dispatch(ident,target_slug||'wrong',false,'destination changed');
 UPDATE outreach_campaign_control SET enabled=false WHERE id=true;
 PERFORM pg_temp.expect_dispatch(ident,target_slug,false,'paused after reserve');
 UPDATE outreach_campaign_control SET enabled=true,health_ready=false WHERE id=true;
 PERFORM pg_temp.expect_dispatch(ident,target_slug,false,'unhealthy after reserve');
 UPDATE outreach_campaign_control SET health_ready=true,health_checked_at=now()-interval '21 minutes' WHERE id=true;
 PERFORM pg_temp.expect_dispatch(ident,target_slug,false,'stale telemetry');
 UPDATE outreach_campaign_control SET health_checked_at=now()+interval '1 second' WHERE id=true;
 PERFORM pg_temp.expect_dispatch(ident,target_slug,false,'future telemetry');
 UPDATE outreach_campaign_control SET health_checked_at=now() WHERE id=true;
 UPDATE outreach_recipient_consents SET revoked_at=now() WHERE recipient_email=target_email;
 PERFORM pg_temp.expect_dispatch(ident,target_slug,false,'permission revoked after reserve');
 UPDATE outreach_recipient_consents SET revoked_at=NULL WHERE recipient_email=target_email;
 INSERT INTO outreach_email_suppressions(recipient,reason) VALUES(target_email,'manual');
 PERFORM pg_temp.expect_dispatch(ident,target_slug,false,'global recipient suppression after reserve');
 DELETE FROM outreach_email_suppressions s WHERE s.recipient=target_email;
 INSERT INTO business_outreach(listing_id,status,contacted_at) VALUES(target_listing,'contacted',now());
 PERFORM pg_temp.expect_dispatch(ident,target_slug,false,'manual contact after reserve');
 DELETE FROM business_outreach b WHERE b.listing_id=target_listing;
 INSERT INTO outreach_email_attempts(id,recipient,campaign_key,idempotency_key,provider,state)
 VALUES(health_id,tag||'health@audit.invalid','listing-claims-v2',tag||'health','mailforge','uncertain');
 PERFORM pg_temp.expect_dispatch(ident,target_slug,false,'uncertain outcome across providers');
 UPDATE outreach_email_attempts SET state='reserved',reserved_at=now()-interval '20 minutes' WHERE id=health_id;
 PERFORM pg_temp.expect_dispatch(ident,target_slug,true,'reserved exactly20min boundary');
 UPDATE outreach_email_attempts SET reserved_at=now()-interval '20 minutes 1 second' WHERE id=health_id;
 PERFORM pg_temp.expect_dispatch(ident,target_slug,false,'stale reservation across providers');
 UPDATE outreach_email_attempts SET provider='resend',state='failed',complained_at=now()-interval '7 days' WHERE id=health_id;
 PERFORM pg_temp.expect_dispatch(ident,target_slug,false,'complaint exact7day boundary');
 UPDATE outreach_email_attempts SET complained_at=now()-interval '7 days 1 second' WHERE id=health_id;
 PERFORM pg_temp.expect_dispatch(ident,target_slug,true,'complaint older than7days');
 UPDATE outreach_email_attempts SET state='accepted',complained_at=NULL,provider_email_id=tag||'health-provider',accepted_at=now()-interval '8 days',bounced_at=now() WHERE id=health_id;
 PERFORM pg_temp.expect_dispatch(ident,target_slug,false,'recent bounce from old acceptance with zero denominator');
 INSERT INTO outreach_email_attempts(recipient,campaign_key,idempotency_key,provider,state,provider_email_id,accepted_at,delivered_at)
 SELECT tag||'sample-'||n||'@audit.invalid','listing-claims-v2',tag||'sample-'||n,'resend','accepted',tag||'provider-'||n,now()-interval '1 hour',now()-interval '59 minutes' FROM generate_series(1,50)n;
 PERFORM pg_temp.expect_dispatch(ident,target_slug,false,'bounce exactly2percent');
 INSERT INTO outreach_email_attempts(recipient,campaign_key,idempotency_key,provider,state,provider_email_id,accepted_at,delivered_at)
 VALUES(tag||'sample-51@audit.invalid','listing-claims-v2',tag||'sample-51','resend','accepted',tag||'provider-51',now()-interval '1 hour',now()-interval '59 minutes');
 PERFORM pg_temp.expect_dispatch(ident,target_slug,true,'bounce1of51 below2percent');
 DELETE FROM outreach_email_attempts WHERE recipient LIKE tag||'sample-%';
 UPDATE outreach_email_attempts SET bounced_at=NULL,accepted_at=now()-interval '24 hours' WHERE id=health_id;
 PERFORM pg_temp.expect_dispatch(ident,target_slug,true,'acceptance exact24hour boundary');
 UPDATE outreach_email_attempts SET accepted_at=now()-interval '24 hours 1 second' WHERE id=health_id;
 PERFORM pg_temp.expect_dispatch(ident,target_slug,false,'unresolved acceptance beyond24hours');
 UPDATE outreach_email_attempts SET suppressed_at=now() WHERE id=health_id;
 PERFORM pg_temp.expect_dispatch(ident,target_slug,true,'suppression resolves overdue acceptance');
 DELETE FROM outreach_email_attempts WHERE id=health_id;
 PERFORM pg_temp.expect_dispatch(ident,target_slug,true,'restored eligible state');
END $$;
ROLLBACK;
