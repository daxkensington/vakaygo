CREATE TABLE "operator_terms_acceptances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"operator_id" uuid NOT NULL,
	"terms_version" varchar(32) NOT NULL,
	"accepted_at" timestamp with time zone NOT NULL,
	"authority_accepted_at" timestamp with time zone,
	"business_legal_name" varchar(256),
	"business_country" varchar(2),
	"business_address" text,
	"representative_name" varchar(256),
	"record_origin" varchar(24) NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operator_terms_acceptances_origin_check" CHECK (record_origin in ('observed_existing','explicit_acceptance'))
);
--> statement-breakpoint
ALTER TABLE "operator_terms_acceptances" ADD CONSTRAINT "operator_terms_acceptances_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_terms_acceptances" ADD CONSTRAINT "operator_terms_acceptances_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "operator_terms_acceptances_receipt_idx" ON "operator_terms_acceptances" USING btree ("listing_id","operator_id","terms_version","accepted_at");
--> statement-breakpoint
-- Copy existing evidence exactly; this is not acceptance of the new revision.
INSERT INTO operator_terms_acceptances(listing_id,operator_id,terms_version,accepted_at,authority_accepted_at,
 business_legal_name,business_country,business_address,representative_name,record_origin)
SELECT listing_id,operator_id,terms_version,terms_accepted_at,authority_accepted_at,
 business_legal_name,business_country,business_address,representative_name,'observed_existing'
FROM listing_onboarding WHERE terms_version IS NOT NULL AND terms_accepted_at IS NOT NULL
ON CONFLICT DO NOTHING;
--> statement-breakpoint
CREATE FUNCTION vakaygo_record_operator_terms_acceptance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
   IF OLD.terms_version IS NOT NULL AND OLD.terms_accepted_at IS NOT NULL THEN
     INSERT INTO operator_terms_acceptances(listing_id,operator_id,terms_version,accepted_at,authority_accepted_at,
       business_legal_name,business_country,business_address,representative_name,record_origin)
     VALUES(OLD.listing_id,OLD.operator_id,OLD.terms_version,OLD.terms_accepted_at,OLD.authority_accepted_at,
       OLD.business_legal_name,OLD.business_country,OLD.business_address,OLD.representative_name,'observed_existing')
     ON CONFLICT DO NOTHING;
   END IF;
 END IF;
 IF NEW.terms_version IS NOT NULL AND NEW.terms_accepted_at IS NOT NULL THEN
   INSERT INTO operator_terms_acceptances(listing_id,operator_id,terms_version,accepted_at,authority_accepted_at,
     business_legal_name,business_country,business_address,representative_name,record_origin)
   VALUES(NEW.listing_id,NEW.operator_id,NEW.terms_version,NEW.terms_accepted_at,NEW.authority_accepted_at,
     NEW.business_legal_name,NEW.business_country,NEW.business_address,NEW.representative_name,'explicit_acceptance')
   ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER listing_onboarding_terms_receipt AFTER INSERT OR UPDATE ON listing_onboarding
 FOR EACH ROW EXECUTE FUNCTION vakaygo_record_operator_terms_acceptance();
--> statement-breakpoint
CREATE FUNCTION vakaygo_operator_terms_version() RETURNS text LANGUAGE sql STABLE AS $$
 SELECT '2026-10-27'::text
$$;
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
 AND n.terms_version=vakaygo_operator_terms_version() AND n.suspended_at IS NULL
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
-- Match the proof/profile lock ordering used by the booking trigger. Every
-- activation path uses this predicate; no administrative application fallback.
CREATE OR REPLACE FUNCTION vakaygo_activate_listing(p_listing uuid,p_operator uuid) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE proof uuid;
BEGIN
 PERFORM 1 FROM booking_provider_config WHERE id=true FOR SHARE;
 PERFORM 1 FROM feature_flags WHERE key='booking_launch_enabled' FOR SHARE;
 PERFORM 1 FROM listings WHERE id=p_listing AND operator_id=p_operator AND status='active' FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT verified_claim_id INTO proof FROM listing_onboarding
   WHERE listing_id=p_listing AND operator_id=p_operator FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM 1 FROM listing_claim_verifications WHERE id=proof FOR SHARE;
 PERFORM 1 FROM operator_payout_profiles WHERE listing_id=p_listing AND operator_id=p_operator FOR SHARE;
 IF NOT vakaygo_onboarding_complete(p_listing) THEN RETURN false; END IF;
 UPDATE listing_onboarding SET activated_at=now(),updated_at=now() WHERE listing_id=p_listing AND operator_id=p_operator;
 RETURN true;
END $$;
