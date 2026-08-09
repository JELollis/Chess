#!/usr/bin/env bash
set -euo pipefail

if ! id aether-chess >/dev/null 2>&1; then
  sudo useradd --system --home /var/lib/aether-chess --shell /usr/sbin/nologin aether-chess
fi

sudo install -d -m 0755 -o aether-chess -g aether-chess \
  /srv/aether-chess /srv/aether-chess/releases /srv/aether-chess/shared
sudo install -d -m 0750 -o aether-chess -g aether-chess /var/lib/aether-chess
sudo install -d -m 0750 -o root -g aether-chess /etc/aether-chess
printf 'ok\n' | sudo tee /srv/aether-chess/shared/healthz.txt >/dev/null
sudo chown aether-chess:aether-chess /srv/aether-chess/shared/healthz.txt
sudo chmod 0644 /srv/aether-chess/shared/healthz.txt

sudo a2enmod headers proxy proxy_http proxy_wstunnel rewrite ssl
echo 'Host layout ready. The service and vhost remain disabled until a deployable server bundle is installed.'

