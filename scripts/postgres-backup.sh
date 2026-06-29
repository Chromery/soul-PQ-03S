#!/bin/sh
set -eu

backup_dir="${BACKUP_DIR:-/backups}"
retention_days="${BACKUP_RETENTION_DAYS:-14}"
interval_seconds="${BACKUP_INTERVAL_SECONDS:-86400}"
db_name="${POSTGRES_DB:-soul_pq}"
db_user="${POSTGRES_USER:-soul}"
db_host="${POSTGRES_HOST:-postgres}"

mkdir -p "$backup_dir"

while true; do
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  backup_file="${backup_dir}/${db_name}-${timestamp}.dump"

  if pg_dump -h "$db_host" -U "$db_user" -d "$db_name" -Fc -f "$backup_file"; then
    echo "Backup PostgreSQL creato: $backup_file"
    find "$backup_dir" -type f -name "${db_name}-*.dump" -mtime +"$retention_days" -delete
  else
    echo "Backup PostgreSQL fallito" >&2
    rm -f "$backup_file"
  fi

  sleep "$interval_seconds"
done
