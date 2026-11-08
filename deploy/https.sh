#!/usr/bin/env bash
# 域名解析生效后，在服务器上运行，申请免费 HTTPS 证书（Let's Encrypt）并自动续期。
# 用法：curl -fsSL https://raw.githubusercontent.com/Ziyuan3123/Ziyuan3123.github.io/main/deploy/https.sh | sudo bash
set -euo pipefail
DOMAIN="${DOMAIN:-wangziyuan.cn}"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y certbot python3-certbot-nginx
certbot --nginx --non-interactive --agree-tos --register-unsafely-without-email \
  --redirect -d "$DOMAIN" -d "www.$DOMAIN"
systemctl reload nginx
echo
echo "======================================"
echo " HTTPS 已开通： https://$DOMAIN"
echo "======================================"
