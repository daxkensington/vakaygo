\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.campaign_report(text) RETURNS jsonb LANGUAGE sql VOLATILE AS $service$
SELECT to_jsonb(report) FROM (
-- SERVICE_REPORT_SQL
) report
$service$;
CREATE FUNCTION pg_temp.control_change(uuid,integer,text,integer,text,integer,text,text,boolean,text,text)
 RETURNS TABLE("actorExists" boolean,changed boolean) LANGUAGE sql VOLATILE AS $service$
-- SERVICE_CONTROL_SQL
$service$;
CREATE FUNCTION pg_temp.permission_grant(uuid,integer,text,uuid,text,text,text,text,text,text,text)
 RETURNS TABLE("actorExists" boolean,changed boolean) LANGUAGE sql VOLATILE AS $service$
-- SERVICE_GRANT_SQL
$service$;
CREATE FUNCTION pg_temp.permission_revoke(uuid,integer,text,uuid,text)
 RETURNS TABLE("actorExists" boolean,changed boolean) LANGUAGE sql VOLATILE AS $service$
-- SERVICE_REVOKE_SQL
$service$;
CREATE FUNCTION pg_temp.change(action text,ver integer,next_stage integer DEFAULT NULL,selected text DEFAULT NULL,ready boolean DEFAULT true)
 RETURNS boolean LANGUAGE sql VOLATILE AS $$ SELECT changed FROM pg_temp.control_change(
 '63000000-0000-4000-8000-000000000001',0,'control-admin@audit.invalid',ver,action,next_stage,'Synthetic audit pause',selected,ready,'resend','listing-claims-v2') $$;
CREATE FUNCTION pg_temp.grant_permission(expected text DEFAULT 'control-business@audit.invalid')
 RETURNS boolean LANGUAGE sql VOLATILE AS $$ SELECT changed FROM pg_temp.permission_grant(
 '63000000-0000-4000-8000-000000000001',0,'control-admin@audit.invalid','64000000-0000-4000-8000-000000000001',
 'control-business@audit.invalid','Synthetic opt-in receipt with date and recipient identity','explicit_opt_in','resend',NULL,NULL,expected) $$;
DO $$
DECLARE island integer; permission uuid; claim uuid; denied boolean;
BEGIN
 IF (SELECT enabled FROM outreach_campaign_control) THEN RAISE EXCEPTION 'Migration unexpectedly enabled sending'; END IF;
 INSERT INTO islands(slug,name,country,is_active) VALUES('control-audit','Control audit','Synthetic',true) RETURNING id INTO island;
 INSERT INTO users(id,email,role,email_verified) VALUES
 ('63000000-0000-4000-8000-000000000001','control-admin@audit.invalid','admin',true),
 ('63000000-0000-4000-8000-000000000002','control-owner@audit.invalid','operator',true);
 INSERT INTO listings(id,operator_id,island_id,type,status,title,slug,type_data) VALUES
 ('64000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000002',island,'tour','active','Control audit','control-audit','{"email":"control-business@audit.invalid"}');
 IF pg_temp.change('enable',0) THEN RAISE EXCEPTION 'Enabled without verified health feed'; END IF;
 UPDATE outreach_campaign_control SET health_ready=true,health_checked_at=now(),health_reason='synthetic_ready';
 IF (pg_temp.campaign_report('listing-claims-v2')->>'accepted')::int<>0 OR
    (pg_temp.campaign_report('listing-claims-v2')->>'telemetryHealthy')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'Read-only report failed empty-ledger health'; END IF;
 IF pg_temp.change('enable',0,NULL,NULL,false) THEN RAISE EXCEPTION 'Enabled without sender prerequisites'; END IF;
 IF NOT pg_temp.change('enable',0) THEN RAISE EXCEPTION 'Ready initial stage could not enable'; END IF;
 IF NOT (SELECT enabled FROM outreach_campaign_control) THEN RAISE EXCEPTION 'Enable did not persist control'; END IF;
 IF pg_temp.change('pause',0) OR pg_temp.change('select_provider',1,NULL,'mailforge') THEN RAISE EXCEPTION 'Stale CAS or active provider change succeeded'; END IF;
 IF NOT pg_temp.change('pause',1) OR NOT pg_temp.change('select_provider',2,NULL,'mailforge') THEN RAISE EXCEPTION 'Paused provider selection failed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM outreach_campaign_control WHERE provider='mailforge' AND NOT enabled AND stage=0 AND NOT health_ready AND health_checked_at IS NULL) THEN RAISE EXCEPTION 'Provider switch retained old health/stage'; END IF;
 UPDATE outreach_campaign_control SET health_ready=true,health_checked_at=now();
 IF pg_temp.change('enable',3) THEN RAISE EXCEPTION 'Unsupported provider enabled'; END IF;
 IF NOT pg_temp.change('select_provider',3,NULL,'resend') THEN RAISE EXCEPTION 'Return to supported provider failed'; END IF;
 UPDATE outreach_campaign_control SET health_ready=true,health_checked_at=now(),stage_started_at=now()-interval '73 hours';
 IF pg_temp.change('request_stage',4,1) THEN RAISE EXCEPTION 'Promoted without mature sample'; END IF;
 INSERT INTO outreach_email_attempts(recipient,campaign_key,idempotency_key,provider_email_id,state,reserved_at,accepted_at,delivered_at)
 SELECT 'control-sample-'||n||'@audit.invalid','listing-claims-v2','control-sample-'||n,'control-provider-'||n,'accepted',now()-interval '26 hours',now()-interval '25 hours',now()-interval '24 hours' FROM generate_series(1,50) n;
 IF pg_temp.change('request_stage',4,2) THEN RAISE EXCEPTION 'Skipped a stage'; END IF;
 IF NOT pg_temp.change('request_stage',4,1) THEN RAISE EXCEPTION 'Healthy mature sample failed one-step promotion'; END IF;
 IF (SELECT stage FROM outreach_campaign_control)<>1 THEN RAISE EXCEPTION 'Promotion did not persist next stage'; END IF;
 IF pg_temp.change('request_stage',5,2) THEN RAISE EXCEPTION 'Promoted before stage observation period'; END IF;
 UPDATE outreach_campaign_control SET stage_started_at=now()-interval '73 hours';
 UPDATE outreach_email_attempts SET bounced_at=now() WHERE recipient='control-sample-1@audit.invalid';
 IF pg_temp.change('request_stage',5,2) THEN RAISE EXCEPTION 'Promoted at 2 percent bounce rate'; END IF;
 -- Keep the harmful event recent while moving its acceptance out of the
 -- denominator cohort: it must still hold promotion and appear in reporting.
 UPDATE outreach_email_attempts SET bounced_at=NULL WHERE recipient='control-sample-1@audit.invalid';
 INSERT INTO outreach_email_attempts(recipient,campaign_key,idempotency_key,provider_email_id,state,reserved_at,accepted_at,bounced_at)
 VALUES('control-late-bounce@audit.invalid','listing-claims-v2','control-late-bounce','control-late-bounce','accepted',now()-interval '8 days',now()-interval '8 days',now());
 IF pg_temp.change('request_stage',5,2) THEN RAISE EXCEPTION 'Recent late bounce disappeared outside acceptance cohort'; END IF;
 IF (pg_temp.campaign_report('listing-claims-v2')->>'bounced')::int<>1 THEN RAISE EXCEPTION 'Report hid a recent bounce on an old acceptance'; END IF;
 INSERT INTO outreach_email_attempts(recipient,campaign_key,idempotency_key,provider_email_id,state,reserved_at,accepted_at,delivered_at)
 VALUES('control-sample-51@audit.invalid','listing-claims-v2','control-sample-51','control-provider-51','accepted',now()-interval '26 hours',now()-interval '25 hours',now()-interval '24 hours');
 UPDATE outreach_email_attempts SET complained_at=now() WHERE recipient='control-sample-2@audit.invalid';
 IF pg_temp.change('request_stage',5,2) THEN RAISE EXCEPTION 'Promoted with a complaint'; END IF;
 UPDATE outreach_email_attempts SET complained_at=NULL WHERE recipient='control-sample-2@audit.invalid';
 INSERT INTO outreach_email_attempts(recipient,campaign_key,idempotency_key,state)
 VALUES('control-uncertain@audit.invalid','listing-claims-v2','control-uncertain','uncertain');
 IF pg_temp.change('request_stage',5,2) THEN RAISE EXCEPTION 'Promoted while transport outcome uncertain'; END IF;
 UPDATE outreach_email_attempts SET state='failed' WHERE recipient='control-uncertain@audit.invalid';
 UPDATE outreach_email_attempts SET delivered_at=NULL WHERE recipient='control-sample-3@audit.invalid';
 IF pg_temp.change('request_stage',5,2) THEN RAISE EXCEPTION 'Promoted with unresolved mature delivery'; END IF;
 UPDATE outreach_email_attempts SET failed_at=now() WHERE recipient='control-sample-3@audit.invalid';
 IF pg_temp.change('request_stage',5,2) THEN RAISE EXCEPTION 'Provider failure counted as promotion delivery proof'; END IF;
 UPDATE outreach_email_attempts SET failed_at=NULL,suppressed_at=now() WHERE recipient='control-sample-3@audit.invalid';
 IF pg_temp.change('request_stage',5,2) THEN RAISE EXCEPTION 'Suppression counted as promotion delivery proof'; END IF;
 UPDATE outreach_email_attempts SET suppressed_at=NULL,delivered_at=now()-interval '24 hours' WHERE recipient='control-sample-3@audit.invalid';
 UPDATE outreach_campaign_control SET health_checked_at=now()-interval '21 minutes';
 IF pg_temp.change('request_stage',5,2) THEN RAISE EXCEPTION 'Promoted with stale telemetry'; END IF;
 UPDATE outreach_campaign_control SET health_checked_at=now();
 UPDATE outreach_campaign_control SET stage_started_at=now()-interval '10 days';
 INSERT INTO outreach_email_attempts(recipient,campaign_key,idempotency_key,provider_email_id,state,reserved_at,accepted_at,failed_at)
 VALUES('control-old-failure@audit.invalid','listing-claims-v2','control-old-failure','control-old-failure','accepted',now()-interval '8 days',now()-interval '8 days',now()-interval '8 days');
 UPDATE outreach_email_attempts SET complained_at=now() WHERE recipient='control-old-failure@audit.invalid';
 IF pg_temp.change('request_stage',5,2) THEN RAISE EXCEPTION 'Recent complaint on an older accepted message ignored'; END IF;
 UPDATE outreach_email_attempts SET complained_at=NULL WHERE recipient='control-old-failure@audit.invalid';
 INSERT INTO outreach_email_attempts(recipient,campaign_key,idempotency_key,provider,state)
 VALUES('control-other-uncertain@audit.invalid','listing-claims-v2','control-other-uncertain','infraforge','uncertain');
 IF pg_temp.change('request_stage',5,2) THEN RAISE EXCEPTION 'Provider switch hid an uncertain campaign send'; END IF;
 DELETE FROM outreach_email_attempts WHERE recipient='control-other-uncertain@audit.invalid';
 IF (pg_temp.campaign_report('listing-claims-v2')->>'accepted')::int<>51 OR
    (pg_temp.campaign_report('listing-claims-v2')->>'matureAccepted')::int<>51 OR
    (pg_temp.campaign_report('listing-claims-v2')->>'bounced')::int<>1 THEN RAISE EXCEPTION 'Report did not preserve exact acceptance/mature/bounce facts'; END IF;
 IF NOT pg_temp.change('request_stage',5,2) THEN RAISE EXCEPTION 'Healthy less-than-2-percent sample could not promote'; END IF;
 IF pg_temp.grant_permission('changed@audit.invalid') THEN RAISE EXCEPTION 'Grant ignored reviewed-email CAS'; END IF;
 IF NOT pg_temp.grant_permission() THEN RAISE EXCEPTION 'Reviewed explicit opt-in could not be recorded'; END IF;
 IF pg_temp.grant_permission() THEN RAISE EXCEPTION 'Duplicate active permission recorded'; END IF;
 SELECT id INTO permission FROM outreach_recipient_consents WHERE recipient_email='control-business@audit.invalid';
 IF NOT (SELECT changed FROM pg_temp.permission_revoke('63000000-0000-4000-8000-000000000001',0,'control-admin@audit.invalid',permission,'Synthetic evidence withdrawn')) THEN RAISE EXCEPTION 'Permission revocation failed'; END IF;
 INSERT INTO outreach_email_suppressions(recipient,reason) VALUES('control-business@audit.invalid','unsubscribe');
 IF pg_temp.grant_permission() THEN RAISE EXCEPTION 'Permission grant bypassed recipient suppression'; END IF;
 IF NOT EXISTS(SELECT 1 FROM outreach_email_suppressions WHERE recipient='control-business@audit.invalid' AND reason='unsubscribe') THEN RAISE EXCEPTION 'Grant cleared suppression'; END IF;
 -- Only synthetic fixture evidence is removed, within this rolled-back test.
 DELETE FROM outreach_email_suppressions WHERE recipient='control-business@audit.invalid';
 IF NOT (SELECT changed FROM pg_temp.permission_grant(
  '63000000-0000-4000-8000-000000000001',0,'control-admin@audit.invalid','64000000-0000-4000-8000-000000000001',
  'control-business@audit.invalid','Synthetic specific country and provider basis review','business_outreach_permission','mailforge','CA','Synthetic dated provider and country policy record','control-business@audit.invalid')) THEN RAISE EXCEPTION 'Reviewed future-provider evidence could not be recorded'; END IF;
 IF (SELECT enabled FROM outreach_campaign_control) THEN RAISE EXCEPTION 'Recording future permission enabled campaign'; END IF;
 INSERT INTO business_outreach(listing_id,status,notes) VALUES('64000000-0000-4000-8000-000000000001','do_not_contact','Synthetic suppression');
 IF pg_temp.grant_permission() THEN RAISE EXCEPTION 'Permission grant reopened do-not-contact listing'; END IF;
 UPDATE users SET session_version=1 WHERE id='63000000-0000-4000-8000-000000000001';
 IF (SELECT "actorExists" FROM pg_temp.control_change('63000000-0000-4000-8000-000000000001',0,'control-admin@audit.invalid',6,'pause',NULL,'Synthetic pause',NULL,true,'resend','listing-claims-v2')) THEN RAISE EXCEPTION 'Stale admin session authorized'; END IF;
 denied:=false;
 BEGIN
  INSERT INTO outreach_recipient_consents(listing_id,recipient_email,evidence,permission_kind,provider)
  VALUES('64000000-0000-4000-8000-000000000001','business-basis@audit.invalid','Synthetic evidence long enough','business_outreach_permission','mailforge');
 EXCEPTION WHEN check_violation THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Business permission accepted without country/policy'; END IF;
 INSERT INTO listing_claims(listing_id,operator_id,status,contact_name,contact_phone) VALUES
 ('64000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000002','approved','Synthetic owner','+15555550123') RETURNING id INTO claim;
 INSERT INTO outreach_claim_attributions(attempt_id,listing_id,claim_id)
 SELECT id,'64000000-0000-4000-8000-000000000001',claim FROM outreach_email_attempts WHERE recipient='control-sample-1@audit.invalid';
 INSERT INTO outreach_email_attempts(recipient,campaign_key,idempotency_key,provider) VALUES
 ('control-other-provider@audit.invalid','listing-claims-v2','control-other-provider','infraforge'),
 ('control-other-campaign@audit.invalid','different-campaign','control-other-campaign','resend');
 INSERT INTO outreach_claim_attributions(attempt_id,listing_id,claim_id)
 SELECT id,'64000000-0000-4000-8000-000000000001',claim FROM outreach_email_attempts WHERE recipient IN ('control-other-provider@audit.invalid','control-other-campaign@audit.invalid');
 IF (pg_temp.campaign_report('listing-claims-v2')->>'linkVisits')::int<>1 OR
  (pg_temp.campaign_report('listing-claims-v2')->>'approvedClaimsFromLinks')::int<>1 THEN RAISE EXCEPTION 'Claim link report mixed campaign/provider scopes'; END IF;
 IF EXISTS(SELECT 1 FROM listing_onboarding WHERE listing_id='64000000-0000-4000-8000-000000000001') OR EXISTS(SELECT 1 FROM bookings WHERE listing_id='64000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'Campaign controls changed booking/onboarding state'; END IF;
END $$;
SELECT 'PASS: actual campaign control/consent SQL, default pause, identity/version CAS, prerequisites, provider isolation, one-step mature ramp, bounce/complaint/uncertainty/feed gates, reviewed recipient, irreversible suppression and revocation';
ROLLBACK;
