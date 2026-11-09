#!/usr/bin/env bash
# 只认 wangziyuan.cn：用别的域名（比如别人指过来的旧域名）或直接输 IP 打开时，
#   http 自动跳到 https://wangziyuan.cn，https 直接拒绝（没有那个域名的证书）。
# 用法（在服务器终端里）：
#   curl -fsSL https://raw.githubusercontent.com/Ziyuan3123/Ziyuan3123.github.io/main/deploy/only-my-domain.sh | sudo bash
set -euo pipefail
DOMAIN="${DOMAIN:-wangziyuan.cn}"
SITE_CONF=/etc/nginx/sites-available/site
CATCH=/etc/nginx/sites-available/00-other-hosts

cp "$SITE_CONF" "/root/site.nginx.bak.$(date +%Y%m%d%H%M%S)"

# 网站本身不再当“默认站点”
sed -i 's/ default_server//g' "$SITE_CONF"
sed -i 's/^\(\s*server_name .*\) _;/\1;/' "$SITE_CONF"

cat > "$CATCH" <<NGINX
# 不是 $DOMAIN 的访问都到这里
server {
  listen 80 default_server;
  listen [::]:80 default_server;
  server_name _;
  location /.well-known/acme-challenge/ { root /var/www/html; }
  location / { return 301 https://$DOMAIN\$request_uri; }
}
server {
  listen 443 ssl default_server;
  listen [::]:443 ssl default_server;
  server_name _;
  ssl_reject_handshake on;
}
NGINX
ln -sf "$CATCH" /etc/nginx/sites-enabled/00-other-hosts

if ! nginx -t; then
  echo "配置有问题，已还原，网站不受影响。请把上面的报错截图发给 Claude。" >&2
  rm -f /etc/nginx/sites-enabled/00-other-hosts
  cp "$(ls -t /root/site.nginx.bak.* | head -1)" "$SITE_CONF"
  nginx -t && systemctl reload nginx
  exit 1
fi
systemctl reload nginx

echo
echo "======================================"
echo " 好了：只有 $DOMAIN 会直接显示网站，"
echo " 其他域名或 IP 打开会跳到 https://$DOMAIN"
echo "======================================"
