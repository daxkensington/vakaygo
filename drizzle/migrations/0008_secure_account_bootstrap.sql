-- Durable JWT revocation and atomic first proof of email ownership.
ALTER TABLE users ADD COLUMN session_version integer NOT NULL DEFAULT 0;
ALTER TABLE users ADD CONSTRAINT users_session_version_nonnegative CHECK (session_version >= 0);
-- Existing unverified JWTs predate trustworthy email ownership.
UPDATE users SET session_version = 1 WHERE email_verified IS DISTINCT FROM true;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION vakaygo_establish_email_identity(p_user_id uuid, p_new_password_hash text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE u users%ROWTYPE; first_proof boolean;
BEGIN
  SELECT * INTO u FROM users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  first_proof := u.email_verified IS DISTINCT FROM true;
  IF first_proof THEN
    DELETE FROM push_subscriptions WHERE user_id=u.id;
    -- Nothing installed before email possession may survive as a credential.
    UPDATE users SET email_verified = true, password_hash = p_new_password_hash,
      totp_enabled = false, totp_secret = NULL, session_version = session_version + 1,
      email_verification_token = NULL, email_verification_expires = NULL,
      magic_link_token = NULL, magic_link_expires = NULL, updated_at = now()
      WHERE id = u.id RETURNING * INTO u;
  END IF;
  RETURN jsonb_build_object('id', u.id, 'email', u.email, 'name', u.name,
    'role', u.role, 'sessionVersion', u.session_version,
    'requiresTwoFactor', coalesce(u.totp_enabled, false), 'credentialsReset', first_proof);
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION vakaygo_consume_email_token(p_token text, p_kind text, p_new_password_hash text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE u users%ROWTYPE; result jsonb;
BEGIN
  IF p_token IS NULL OR length(p_token) <> 64 OR p_token !~ '^[a-f0-9]{64}$'
    OR p_kind NOT IN ('verification', 'magic') OR p_kind IS NULL THEN RETURN NULL; END IF;
  -- Password selection is purpose-bound to first-time email confirmation.
  IF p_kind <> 'verification' AND p_new_password_hash IS NOT NULL THEN RETURN NULL; END IF;
  IF p_kind = 'verification' THEN
    SELECT * INTO u FROM users WHERE email_verification_token = p_token
      AND email_verification_expires > now() FOR UPDATE;
  ELSE
    SELECT * INTO u FROM users WHERE magic_link_token = p_token
      AND magic_link_expires > now() FOR UPDATE;
  END IF;
  IF NOT FOUND THEN RETURN NULL; END IF;
  result := vakaygo_establish_email_identity(u.id, p_new_password_hash);
  -- Returning verified users retain credentials/epoch and consume this token only.
  IF p_kind = 'verification' THEN
    UPDATE users SET email_verification_token = NULL, email_verification_expires = NULL WHERE id = u.id;
  ELSE
    UPDATE users SET magic_link_token = NULL, magic_link_expires = NULL WHERE id = u.id;
  END IF;
  RETURN result;
END $$;

--> statement-breakpoint
-- Subscription enrollment serializes with first-email-proof cleanup on users.
CREATE OR REPLACE FUNCTION vakaygo_set_push_subscription(p_user_id uuid, p_session_version integer,
  p_endpoint text, p_p256dh text, p_auth text)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE u users%ROWTYPE;
BEGIN
  SELECT * INTO u FROM users WHERE id=p_user_id FOR UPDATE;
  IF NOT FOUND OR u.email_verified IS DISTINCT FROM true OR u.session_version <> p_session_version
    OR p_session_version IS NULL THEN RETURN false; END IF;
  DELETE FROM push_subscriptions WHERE user_id=u.id AND endpoint=p_endpoint;
  INSERT INTO push_subscriptions(user_id,endpoint,p256dh,auth) VALUES(u.id,p_endpoint,p_p256dh,p_auth);
  RETURN true;
END $$;
