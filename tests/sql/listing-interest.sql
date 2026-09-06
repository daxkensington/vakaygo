BEGIN;
DO $$
DECLARE owner_id uuid:=gen_random_uuid(); customer uuid:=gen_random_uuid(); unverified uuid:=gen_random_uuid();
 admin_id uuid:=gen_random_uuid(); listing uuid:=gen_random_uuid(); other_listing uuid; island integer;
 denied boolean; bookings_before integer; outbox_before integer;
BEGIN
 INSERT INTO islands(slug,name,country,is_active) VALUES('interest-audit','Interest audit','Synthetic',true) RETURNING id INTO island;
 INSERT INTO users(id,email,role,email_verified) VALUES
 (owner_id,'interest-owner@audit.invalid','operator',true),(customer,'interest-customer@audit.invalid','traveler',true),
 (unverified,'interest-unverified@audit.invalid','traveler',false),(admin_id,'interest-admin@audit.invalid','admin',true);
 INSERT INTO listings(id,operator_id,island_id,type,status,title,slug,type_data)
 VALUES(listing,owner_id,island,'tour','active','Interest audit','interest-audit','{"unclaimed":false,"claimedAt":"2099-01-01"}');
 SELECT count(*) INTO bookings_before FROM bookings;
 SELECT count(*) INTO outbox_before FROM booking_mail_outbox;
 IF vakaygo_listing_claim_verified(listing) THEN RAISE EXCEPTION 'Editable fields established claim'; END IF;
 -- Independent database validation rejects unverified, stale and self-created demand.
 FOREACH other_listing IN ARRAY ARRAY[unverified,owner_id,admin_id] LOOP
  denied:=false;
  BEGIN PERFORM vakaygo_record_listing_interest(listing,other_listing,0,true);
  EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'VG_INTEREST:%' THEN denied:=true; ELSE RAISE; END IF; END;
  IF NOT denied THEN RAISE EXCEPTION 'Unverified, owner or administrator interest accepted'; END IF;
 END LOOP;
 denied:=false;
 BEGIN PERFORM vakaygo_record_listing_interest(listing,customer,99,true);
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='VG_INTEREST:SESSION' THEN denied:=true; ELSE RAISE; END IF; END;
 IF NOT denied THEN RAISE EXCEPTION 'Stale session accepted'; END IF;
 denied:=false;
 BEGIN PERFORM vakaygo_record_listing_interest(listing,customer,NULL,true);
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='VG_INTEREST:SESSION' THEN denied:=true; ELSE RAISE; END IF; END;
 IF NOT denied THEN RAISE EXCEPTION 'Null session accepted'; END IF;
 IF NOT vakaygo_record_listing_interest(listing,customer,0,true) THEN RAISE EXCEPTION 'Valid interest rejected'; END IF;
 PERFORM vakaygo_record_listing_interest(listing,customer,0,true);
 IF (SELECT count(*) FROM listing_interest WHERE listing_id=listing)<>1 OR
    (SELECT count(*) FROM business_outreach WHERE listing_id=listing)<>1 THEN RAISE EXCEPTION 'Replay duplicated demand/outreach'; END IF;
 UPDATE business_outreach SET status='do_not_contact',notes='Synthetic opt-out' WHERE listing_id=listing;
 PERFORM vakaygo_record_listing_interest(listing,customer,0,false);
 IF EXISTS(SELECT 1 FROM listing_interest WHERE listing_id=listing AND active) THEN RAISE EXCEPTION 'Withdrawal not honored'; END IF;
 PERFORM vakaygo_record_listing_interest(listing,customer,0,true);
 IF (SELECT status FROM business_outreach WHERE listing_id=listing)<>'do_not_contact' THEN RAISE EXCEPTION 'Interest reopened suppression'; END IF;
 -- Paused/inactive listings cannot accumulate fresh demand; withdrawals still work.
 UPDATE listings SET status='paused' WHERE id=listing;
 denied:=false;
 BEGIN PERFORM vakaygo_record_listing_interest(listing,customer,0,true);
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='VG_INTEREST:NOT_FOUND' THEN denied:=true; ELSE RAISE; END IF; END;
 IF NOT denied THEN RAISE EXCEPTION 'Paused listing accepted interest'; END IF;
 PERFORM vakaygo_record_listing_interest(listing,customer,0,false);
 UPDATE listings SET status='active' WHERE id=listing;
 UPDATE islands SET is_active=false WHERE id=island;
 denied:=false;
 BEGIN PERFORM vakaygo_record_listing_interest(listing,customer,0,true);
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='VG_INTEREST:NOT_FOUND' THEN denied:=true; ELSE RAISE; END IF; END;
 IF NOT denied THEN RAISE EXCEPTION 'Inactive destination accepted interest'; END IF;
 UPDATE islands SET is_active=true WHERE id=island;
 -- A single user cannot create an unbounded outreach queue, including withdrawals.
 FOR n IN 1..19 LOOP
  INSERT INTO listings(operator_id,island_id,type,status,title,slug) VALUES(owner_id,island,'tour','active','Interest limit','interest-limit-'||n) RETURNING id INTO other_listing;
  PERFORM vakaygo_record_listing_interest(other_listing,customer,0,true);
 END LOOP;
 INSERT INTO listings(operator_id,island_id,type,status,title,slug) VALUES(owner_id,island,'tour','active','Over limit','interest-over-limit') RETURNING id INTO other_listing;
 denied:=false;
 BEGIN PERFORM vakaygo_record_listing_interest(other_listing,customer,0,true);
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='VG_INTEREST:LIMIT' THEN denied:=true; ELSE RAISE; END IF; END;
 IF NOT denied THEN RAISE EXCEPTION 'Daily limit bypassed'; END IF;
 IF EXISTS(SELECT 1 FROM business_outreach WHERE listing_id=other_listing) THEN RAISE EXCEPTION 'Denied interest created outreach'; END IF;
 IF (SELECT count(*) FROM bookings)<>bookings_before OR
    (SELECT count(*) FROM booking_mail_outbox)<>outbox_before THEN RAISE EXCEPTION 'Interest created booking or email side effects'; END IF;
 DELETE FROM users WHERE id=customer;
 IF EXISTS(SELECT 1 FROM listing_interest WHERE user_id=customer) THEN RAISE EXCEPTION 'Account deletion retained interest identity'; END IF;
END $$;
SELECT 'PASS: verified interest, session/ownership checks, deduplication, withdrawal, suppression, daily limits, account deletion and no booking/email effects';
ROLLBACK;
