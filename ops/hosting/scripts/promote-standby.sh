#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" != "--azure-confirmed-down" ]]; then
  echo 'Refusing promotion without --azure-confirmed-down' >&2
  exit 2
fi

mysql --login-path=aether-bootstrap --execute='STOP REPLICA; SET GLOBAL super_read_only=OFF; SET GLOBAL read_only=OFF;'
mysql --login-path=aether-bootstrap --batch --skip-column-names \
  --execute='SELECT @@hostname, @@read_only, @@super_read_only;'
echo 'Box 2 is writable. Azure must be re-seeded before it can accept writes again.'

