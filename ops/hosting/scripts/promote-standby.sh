#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" != "--azure-confirmed-down" ]]; then
  echo 'Refusing promotion without --azure-confirmed-down' >&2
  exit 2
fi

drain_timeout="${AETHER_DRAIN_TIMEOUT:-300}"
if [[ ! "${drain_timeout}" =~ ^[0-9]+$ ]] || (( drain_timeout < 1 )); then
  echo 'AETHER_DRAIN_TIMEOUT must be a positive integer' >&2
  exit 2
fi

# Freeze the retrieved GTID set, then allow the SQL thread to apply every relay
# transaction already received before Azure became unavailable.
promotion_complete=0
restore_replication_on_abort() {
  if (( promotion_complete == 0 )); then
    mysql --login-path=aether-bootstrap --execute='START REPLICA;' >/dev/null 2>&1 || true
  fi
}
trap restore_replication_on_abort EXIT

mysql --login-path=aether-bootstrap \
  --execute='STOP REPLICA IO_THREAD; START REPLICA SQL_THREAD;'

deadline=$((SECONDS + drain_timeout))
while true; do
  drained="$(mysql --login-path=aether-bootstrap --batch --skip-column-names \
    --execute="SELECT COALESCE(GTID_SUBSET(RECEIVED_TRANSACTION_SET, @@GLOBAL.gtid_executed), 0) FROM performance_schema.replication_connection_status WHERE LENGTH(CHANNEL_NAME) = 0;" )"
  if [[ "${drained}" == "1" ]]; then
    break
  fi
  if (( SECONDS >= deadline )); then
    echo 'Replica relay log did not drain; standby remains read-only.' >&2
    exit 1
  fi
  sleep 1
done

mysql --login-path=aether-bootstrap \
  --execute='STOP REPLICA SQL_THREAD; SET PERSIST super_read_only=OFF; SET PERSIST read_only=OFF;'
promotion_complete=1
trap - EXIT
mysql --login-path=aether-bootstrap --batch --skip-column-names \
  --execute='SELECT @@hostname, @@read_only, @@super_read_only;'
echo 'Box 2 is writable. Azure must be re-seeded before it can accept writes again.'
