-- Separate managed B2B transport. This migration never enables sending.
ALTER TABLE outreach_campaign_control DROP CONSTRAINT outreach_campaign_control_provider_check;
ALTER TABLE outreach_campaign_control ADD CONSTRAINT outreach_campaign_control_provider_check CHECK(provider IN ('resend','sendcorex','mailforge','infraforge'));
ALTER TABLE outreach_recipient_consents DROP CONSTRAINT outreach_recipient_consents_provider_check;
ALTER TABLE outreach_recipient_consents ADD CONSTRAINT outreach_recipient_consents_provider_check CHECK(provider IN ('resend','sendcorex','mailforge','infraforge'));
ALTER TABLE outreach_recipient_consents DROP CONSTRAINT outreach_recipient_consents_check;
ALTER TABLE outreach_recipient_consents ADD CONSTRAINT outreach_recipient_policy_check CHECK(permission_kind='explicit_opt_in' OR (provider IN ('sendcorex','mailforge','infraforge') AND recipient_country IS NOT NULL AND recipient_country ~ '^[A-Z]{2}$' AND policy_reference IS NOT NULL AND length(btrim(policy_reference))>=CASE WHEN provider='sendcorex' THEN 20 ELSE 10 END));
CREATE TABLE outreach_provider_cursors (provider varchar(32) PRIMARY KEY, cursor text NOT NULL CHECK(length(cursor) BETWEEN 1 AND 2048), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE outreach_webhook_proofs (
 provider varchar(32) PRIMARY KEY,
 webhook_id varchar(128) NOT NULL,
 secret_hash varchar(64) NOT NULL CHECK(secret_hash ~ '^[a-f0-9]{64}$'),
 verified_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE FUNCTION vakaygo_outreach_permission_allowed(p_provider text,p_kind text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT (p_provider IN ('resend','sendcorex') AND p_kind='explicit_opt_in') OR (p_provider='sendcorex' AND p_kind='business_outreach_permission')
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION vakaygo_reserve_outreach_attempt(p_listing uuid,p_recipient text,p_campaign text)
RETURNS TABLE(attempt_id uuid,reason text) LANGUAGE plpgsql VOLATILE AS $$
DECLARE c outreach_campaign_control%ROWTYPE; cap integer; n integer; ident uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('vakaygo-outreach-campaign',0));
 SELECT * INTO c FROM outreach_campaign_control WHERE id=true;
 IF NOT FOUND OR NOT c.enabled THEN RETURN QUERY SELECT NULL::uuid,'campaign_paused'::text; RETURN; END IF;
 IF p_campaign<>'listing-claims-v2' OR p_recipient<>lower(btrim(p_recipient)) OR length(p_recipient)>254 THEN RETURN QUERY SELECT NULL::uuid,'invalid_request'::text; RETURN; END IF;
 -- Only implemented transports can reserve an attempt.
 IF c.provider NOT IN ('resend','sendcorex') THEN RETURN QUERY SELECT NULL::uuid,'provider_adapter_not_configured'::text; RETURN; END IF;
 IF NOT c.health_ready OR c.health_checked_at IS NULL OR c.health_checked_at<now()-interval '20 minutes' OR c.health_checked_at>now()+interval '1 minute' THEN RETURN QUERY SELECT NULL::uuid,'telemetry_unavailable'::text; RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM listings l JOIN islands i ON i.id=l.island_id WHERE l.id=p_listing AND l.status='active' AND i.is_active=true AND lower(btrim(l.type_data->>'email'))=p_recipient AND NOT vakaygo_listing_claim_verified(l.id)) THEN RETURN QUERY SELECT NULL::uuid,'listing_not_eligible'::text; RETURN; END IF;
 IF EXISTS(SELECT 1 FROM business_outreach WHERE listing_id=p_listing AND (status='do_not_contact' OR contacted_at IS NOT NULL)) THEN RETURN QUERY SELECT NULL::uuid,'already_contacted_or_suppressed'::text; RETURN; END IF;
 IF EXISTS(SELECT 1 FROM outreach_email_suppressions WHERE recipient=p_recipient) THEN RETURN QUERY SELECT NULL::uuid,'suppressed'::text; RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM outreach_recipient_consents WHERE listing_id=p_listing AND recipient_email=p_recipient AND provider=c.provider AND vakaygo_outreach_permission_allowed(provider,permission_kind) AND revoked_at IS NULL AND granted_at<=now()) THEN RETURN QUERY SELECT NULL::uuid,'recipient_permission_missing'::text; RETURN; END IF;
 IF EXISTS(SELECT 1 FROM outreach_email_attempts WHERE campaign_key=p_campaign AND (listing_id=p_listing OR recipient=p_recipient)) THEN RETURN QUERY SELECT NULL::uuid,'already_reserved'::text; RETURN; END IF;
 IF EXISTS(SELECT 1 FROM outreach_email_attempts WHERE campaign_key=p_campaign AND (state='uncertain' OR (state='reserved' AND reserved_at<now()-interval '20 minutes'))) THEN RETURN QUERY SELECT NULL::uuid,'uncertain_transport_hold'::text; RETURN; END IF;
 IF EXISTS(SELECT 1 FROM outreach_email_attempts WHERE campaign_key=p_campaign AND provider=c.provider AND complained_at>now()-interval '7 days') THEN RETURN QUERY SELECT NULL::uuid,'complaint_hold'::text; RETURN; END IF;
 -- Recent reputation harm counts even when the original send is older than
 -- the denominator window. No accepted sample never hides a recent bounce.
 IF EXISTS(SELECT 1 FROM (
   SELECT count(*) FILTER(WHERE bounced_at>=now()-interval '7 days') AS bounced,
     count(*) FILTER(WHERE accepted_at>=now()-interval '7 days') AS accepted
   FROM outreach_email_attempts WHERE campaign_key=p_campaign AND provider=c.provider
  ) health WHERE bounced>0 AND (accepted=0 OR bounced::numeric/greatest(accepted,1)>=0.02))
 THEN RETURN QUERY SELECT NULL::uuid,'bounce_rate_hold'::text; RETURN; END IF;
 IF EXISTS(SELECT 1 FROM outreach_email_attempts WHERE campaign_key=p_campaign AND provider=c.provider AND state='accepted' AND accepted_at<now()-interval '24 hours' AND delivered_at IS NULL AND bounced_at IS NULL AND suppressed_at IS NULL AND failed_at IS NULL) THEN RETURN QUERY SELECT NULL::uuid,'unresolved_delivery_hold'::text; RETURN; END IF;
 cap := (ARRAY[18,24,32,44,60])[c.stage+1];
 SELECT count(*) INTO n FROM outreach_email_attempts WHERE campaign_key=p_campaign AND reserved_at>now()-interval '24 hours';
 IF n>=cap THEN RETURN QUERY SELECT NULL::uuid,'daily_cap'::text; RETURN; END IF;
 SELECT count(*) INTO n FROM outreach_email_attempts WHERE campaign_key=p_campaign AND reserved_at>now()-interval '1 hour';
 IF n>=6 THEN RETURN QUERY SELECT NULL::uuid,'hourly_cap'::text; RETURN; END IF;
 IF EXISTS(SELECT 1 FROM outreach_email_attempts WHERE campaign_key=p_campaign AND reserved_at>now()-interval '10 minutes') THEN RETURN QUERY SELECT NULL::uuid,'minimum_interval'::text; RETURN; END IF;
 ident:=gen_random_uuid();
 INSERT INTO outreach_email_attempts(id,listing_id,recipient,campaign_key,idempotency_key,provider)
 VALUES(ident,p_listing,p_recipient,p_campaign,'outreach:'||ident::text,c.provider);
 RETURN QUERY SELECT ident,NULL::text;
END $$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION vakaygo_apply_outreach_events(p_provider text,p_email_id text)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE target outreach_email_attempts%ROWTYPE; affected integer;
BEGIN
 SELECT * INTO target FROM outreach_email_attempts
 WHERE provider=p_provider AND provider_email_id=p_email_id FOR UPDATE;
 IF target.id IS NULL THEN RETURN 0; END IF;
 WITH matched AS (
  UPDATE outreach_email_events e SET attempt_id=target.id
  WHERE e.provider=p_provider AND e.provider_email_id=p_email_id
    AND e.attempt_id IS NULL
    AND e.recipient_hash=encode(sha256(convert_to(target.recipient,'UTF8')),'hex')
  RETURNING e.*
 ), suppressed AS (
  INSERT INTO outreach_email_suppressions(recipient,reason,provider,source_event_id)
  SELECT DISTINCT ON (target.recipient) target.recipient,
   CASE m.event_type WHEN 'email.complained' THEN 'complaint'
    WHEN 'email.bounced' THEN 'bounce' WHEN 'email.unsubscribed' THEN 'unsubscribe' ELSE 'provider_suppressed' END,
   p_provider,m.provider_event_id
  FROM matched m WHERE m.event_type IN ('email.bounced','email.complained','email.suppressed','email.unsubscribed')
  ORDER BY target.recipient,
   CASE m.event_type WHEN 'email.complained' THEN 3 WHEN 'email.bounced' THEN 2 ELSE 1 END DESC,
   m.occurred_at,m.provider_event_id
  ON CONFLICT(recipient) DO NOTHING
  RETURNING recipient
 ), rollup AS (
  SELECT min(occurred_at) FILTER(WHERE event_type='email.sent') AS sent_at,
   min(occurred_at) FILTER(WHERE event_type='email.delivered') AS delivered_at,
   min(occurred_at) FILTER(WHERE event_type='email.bounced') AS bounced_at,
   min(occurred_at) FILTER(WHERE event_type='email.complained') AS complained_at,
   min(occurred_at) FILTER(WHERE event_type IN ('email.suppressed','email.unsubscribed')) AS suppressed_at,
   min(occurred_at) FILTER(WHERE event_type='email.failed') AS failed_at,
   min(occurred_at) FILTER(WHERE event_type='email.opened') AS opened_at,
   min(occurred_at) FILTER(WHERE event_type='email.clicked') AS clicked_at,
   max(occurred_at) AS latest_at,
   (array_agg(event_type ORDER BY occurred_at DESC,
     CASE event_type WHEN 'email.complained' THEN 5 WHEN 'email.bounced' THEN 4
      WHEN 'email.suppressed' THEN 3 WHEN 'email.failed' THEN 2 ELSE 1 END DESC,
     provider_event_id))[1] AS latest_type
  FROM matched
 )
 UPDATE outreach_email_attempts a SET
  sent_at=least(a.sent_at,r.sent_at),delivered_at=least(a.delivered_at,r.delivered_at),
  bounced_at=least(a.bounced_at,r.bounced_at),complained_at=least(a.complained_at,r.complained_at),
  suppressed_at=least(a.suppressed_at,r.suppressed_at),failed_at=least(a.failed_at,r.failed_at),
  opened_at=least(a.opened_at,r.opened_at),clicked_at=least(a.clicked_at,r.clicked_at),
  last_event=CASE WHEN r.latest_at>=coalesce(a.last_event_at,'-infinity'::timestamptz)
   THEN r.latest_type ELSE a.last_event END,
  last_event_at=greatest(a.last_event_at,r.latest_at),updated_at=now()
 FROM rollup r WHERE a.id=target.id AND r.latest_at IS NOT NULL;
 GET DIAGNOSTICS affected=ROW_COUNT;
 RETURN affected;
END $$;

--> statement-breakpoint
UPDATE outreach_campaign_control SET enabled=false,health_ready=false,health_checked_at=NULL,health_reason='sendcorex_adapter_review_required',pause_reason='Transport update requires a fresh review',version=version+CASE WHEN enabled OR health_ready THEN 1 ELSE 0 END,updated_at=now() WHERE id=true;
