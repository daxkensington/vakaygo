-- Campaign-only controls. No existing claims, bookings, prices or sender DNS change.
CREATE TABLE outreach_campaign_control (
 id boolean PRIMARY KEY DEFAULT true CHECK(id=true),
 enabled boolean NOT NULL DEFAULT false,
 provider varchar(32) NOT NULL DEFAULT 'resend' CHECK(provider IN ('resend','mailforge','infraforge')),
 stage integer NOT NULL DEFAULT 0 CHECK(stage BETWEEN 0 AND 4),
 stage_started_at timestamptz NOT NULL DEFAULT now(),
 version integer NOT NULL DEFAULT 0,
 updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 pause_reason text NOT NULL DEFAULT 'Awaiting verified sender, tracking and recipient permission',
 health_checked_at timestamptz,
 health_ready boolean NOT NULL DEFAULT false,
 health_reason text NOT NULL DEFAULT 'not_checked'
);
INSERT INTO outreach_campaign_control(id) VALUES(true);

CREATE TABLE outreach_recipient_consents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
 recipient_email varchar(254) NOT NULL CHECK(recipient_email=lower(btrim(recipient_email)) AND position('@' IN recipient_email)>1),
 provider varchar(32) NOT NULL DEFAULT 'resend' CHECK(provider IN ('resend','mailforge','infraforge')),
 permission_kind varchar(32) NOT NULL DEFAULT 'explicit_opt_in' CHECK(permission_kind IN ('explicit_opt_in','business_outreach_permission')),
 recipient_country char(2),
 policy_reference text,
 evidence text NOT NULL CHECK(length(btrim(evidence)) BETWEEN 20 AND 4000),
 granted_by uuid REFERENCES users(id) ON DELETE SET NULL,
 granted_at timestamptz NOT NULL DEFAULT now(),
 revoked_by uuid REFERENCES users(id) ON DELETE SET NULL,
 revoked_at timestamptz,
 revocation_reason text,
 CHECK(permission_kind='explicit_opt_in' OR (provider IN ('mailforge','infraforge') AND recipient_country IS NOT NULL AND recipient_country ~ '^[A-Z]{2}$' AND policy_reference IS NOT NULL AND length(btrim(policy_reference))>=10))
);
CREATE UNIQUE INDEX outreach_recipient_consent_active_unique ON outreach_recipient_consents(listing_id,recipient_email,provider) WHERE revoked_at IS NULL;

CREATE TABLE outreach_claim_attributions (
 attempt_id uuid PRIMARY KEY REFERENCES outreach_email_attempts(id) ON DELETE CASCADE,
 listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
 first_visited_at timestamptz NOT NULL DEFAULT now(),
 last_visited_at timestamptz NOT NULL DEFAULT now(),
 claim_id uuid REFERENCES listing_claims(id) ON DELETE SET NULL,
 claimed_at timestamptz,
 operator_id uuid REFERENCES users(id) ON DELETE SET NULL
);

-- VOLATILE PL/pgSQL obtains a fresh READ COMMITTED snapshot after the lock.
-- A single locked CTE with an earlier snapshot would not serialize rolling caps.
CREATE FUNCTION vakaygo_reserve_outreach_attempt(p_listing uuid,p_recipient text,p_campaign text)
RETURNS TABLE(attempt_id uuid,reason text) LANGUAGE plpgsql VOLATILE AS $$
DECLARE c outreach_campaign_control%ROWTYPE; cap integer; n integer; ident uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('vakaygo-outreach-campaign',0));
 SELECT * INTO c FROM outreach_campaign_control WHERE id=true;
 IF NOT FOUND OR NOT c.enabled THEN RETURN QUERY SELECT NULL::uuid,'campaign_paused'::text; RETURN; END IF;
 IF p_campaign<>'listing-claims-v2' OR p_recipient<>lower(btrim(p_recipient)) OR length(p_recipient)>254 THEN RETURN QUERY SELECT NULL::uuid,'invalid_request'::text; RETURN; END IF;
 -- This release has only the Resend transport; recording an alternative policy
 -- does not silently enable an unconfigured provider.
 IF c.provider<>'resend' THEN RETURN QUERY SELECT NULL::uuid,'provider_adapter_not_configured'::text; RETURN; END IF;
 IF NOT c.health_ready OR c.health_checked_at IS NULL OR c.health_checked_at<now()-interval '20 minutes' OR c.health_checked_at>now()+interval '1 minute' THEN RETURN QUERY SELECT NULL::uuid,'telemetry_unavailable'::text; RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM listings l JOIN islands i ON i.id=l.island_id WHERE l.id=p_listing AND l.status='active' AND i.is_active=true AND lower(btrim(l.type_data->>'email'))=p_recipient AND NOT vakaygo_listing_claim_verified(l.id)) THEN RETURN QUERY SELECT NULL::uuid,'listing_not_eligible'::text; RETURN; END IF;
 IF EXISTS(SELECT 1 FROM business_outreach WHERE listing_id=p_listing AND (status='do_not_contact' OR contacted_at IS NOT NULL)) THEN RETURN QUERY SELECT NULL::uuid,'already_contacted_or_suppressed'::text; RETURN; END IF;
 IF EXISTS(SELECT 1 FROM outreach_email_suppressions WHERE recipient=p_recipient) THEN RETURN QUERY SELECT NULL::uuid,'suppressed'::text; RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM outreach_recipient_consents WHERE listing_id=p_listing AND recipient_email=p_recipient AND provider=c.provider AND permission_kind='explicit_opt_in' AND revoked_at IS NULL AND granted_at<=now()) THEN RETURN QUERY SELECT NULL::uuid,'recipient_permission_missing'::text; RETURN; END IF;
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
