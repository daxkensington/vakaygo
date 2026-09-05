-- Additive audit remediation. Apply to an isolated Neon branch before production.
ALTER TABLE bookings
 ADD COLUMN checkout_session_id varchar(256),
 ADD COLUMN checkout_expires_at timestamp,
 ADD COLUMN payment_mode varchar(32),
 ADD COLUMN operator_earnings_cents integer,
 ADD COLUMN cancellation_policy_snapshot varchar(32),
 ADD COLUMN cancellation_policy_version integer,
 ADD COLUMN cancellation_requested_at timestamp,
 ADD COLUMN cancellation_refund_cents integer,
 ADD COLUMN refund_id varchar(256);
--> statement-breakpoint
CREATE TABLE booking_mail_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 booking_id uuid NOT NULL CONSTRAINT booking_mail_outbox_booking_id_bookings_id_fk REFERENCES bookings(id),
 kind varchar(32) NOT NULL,
 recipient varchar(16) NOT NULL,
 attempts integer NOT NULL DEFAULT 0,
 available_at timestamp NOT NULL DEFAULT now(),
 locked_until timestamp,
 delivered_at timestamp,
 created_at timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX booking_mail_outbox_pending_idx ON booking_mail_outbox(available_at);
--> statement-breakpoint
CREATE UNIQUE INDEX booking_mail_outbox_booking_id_kind_recipient_key ON booking_mail_outbox(booking_id,kind,recipient);
--> statement-breakpoint
CREATE FUNCTION vakaygo_booking_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE l listings%ROWTYPE; p promo_codes%ROWTYPE; d date; used integer; capacity integer; expected numeric; quantity integer;
BEGIN
 SELECT * INTO l FROM listings WHERE id = NEW.listing_id FOR UPDATE;
 IF l.status <> 'active' OR l.operator_id = '197d8586-7fd3-4999-91de-a50ad7d70e23' OR coalesce((l.type_data->>'demo')::boolean, false) THEN
   RAISE EXCEPTION 'VG_BOOKING:This listing is unavailable';
 END IF;
 IF NEW.guest_count IS NULL OR NEW.guest_count < 1 OR NEW.guest_count > coalesce(l.max_guests, 1000) THEN
   RAISE EXCEPTION 'VG_BOOKING:Invalid guest count';
 END IF;
 IF NEW.start_date::date < (now() AT TIME ZONE coalesce((SELECT timezone FROM islands WHERE id=l.island_id),'America/Puerto_Rico'))::date THEN
   RAISE EXCEPTION 'VG_BOOKING:Choose a future date';
 END IF;
 IF l.type='stay' AND (NEW.end_date::date-NEW.start_date::date < coalesce(l.min_stay,1) OR NEW.end_date::date-NEW.start_date::date > coalesce(l.max_stay,366)) THEN
   RAISE EXCEPTION 'VG_BOOKING:Stay length is outside the listing limits';
 END IF;
 IF NEW.end_date <= NEW.start_date OR (l.type = 'stay' AND NEW.end_date IS NULL)
    OR coalesce(NEW.end_date, NEW.start_date) - NEW.start_date > interval '366 days' THEN
   RAISE EXCEPTION 'VG_BOOKING:Invalid booking dates';
 END IF;
 NEW.cancellation_policy_snapshot := CASE WHEN l.cancellation_policy IN ('flexible','moderate','strict','non_refundable') THEN l.cancellation_policy ELSE 'moderate' END;
 NEW.cancellation_policy_version := 1;
 -- Every occupied day is checked while holding the listing row lock. Pending
 -- card bookings hold capacity until payment or explicit expiry/cancellation.
 FOR d IN SELECT generate_series(NEW.start_date::date,
   CASE WHEN l.type = 'stay' THEN NEW.end_date::date - 1 ELSE coalesce(NEW.end_date, NEW.start_date)::date END, interval '1 day')::date LOOP
   IF EXISTS(SELECT 1 FROM availability a WHERE a.listing_id=l.id AND a.date::date=d AND a.is_blocked) THEN
     RAISE EXCEPTION 'VG_BOOKING:One or more selected dates are blocked';
   END IF;
   IF NEW.status <> 'requested' THEN
     SELECT CASE WHEN l.type='stay' THEN count(*) ELSE coalesce(sum(b.guest_count),0) END INTO used FROM bookings b
     WHERE b.listing_id=l.id AND b.status IN ('pending','confirmed','completed')
       AND b.start_date::date <= d
       AND CASE WHEN l.type='stay' THEN b.end_date::date > d ELSE coalesce(b.end_date,b.start_date)::date >= d END;
     SELECT min(a.spots) INTO capacity FROM availability a WHERE a.listing_id=l.id AND a.date::date=d;
     capacity := CASE WHEN l.type='stay' THEN 1 ELSE coalesce(capacity,l.max_guests,1) END;
     IF used + (CASE WHEN l.type='stay' THEN 1 ELSE NEW.guest_count END) > capacity THEN
       RAISE EXCEPTION 'VG_BOOKING:These dates no longer have enough availability';
     END IF;
   END IF;
 END LOOP;
 IF NEW.status = 'requested' THEN
   NEW.subtotal:=0; NEW.service_fee:=0; NEW.total_amount:=0; NEW.discount_amount:=0; NEW.promo_code_id:=NULL; NEW.payment_method:='none';
 ELSE
   IF coalesce(l.price_amount,0)<=0 OR coalesce((l.type_data->>'unclaimed')::boolean,false)
     OR EXISTS(SELECT 1 FROM users WHERE id=l.operator_id AND email ILIKE '%unclaimed%')
     OR EXISTS(SELECT 1 FROM pricing_rules WHERE listing_id=l.id AND is_active)
     OR EXISTS(SELECT 1 FROM availability WHERE listing_id=l.id AND price_override IS NOT NULL) THEN
     RAISE EXCEPTION 'VG_BOOKING:This listing requires a price request';
   END IF;
   quantity := CASE WHEN l.type='stay' THEN NEW.end_date::date-NEW.start_date::date ELSE NEW.guest_count END;
   IF l.price_unit IN ('trip','group') THEN quantity:=1; END IF;
   IF round(l.price_amount*quantity,2) <> NEW.subtotal OR upper(coalesce(l.price_currency,'USD')) <> upper(NEW.currency) THEN
     RAISE EXCEPTION 'VG_BOOKING:The price has changed. Please refresh and try again';
   END IF;
 END IF;
 IF NEW.promo_code_id IS NOT NULL THEN
   SELECT * INTO p FROM promo_codes WHERE id=NEW.promo_code_id FOR UPDATE;
   IF NOT FOUND OR NOT p.is_active OR now() NOT BETWEEN p.valid_from AND p.valid_until
      OR (p.max_uses IS NOT NULL AND coalesce(p.current_uses,0)>=p.max_uses)
      OR (p.max_uses_per_user IS NOT NULL AND (SELECT count(*) FROM promo_code_uses WHERE promo_code_id=p.id AND user_id=NEW.traveler_id)>=p.max_uses_per_user)
      OR (p.discount_type='fixed' AND upper(p.currency)<>upper(NEW.currency))
      OR coalesce(p.min_order_amount,0)>NEW.subtotal+NEW.service_fee
      OR (json_array_length(coalesce(p.applicable_types,'[]'::json))>0 AND NOT p.applicable_types::jsonb ? l.type::text)
      OR (json_array_length(coalesce(p.applicable_islands,'[]'::json))>0 AND NOT p.applicable_islands::jsonb @> to_jsonb(l.island_id)) THEN
     RAISE EXCEPTION 'VG_BOOKING:This promo code is no longer available';
   END IF;
   expected:=CASE WHEN p.discount_type='percentage' THEN round((NEW.subtotal+NEW.service_fee)*p.discount_value/100,2) ELSE p.discount_value END;
   expected:=least(expected,coalesce(p.max_discount_amount,expected),NEW.subtotal+NEW.service_fee);
   IF expected<>NEW.discount_amount THEN RAISE EXCEPTION 'VG_BOOKING:The promotion has changed. Please try again'; END IF;
   UPDATE promo_codes SET current_uses=coalesce(current_uses,0)+1 WHERE id=p.id;
 END IF;
 IF NEW.status='pending' AND NEW.total_amount<=0 THEN RAISE EXCEPTION 'VG_BOOKING:This promotion leaves no payable amount. Please contact support'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER booking_insert_guard BEFORE INSERT ON bookings FOR EACH ROW EXECUTE FUNCTION vakaygo_booking_guard();
--> statement-breakpoint
CREATE FUNCTION vakaygo_booking_events() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE event_kind text;
BEGIN
 IF TG_OP='INSERT' THEN
   IF NEW.promo_code_id IS NOT NULL THEN
     INSERT INTO promo_code_uses(promo_code_id,user_id,booking_id,discount_applied) VALUES(NEW.promo_code_id,NEW.traveler_id,NEW.id,NEW.discount_amount);
   END IF;
   event_kind := CASE WHEN NEW.status='requested' THEN 'requested' ELSE 'received' END;
   INSERT INTO booking_mail_outbox(booking_id,kind,recipient) VALUES(NEW.id,event_kind,'traveler'),(NEW.id,event_kind,'operator');
   IF NEW.status='requested' THEN INSERT INTO booking_mail_outbox(booking_id,kind,recipient) VALUES(NEW.id,event_kind,'team'); END IF;
 ELSE
   IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('confirmed','cancelled','refunded') THEN
     event_kind := CASE WHEN NEW.status='confirmed' AND NEW.payment_method='none' THEN 'request_confirmed' ELSE NEW.status::text END;
     INSERT INTO booking_mail_outbox(booking_id,kind,recipient) VALUES(NEW.id,event_kind,'traveler'),(NEW.id,event_kind,'operator') ON CONFLICT DO NOTHING;
   END IF;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER booking_events AFTER INSERT OR UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION vakaygo_booking_events();

--> statement-breakpoint
-- Known demonstration account: preserve data while removing bookable fixtures.
UPDATE listings SET status='paused' WHERE operator_id='197d8586-7fd3-4999-91de-a50ad7d70e23' AND status='active';
