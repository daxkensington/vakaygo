\set ON_ERROR_STOP on
INSERT INTO islands(id,slug,name,country,timezone) VALUES(900001,'audit-island','Audit island','Grenada','America/Grenada');
INSERT INTO users(id,email,role) VALUES('10000000-0000-4000-8000-000000000001','audit-operator@example.invalid','operator'),('10000000-0000-4000-8000-000000000002','audit-traveler@example.invalid','traveler');
INSERT INTO listings(id,operator_id,island_id,type,title,slug,status,price_amount,price_currency,price_unit,max_guests,cancellation_policy)
 VALUES('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',900001,'tour','Audit tour','audit-tour','active',65,'USD','person',2,'moderate');
INSERT INTO availability(listing_id,date,spots,is_blocked) VALUES('20000000-0000-4000-8000-000000000001','2099-12-01',2,true);
CREATE FUNCTION audit_book(n text, d date, guests integer DEFAULT 1) RETURNS void LANGUAGE sql AS $$
 INSERT INTO bookings(booking_number,traveler_id,operator_id,listing_id,start_date,guest_count,subtotal,service_fee,total_amount,currency,payment_method)
 VALUES(n,'10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',d,guests,65*guests,6.5*guests,71.5*guests,'USD','card');
$$;
DO $$ BEGIN
 BEGIN PERFORM audit_book('blocked','2099-12-01'); RAISE EXCEPTION 'Expected blocked rejection'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'VG_BOOKING:%blocked%' THEN RAISE; END IF; END;
 BEGIN PERFORM audit_book('zero','2099-12-02',0); RAISE EXCEPTION 'Expected guest rejection'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'VG_BOOKING:%guest%' THEN RAISE; END IF; END;
 PERFORM audit_book('hold','2099-12-02',2);
 BEGIN PERFORM audit_book('oversold','2099-12-02'); RAISE EXCEPTION 'Expected capacity rejection'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'VG_BOOKING:%availability%' THEN RAISE; END IF; END;
 IF (SELECT count(*) FROM booking_mail_outbox o JOIN bookings b ON b.id=o.booking_id WHERE b.booking_number='hold')<>2 THEN RAISE EXCEPTION 'Creation must atomically queue traveler and operator mail'; END IF;
 UPDATE listings SET cancellation_policy='strict' WHERE slug='audit-tour';
 IF (SELECT cancellation_policy_snapshot FROM bookings WHERE booking_number='hold')<>'moderate' THEN RAISE EXCEPTION 'Booking policy changed after listing edit'; END IF;
 UPDATE bookings SET status='cancelled' WHERE booking_number='hold';
 PERFORM audit_book('released','2099-12-02');
END $$;
-- One seat for the independent concurrent-reservation check.
INSERT INTO availability(listing_id,date,spots) VALUES('20000000-0000-4000-8000-000000000001','2099-12-03',1);

-- Requests do not reserve inventory, but accepting one must reserve it atomically.
INSERT INTO bookings(booking_number,traveler_id,operator_id,listing_id,status,start_date,guest_count,subtotal,total_amount)
 SELECT n,'10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','requested','2099-12-04',2,999,999
 FROM unnest(ARRAY['request-one','request-two']) n;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM bookings WHERE booking_number LIKE 'request-%' AND (total_amount<>0 OR payment_method<>'none')) THEN RAISE EXCEPTION 'Requests must not charge'; END IF;
 UPDATE bookings SET status='confirmed' WHERE booking_number='request-one';
 BEGIN UPDATE bookings SET status='confirmed' WHERE booking_number='request-two'; RAISE EXCEPTION 'Expected request confirmation capacity rejection'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'VG_BOOKING:%availability%' THEN RAISE; END IF; END;
END $$;
