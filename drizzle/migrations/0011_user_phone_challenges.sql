-- Personal phone verification is durable and separate from sign-in and listing claims.
CREATE TABLE user_phone_challenges (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 challenge_id uuid NOT NULL,
 phone varchar(20) NOT NULL,
 code_hash varchar(64),
 session_version integer NOT NULL,
 profile_phone_snapshot varchar(20),
 state varchar(16) NOT NULL,
 expires_at timestamptz NOT NULL,
 attempts integer NOT NULL DEFAULT 0,
 next_send_at timestamptz NOT NULL,
 send_window_started_at timestamptz NOT NULL,
 send_count integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT user_phone_challenges_state_check CHECK(state IN ('sending','pending','failed','consumed','locked','expired','invalidated')),
 CONSTRAINT user_phone_challenges_attempts_check CHECK(attempts BETWEEN 0 AND 5),
 CONSTRAINT user_phone_challenges_send_count_check CHECK(send_count BETWEEN 1 AND 5),
 CONSTRAINT user_phone_challenges_phone_check CHECK(phone ~ '^\+[1-9][0-9]{7,14}$')
);
