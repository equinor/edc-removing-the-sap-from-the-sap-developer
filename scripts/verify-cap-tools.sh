#!/usr/bin/env bash
set -euo pipefail

required_commands=(
  node
  npm
  cds
  mbt
  ui5
  java
  sqlite3
  cf
  btp
)

echo "[CAP verify] Checking required commands..."
for cmd in "${required_commands[@]}"; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "[CAP verify] Missing required command: $cmd" >&2
    exit 1
  fi
  echo "[CAP verify] OK: $cmd"
done

echo "[CAP verify] Checking versions..."
node --version
npm --version
cds --version
mbt --version
ui5 --version
java -version
sqlite3 --version
cf --version
btp --version

echo "[CAP verify] Checking Cloud Foundry MultiApps plugin..."
if ! cf plugins | grep -qi "multiapps"; then
  echo "[CAP verify] Missing required CF plugin: multiapps" >&2
  exit 1
fi

echo "[CAP verify] All required CAP tools are installed."
