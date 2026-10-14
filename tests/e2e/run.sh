#!/usr/bin/env bash
# Kører Playwright-testene (tests/e2e) mod en lokal app og den LOKALE Supabase.
# Forudsætter: Docker + `supabase start` (og gerne `supabase db reset`) og .env.test.local.
# Starter selv `next dev` på E2E_PORT (standard 3102) med miljø fra .env.test.local og midlertidige hemmeligheder.
# Rører aldrig .env.local og kører aldrig mod andet end localhost.
set -u
cd "$(dirname "$0")/../.."

[ -f .env.test.local ] || { echo ".env.test.local mangler." >&2; exit 2; }
set -a; . ./.env.test.local; set +a
case "${NEXT_PUBLIC_SUPABASE_URL:-}" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) echo "Afviser: NEXT_PUBLIC_SUPABASE_URL peger ikke på lokal Supabase." >&2; exit 2 ;;
esac

PORT="${E2E_PORT:-3102}"
export E2E_BASE_URL="http://127.0.0.1:$PORT"
export TERMS_COOKIE_SECRET="test-terms-cookie-secret-0123456789abcdef"
export CRON_SECRET="test-cron-secret-0123456789abcdef"
export OPENAI_API_KEY="sk-test-not-used"
export NEXT_TELEMETRY_DISABLED=1

# Demodata til klinikoversigten (tests/e2e/clinic-directory.spec.ts): verificerede og importerede, fiktive klinikker.
# Seed-scriptet nægter ikke-lokal URL og rydder først tidligere demodata, så det er genkørbart. Spring over med E2E_SKIP_SEED=1.
if [ "${E2E_SKIP_SEED:-0}" != "1" ]; then
  npm run --silent seed:demo >/dev/null || { echo "seed:demo fejlede." >&2; exit 2; }
fi

LOG="${TMPDIR:-/tmp}/tandmatch-e2e-server.log"
npx next dev -p "$PORT" -H 127.0.0.1 >"$LOG" 2>&1 &
SERVER_PID=$!
cleanup() { kill "$SERVER_PID" 2>/dev/null; pkill -P "$SERVER_PID" 2>/dev/null; wait "$SERVER_PID" 2>/dev/null; git checkout -- CLAUDE.md 2>/dev/null; }
trap cleanup EXIT

for _ in $(seq 1 90); do
  curl -s -o /dev/null "$E2E_BASE_URL/api/terms/status" && break
  kill -0 "$SERVER_PID" 2>/dev/null || { echo "Serveren stoppede. Se $LOG" >&2; exit 2; }
  sleep 1
done

npx playwright test "$@"
STATUS=$?
[ $STATUS -ne 0 ] && echo "Serverlog: $LOG" >&2
exit $STATUS
