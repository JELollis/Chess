#!/usr/bin/env bash
set -euo pipefail

NODE_VERSION="${NODE_VERSION:-24.19.0}"
NODE_DIST_BASE="https://nodejs.org/dist/v${NODE_VERSION}"

case "$(uname -m)" in
  x86_64) NODE_ARCH="x64" ;;
  aarch64|arm64) NODE_ARCH="arm64" ;;
  *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

NODE_ARCHIVE="node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz"
NODE_INSTALL_DIR="/opt/node-v${NODE_VERSION}-linux-${NODE_ARCH}"
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TEMP_DIR}"' EXIT

curl --fail --location --silent --show-error \
  "${NODE_DIST_BASE}/SHASUMS256.txt" \
  --output "${TEMP_DIR}/SHASUMS256.txt"
curl --fail --location --silent --show-error \
  "${NODE_DIST_BASE}/${NODE_ARCHIVE}" \
  --output "${TEMP_DIR}/${NODE_ARCHIVE}"

(
  cd "${TEMP_DIR}"
  grep " ${NODE_ARCHIVE}$" SHASUMS256.txt | sha256sum --check --strict -
)

if [[ ! -d "${NODE_INSTALL_DIR}" ]]; then
  sudo tar --extract --xz --file "${TEMP_DIR}/${NODE_ARCHIVE}" --directory /opt
fi

sudo ln -sfn "${NODE_INSTALL_DIR}" /opt/node
for executable in node npm npx corepack; do
  sudo ln -sfn "/opt/node/bin/${executable}" "/usr/local/bin/${executable}"
done

echo "node=$(node --version)"
echo "npm=$(npm --version)"

