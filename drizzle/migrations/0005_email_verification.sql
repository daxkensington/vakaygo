ALTER TABLE "users" ADD COLUMN "email_verification_token" varchar(128);
ALTER TABLE "users" ADD COLUMN "email_verification_expires" timestamp;
