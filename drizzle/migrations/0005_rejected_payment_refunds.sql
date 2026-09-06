CREATE TABLE "rejected_payment_refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"checkout_session_id" varchar(256) NOT NULL,
	"payment_id" varchar(256) NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" varchar(8) NOT NULL,
	"refund_id" varchar(256),
	"refund_status" varchar(32),
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"next_attempt_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rejected_payment_refunds_checkout_session_id_unique" UNIQUE("checkout_session_id"),
	CONSTRAINT "rejected_payment_refunds_payment_id_unique" UNIQUE("payment_id"),
	CONSTRAINT "rejected_payment_refunds_refund_id_unique" UNIQUE("refund_id"),
	CONSTRAINT "rejected_refunds_positive_amount" CHECK ("rejected_payment_refunds"."amount_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "rejected_payment_refunds" ADD CONSTRAINT "rejected_payment_refunds_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rejected_refunds_pending_idx" ON "rejected_payment_refunds" USING btree ("refund_status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "rejected_refunds_booking_idx" ON "rejected_payment_refunds" USING btree ("booking_id");
--> statement-breakpoint
-- Refund failures need a distinct durable event, including partial refunds
-- whose booking status remains cancelled and failures after a success email.
CREATE FUNCTION vakaygo_booking_refund_failure_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO booking_mail_outbox(booking_id,kind,recipient)
 VALUES(NEW.id,'refund_failed','traveler'),(NEW.id,'refund_failed','operator'),(NEW.id,'refund_failed','team')
 ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER booking_refund_failure_event AFTER UPDATE OF refund_status ON bookings
 FOR EACH ROW WHEN (
   OLD.refund_status IS DISTINCT FROM NEW.refund_status
   AND NEW.refund_status IN ('failed','canceled')
   AND NEW.cancellation_requested_at IS NOT NULL
   AND NEW.cancellation_refund_cents > 0
   AND NEW.payment_id IS NOT NULL
   AND NEW.refund_id IS NOT NULL
 ) EXECUTE FUNCTION vakaygo_booking_refund_failure_event();
