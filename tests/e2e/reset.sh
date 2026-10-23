#!/bin/bash
# fresh "crm" database from the project's schema + seed, then restart the API
cd "$(dirname "$0")"
P="psql -h ${PGHOST:-/tmp} -p ${PGPORT:-55432} -U postgres -v ON_ERROR_STOP=1 -q"
$P -c "drop database if exists crm with (force)" -c "create database crm" >/dev/null
$P -d crm -f supabase-stubs.sql >/dev/null 2>&1
$P -d crm -f ../../supabase/schema.sql 2>&1 | grep -v "pg_cron not available" | grep -iE "error|warn"
$P -d crm -f ../../supabase/seed.sql >/dev/null 2>&1 || echo "SEED FAILED"
rm -rf shots
./run.sh
