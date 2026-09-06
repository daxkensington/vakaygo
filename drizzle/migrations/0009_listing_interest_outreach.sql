-- Directory demand is separate from booking_requests, inventory and payments.
CREATE FUNCTION vakaygo_listing_claim_verified(p_listing uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM listings l
 JOIN users u ON u.id=l.operator_id AND u.role IN ('operator','admin') AND u.email_verified=true
 JOIN listing_onboarding n ON n.listing_id=l.id AND n.operator_id=l.operator_id
 JOIN listing_claim_verifications v ON v.id=n.verified_claim_id AND v.listing_id=l.id AND v.operator_id=l.operator_id
 JOIN listing_claims cl ON cl.id=v.claim_id AND cl.listing_id=l.id AND cl.operator_id=l.operator_id AND cl.status='approved'
 JOIN listing_trusted_contacts tc ON tc.listing_id=l.id AND tc.phone=v.target_phone
 WHERE l.id=p_listing AND v.status='verified' AND v.verified_at IS NOT NULL
 AND v.provider_approved_at IS NOT NULL AND v.provider_verification_id IS NOT NULL AND v.revoked_at IS NULL)
$$;
--> statement-breakpoint
CREATE TABLE listing_interest (
 listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 active boolean NOT NULL DEFAULT true,
 notice_version varchar(32) NOT NULL DEFAULT '2026-09-06',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(listing_id,user_id)
);
--> statement-breakpoint
CREATE INDEX listing_interest_user_updated_idx ON listing_interest(user_id,updated_at);
--> statement-breakpoint
CREATE INDEX listing_interest_active_listing_idx ON listing_interest(listing_id) WHERE active=true;
--> statement-breakpoint
CREATE TABLE business_outreach (
 listing_id uuid PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
 status varchar(24) NOT NULL DEFAULT 'new' CHECK(status IN ('new','reviewing','contacted','do_not_contact')),
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=4000),
 updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
 contacted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE FUNCTION vakaygo_record_listing_interest(p_listing uuid,p_user uuid,p_session integer,p_active boolean)
 RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE u users%ROWTYPE; l listings%ROWTYPE; existing listing_interest%ROWTYPE;
BEGIN
 -- Same lock order as ownership verification. User lock serializes daily limits
 -- across different listings and rechecks the session after any lock wait.
 SELECT * INTO l FROM listings WHERE id=p_listing FOR SHARE;
 SELECT * INTO u FROM users WHERE id=p_user FOR UPDATE;
 IF u.id IS NULL OR p_session IS NULL OR u.session_version<>p_session THEN RAISE EXCEPTION 'VG_INTEREST:SESSION'; END IF;
 IF p_active IS NULL THEN RAISE EXCEPTION 'VG_INTEREST:INPUT'; END IF;
 -- Withdrawal remains possible even if the listing is paused or email changes.
 IF NOT p_active THEN
   UPDATE listing_interest SET active=false,updated_at=now() WHERE listing_id=p_listing AND user_id=p_user AND active=true;
   RETURN false;
 END IF;
 IF u.email_verified IS DISTINCT FROM true THEN RAISE EXCEPTION 'VG_INTEREST:VERIFY_EMAIL'; END IF;
 IF l.id IS NULL OR l.status<>'active' OR NOT EXISTS(SELECT 1 FROM islands WHERE id=l.island_id AND is_active=true)
   OR l.operator_id='197d8586-7fd3-4999-91de-a50ad7d70e23'
 THEN RAISE EXCEPTION 'VG_INTEREST:NOT_FOUND'; END IF;
 IF l.operator_id=p_user OR u.role='admin' THEN RAISE EXCEPTION 'VG_INTEREST:OWN_LISTING'; END IF;
 SELECT * INTO existing FROM listing_interest WHERE listing_id=p_listing AND user_id=p_user;
 IF existing.active=true THEN RETURN true; END IF;
 IF (SELECT count(*) FROM listing_interest WHERE user_id=p_user AND updated_at>now()-interval '24 hours')>=20
 THEN RAISE EXCEPTION 'VG_INTEREST:LIMIT'; END IF;
 INSERT INTO listing_interest(listing_id,user_id) VALUES(p_listing,p_user)
 ON CONFLICT(listing_id,user_id) DO UPDATE SET active=true,notice_version='2026-09-06',updated_at=now();
 -- Repeat interest never reopens a contacted or suppressed business.
 INSERT INTO business_outreach(listing_id) VALUES(p_listing) ON CONFLICT DO NOTHING;
 RETURN true;
END $$;
