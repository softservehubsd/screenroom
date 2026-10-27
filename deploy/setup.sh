#!/usr/bin/env bash
# Run on a fresh Ubuntu 22.04/24.04 AWS server (Lightsail or EC2):
#   sudo bash deploy/setup.sh yourdomain.com
# Expects the project to be in /opt/screenroom (see DEPLOY-AWS.md).
set -euo pipefail
DOMAIN="${1:?Usage: sudo bash deploy/setup.sh yourdomain.com}"
APP=/opt/screenroom

apt-get update
apt-get install -y curl debian-keyring debian-archive-keyring apt-transport-https gpg
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs ffmpeg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
apt-get update && apt-get install -y caddy

id screenroom &>/dev/null || useradd --system --home "$APP" --shell /usr/sbin/nologin screenroom
mkdir -p /var/lib/screenroom
chown -R screenroom:screenroom /var/lib/screenroom
chown -R root:root "$APP"

# Secrets file (edit the passwords!)
if [ ! -f /etc/screenroom.env ]; then
  cat > /etc/screenroom.env <<EOF
NODE_ENV=production
PORT=3000
HOST=127.0.0.1
DATA_DIR=/var/lib/screenroom
ADMIN_PASSWORD=CHANGE-ME-admin-password
VIEWER_PASSWORD=CHANGE-ME-family-password
SESSION_SECRET=$(head -c 48 /dev/urandom | base64 | tr -d '/+=\n')
EOF
  chmod 600 /etc/screenroom.env
fi

cp "$APP/deploy/screenroom.service" /etc/systemd/system/screenroom.service
sed "s/YOUR_DOMAIN/$DOMAIN/" "$APP/deploy/Caddyfile" > /etc/caddy/Caddyfile

systemctl daemon-reload
systemctl enable screenroom
systemctl restart caddy
echo
echo "Now edit /etc/screenroom.env (set both passwords), then run:"
echo "  sudo systemctl restart screenroom"
echo "Site: https://$DOMAIN    Admin: https://$DOMAIN/admin"
