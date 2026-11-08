#!/usr/bin/env bash
# 在腾讯云轻量服务器（Ubuntu）上一键部署个人网站：
#   装 nginx 和 git，从 GitHub 拉网站，每 5 分钟自动同步一次。
# 用法（在服务器终端里）：
#   curl -fsSL https://raw.githubusercontent.com/Ziyuan3123/Ziyuan3123.github.io/claude/project-thread-vxngjc/deploy/setup.sh | sudo bash
set -euo pipefail

REPO=https://github.com/Ziyuan3123/Ziyuan3123.github.io.git
DIR=/var/www/site
DOMAIN="${DOMAIN:-wangziyuan.cn}"

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y nginx git

if [ -d "$DIR/.git" ]; then
  git -C "$DIR" fetch -q --depth 1 origin main && git -C "$DIR" reset -q --hard origin/main
else
  rm -rf "$DIR"
  git clone -q --depth 1 -b main "$REPO" "$DIR"
fi

cat > /etc/nginx/sites-available/site <<NGINX
server {
  listen 80 default_server;
  listen [::]:80 default_server;
  server_name $DOMAIN www.$DOMAIN _;
  root $DIR;
  index index.html;

  location ~ /\.git { deny all; }
  location /deploy/ { deny all; }

  gzip on;
  gzip_types text/css application/javascript image/svg+xml application/json;

  location ~* \.(webp|png|jpg|jpeg|svg|woff2|js|css)$ {
    expires 30d;
    add_header Cache-Control "public";
  }
  location / { try_files \$uri \$uri/ =404; }
}
NGINX
ln -sf /etc/nginx/sites-available/site /etc/nginx/sites-enabled/site
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable --now nginx
systemctl reload nginx

# 每 5 分钟从 GitHub 同步一次（GitHub 上改了网站，这里自动更新）
cat > /etc/cron.d/site-sync <<CRON
*/5 * * * * root git -C $DIR fetch -q --depth 1 origin main && git -C $DIR reset -q --hard origin/main
CRON

IP=$(curl -fsS -4 --max-time 5 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
echo
echo "======================================"
echo " 部署完成！用手机浏览器打开： http://$IP"
echo "======================================"
