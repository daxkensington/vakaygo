-- No existing booking or payment is grandfathered into new booking eligibility.
ALTER TABLE bookings ADD COLUMN checkout_stripe_account_id varchar(256);
--> statement-breakpoint
CREATE FUNCTION vakaygo_booking_dates_available(p_listing uuid,p_start timestamp,p_end timestamp,p_guests integer,p_booking uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT coalesce((SELECT p_guests>0 AND p_start IS NOT NULL
  AND (p_end IS NULL OR p_end>p_start) AND coalesce(p_end,p_start)-p_start<=interval '366 days'
  AND (l.type<>'stay' OR p_end IS NOT NULL)
  AND NOT EXISTS(
    SELECT 1 FROM generate_series(p_start::date,
      CASE WHEN l.type='stay' THEN p_end::date-1 ELSE coalesce(p_end,p_start)::date END,interval '1 day') day
    WHERE NOT EXISTS(SELECT 1 FROM availability a WHERE a.listing_id=l.id AND a.date::date=day::date AND a.is_blocked=false AND a.spots>0)
      OR EXISTS(SELECT 1 FROM availability a WHERE a.listing_id=l.id AND a.date::date=day::date AND a.is_blocked=true)
      OR (SELECT coalesce(sum(CASE WHEN l.type='stay' THEN 1 ELSE b.guest_count END),0) FROM bookings b
        WHERE b.listing_id=l.id AND (p_booking IS NULL OR b.id<>p_booking)
        AND b.status IN ('pending','confirmed','completed') AND b.start_date::date<=day::date
        AND CASE WHEN l.type='stay' THEN b.end_date::date>day::date ELSE coalesce(b.end_date,b.start_date)::date>=day::date END)
        + CASE WHEN l.type='stay' THEN 1 ELSE p_guests END
        > CASE WHEN l.type='stay' THEN 1 ELSE (SELECT min(a.spots) FROM availability a WHERE a.listing_id=l.id AND a.date::date=day::date) END
  ) FROM listings l WHERE l.id=p_listing),false)
$$;
--> statement-breakpoint
CREATE FUNCTION vakaygo_booking_onboarding_guard() RETURNS trigger LANGUAGE plpgsql AS $$
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
 -- Cancellations, refund reconciliation and fulfillment of historical bookings
 -- must remain available after eligibility is revoked or the launch is paused.
 IF NOT must_check THEN RETURN NEW; END IF;
 -- Lock the evidence in the same order as activation. Revocation/configuration
 -- changes cannot slip between this check and the booking/inventory/outbox write.
 PERFORM id FROM booking_provider_config WHERE id=true FOR SHARE;
 PERFORM key FROM feature_flags WHERE key='booking_launch_enabled' FOR SHARE;
 SELECT operator_id INTO current_operator FROM listings WHERE id=NEW.listing_id FOR UPDATE;
 SELECT stripe_account_id,verified_claim_id INTO current_account,verification_id
   FROM listing_onboarding WHERE listing_id=NEW.listing_id FOR SHARE;
 PERFORM id FROM listing_claim_verifications WHERE id=verification_id FOR SHARE;
 IF NEW.operator_id IS DISTINCT FROM current_operator OR NOT vakaygo_listing_bookable(NEW.listing_id) THEN
   RAISE EXCEPTION 'VG_BOOKING:This business is not accepting bookings on VakayGo yet';
 END IF;
 IF NOT vakaygo_booking_dates_available(NEW.listing_id,NEW.start_date,NEW.end_date,NEW.guest_count,NEW.id) THEN
   RAISE EXCEPTION 'VG_BOOKING:The business has not made these dates available';
 END IF;
 IF NEW.checkout_session_id IS NOT NULL AND
   (NEW.payment_mode IS DISTINCT FROM 'destination' OR NEW.checkout_stripe_account_id IS DISTINCT FROM current_account) THEN
   RAISE EXCEPTION 'VG_BOOKING:The business payment setup has changed';
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
-- PostgreSQL runs same-timing triggers alphabetically: this gate must precede
-- the existing inventory/promotion guard and all AFTER outbox triggers.
CREATE TRIGGER booking_00_onboarding_guard BEFORE INSERT OR UPDATE ON bookings
 FOR EACH ROW EXECUTE FUNCTION vakaygo_booking_onboarding_guard();
--> statement-breakpoint
-- Publishing/blocking dates serializes with the booking gate's listing lock.
CREATE FUNCTION vakaygo_availability_booking_lock() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
   PERFORM id FROM listings WHERE id=OLD.listing_id FOR UPDATE;
   RETURN OLD;
 ELSIF TG_OP='INSERT' THEN
   PERFORM id FROM listings WHERE id=NEW.listing_id FOR UPDATE;
 ELSE
   PERFORM id FROM listings WHERE id IN (OLD.listing_id,NEW.listing_id) ORDER BY id FOR UPDATE;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER availability_booking_lock BEFORE INSERT OR UPDATE OR DELETE ON availability
 FOR EACH ROW EXECUTE FUNCTION vakaygo_availability_booking_lock();
