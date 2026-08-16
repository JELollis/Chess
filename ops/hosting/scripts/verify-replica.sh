#!/usr/bin/env bash
set -euo pipefail

status="$(mysql --login-path=aether-bootstrap --execute='SHOW REPLICA STATUS\G')"
grep -Eq '^[[:space:]]*Replica_IO_Running: Yes$' <<<"${status}"
grep -Eq '^[[:space:]]*Replica_SQL_Running: Yes$' <<<"${status}"
grep -Eq '^[[:space:]]*Last_IO_Error: $' <<<"${status}"
grep -Eq '^[[:space:]]*Last_SQL_Error: $' <<<"${status}"
mysql --login-path=aether-bootstrap --batch --skip-column-names \
  --execute='SELECT @@hostname, @@read_only, @@super_read_only;'
echo 'Replication threads are healthy.'

