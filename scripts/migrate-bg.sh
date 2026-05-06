#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
set -a
source .env.local
set +a
export NODE_TLS_REJECT_UNAUTHORIZED=0
exec npx tsx scripts/migrate-google-photos-to-blob.ts --concurrency=8 "$@"
