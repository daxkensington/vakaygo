#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL must point to the isolated vakaygo_test fixture}"
identity=$(psql "$DATABASE_URL" -XAt -v ON_ERROR_STOP=1 -c "SELECT current_database()||':'||current_user")
[[ "$identity" == "vakaygo_test:audit" ]] || { echo "Refusing a non-fixture database" >&2; exit 1; }
tmpdir=$(mktemp -d /tmp/vakaygo-outreach-race.XXXXXX)
cleanup_ready=0
cleanup() {
  local original_status=$?
  trap - EXIT
  if [[ "$cleanup_ready" == 1 ]]; then
    if ! psql "$DATABASE_URL" -Xq -v ON_ERROR_STOP=1 --set=control="$(cat "$tmpdir/control.json")" <<'SQL'
BEGIN;
CREATE TEMP TABLE restored_outreach_control AS SELECT * FROM json_populate_record(NULL::outreach_campaign_control, :'control'::json);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM outreach_campaign_control c JOIN restored_outreach_control b USING(id)
   WHERE c.provider='resend' AND c.enabled AND c.stage=0 AND c.version=b.version AND c.health_reason='synthetic_reservation_race') THEN
  RAISE EXCEPTION 'Foreign control drift: preserve fixture and reconcile rather than overwrite';
 END IF;
END $$;
DELETE FROM outreach_email_attempts WHERE listing_id IN('7a200000-0000-4000-8000-000000000001','7a200000-0000-4000-8000-000000000002')
 OR id IN(SELECT ('7a300000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid FROM generate_series(1,17)n);
DELETE FROM outreach_recipient_consents WHERE listing_id IN('7a200000-0000-4000-8000-000000000001','7a200000-0000-4000-8000-000000000002');
DELETE FROM listings WHERE id IN('7a200000-0000-4000-8000-000000000001','7a200000-0000-4000-8000-000000000002');
DELETE FROM users WHERE id='7a100000-0000-4000-8000-000000000001';
DELETE FROM islands WHERE slug='outreach-reservation-race-audit';
UPDATE outreach_campaign_control c SET enabled=b.enabled,provider=b.provider,stage=b.stage,stage_started_at=b.stage_started_at,
 version=b.version,updated_by=b.updated_by,updated_at=b.updated_at,pause_reason=b.pause_reason,
 health_checked_at=b.health_checked_at,health_ready=b.health_ready,health_reason=b.health_reason
 FROM restored_outreach_control b WHERE c.id=b.id;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM outreach_campaign_control c JOIN restored_outreach_control b USING(id) WHERE to_jsonb(c)<>to_jsonb(b)) THEN
  RAISE EXCEPTION 'Control restoration did not preserve the original row';
 END IF;
END $$;
COMMIT;
SQL
    then
      echo "Concurrency fixture cleanup failed; do not replay before inspection" >&2
      original_status=1
    fi
  fi
  rm -f "$tmpdir/control.json" "$tmpdir/empty-a.log" "$tmpdir/empty-b.log" "$tmpdir/quota-a.log" "$tmpdir/quota-b.log"
  rmdir "$tmpdir"
  exit "$original_status"
}
trap cleanup EXIT
psql "$DATABASE_URL" -XAt -v ON_ERROR_STOP=1 -c "SELECT row_to_json(c) FROM outreach_campaign_control c WHERE id=true" > "$tmpdir/control.json"
psql "$DATABASE_URL" -Xq -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM outreach_email_attempts WHERE campaign_key='listing-claims-v2') OR
    NOT EXISTS(SELECT 1 FROM outreach_campaign_control WHERE id=true AND NOT enabled AND provider='resend' AND stage=0) THEN
  RAISE EXCEPTION 'Concurrency test needs the default paused, empty campaign fixture';
 END IF;
 IF EXISTS(SELECT 1 FROM users WHERE id='7a100000-0000-4000-8000-000000000001') OR
    EXISTS(SELECT 1 FROM listings WHERE id IN('7a200000-0000-4000-8000-000000000001','7a200000-0000-4000-8000-000000000002')) OR
    EXISTS(SELECT 1 FROM islands WHERE slug='outreach-reservation-race-audit') OR
    EXISTS(SELECT 1 FROM outreach_email_attempts WHERE id IN(SELECT ('7a300000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid FROM generate_series(1,17)n)) THEN
  RAISE EXCEPTION 'Owned fixture identity already exists; do not overwrite it';
 END IF;
END $$;
INSERT INTO islands(slug,name,country,is_active) VALUES('outreach-reservation-race-audit','Outreach reservation concurrency audit','Synthetic',true);
INSERT INTO users(id,email,role,email_verified) VALUES('7a100000-0000-4000-8000-000000000001','outreach-race-owner@audit.invalid','operator',true);
INSERT INTO listings(id,operator_id,island_id,type,status,title,slug,type_data)
 SELECT v.id,'7a100000-0000-4000-8000-000000000001',i.id,'tour','active',v.title,v.slug,json_build_object('email',v.email)
 FROM islands i CROSS JOIN(VALUES
 ('7a200000-0000-4000-8000-000000000001'::uuid,'Outreach race A','outreach-race-a','outreach-race-a@audit.invalid'),
 ('7a200000-0000-4000-8000-000000000002'::uuid,'Outreach race B','outreach-race-b','outreach-race-b@audit.invalid'))v(id,title,slug,email)
 WHERE i.slug='outreach-reservation-race-audit';
INSERT INTO outreach_recipient_consents(listing_id,recipient_email,evidence)
 SELECT id,type_data->>'email','Synthetic opt-in evidence for isolated two-worker reservation test'
 FROM listings WHERE id IN('7a200000-0000-4000-8000-000000000001','7a200000-0000-4000-8000-000000000002');
UPDATE outreach_campaign_control SET enabled=true,stage=0,health_ready=true,health_checked_at=now(),health_reason='synthetic_reservation_race' WHERE id=true;
COMMIT;
SQL
cleanup_ready=1
run_race() {
  local label=$1 expected_reason=$2 expected_daily=$3 expected_hourly=$4
  psql "$DATABASE_URL" -XqAt -v ON_ERROR_STOP=1 -c "BEGIN; SELECT coalesce(attempt_id::text,'REFUSED')||'|'||coalesce(reason,'') FROM vakaygo_reserve_outreach_attempt('7a200000-0000-4000-8000-000000000001','outreach-race-a@audit.invalid','listing-claims-v2'); SELECT pg_sleep(1); COMMIT;" > "$tmpdir/$label-a.log" 2>&1 &
  local a=$!
  psql "$DATABASE_URL" -XqAt -v ON_ERROR_STOP=1 -c "BEGIN; SELECT coalesce(attempt_id::text,'REFUSED')||'|'||coalesce(reason,'') FROM vakaygo_reserve_outreach_attempt('7a200000-0000-4000-8000-000000000002','outreach-race-b@audit.invalid','listing-claims-v2'); SELECT pg_sleep(1); COMMIT;" > "$tmpdir/$label-b.log" 2>&1 &
  local b=$!
  local failed=0
  wait "$a" || failed=1
  wait "$b" || failed=1
  if [[ "$failed" != 0 ]]; then cat "$tmpdir/$label-a.log" "$tmpdir/$label-b.log"; return 1; fi
  local accepted refused counts
  accepted=$(cat "$tmpdir/$label-a.log" "$tmpdir/$label-b.log" | grep -Ec '^[0-9a-f-]{36}\|$' || true)
  refused=$(cat "$tmpdir/$label-a.log" "$tmpdir/$label-b.log" | grep -Ec "^REFUSED\\|$expected_reason$" || true)
  [[ "$accepted" == 1 && "$refused" == 1 ]] || { cat "$tmpdir/$label-a.log" "$tmpdir/$label-b.log"; return 1; }
  counts=$(psql "$DATABASE_URL" -XAt -v ON_ERROR_STOP=1 -c "SELECT count(*) FILTER(WHERE reserved_at>now()-interval '24 hours')||'|'||count(*) FILTER(WHERE reserved_at>now()-interval '1 hour') FROM outreach_email_attempts WHERE campaign_key='listing-claims-v2'")
  [[ "$counts" == "$expected_daily|$expected_hourly" ]] || { echo "Rolling quota assertion failed: $counts" >&2; return 1; }
  echo "PASS: $label two-worker race; exactly one reservation, other refused by $expected_reason; rolling counts $counts"
}
run_race empty minimum_interval 1 1
psql "$DATABASE_URL" -Xq -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
DELETE FROM outreach_email_attempts WHERE listing_id IN('7a200000-0000-4000-8000-000000000001','7a200000-0000-4000-8000-000000000002');
INSERT INTO outreach_email_attempts(id,recipient,campaign_key,idempotency_key,state,reserved_at)
 SELECT ('7a300000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'outreach-race-seed-'||n||'@audit.invalid',
 'listing-claims-v2','outreach-race-seed-'||n,'failed',now()-CASE WHEN n<=5 THEN interval '20 minutes' ELSE interval '2 hours' END
 FROM generate_series(1,17)n;
COMMIT;
SQL
run_race quota daily_cap 18 6
echo "PASS: real PostgreSQL advisory-lock reservations cannot oversubscribe spacing, daily18 or hourly6 under two concurrent workers."
