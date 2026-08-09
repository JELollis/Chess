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

The Apache template uses the reserved `.invalid` hostname until a real domain is purchased. It must not become the default vhost. TLS is added after DNS exists.

See `FAILOVER.md` for promotion and rejoin behavior. The API service template remains disabled until the current Cloudflare-shaped API is replaced by its MySQL-backed Node runtime.
