#!/usr/bin/env bash
set -u
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "BEGIN; SELECT audit_book('race-a','2099-12-03'); SELECT pg_sleep(2); COMMIT;" > /tmp/vakay-race-a.log 2>&1 &
a=$!
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "BEGIN; SELECT audit_book('race-b','2099-12-03'); SELECT pg_sleep(2); COMMIT;" > /tmp/vakay-race-b.log 2>&1 &
b=$!
wait "$a"; ra=$?
wait "$b"; rb=$?
if [[ "$ra" == 0 && "$rb" != 0 ]]; then cat /tmp/vakay-race-b.log; elif [[ "$rb" == 0 && "$ra" != 0 ]]; then cat /tmp/vakay-race-a.log; else cat /tmp/vakay-race-a.log /tmp/vakay-race-b.log; exit 1; fi
count=$(psql "$DATABASE_URL" -Atc "SELECT count(*) FROM bookings WHERE booking_number IN ('race-a','race-b')")
[[ "$count" == 1 ]] || exit 1
echo "Concurrent reservation check passed: exactly one booking holds the last seat."
