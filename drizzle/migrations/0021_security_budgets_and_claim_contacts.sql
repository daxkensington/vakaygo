CREATE TABLE "usage_budget_counters" (
	"day" date NOT NULL,
	"feature" varchar(32) NOT NULL,
	"bucket" varchar(80) NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL,
	"units" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_budget_counters_day_feature_bucket_pk" PRIMARY KEY("day","feature","bucket")
);
--> statement-breakpoint
CREATE INDEX "listing_trusted_contacts_phone_idx" ON "listing_trusted_contacts" USING btree ("phone");--> statement-breakpoint
-- A trusted phone recorded for more than one listing cannot show who runs one of them
-- (resort outlets on the resort's switchboard, operators filed under an aggregator's
-- number): whoever answers it could claim every listing on it. Those claims go to team
-- review. The app applies the same rule before it calls this function
-- (lib/claim-contact-policy.ts); this is the database's own check. Otherwise unchanged
-- from 0006.
CREATE OR REPLACE FUNCTION vakaygo_begin_claim(p_listing uuid,p_operator uuid,p_service text,p_provider_account text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE l listings%ROWTYPE; t listing_trusted_contacts%ROWTYPE; v uuid; c uuid; claimant users%ROWTYPE;
BEGIN
 SELECT * INTO l FROM listings WHERE id=p_listing FOR UPDATE;
 SELECT * INTO claimant FROM users WHERE id=p_operator AND role IN ('operator','admin') FOR UPDATE;
 IF l.id IS NULL OR claimant.id IS NULL THEN RAISE EXCEPTION 'VG_ONBOARDING:Claim unavailable'; END IF;
 SELECT * INTO t FROM listing_trusted_contacts WHERE listing_id=p_listing;
 IF t.listing_id IS NULL OR l.operator_id<>t.original_operator_id
 OR NOT EXISTS(SELECT 1 FROM users WHERE id=l.operator_id AND lower(email)='unclaimed@vakaygo.com')
 THEN RAISE EXCEPTION 'VG_ONBOARDING:Automated verification is unavailable; support review required'; END IF;
 IF EXISTS(SELECT 1 FROM listing_trusted_contacts o WHERE o.phone=t.phone AND o.listing_id<>p_listing)
 THEN RAISE EXCEPTION 'VG_ONBOARDING:This business shares its phone number with other listings; request a team review'; END IF;
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
