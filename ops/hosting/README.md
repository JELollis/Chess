# Aether Chess hosting operations

This directory contains reproducible configuration for the two Ubuntu application hosts and their MySQL primary/standby pair.

## Intended topology

- **Box 1 (`ubuntu`)** — primary Apache/Node application host in Azure.
- **Azure `mysql`** — primary MySQL server.
- **Box 2 (`servedaderb`)** — standby Apache/Node application host and read-only MySQL replica on Proxmox.
- Tailscale provides the private cross-site network. Database and replication traffic must not be exposed broadly to the public internet.

## Runtime

`install-node-lts.sh` installs the pinned official Node.js LTS binary under `/opt`, verifies its published SHA-256 checksum, and exposes `node`, `npm`, `npx`, and `corepack` through `/usr/local/bin`. It does not remove Ubuntu-packaged Node versions used by unrelated software.

## Safety model

- Both Apache hosts may serve traffic, but Azure `mysql` is the only normal writable database.
- Box 2 is a GTID replica protected by `read_only` and `super_read_only`.
- Promotion is manual and guarded to prevent split-brain.
- MySQL port 3306 is open on `tailscale0` and closed on public interfaces.
- Secrets live in root-owned `/etc/aether-chess` files and MySQL login paths, never in this repository.

Apache serves `aether.completeelectronics.net` and proxies the full Vinext application to its private production server on `127.0.0.1:3100`. It is configured as explicit HTTP and HTTPS name-based vhosts and uses the existing `*.completeelectronics.net` certificate. Cloudflare owns the public HTTP-to-HTTPS redirect policy.

`/healthz` is deliberately proxied through Vinext rather than served from a static file, so a stopped or unreachable application service makes the origin unhealthy. The anonymous client currently has no database dependency; extend this to a database-aware API health handler when authenticated server features are enabled.

See `FAILOVER.md` for promotion and rejoin behavior. The anonymous free web client is active on both hosts; MySQL-backed account/API features remain deferred.
