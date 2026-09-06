\set ON_ERROR_STOP on
BEGIN;
INSERT INTO islands(id,slug,name,country) VALUES(900006,'claim-fixture','Claim fixture','Canada');
INSERT INTO users(id,email,role,name) VALUES
 ('60000000-0000-4000-8000-000000000001','unclaimed@vakaygo.com','operator','Synthetic import placeholder'),
 ('60000000-0000-4000-8000-000000000002','claimant@example.invalid','operator','Synthetic claimant'),
 ('60000000-0000-4000-8000-000000000003','competing@example.invalid','operator','Synthetic competitor'),
 ('60000000-0000-4000-8000-000000000004','reviewer@example.invalid','admin','Synthetic reviewer');
INSERT INTO listings(id,operator_id,island_id,type,title,slug,status,price_amount,price_currency,price_unit,max_guests,type_data,cancellation_policy) VALUES
 ('61000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',900006,'tour','Trusted import','trusted-import','active',50,'USD','person',4,
 '{"unclaimed":true,"googlePlaceId":"ChIJ_SYNTHETIC_TRUSTED","phone":"+14735550123"}','moderate'),
 ('61000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000002',900006,'tour','Operator JSON forgery','forged-import','active',50,'USD','person',4,
 '{"unclaimed":true,"googlePlaceId":"ChIJ_SYNTHETIC_FORGED","phone":"+14735550999"}','moderate'),
 ('61000000-0000-4000-8000-000000000003','60000000-0000-4000-8000-000000000001',900006,'tour','Untrusted source','untrusted-source','active',50,'USD','person',4,
 '{"unclaimed":true,"source":"self-reported","phone":"+14735550888"}','moderate');
-- The runner inserts the exact contact snapshot statement from migration0006 here.
-- MIGRATION_CONTACT_SNAPSHOT
DO $$
DECLARE target uuid:='61000000-0000-4000-8000-000000000001'; actor uuid:='60000000-0000-4000-8000-000000000002';
 verification uuid; claim uuid; lease uuid:=gen_random_uuid(); target_phone text; changed integer;
BEGIN
 IF (SELECT enabled FROM feature_flags WHERE key='booking_launch_enabled') THEN RAISE EXCEPTION 'Migration must default launch off'; END IF;
 IF EXISTS(SELECT 1 FROM booking_provider_config WHERE environment IS NOT NULL OR platform_account_id IS NOT NULL) THEN RAISE EXCEPTION 'Provider defaults must be unconfigured'; END IF;
 IF (SELECT count(*) FROM listing_trusted_contacts)<>1 THEN RAISE EXCEPTION 'Only independently sourced placeholder-owned import may be snapshotted'; END IF;
 IF vakaygo_listing_bookable(target) THEN RAISE EXCEPTION 'Imported active listing must be closed'; END IF;
 UPDATE listings SET type_data='{"unclaimed":false,"phone":"+14735550999","claimedAt":"forged","claimId":"forged"}' WHERE id=target;
 verification:=vakaygo_begin_claim(target,actor,'VA_synthetic','AC_synthetic');
 SELECT v.target_phone,v.claim_id INTO target_phone,claim FROM listing_claim_verifications v WHERE v.id=verification;
 IF target_phone<>'+14735550123' THEN RAISE EXCEPTION 'Editable listing phone replaced trusted contact'; END IF;
 BEGIN
  PERFORM vakaygo_begin_claim(target,'60000000-0000-4000-8000-000000000003','VA_synthetic','AC_synthetic');
  RAISE EXCEPTION 'Expected competing challenge rejection';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'VG_ONBOARDING:%already in progress%' THEN RAISE; END IF; END;
 UPDATE listing_claim_verifications SET status='pending',provider_verification_id='VE_synthetic',
  check_token=lease,check_locked_until=now()+interval '2 minutes' WHERE id=verification;
 BEGIN
  PERFORM vakaygo_complete_claim(verification,actor,lease);
  RAISE EXCEPTION 'Expected rejection without actual provider approval';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'VG_ONBOARDING:%' THEN RAISE; END IF; END;
 IF (SELECT operator_id FROM listings WHERE id=target)=actor THEN RAISE EXCEPTION 'Unverified claim transferred ownership'; END IF;
 UPDATE listing_claim_verifications SET provider_approved_at=now() WHERE id=verification;
 PERFORM vakaygo_complete_claim(verification,actor,lease);
 IF (SELECT operator_id FROM listings WHERE id=target)<>actor
  OR NOT EXISTS(SELECT 1 FROM listing_claims WHERE id=claim AND status='approved')
  OR NOT EXISTS(SELECT 1 FROM listing_onboarding WHERE listing_id=target AND operator_id=actor AND verified_claim_id=verification)
 THEN RAISE EXCEPTION 'Verified claim must transfer ownership and create onboarding atomically'; END IF;
 IF vakaygo_listing_bookable(target) THEN RAISE EXCEPTION 'Claim alone must not enable bookings'; END IF;
 BEGIN
  PERFORM vakaygo_complete_claim(verification,actor,lease);
  RAISE EXCEPTION 'Expected consumed challenge rejection';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'VG_ONBOARDING:%' THEN RAISE; END IF; END;
 UPDATE booking_provider_config SET environment='test',platform_account_id='acct_synthetic',allowed_countries='["CA"]';
 INSERT INTO availability(listing_id,date,spots,spots_remaining,is_blocked) VALUES(target,'2099-01-01',4,4,false);
 UPDATE listing_onboarding SET business_legal_name='Synthetic company',business_country='CA',business_address='123 Synthetic Road',
  representative_name='Synthetic representative',authority_accepted_at=now(),terms_version='2026-09-06',terms_accepted_at=now(),
  stripe_account_id='acct_syntheticoperator',provider_environment='test',platform_account_id='acct_synthetic',provider_country='CA',
  charges_enabled=true,payouts_enabled=true,details_submitted=true,card_payments_active=true,transfers_active=true,provider_checked_at=now()
 WHERE listing_id=target;
 IF NOT vakaygo_onboarding_complete(target) THEN RAISE EXCEPTION 'Valid synthetic onboarding must pass setup predicate'; END IF;
 IF vakaygo_listing_bookable(target) THEN RAISE EXCEPTION 'Completed onboarding still needs explicit activation and launch'; END IF;
 IF NOT vakaygo_activate_listing(target,actor) THEN RAISE EXCEPTION 'Complete setup should activate while global offer remains closed'; END IF;
 IF vakaygo_listing_bookable(target) THEN RAISE EXCEPTION 'Global launch flag still blocks activated business'; END IF;
 UPDATE feature_flags SET enabled=true WHERE key='booking_launch_enabled';
 IF NOT vakaygo_listing_bookable(target) THEN RAISE EXCEPTION 'Complete activated launched fixture should be eligible'; END IF;
 UPDATE listing_onboarding SET provider_checked_at=now()-interval '16 minutes' WHERE listing_id=target;
 IF vakaygo_listing_bookable(target) THEN RAISE EXCEPTION 'Expired provider readiness must close'; END IF;
 UPDATE listing_onboarding SET provider_checked_at=now(),provider_version=provider_version+1 WHERE listing_id=target;
 UPDATE listing_onboarding SET charges_enabled=true WHERE listing_id=target AND provider_version=0;
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>0 THEN RAISE EXCEPTION 'Stale provider version must lose compare-and-set'; END IF;
 UPDATE listing_onboarding SET provider_revoked_at=now() WHERE listing_id=target;
 IF vakaygo_listing_bookable(target) THEN RAISE EXCEPTION 'Provider deauthorization must close'; END IF;
 UPDATE listing_onboarding SET provider_revoked_at=NULL WHERE listing_id=target;
 UPDATE listings SET operator_id='60000000-0000-4000-8000-000000000003' WHERE id=target;
 IF vakaygo_listing_bookable(target) THEN RAISE EXCEPTION 'Ownership changes must invalidate prior onboarding'; END IF;
 UPDATE listings SET operator_id=actor WHERE id=target;
 UPDATE listing_claims SET status='rejected' WHERE id=claim;
 IF vakaygo_listing_bookable(target) THEN RAISE EXCEPTION 'Rejected claim cannot retain readiness'; END IF;
 UPDATE listing_claims SET status='approved' WHERE id=claim;
 UPDATE listing_claim_verifications SET provider_approved_at=NULL WHERE id=verification;
 IF vakaygo_listing_bookable(target) THEN RAISE EXCEPTION 'Missing provider proof cannot retain readiness'; END IF;
END $$;
ROLLBACK;
