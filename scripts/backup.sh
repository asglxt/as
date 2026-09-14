#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$BACKUP_DIR"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

pg_dump "$DATABASE_URL" | gzip > "$BACKUP_DIR/school-$TIMESTAMP.sql.gz"
echo "backup written: $BACKUP_DIR/school-$TIMESTAMP.sql.gz"

find "$BACKUP_DIR" -name 'school-*.sql.gz' -mtime +30 -delete
