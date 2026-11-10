#!/bin/sh
set -eu

# Wait for the app to create/seed the database, then back it up once per day.
# The backup process must never prevent the web server from starting.
backup_initial_delay="${BACKUP_INITIAL_DELAY_SECONDS:-120}"
backup_interval="${BACKUP_INTERVAL_SECONDS:-86400}"

(
  sleep "$backup_initial_delay"
  while true; do
    if ! node /app/scripts/backup-db.mjs; then
      echo "[backup] run failed; next attempt in ${backup_interval}s" >&2
    fi
    sleep "$backup_interval"
  done
) &

exec node server.js
