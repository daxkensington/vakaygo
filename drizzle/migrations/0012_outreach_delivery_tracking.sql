-- Additive campaign evidence only. This does not send mail or enable a campaign.
CREATE TABLE outreach_email_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 listing_id uuid REFERENCES listings(id) ON DELETE SET NULL,
 recipient varchar(254) NOT NULL,
 campaign_key varchar(96) NOT NULL,
 idempotency_key varchar(128) NOT NULL,
 provider varchar(32) NOT NULL DEFAULT 'resend',
 state varchar(16) NOT NULL DEFAULT 'reserved',
 provider_email_id varchar(128),
 reserved_at timestamptz NOT NULL DEFAULT now(),
 accepted_at timestamptz,
 failed_at timestamptz,
 error_code varchar(64),
 last_event varchar(64),
 last_event_at timestamptz,
 sent_at timestamptz,
 delivered_at timestamptz,
 bounced_at timestamptz,
 complained_at timestamptz,
 suppressed_at timestamptz,
 opened_at timestamptz,
 clicked_at timestamptz,
 last_polled_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT outreach_attempt_recipient_check CHECK (recipient=lower(trim(recipient)) AND length(recipient) BETWEEN 6 AND 254),
 CONSTRAINT outreach_attempt_provider_check CHECK (provider ~ '^[a-z][a-z0-9_-]{0,31}$'),
 CONSTRAINT outreach_attempt_state_check CHECK (state IN ('reserved','accepted','failed','uncertain')),
 CONSTRAINT outreach_attempt_accepted_check CHECK (state<>'accepted' OR (provider_email_id IS NOT NULL AND accepted_at IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX outreach_attempt_listing_campaign_key ON outreach_email_attempts(listing_id,campaign_key);
CREATE UNIQUE INDEX outreach_attempt_recipient_campaign_key ON outreach_email_attempts(recipient,campaign_key);
CREATE UNIQUE INDEX outreach_attempt_idempotency_key ON outreach_email_attempts(idempotency_key);
CREATE UNIQUE INDEX outreach_attempt_provider_email_key ON outreach_email_attempts(provider,provider_email_id);
CREATE INDEX outreach_attempt_reserved_idx ON outreach_email_attempts(reserved_at);
--> statement-breakpoint
CREATE TABLE outreach_email_events (
 provider varchar(32) NOT NULL,
 provider_event_id varchar(256) NOT NULL,
 provider_email_id varchar(128) NOT NULL,
 event_type varchar(64) NOT NULL,
 occurred_at timestamptz NOT NULL,
 recipient_hash varchar(64) NOT NULL,
 evidence_source varchar(24) NOT NULL DEFAULT 'webhook',
 bounce_type varchar(24),
 attempt_id uuid REFERENCES outreach_email_attempts(id) ON DELETE SET NULL,
 received_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(provider,provider_event_id),
 CONSTRAINT outreach_event_recipient_hash_check CHECK (recipient_hash ~ '^[0-9a-f]{64}$'),
 CONSTRAINT outreach_event_evidence_source_check CHECK (evidence_source IN ('webhook','provider_poll'))
);
CREATE INDEX outreach_event_provider_email_idx ON outreach_email_events(provider,provider_email_id);
--> statement-breakpoint
CREATE TABLE outreach_email_suppressions (
 recipient varchar(254) PRIMARY KEY,
 reason varchar(24) NOT NULL,
 provider varchar(32),
 source_event_id varchar(256),
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT outreach_suppression_recipient_check CHECK (recipient=lower(trim(recipient)) AND length(recipient) BETWEEN 6 AND 254),
 CONSTRAINT outreach_suppression_reason_check CHECK (reason IN ('bounce','complaint','provider_suppressed','unsubscribe','manual'))
);
--> statement-breakpoint
-- Call after taking the provider/email advisory transaction lock in a separate
-- statement under READ COMMITTED. Both acceptance and webhook ingestion use it.
-- This avoids losing a webhook racing the provider's send response.
CREATE FUNCTION vakaygo_apply_outreach_events(p_provider text,p_email_id text)
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
    WHEN 'email.bounced' THEN 'bounce' ELSE 'provider_suppressed' END,
   p_provider,m.provider_event_id
  FROM matched m WHERE m.event_type IN ('email.bounced','email.complained','email.suppressed')
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
   min(occurred_at) FILTER(WHERE event_type='email.suppressed') AS suppressed_at,
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
