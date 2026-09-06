BEGIN;
DO $$
DECLARE a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid(); r jsonb; u users%ROWTYPE;
BEGIN
 INSERT INTO users(id,email,name,role,email_verified,password_hash,totp_enabled,totp_secret,session_version,email_verification_token,email_verification_expires,magic_link_token,magic_link_expires)
 VALUES(a,'bootstrap-victim@audit.invalid','Synthetic owner','operator',false,'attacker-password',true,'attacker-totp',1,repeat('a',64),now()+interval '1 hour',repeat('b',64),now()+interval '1 hour');
 INSERT INTO push_subscriptions(user_id,endpoint,p256dh,auth) VALUES(a,'https://push.audit.invalid/preproof','synthetic','synthetic');
 IF vakaygo_set_push_subscription(a,1,'https://push.audit.invalid/denied','synthetic','synthetic') THEN RAISE EXCEPTION 'unverified push enrollment accepted'; END IF;
 IF vakaygo_consume_email_token(repeat('a',64),'magic') IS NOT NULL THEN RAISE EXCEPTION 'token purpose bypass'; END IF;
 IF vakaygo_consume_email_token(repeat('b',64),'magic','forbidden-password') IS NOT NULL THEN RAISE EXCEPTION 'magic password override accepted'; END IF;
 r := vakaygo_consume_email_token(repeat('a',64),'verification','owner-password');
 SELECT * INTO u FROM users WHERE id=a;
 IF r->>'id' <> a::text OR (r->>'sessionVersion')::int <> 2 OR (r->>'credentialsReset')::boolean <> true OR (r->>'requiresTwoFactor')::boolean <> false
   OR u.email_verified <> true OR u.password_hash <> 'owner-password' OR u.totp_enabled <> false OR u.totp_secret IS NOT NULL
   OR u.magic_link_token IS NOT NULL OR u.email_verification_token IS NOT NULL THEN RAISE EXCEPTION 'first confirmation failed reset/revocation'; END IF;
 IF vakaygo_consume_email_token(repeat('a',64),'verification','attacker-password') IS NOT NULL THEN RAISE EXCEPTION 'verification replay accepted'; END IF;
 IF vakaygo_consume_email_token(repeat('b',64),'magic') IS NOT NULL THEN RAISE EXCEPTION 'old alternate token survived proof'; END IF;
 IF EXISTS(SELECT 1 FROM push_subscriptions WHERE user_id=a) THEN RAISE EXCEPTION 'preproof push subscriber survived'; END IF;
 IF vakaygo_set_push_subscription(a,1,'https://push.audit.invalid/stale','synthetic','synthetic') THEN RAISE EXCEPTION 'stale push enrollment accepted'; END IF;
 IF NOT vakaygo_set_push_subscription(a,2,'https://push.audit.invalid/owner','synthetic','synthetic') THEN RAISE EXCEPTION 'verified push enrollment rejected'; END IF;
 -- Stale pre-proof writes use the old epoch and must affect no rows.
 UPDATE users SET totp_secret='stale-write',totp_enabled=true WHERE id=a AND session_version=1;
 IF FOUND THEN RAISE EXCEPTION 'stale enrollment CAS accepted'; END IF;
 UPDATE users SET totp_enabled=true,totp_secret='owner-totp',magic_link_token=repeat('c',64),magic_link_expires=now()+interval '1 hour',
   email_verification_token=repeat('d',64),email_verification_expires=now()+interval '1 hour' WHERE id=a;
 r := vakaygo_consume_email_token(repeat('c',64),'magic');
 SELECT * INTO u FROM users WHERE id=a;
 IF (r->>'requiresTwoFactor')::boolean <> true OR (r->>'credentialsReset')::boolean <> false
   OR u.password_hash <> 'owner-password' OR u.session_version <> 2 OR u.totp_secret <> 'owner-totp'
   OR u.email_verification_token <> repeat('d',64) THEN RAISE EXCEPTION 'verified return reset credentials or bypassed TOTP'; END IF;
 r := vakaygo_consume_email_token(repeat('d',64),'verification','replacement-not-allowed');
 SELECT * INTO u FROM users WHERE id=a;
 IF u.password_hash <> 'owner-password' OR u.session_version <> 2 OR u.totp_enabled <> true THEN RAISE EXCEPTION 'verified confirmation changed credential'; END IF;
 IF NOT EXISTS(SELECT 1 FROM push_subscriptions WHERE user_id=a AND endpoint='https://push.audit.invalid/owner') THEN RAISE EXCEPTION 'verified return removed owner push'; END IF;
 -- Google verified email first proof must discard preseeded credentials.
 INSERT INTO users(id,email,name,role,email_verified,password_hash,totp_enabled,totp_secret)
 VALUES(b,'google-bootstrap@audit.invalid','Synthetic Google','traveler',false,'attacker-password',true,'attacker-totp');
 r := vakaygo_establish_email_identity(b);
 SELECT * INTO u FROM users WHERE id=b;
 IF u.email_verified <> true OR u.password_hash IS NOT NULL OR u.totp_secret IS NOT NULL OR u.totp_enabled <> false OR u.session_version <> 1 THEN RAISE EXCEPTION 'Google first proof unsafe'; END IF;
 r := vakaygo_establish_email_identity(b);
 IF (r->>'sessionVersion')::int <> 1 OR (r->>'credentialsReset')::boolean <> false THEN RAISE EXCEPTION 'normal Google return revoked sessions'; END IF;
 -- Magic first proof has identical cleanup and validates expiry.
 INSERT INTO users(id,email,name,role,email_verified,password_hash,magic_link_token,magic_link_expires)
 VALUES(c,'magic-bootstrap@audit.invalid','Synthetic Magic','traveler',false,'attacker-password',repeat('e',64),now()-interval '1 minute');
 IF vakaygo_consume_email_token(repeat('e',64),'magic') IS NOT NULL THEN RAISE EXCEPTION 'expired token accepted'; END IF;
 UPDATE users SET magic_link_expires=now()+interval '1 hour' WHERE id=c;
 r := vakaygo_consume_email_token(repeat('e',64),'magic');
 SELECT * INTO u FROM users WHERE id=c;
 IF u.email_verified <> true OR u.password_hash IS NOT NULL OR u.session_version <> 1 THEN RAISE EXCEPTION 'magic first proof unsafe'; END IF;
 IF vakaygo_consume_email_token(repeat('e',64),'magic') IS NOT NULL THEN RAISE EXCEPTION 'magic replay accepted'; END IF;
END $$;
SELECT 'PASS: email proof purpose, expiry, replay, credential reset, epoch revocation, verified return/TOTP preservation, stale enrollment CAS' AS result;
ROLLBACK;
