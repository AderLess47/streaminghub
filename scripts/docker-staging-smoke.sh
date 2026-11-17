#!/usr/bin/env bash
# Smoke-test the staging Docker entrypoint without Fly or production secrets.
# The image must have been built from this checkout before running this script.
set -euo pipefail

IMAGE="${1:-streaminghub-staging-smoke}"
CONTAINER="${CONTAINER_NAME:-streaminghub-staging-smoke}"
PORT="${PORT:-3000}"
BASE="http://127.0.0.1:${PORT}"

fail() {
  echo "::error::$*" >&2
  exit 1
}

cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then
    echo "--- container logs ---" >&2
    docker logs --tail 120 "$CONTAINER" >&2 || true
  fi
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT

docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run --detach --name "$CONTAINER" \
  --publish "127.0.0.1:${PORT}:3000" \
  --env ENABLE_PUBLIC_HTML_CACHE=1 \
  --env UPSTREAM_PORT=3001 \
  --env PORT=3000 \
  --env NODE_ENV=production \
  --env DEPLOY_ENV=staging-smoke \
  --env APP_URL="$BASE" \
  --env DATABASE_PATH=/tmp/streaminghub-smoke.db \
  --env BACKUP_DIR=/tmp/streaminghub-smoke-backups \
  --env BACKUP_INITIAL_DELAY_SECONDS=86400 \
  --env RETENTION_INITIAL_DELAY_SECONDS=86400 \
  "$IMAGE" >/dev/null

ready=0
for _attempt in $(seq 1 60); do
  if [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null || true)" != "true" ]; then
    fail "container stopped before the app became ready"
  fi
  code="$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/status" || true)"
  if [ "$code" = "200" ]; then
    ready=1
    break
  fi
  sleep 2
done
[ "$ready" = "1" ] || fail "staging app did not return HTTP 200 from /status"

processes="$(docker top "$CONTAINER")"
printf '%s\n' "$processes"
grep -Eq 'next-server|node[[:space:]]+server\.js' <<<"$processes" \
  || fail "the Next standalone server is not running"
grep -q 'public-html-cache-proxy\.mjs' <<<"$processes" \
  || fail "the public HTML cache proxy is not running"

headers="$(curl -sS -D - -o /dev/null -H 'Accept: text/html' "$BASE/")"
printf '%s\n' "$headers" | grep -Eiq '^cache-control: public' \
  || fail "anonymous public HTML is not marked public"
printf '%s\n' "$headers" | grep -Eiq '^vary:.*cookie' \
  || fail "anonymous public HTML does not vary by cookie"

body="$(curl -fsS -H 'Accept: text/html' "$BASE/")"
grep -q 'StreamingHub' <<<"$body" \
  || fail "anonymous public HTML body is missing expected content"

session_headers="$(curl -sS -D - -o /dev/null \
  -H 'Accept: text/html' \
  -H 'Cookie: sh_session=staging-smoke-invalid' \
  "$BASE/")"
printf '%s\n' "$session_headers" | grep -Eiq '^cache-control: private' \
  || fail "session request is not marked private"
if printf '%s\n' "$session_headers" | grep -Eiq '^cache-control: public'; then
  fail "session request was published as public"
fi

status_headers="$(curl -sS -D - -o /dev/null -H 'Accept: text/html' "$BASE/status")"
printf '%s\n' "$status_headers" | grep -Eiq '^cache-control: private' \
  || fail "/status is not marked private"

# Prove the second anonymous request is actually a cache hit: stop the Next
# upstream and request the already-warmed public page through the proxy.
next_pid="$(docker exec "$CONTAINER" node -e '
const fs = require("fs");
for (const name of fs.readdirSync("/proc")) {
  if (!/^\d+$/.test(name)) continue;
  try {
    const cmd = fs.readFileSync(`/proc/${name}/cmdline`, "utf8").split("\0").join(" ");
    if (cmd.includes("next-server") || cmd.includes("node server.js")) {
      console.log(name);
      process.exit(0);
    }
  } catch {}
}
process.exit(1);
')"
[ -n "$next_pid" ] || fail "could not find the Next server PID"
docker exec "$CONTAINER" node -e 'process.kill(Number(process.argv[1]), "SIGTERM")' "$next_pid"
sleep 1

cached_headers="$(curl -sS -D - -o /dev/null -H 'Accept: text/html' "$BASE/")"
printf '%s\n' "$cached_headers" | grep -Eiq '^cache-control: public' \
  || fail "cached public HTML disappeared after the upstream stopped"
cached_body="$(curl -fsS -H 'Accept: text/html' "$BASE/")"
grep -q 'StreamingHub' <<<"$cached_body" \
  || fail "cached body is not the expected public HTML"

echo "staging image smoke test passed"
