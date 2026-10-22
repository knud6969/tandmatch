#!/usr/bin/env bash
# Kører alle RLS-tests (tests/rls/NN_*.sql) mod den LOKALE Supabase-database og stopper ved første fejl.
# Forudsætter: `supabase start` og `supabase db reset`. Kører aldrig mod andet end localhost.
# Overstyr forbindelsen med TEST_DB_URL (skal pege på 127.0.0.1/localhost); standard er Supabase CLI'ens lokale database.
set -u
cd "$(dirname "$0")"

DB_URL="${TEST_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DB_URL" in
  *@127.0.0.1:*|*@localhost:*|*@\[::1\]:*) ;;
  *) echo "Afviser at køre RLS-tests mod en anden database end den lokale: $DB_URL" >&2; exit 2 ;;
esac

if ! command -v psql >/dev/null 2>&1; then echo "psql mangler (brew install libpq)." >&2; exit 2; fi
if ! psql "$DB_URL" -X -q -t -A -c "select 1" >/dev/null 2>&1; then
  echo "Kan ikke nå den lokale database. Kør 'supabase start' og 'supabase db reset' først." >&2; exit 2
fi

passed=0
for f in [0-9][0-9]_*.sql; do
  if out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -o /dev/null -f "$f" 2>&1); then
    echo "BESTÅET  $f"
    passed=$((passed + 1))
  else
    echo "FEJLET   $f" >&2
    echo "$out" | sed 's/^/         /' >&2
    echo "$passed bestået, 1 fejlet (stoppede ved første fejl)." >&2
    exit 1
  fi
done
echo "$passed bestået, 0 fejlet."
