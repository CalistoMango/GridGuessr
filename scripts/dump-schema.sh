#!/usr/bin/env bash
set -euo pipefail

# Load env vars
set -a
source "$(dirname "$0")/../.env.local"
set +a

# Sanity check
: "${SUPABASE_DB_URL:?Need SUPABASE_DB_URL in .env.local}"
: "${SUPABASE_DB_PASSWORD:?Need SUPABASE_DB_PASSWORD in .env.local}"

mkdir -p supabase

PGPASSWORD="$SUPABASE_DB_PASSWORD" pg_dump \
  --schema-only \
  --no-owner \
  --dbname="$SUPABASE_DB_URL" \
  > supabase/schema.sql

echo "Schema dumped to supabase/schema.sql"
