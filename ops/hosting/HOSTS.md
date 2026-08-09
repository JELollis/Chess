# Hosting inventory

Audited 2026-08-09.

| Role | Host | OS | Runtime/services | Private network |
|---|---|---|---|---|
| Box 1 application | `ubuntu` | Ubuntu Server 24.04.4 LTS | Apache 2.4.58; Node 24.19.0; npm 11.17.0 | Tailscale and Azure private network |
| Primary database | `mysql` | Ubuntu Server 24.04.4 LTS | MySQL 8.0.46 | Tailscale and Azure private network |
| Box 2 application/standby database | `servedaderb` | Ubuntu Server 24.04.4 LTS | Apache 2.4.58; Node 24.19.0; npm 11.17.0; MySQL 8.0.46 | Tailscale |

Box 1 has approximately 1 GiB RAM and a 62 GiB root volume. Box 2 has approximately 31 GiB RAM; after disposable cache and archived-journal cleanup its root volume had approximately 8 GiB free. The shared `/mnt/backup` CIFS storage is mounted and writable on all three hosts, but it is one storage system and therefore not an independent second backup.

## Installed foundation

- Both application hosts have the `aether-chess` system account and `/srv/aether-chess/{releases,shared}` layout.
- Apache modules required for static hosting and reverse proxying are enabled.
- Release `20260809T011427-5f33df4-node` is active on both application hosts.
- The Aether systemd service is enabled on both hosts and binds only to `127.0.0.1:3100`.
- Apache serves the temporary `aether.completeelectronics.net` name over HTTP and HTTPS and proxies the full Vinext application to the private service.
- Both origins use the existing Let's Encrypt `*.completeelectronics.net` certificate; Cloudflare handles public HTTPS rewriting.
- Private configuration belongs under `/etc/aether-chess` with group-restricted permissions.
- MySQL port 3306 is allowed on `tailscale0` and closed on public interfaces on both database hosts.
- Azure is GTID server ID 1. Box 2 is GTID server ID 2 with `read_only` and `super_read_only` enabled.
- Box 2 replication uses GTID auto-positioning and resumes automatically after MySQL restart.
- `/usr/local/sbin/aether-verify-replica` verifies replication; `/usr/local/sbin/aether-promote-standby` requires the explicit `--azure-confirmed-down` guard.

## Intentionally deferred

- MySQL-backed account/API functionality; the deployed free client does not depend on it.
- Least-privilege Aether application database credentials, pending the production schema.
- Automated promotion, which requires quorum to avoid split-brain.
- Independent encrypted off-site backups and scheduled restore exercises.
