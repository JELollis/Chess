#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo 'Usage: install-release.sh RELEASE_ID RELEASE_ARCHIVE' >&2
  exit 2
fi

release_id="$1"
archive="$2"
release_root="/srv/aether-chess/releases/${release_id}"

if [[ ! "${release_id}" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo 'Invalid release ID' >&2
  exit 2
fi
if [[ ! -f "${archive}" ]]; then
  echo "Release archive not found: ${archive}" >&2
  exit 2
fi
if [[ -e "${release_root}" ]]; then
  echo "Release already exists: ${release_root}" >&2
  exit 2
fi

sudo install -d -m 0755 -o aether-chess -g aether-chess "${release_root}"
sudo tar --extract --gzip --file "${archive}" --directory "${release_root}"
sudo chown -R aether-chess:aether-chess "${release_root}"

sudo -u aether-chess /usr/local/bin/npm --prefix "${release_root}" ci
if [[ ! -f "${release_root}/dist/server/index.js" ]]; then
  sudo -u aether-chess env AETHER_DEPLOY_TARGET=node \
    /usr/local/bin/npm --prefix "${release_root}" run build
fi

sudo ln -sfn "${release_root}" /srv/aether-chess/current.next
sudo mv -Tf /srv/aether-chess/current.next /srv/aether-chess/current

echo "Installed release ${release_id}. Enable/restart the service only after its environment is configured."
