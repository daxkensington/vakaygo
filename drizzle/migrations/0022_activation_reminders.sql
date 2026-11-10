-- Operator activation follow-through. Additive: no booking, price, payout or listing row changes.
-- 1. Reminders: a revised agreement is its own stage ("agreement_update"), so a business that finished its
--    company details and accepted an earlier version is not silenced by reminders about a step it had done.
ALTER TABLE "operator_onboarding_nudges" DROP CONSTRAINT "operator_onboarding_nudges_stage_check";--> statement-breakpoint
ALTER TABLE "operator_onboarding_nudges" ADD CONSTRAINT "operator_onboarding_nudges_stage_check" CHECK (stage in ('business_details','agreement_update','listing_setup','payout_setup','payout_rejected','activate','admin_review'));--> statement-breakpoint
-- 2. The button in a reminder can sign the business in once (server/operator-setup-link.ts). NULL = not used.
ALTER TABLE "operator_onboarding_nudges" ADD COLUMN "signin_used_at" timestamp with time zone;--> statement-breakpoint
-- 3. The team is told when a booking is confirmed (paid), cancelled or refunded, not only when a request arrives.
--    Same function as 0004 with one more outbox recipient on status changes; the mail cron already renders 'team'.
CREATE OR REPLACE FUNCTION vakaygo_booking_events() RETURNS trigger LANGUAGE plpgsql AS $$
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
     INSERT INTO booking_mail_outbox(booking_id,kind,recipient) VALUES(NEW.id,event_kind,'traveler'),(NEW.id,event_kind,'operator'),(NEW.id,event_kind,'team') ON CONFLICT DO NOTHING;
   END IF;
 END IF;
 RETURN NEW;
END $$;
