#!/usr/bin/env bash
# Kører API-testene (tests/api/*.test.ts) mod en lokal app og den LOKALE Supabase.
# Forudsætter: Docker + `supabase start` (og gerne `supabase db reset` for ren database) og .env.test.local.
# Starter selv `next dev` på TEST_PORT (standard 3101) med miljø fra .env.test.local og midlertidige hemmeligheder
# (skrives ikke til .env.local). Rører aldrig .env.local og kører aldrig mod andet end localhost.
set -u
cd "$(dirname "$0")/../.."

[ -f .env.test.local ] || { echo ".env.test.local mangler." >&2; exit 2; }
set -a; . ./.env.test.local; set +a
case "${NEXT_PUBLIC_SUPABASE_URL:-}" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) echo "Afviser: NEXT_PUBLIC_SUPABASE_URL peger ikke på lokal Supabase." >&2; exit 2 ;;
esac

PORT="${TEST_PORT:-3101}"
export TEST_BASE_URL="http://127.0.0.1:$PORT"
export TERMS_COOKIE_SECRET="test-terms-cookie-secret-0123456789abcdef"
export CRON_SECRET="test-cron-secret-0123456789abcdef"
export OPENAI_API_KEY="sk-test-not-used"
# Falsk AI-klient uden netværkskald (services/ai/openai.ts createAiClient). Virker kun når NODE_ENV ikke er production.
export AI_FAKE_CLIENT=1
export NEXT_TELEMETRY_DISABLED=1

LOG="${TMPDIR:-/tmp}/tandmatch-test-server.log"
npx next dev -p "$PORT" -H 127.0.0.1 >"$LOG" 2>&1 &
SERVER_PID=$!
cleanup() { kill "$SERVER_PID" 2>/dev/null; pkill -P "$SERVER_PID" 2>/dev/null; wait "$SERVER_PID" 2>/dev/null; }
trap cleanup EXIT

for _ in $(seq 1 90); do
  curl -s -o /dev/null "$TEST_BASE_URL/api/terms/status" && break
  kill -0 "$SERVER_PID" 2>/dev/null || { echo "Serveren stoppede. Se $LOG" >&2; exit 2; }
  sleep 1
done

node --test --test-reporter=spec --test-concurrency=1 tests/api/*.test.ts
STATUS=$?
[ $STATUS -ne 0 ] && echo "Serverlog: $LOG" >&2
exit $STATUS
