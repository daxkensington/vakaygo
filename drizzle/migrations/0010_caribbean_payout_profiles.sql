-- Track 2 Caribbean & international multi-rail payout profiles (PayPal, Wise, SWIFT/Local Bank Wire + W-8BEN foreign status certification).
CREATE TABLE IF NOT EXISTS operator_payout_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL UNIQUE REFERENCES listings(id) ON DELETE CASCADE,
  operator_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payout_method varchar(24) NOT NULL CHECK (payout_method IN ('paypal','wise','bank_wire')),
  payout_currency varchar(8) NOT NULL DEFAULT 'USD' CHECK (payout_currency IN ('USD','XCD','BBD','JMD','KYD','TTD','DOP','BSD','AWG','ANG','EUR')),
  paypal_email varchar(320),
  wise_recipient_email varchar(320),
  wise_account_id varchar(128),
  bank_name varchar(256),
  bank_country varchar(2),
  bank_account_holder varchar(256),
  bank_account_number varchar(128),
  bank_swift_bic varchar(32),
  bank_routing_or_branch varchar(128),
  intermediary_bank_swift varchar(32),
  minimum_payout_usd numeric(10,2) NOT NULL DEFAULT 50.00 CHECK (minimum_payout_usd >= 10.00 AND minimum_payout_usd <= 10000.00),
  w8ben_certified boolean NOT NULL DEFAULT false,
  w8ben_beneficial_owner varchar(256),
  w8ben_country varchar(2),
  w8ben_tax_id varchar(128),
  w8ben_signed_name varchar(256),
  w8ben_signed_at timestamptz,
  status varchar(24) NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review','verified','rejected')),
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  revoked_at timestamptz,
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS operator_payout_profiles_operator_idx ON operator_payout_profiles(operator_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS operator_payout_profiles_status_idx ON operator_payout_profiles(status);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION vakaygo_onboarding_complete(p_listing_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
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
 AND n.provider_revoked_at IS NULL
 AND (
   (
     n.stripe_account_id ~ '^acct_[A-Za-z0-9]+$'
     AND n.provider_environment=c.environment AND n.platform_account_id=c.platform_account_id
     AND c.allowed_countries::jsonb ? n.business_country
     AND n.provider_country=n.business_country
     AND n.charges_enabled AND n.payouts_enabled AND n.details_submitted
     AND n.card_payments_active AND n.transfers_active
     AND n.provider_checked_at<=now() AND n.provider_checked_at>now()-interval '15 minutes'
   )
   OR (
     n.stripe_account_id IS NULL
     AND c.platform_account_id ~ '^acct_[A-Za-z0-9]+$'
     AND c.environment IN ('test','live')
     AND EXISTS(
       SELECT 1 FROM operator_payout_profiles p
       WHERE p.listing_id=l.id AND p.operator_id=l.operator_id
         AND p.status='verified' AND p.revoked_at IS NULL
         AND p.w8ben_certified=true AND p.w8ben_signed_at IS NOT NULL
     )
   )
 )
 AND vakaygo_listing_setup_valid(l.id))
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION vakaygo_booking_onboarding_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE must_check boolean; current_operator uuid; current_account text; verification_id uuid;
BEGIN
 IF TG_OP='INSERT' THEN
   must_check := true;
 ELSE
   IF NEW.listing_id IS DISTINCT FROM OLD.listing_id OR NEW.operator_id IS DISTINCT FROM OLD.operator_id THEN
     RAISE EXCEPTION 'VG_BOOKING:A booking cannot be transferred to another business';
   END IF;
   must_check := (NEW.status='confirmed' AND OLD.status IS DISTINCT FROM NEW.status)
     OR (NEW.checkout_session_id IS NOT NULL AND NEW.checkout_session_id IS DISTINCT FROM OLD.checkout_session_id)
     OR (NEW.checkout_stripe_account_id IS DISTINCT FROM OLD.checkout_stripe_account_id)
     OR (NEW.payment_mode IS DISTINCT FROM OLD.payment_mode)
     OR (NEW.paid_at IS NOT NULL AND OLD.paid_at IS NULL)
     OR (NEW.payment_id IS NOT NULL AND NEW.payment_id IS DISTINCT FROM OLD.payment_id)
     OR (NEW.recovery_email_sent_at IS NOT NULL AND OLD.recovery_email_sent_at IS NULL);
 END IF;
 IF NOT must_check THEN RETURN NEW; END IF;
 PERFORM id FROM booking_provider_config WHERE id=true FOR SHARE;
 PERFORM key FROM feature_flags WHERE key='booking_launch_enabled' FOR SHARE;
 SELECT operator_id INTO current_operator FROM listings WHERE id=NEW.listing_id FOR UPDATE;
 SELECT stripe_account_id,verified_claim_id INTO current_account,verification_id
   FROM listing_onboarding WHERE listing_id=NEW.listing_id FOR SHARE;
 PERFORM id FROM listing_claim_verifications WHERE id=verification_id FOR SHARE;
 PERFORM id FROM operator_payout_profiles WHERE listing_id=NEW.listing_id FOR SHARE;
 IF NEW.operator_id IS DISTINCT FROM current_operator OR NOT vakaygo_listing_bookable(NEW.listing_id) THEN
   RAISE EXCEPTION 'VG_BOOKING:This business is not accepting bookings on VakayGo yet';
 END IF;
 IF NOT vakaygo_booking_dates_available(NEW.listing_id,NEW.start_date,NEW.end_date,NEW.guest_count,NEW.id) THEN
   RAISE EXCEPTION 'VG_BOOKING:The business has not made these dates available';
 END IF;
 IF NEW.checkout_session_id IS NOT NULL THEN
   IF current_account IS NOT NULL THEN
     IF NEW.payment_mode IS DISTINCT FROM 'destination' OR NEW.checkout_stripe_account_id IS DISTINCT FROM current_account THEN
       RAISE EXCEPTION 'VG_BOOKING:The business payment setup has changed';
     END IF;
   ELSE
     IF NEW.payment_mode IS DISTINCT FROM 'platform'
       OR NEW.checkout_stripe_account_id IS DISTINCT FROM (SELECT platform_account_id FROM booking_provider_config WHERE id=true)
       OR NOT EXISTS(
         SELECT 1 FROM operator_payout_profiles p
         WHERE p.listing_id=NEW.listing_id AND p.operator_id=current_operator
           AND p.status='verified' AND p.revoked_at IS NULL AND p.w8ben_certified=true
       ) THEN
       RAISE EXCEPTION 'VG_BOOKING:The business payment setup has changed';
     END IF;
   END IF;
 END IF;
 RETURN NEW;
END $$;
