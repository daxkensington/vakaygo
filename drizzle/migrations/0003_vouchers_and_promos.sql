-- Add voucher and promo fields to bookings
ALTER TABLE "bookings" ADD COLUMN "verification_token" varchar(128);--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "checked_in" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "checked_in_at" timestamp;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "promo_code_id" uuid;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "discount_amount" numeric(10, 2) DEFAULT '0.00';--> statement-breakpoint

-- Promo codes table
CREATE TABLE "promo_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(32) NOT NULL UNIQUE,
	"description" text,
	"discount_type" varchar(16) NOT NULL,
	"discount_value" numeric(10, 2) NOT NULL,
	"currency" varchar(8) DEFAULT 'XCD',
	"min_order_amount" numeric(10, 2),
	"max_discount_amount" numeric(10, 2),
	"max_uses" integer,
	"current_uses" integer DEFAULT 0,
	"max_uses_per_user" integer DEFAULT 1,
	"valid_from" timestamp NOT NULL,
	"valid_until" timestamp NOT NULL,
	"applicable_types" json,
	"applicable_islands" json,
	"is_active" boolean DEFAULT true,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

-- Promo code uses table
CREATE TABLE "promo_code_uses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"promo_code_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"booking_id" uuid,
	"discount_applied" numeric(10, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

-- Indexes
CREATE INDEX "promo_codes_code_idx" ON "promo_codes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "promo_code_uses_promo_idx" ON "promo_code_uses" USING btree ("promo_code_id");--> statement-breakpoint
CREATE INDEX "promo_code_uses_user_idx" ON "promo_code_uses" USING btree ("user_id");--> statement-breakpoint

-- Foreign keys
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_code_uses" ADD CONSTRAINT "promo_code_uses_promo_code_id_promo_codes_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_code_uses" ADD CONSTRAINT "promo_code_uses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_code_uses" ADD CONSTRAINT "promo_code_uses_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;
