# Database failover runbook

Both Apache hosts may serve web traffic. Azure `mysql` is the only normally writable database; Box 2 is a GTID replica protected by `read_only` and `super_read_only`.

## Promote Box 2

1. Confirm Azure MySQL is unavailable from more than one network location. A Tailscale interruption alone is insufficient.
2. Remove Box 1 from Aether web traffic so it cannot write through a stale database endpoint.
3. Record `SHOW REPLICA STATUS\G`, including lag and both error fields.
4. Run `promote-standby.sh --azure-confirmed-down` on Box 2. It stops the receiver, drains all retrieved GTIDs through the SQL applier, and aborts without making the server writable if the drain times out. Override the 300-second bound only with `AETHER_DRAIN_TIMEOUT`.
5. Set Box 2's private `DB_HOST=127.0.0.1` and restart only the Aether API.
6. Verify health checks, account writes, logs, and backups before restoring public traffic.

## Rejoin Azure

Never make the former Azure primary writable after Box 2 has accepted writes. Back it up, re-seed it from Box 2, configure it as a replica, and wait for zero lag. A planned maintenance window is required to reverse the roles safely.

When Box 2 becomes a standby again, remove the promotion overrides with `RESET PERSIST super_read_only; RESET PERSIST read_only;`, restart MySQL, and verify both flags are `1` before starting application traffic against the Azure primary.

Automatic promotion is intentionally disabled to prevent split-brain. Add a third MySQL voting member or an external quorum before automating database promotion.
