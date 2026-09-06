-- Canonical claim/onboarding evidence. Existing listings remain ineligible.
CREATE TABLE listing_trusted_contacts (
 listing_id uuid PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
 original_operator_id uuid NOT NULL REFERENCES users(id),
 phone varchar(20) NOT NULL CHECK (phone ~ '^\+[1-9][0-9]{7,14}$'),
 source varchar(64) NOT NULL,
 source_reference text NOT NULL,
 captured_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
-- Only independently sourced, still-unclaimed placeholder records are eligible for a snapshot.
-- Ambiguous/local-only numbers and other sources remain unresolved (closed).
INSERT INTO listing_trusted_contacts(listing_id,original_operator_id,phone,source,source_reference)
SELECT l.id,l.operator_id,
 CASE WHEN regexp_replace(l.type_data->>'phone','[^0-9+]','','g') ~ '^\+[1-9][0-9]{7,14}$'
      THEN regexp_replace(l.type_data->>'phone','[^0-9+]','','g')
      WHEN regexp_replace(l.type_data->>'phone','[^0-9]','','g') ~ '^1[0-9]{10}$'
      THEN '+'||regexp_replace(l.type_data->>'phone','[^0-9]','','g')
      ELSE '+1'||regexp_replace(l.type_data->>'phone','[^0-9]','','g') END,
 'google-places',l.type_data->>'googlePlaceId'
FROM listings l JOIN users u ON u.id=l.operator_id
WHERE lower(u.email)='unclaimed@vakaygo.com' AND u.role='operator'
 AND l.type_data->>'unclaimed'='true'
 AND length(l.type_data->>'googlePlaceId')>=8
 AND coalesce(l.type_data->>'source','google-places')='google-places'
 AND (regexp_replace(l.type_data->>'phone','[^0-9+]','','g') ~ '^\+[1-9][0-9]{7,14}$'
   OR regexp_replace(l.type_data->>'phone','[^0-9]','','g') ~ '^1[0-9]{10}$'
   OR regexp_replace(l.type_data->>'phone','[^0-9]','','g') ~ '^(242|246|264|268|284|340|345|441|473|649|664|721|758|767|784|787|809|829|849|868|869|876|939)[0-9]{7}$');
--> statement-breakpoint
CREATE TABLE listing_claim_verifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
 operator_id uuid NOT NULL REFERENCES users(id),
 claim_id uuid NOT NULL UNIQUE REFERENCES listing_claims(id),
 target_phone varchar(20) NOT NULL,
 service_sid varchar(64) NOT NULL,
 provider_account_id varchar(64) NOT NULL,
 provider_verification_id varchar(64) UNIQUE,
 status varchar(24) NOT NULL DEFAULT 'sending' CHECK(status IN ('sending','pending','verified','failed','expired','revoked')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 check_token uuid,
 check_locked_until timestamptz,
 provider_approved_at timestamptz,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes',
 verified_at timestamptz,
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX listing_claim_verifications_active_listing ON listing_claim_verifications(listing_id) WHERE status IN ('sending','pending','verified');
--> statement-breakpoint
CREATE UNIQUE INDEX listing_claim_verifications_active_phone ON listing_claim_verifications(target_phone) WHERE status IN ('sending','pending');
--> statement-breakpoint
CREATE TABLE booking_provider_config (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 environment varchar(8) CHECK(environment IN ('test','live')),
 platform_account_id varchar(128),
 allowed_countries json NOT NULL DEFAULT '[]'::json,
 updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
INSERT INTO booking_provider_config(id) VALUES(true);
--> statement-breakpoint
INSERT INTO feature_flags(key,enabled,description) VALUES('booking_launch_enabled',false,'Bookings remain closed until explicitly launched after business onboarding validation')
ON CONFLICT(key) DO UPDATE SET enabled=false,updated_at=now();
--> statement-breakpoint
CREATE TABLE listing_onboarding (
 listing_id uuid PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
 operator_id uuid NOT NULL REFERENCES users(id),
 verified_claim_id uuid NOT NULL REFERENCES listing_claim_verifications(id),
 business_legal_name varchar(256),
 business_country varchar(2),
 business_address text,
 representative_name varchar(256),
 authority_accepted_at timestamptz,
 terms_version varchar(32),
 terms_accepted_at timestamptz,
 stripe_account_id varchar(128),
 provider_environment varchar(8),
 platform_account_id varchar(128),
 provider_country varchar(2),
 charges_enabled boolean NOT NULL DEFAULT false,
 payouts_enabled boolean NOT NULL DEFAULT false,
 details_submitted boolean NOT NULL DEFAULT false,
 card_payments_active boolean NOT NULL DEFAULT false,
 transfers_active boolean NOT NULL DEFAULT false,
 provider_checked_at timestamptz,
 provider_version integer NOT NULL DEFAULT 0,
 provider_revoked_at timestamptz,
 connect_attempt_id uuid NOT NULL DEFAULT gen_random_uuid(),
 activated_at timestamptz,
 suspended_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX listing_onboarding_stripe_account_idx ON listing_onboarding(stripe_account_id);
--> statement-breakpoint
CREATE FUNCTION vakaygo_listing_setup_valid(p_listing_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT coalesce((SELECT l.price_amount>0 AND l.price_currency ~ '^[A-Z]{3}$'
  AND l.price_unit IN ('night','person','group','hour','day','trip','vehicle','event','session','meal','entry','ticket')
  AND l.max_guests>0
  AND l.cancellation_policy IN ('flexible','moderate','strict','non_refundable')
  AND coalesce(l.min_stay,1)>0 AND coalesce(l.max_stay,366)>=coalesce(l.min_stay,1)
  AND coalesce(l.advance_notice,0)>=0
  AND EXISTS(SELECT 1 FROM availability a WHERE a.listing_id=l.id AND a.date>=current_date
    AND a.is_blocked=false AND a.spots>0 AND a.spots_remaining>0
    AND a.spots_remaining<=a.spots AND (a.price_override IS NULL OR a.price_override>0))
 FROM listings l WHERE l.id=p_listing_id),false)
$$;
--> statement-breakpoint
CREATE FUNCTION vakaygo_onboarding_complete(p_listing_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM listings l JOIN users u ON u.id=l.operator_id
 JOIN listing_onboarding n ON n.listing_id=l.id AND n.operator_id=l.operator_id
 JOIN listing_claim_verifications v ON v.id=n.verified_claim_id AND v.listing_id=l.id AND v.operator_id=l.operator_id
 JOIN listing_claims cl ON cl.id=v.claim_id AND cl.listing_id=l.id AND cl.operator_id=l.operator_id AND cl.status='approved'
 JOIN listing_trusted_contacts tc ON tc.listing_id=l.id AND tc.phone=v.target_phone
 JOIN booking_provider_config c ON c.id=true
 WHERE l.id=p_listing_id AND u.role IN ('operator','admin')
 AND v.status='verified' AND v.verified_at IS NOT NULL AND v.provider_approved_at IS NOT NULL AND v.provider_verification_id IS NOT NULL AND v.revoked_at IS NULL
 AND length(trim(n.business_legal_name))>=2 AND n.business_country ~ '^[A-Z]{2}$'
 AND length(trim(n.business_address))>=8 AND length(trim(n.representative_name))>=2
 AND n.authority_accepted_at IS NOT NULL AND n.terms_accepted_at IS NOT NULL
 AND n.terms_version='2026-09-06' AND n.suspended_at IS NULL
 AND n.provider_revoked_at IS NULL AND n.stripe_account_id ~ '^acct_[A-Za-z0-9]+$'
 AND n.provider_environment=c.environment AND n.platform_account_id=c.platform_account_id
 AND c.allowed_countries::jsonb ? n.business_country
 AND n.provider_country=n.business_country
 AND n.charges_enabled AND n.payouts_enabled AND n.details_submitted
 AND n.card_payments_active AND n.transfers_active
 AND n.provider_checked_at<=now() AND n.provider_checked_at>now()-interval '15 minutes'
 AND vakaygo_listing_setup_valid(l.id))
$$;
--> statement-breakpoint
CREATE FUNCTION vakaygo_listing_bookable(p_listing_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM listings l JOIN listing_onboarding n ON n.listing_id=l.id
 WHERE l.id=p_listing_id AND l.status='active' AND n.activated_at IS NOT NULL
 AND EXISTS(SELECT 1 FROM feature_flags WHERE key='booking_launch_enabled' AND enabled=true)
 AND vakaygo_onboarding_complete(l.id))
$$;
--> statement-breakpoint
CREATE FUNCTION vakaygo_begin_claim(p_listing uuid,p_operator uuid,p_service text,p_provider_account text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE l listings%ROWTYPE; t listing_trusted_contacts%ROWTYPE; v uuid; c uuid; claimant users%ROWTYPE;
BEGIN
 SELECT * INTO l FROM listings WHERE id=p_listing FOR UPDATE;
 SELECT * INTO claimant FROM users WHERE id=p_operator AND role IN ('operator','admin') FOR UPDATE;
 IF l.id IS NULL OR claimant.id IS NULL THEN RAISE EXCEPTION 'VG_ONBOARDING:Claim unavailable'; END IF;
 SELECT * INTO t FROM listing_trusted_contacts WHERE listing_id=p_listing;
 IF t.listing_id IS NULL OR l.operator_id<>t.original_operator_id
 OR NOT EXISTS(SELECT 1 FROM users WHERE id=l.operator_id AND lower(email)='unclaimed@vakaygo.com')
 THEN RAISE EXCEPTION 'VG_ONBOARDING:Automated verification is unavailable; support review required'; END IF;
 UPDATE listing_claim_verifications SET status='expired',updated_at=now()
 WHERE target_phone=t.phone AND status IN ('sending','pending') AND expires_at<=now();
 IF EXISTS(SELECT 1 FROM listing_claim_verifications WHERE target_phone=t.phone AND status IN ('sending','pending'))
 THEN RAISE EXCEPTION 'VG_ONBOARDING:A verification is already in progress; use its code or wait for expiry'; END IF;
 IF (SELECT count(*) FROM listing_claim_verifications WHERE (listing_id=p_listing OR operator_id=p_operator) AND created_at>now()-interval '1 hour')>=5
 THEN RAISE EXCEPTION 'VG_ONBOARDING:Verification limit reached; try again later'; END IF;
 INSERT INTO listing_claims(listing_id,operator_id,contact_name,contact_phone)
 VALUES(p_listing,p_operator,coalesce(nullif(claimant.name,''),'Business representative'),t.phone) RETURNING id INTO c;
 INSERT INTO listing_claim_verifications(listing_id,operator_id,claim_id,target_phone,service_sid,provider_account_id)
 VALUES(p_listing,p_operator,c,t.phone,p_service,p_provider_account) RETURNING id INTO v;
 RETURN v;
END $$;
--> statement-breakpoint
CREATE FUNCTION vakaygo_complete_claim(p_verification uuid,p_operator uuid,p_check_token uuid) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v listing_claim_verifications%ROWTYPE; l listings%ROWTYPE; t listing_trusted_contacts%ROWTYPE;
BEGIN
 SELECT * INTO v FROM listing_claim_verifications WHERE id=p_verification;
 SELECT * INTO l FROM listings WHERE id=v.listing_id FOR UPDATE;
 SELECT * INTO v FROM listing_claim_verifications WHERE id=p_verification FOR UPDATE;
 SELECT * INTO t FROM listing_trusted_contacts WHERE listing_id=v.listing_id;
 IF v.operator_id IS DISTINCT FROM p_operator OR v.status<>'pending' OR v.expires_at<=now()
 OR v.check_token IS DISTINCT FROM p_check_token OR v.check_locked_until<=now()
 OR v.provider_verification_id IS NULL OR v.provider_approved_at IS NULL OR l.operator_id IS DISTINCT FROM t.original_operator_id
 OR NOT EXISTS(SELECT 1 FROM users WHERE id=p_operator AND role IN ('operator','admin'))
 THEN RAISE EXCEPTION 'VG_ONBOARDING:Verification expired or ownership changed'; END IF;
 UPDATE listing_claim_verifications SET status='verified',verified_at=now(),updated_at=now(),check_token=NULL,check_locked_until=NULL WHERE id=v.id;
 UPDATE listing_claims SET status='approved',reviewed_at=now(),admin_notes='Automated verification of the trusted business contact',updated_at=now() WHERE id=v.claim_id AND status='pending';
 IF NOT FOUND THEN RAISE EXCEPTION 'VG_ONBOARDING:Claim is no longer pending'; END IF;
 UPDATE listings SET operator_id=p_operator,type_data=(coalesce(type_data::jsonb,'{}'::jsonb)||jsonb_build_object('unclaimed',false))::json,updated_at=now() WHERE id=l.id;
 INSERT INTO listing_onboarding(listing_id,operator_id,verified_claim_id) VALUES(l.id,p_operator,v.id);
 UPDATE listing_claims SET status='rejected',admin_notes='Another verified claim was completed',reviewed_at=now(),updated_at=now() WHERE listing_id=l.id AND id<>v.claim_id AND status='pending';
 RETURN v.claim_id;
END $$;

--> statement-breakpoint
CREATE FUNCTION vakaygo_activate_listing(p_listing uuid,p_operator uuid) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
 PERFORM 1 FROM booking_provider_config WHERE id=true FOR SHARE;
 PERFORM 1 FROM feature_flags WHERE key='booking_launch_enabled' FOR SHARE;
 PERFORM 1 FROM listings WHERE id=p_listing AND operator_id=p_operator AND status='active' FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM 1 FROM listing_onboarding WHERE listing_id=p_listing AND operator_id=p_operator FOR UPDATE;
 IF NOT FOUND OR NOT vakaygo_onboarding_complete(p_listing) THEN RETURN false; END IF;
 UPDATE listing_onboarding SET activated_at=now(),updated_at=now() WHERE listing_id=p_listing AND operator_id=p_operator;
 RETURN true;
END $$;

--> statement-breakpoint
CREATE FUNCTION vakaygo_reject_claim(p_claim uuid,p_admin uuid,p_notes text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE target uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM users WHERE id=p_admin AND role='admin') THEN RETURN false; END IF;
 SELECT listing_id INTO target FROM listing_claims WHERE id=p_claim;
 PERFORM 1 FROM listings WHERE id=target FOR UPDATE;
 UPDATE listing_claims SET status='rejected',reviewed_by=p_admin,reviewed_at=now(),admin_notes=p_notes,updated_at=now()
 WHERE id=p_claim AND status='pending';
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE listing_claim_verifications SET status='revoked',revoked_at=now(),check_token=NULL,check_locked_until=NULL,updated_at=now()
 WHERE claim_id=p_claim AND status IN ('sending','pending');
 RETURN true;
END $$;
