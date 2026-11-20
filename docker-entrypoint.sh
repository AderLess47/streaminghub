#!/bin/sh
set -eu

# Wait for the app to create/seed the database, then back it up once per day.
# The backup process must never prevent the web server from starting.
backup_initial_delay="${BACKUP_INITIAL_DELAY_SECONDS:-120}"
backup_interval="${BACKUP_INTERVAL_SECONDS:-86400}"

# Delete contact messages past the retention period once per day. Runs next to
# the backup loop and never prevents the web server from starting.
retention_initial_delay="${RETENTION_INITIAL_DELAY_SECONDS:-180}"
retention_interval="${RETENTION_INTERVAL_SECONDS:-86400}"

(
  sleep "$retention_initial_delay"
  while true; do
    for job in contact-retention audit-retention; do
      if ! node "/app/scripts/${job}.mjs"; then
        echo "[retention] ${job} failed; next attempt in ${retention_interval}s" >&2
      fi
    done
    sleep "$retention_interval"
  done
) &

(
  sleep "$backup_initial_delay"
  while true; do
    if ! node /app/scripts/backup-db.mjs; then
      echo "[backup] run failed; next attempt in ${backup_interval}s" >&2
    fi
    sleep "$backup_interval"
  done
) &

if [ "${ENABLE_PUBLIC_HTML_CACHE:-0}" = "1" ]; then
  # Keep the Next server private to the container and put the anonymous-only
  # public HTML cache on the public port. Session requests bypass the cache.
  PORT="${UPSTREAM_PORT:-3001}" HOSTNAME=127.0.0.1 node server.js &
  next_pid=$!
  node scripts/public-html-cache-proxy.mjs &
  proxy_pid=$!
  trap 'kill "$next_pid" "$proxy_pid" 2>/dev/null || true' INT TERM EXIT
  wait "$proxy_pid"
  exit $?
fi

exec node server.js
