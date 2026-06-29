#!/bin/sh
set -eu

backup_dir="${BACKUP_DIR:-/backups}"
retention_days="${BACKUP_RETENTION_DAYS:-14}"
backup_time="${BACKUP_TIME_LOCAL:-03:00}"
remote_prefix="${BACKUP_REMOTE_PREFIX:-backups/postgres}"
db_name="${POSTGRES_DB:-soul_pq}"
db_user="${POSTGRES_USER:-soul}"
db_host="${POSTGRES_HOST:-postgres}"

mkdir -p "$backup_dir"

run_backup() {
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  backup_file="${backup_dir}/${db_name}-${timestamp}.dump"

  if pg_dump -h "$db_host" -U "$db_user" -d "$db_name" -Fc -f "$backup_file"; then
    echo "Backup PostgreSQL creato: $backup_file"
    upload_backup "$backup_file"
    find "$backup_dir" -type f -name "${db_name}-*.dump" -mtime +"$retention_days" -delete
  else
    echo "Backup PostgreSQL fallito" >&2
    rm -f "$backup_file"
  fi
}

upload_backup() {
  backup_file="$1"
  if [ -z "${S3_ENDPOINT:-}" ] || [ -z "${S3_BUCKET:-}" ] || [ -z "${S3_ACCESS_KEY_ID:-}" ] || [ -z "${S3_SECRET_ACCESS_KEY:-}" ]; then
    echo "Upload B2 saltato: configurazione S3/B2 incompleta"
    return
  fi

  export AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID"
  export AWS_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY"
  export AWS_DEFAULT_REGION="${S3_REGION:-us-west-004}"
  export AWS_EC2_METADATA_DISABLED=true

  aws_config_dir="/tmp/aws"
  mkdir -p "$aws_config_dir"
  export AWS_CONFIG_FILE="${aws_config_dir}/config"
  if [ "${S3_FORCE_PATH_STYLE:-true}" != "false" ]; then
    printf "[default]\ns3 =\n    addressing_style = path\n" > "$AWS_CONFIG_FILE"
  fi

  remote_key="${remote_prefix%/}/$(basename "$backup_file")"
  if aws --endpoint-url "$S3_ENDPOINT" s3 cp "$backup_file" "s3://${S3_BUCKET}/${remote_key}" --only-show-errors; then
    echo "Backup PostgreSQL caricato su B2: s3://${S3_BUCKET}/${remote_key}"
  else
    echo "Upload B2 fallito per $backup_file" >&2
    return 1
  fi
}

seconds_until_next_backup() {
  target_hour="${backup_time%:*}"
  target_minute="${backup_time#*:}"
  current_hour="$(date +%H)"
  current_minute="$(date +%M)"
  current_second="$(date +%S)"

  target_total=$(((1$target_hour - 100) * 3600 + (1$target_minute - 100) * 60))
  current_total=$(((1$current_hour - 100) * 3600 + (1$current_minute - 100) * 60 + (1$current_second - 100)))
  delay=$((target_total - current_total))
  if [ "$delay" -le 0 ]; then
    delay=$((delay + 86400))
  fi
  echo "$delay"
}

if [ "${BACKUP_ONCE:-false}" = "true" ]; then
  run_backup
  exit 0
fi

while true; do
  delay="$(seconds_until_next_backup)"
  echo "Prossimo backup PostgreSQL alle ${backup_time} (${TZ:-UTC}), tra ${delay}s"
  sleep "$delay"
  run_backup
done
