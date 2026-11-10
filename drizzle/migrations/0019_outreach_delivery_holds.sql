-- Outreach delivery holds, country gate and legacy opt-outs. This migration never enables sending.
-- A recorded delivery review lets an administrator resume after reviewing bounces/failures.
ALTER TABLE "outreach_campaign_control" ADD COLUMN "holds_reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "outreach_campaign_control" ADD COLUMN "holds_reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "outreach_campaign_control" ADD COLUMN "holds_review_note" text;--> statement-breakpoint
ALTER TABLE "outreach_campaign_control" ADD CONSTRAINT "outreach_campaign_control_holds_reviewed_by_users_id_fk" FOREIGN KEY ("holds_reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
-- Same gates as before, with four changes:
--  * an address that an earlier campaign already emailed, or that opted out, for any listing is never reserved again;
--  * a destination or recorded country with a prior opt-in law (Greece, Spain, Italy, Croatia, Costa Rica)
--    needs the recipient's explicit opt-in; reviewed business permission alone is refused;
--  * the bounce hold needs 3 bounces while fewer than 50 messages were accepted, then the 2% rate applies;
--    a soft-failure hold (Sendcorex) needs 5 failures, then a 10% rate. One bad recipient no longer stops
--    the campaign; that recipient is not written to again because an address gets one attempt per campaign;
--  * both holds count from the later of 7 days ago and the last recorded delivery review.
-- The limits mirror lib/outreach-campaign-policy.ts. Complaint, uncertain and unresolved holds are unchanged.
CREATE OR REPLACE FUNCTION vakaygo_reserve_outreach_attempt(p_listing uuid,p_recipient text,p_campaign text)
RETURNS TABLE(attempt_id uuid,reason text) LANGUAGE plpgsql VOLATILE AS $$
DECLARE c outreach_campaign_control%ROWTYPE; cap integer; n integer; ident uuid; since timestamptz;
 n_accepted integer; n_bounced integer; n_failed integer;
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
 -- Earlier campaigns recorded contact per listing. Apply it per address.
 IF EXISTS(SELECT 1 FROM business_outreach lo JOIN listings ll ON ll.id=lo.listing_id
   WHERE lo.listing_id<>p_listing AND (lo.status='do_not_contact' OR lo.contacted_at IS NOT NULL)
     AND (lower(btrim(ll.type_data->>'email'))=p_recipient
       OR p_recipient IN (SELECT lower(m[1]) FROM regexp_matches(lo.notes,'Claim invitation emailed to ([^[:space:]]+)','g') m)))
 THEN RETURN QUERY SELECT NULL::uuid,'address_already_contacted'::text; RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM outreach_recipient_consents WHERE listing_id=p_listing AND recipient_email=p_recipient AND provider=c.provider AND vakaygo_outreach_permission_allowed(provider,permission_kind) AND revoked_at IS NULL AND granted_at<=now()) THEN RETURN QUERY SELECT NULL::uuid,'recipient_permission_missing'::text; RETURN; END IF;
 -- Prior opt-in countries: the destination's country, or the country on the permission record.
 IF NOT EXISTS(SELECT 1 FROM outreach_recipient_consents p JOIN listings l ON l.id=p.listing_id JOIN islands i ON i.id=l.island_id
   WHERE p.listing_id=p_listing AND p.recipient_email=p_recipient AND p.provider=c.provider
     AND vakaygo_outreach_permission_allowed(p.provider,p.permission_kind) AND p.revoked_at IS NULL AND p.granted_at<=now()
     AND (p.permission_kind='explicit_opt_in'
       OR (i.country NOT IN ('Greece','Spain','Italy','Croatia','Costa Rica')
         AND coalesce(p.recipient_country::text,'') NOT IN ('GR','ES','IT','HR','CR'))))
 THEN RETURN QUERY SELECT NULL::uuid,'country_requires_explicit_opt_in'::text; RETURN; END IF;
 IF EXISTS(SELECT 1 FROM outreach_email_attempts WHERE campaign_key=p_campaign AND (listing_id=p_listing OR recipient=p_recipient)) THEN RETURN QUERY SELECT NULL::uuid,'already_reserved'::text; RETURN; END IF;
 IF EXISTS(SELECT 1 FROM outreach_email_attempts WHERE campaign_key=p_campaign AND (state='uncertain' OR (state='reserved' AND reserved_at<now()-interval '20 minutes'))) THEN RETURN QUERY SELECT NULL::uuid,'uncertain_transport_hold'::text; RETURN; END IF;
 IF EXISTS(SELECT 1 FROM outreach_email_attempts WHERE campaign_key=p_campaign AND provider=c.provider AND complained_at>now()-interval '7 days') THEN RETURN QUERY SELECT NULL::uuid,'complaint_hold'::text; RETURN; END IF;
 since:=greatest(now()-interval '7 days',coalesce(c.holds_reviewed_at,'-infinity'::timestamptz));
 SELECT count(*) FILTER(WHERE accepted_at>=since),count(*) FILTER(WHERE bounced_at>=since),
   count(*) FILTER(WHERE provider='sendcorex' AND accepted_at IS NOT NULL AND failed_at>=since)
  INTO n_accepted,n_bounced,n_failed
  FROM outreach_email_attempts WHERE campaign_key=p_campaign AND provider=c.provider;
 IF n_bounced>0 AND (CASE WHEN n_accepted<50 THEN n_bounced>=3 ELSE n_bounced::numeric/n_accepted>=0.02 END)
 THEN RETURN QUERY SELECT NULL::uuid,'bounce_rate_hold'::text; RETURN; END IF;
 IF n_failed>0 AND (CASE WHEN n_accepted<50 THEN n_failed>=5 ELSE n_failed::numeric/n_accepted>=0.1 END)
 THEN RETURN QUERY SELECT NULL::uuid,'failure_rate_hold'::text; RETURN; END IF;
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
-- Businesses that opted out of the earlier per-listing invitations are suppressed per address,
-- so the opt-out also covers their other listings and any later campaign. No address is written
-- into this file; the rows come from existing do_not_contact records.
WITH legacy AS (
 SELECT lower(btrim(l.type_data->>'email')) AS recipient,b.notes
   FROM business_outreach b JOIN listings l ON l.id=b.listing_id WHERE b.status='do_not_contact'
 UNION
 SELECT lower(m[1]),b.notes FROM business_outreach b,
   regexp_matches(b.notes,'Claim invitation emailed to ([^[:space:]]+)','g') m WHERE b.status='do_not_contact'
), targets AS (
 SELECT recipient,bool_or(notes ~* '(unsubscrib|opted out)') AS opted_out FROM legacy
  WHERE recipient ~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}$' AND length(recipient) BETWEEN 6 AND 254
  GROUP BY recipient
), blocked AS (
 INSERT INTO outreach_email_suppressions(recipient,reason,source_event_id)
 SELECT recipient,CASE WHEN opted_out THEN 'unsubscribe' ELSE 'manual' END,'migration_0019_legacy_do_not_contact' FROM targets
 ON CONFLICT(recipient) DO NOTHING RETURNING recipient
)
UPDATE outreach_recipient_consents p SET revoked_at=now(),revocation_reason='legacy_recipient_do_not_contact'
 WHERE p.recipient_email IN (SELECT recipient FROM targets) AND p.revoked_at IS NULL;
