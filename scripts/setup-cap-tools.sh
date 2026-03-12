#!/usr/bin/env bash
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

CF_VERSION="8.8.0"
BTP_CLI_ARCHIVE="btp-cli-linux-amd64-latest.tar.gz"
BTP_EULA_COOKIE="eula_3_2_agreed=tools.hana.ondemand.com/developer-license-3_2.txt"

echo "[CAP setup] Updating apt cache..."
sudo apt-get update

echo "[CAP setup] Installing OS packages..."
sudo apt-get install -y --no-install-recommends \
  sqlite3 \
  libsqlite3-dev \
  jq \
  make \
  python3 \
  python3-pip \
  ca-certificates \
  curl \
  wget \
  unzip

echo "[CAP setup] Installing Cloud Foundry CLI..."
curl -fsSL "https://packages.cloudfoundry.org/stable?release=debian64&version=${CF_VERSION}" -o /tmp/cf8.deb
sudo dpkg -i /tmp/cf8.deb
rm -f /tmp/cf8.deb

echo "[CAP setup] Installing global npm tools..."
npm install -g \
  @sap/cds-dk \
  hana-cli \
  mbt \
  @ui5/cli

echo "[CAP setup] Installing Cloud Foundry MultiApps plugin..."
cf install-plugin -f multiapps

echo "[CAP setup] Installing SAP BTP CLI..."
curl -fsSL --cookie "${BTP_EULA_COOKIE}" "https://tools.hana.ondemand.com/additional/${BTP_CLI_ARCHIVE}" -o /tmp/btp-cli.tar.gz
tar -xzf /tmp/btp-cli.tar.gz -C /tmp
sudo mv /tmp/linux-amd64/btp /usr/local/bin/btp
sudo chmod +x /usr/local/bin/btp
rm -rf /tmp/btp-cli.tar.gz /tmp/linux-amd64

echo "[CAP setup] Verifying installation..."
node --version
npm --version
cds --version
mbt --version
ui5 --version
java -version
sqlite3 --version
cf --version
btp --version

echo "[CAP setup] Done."
