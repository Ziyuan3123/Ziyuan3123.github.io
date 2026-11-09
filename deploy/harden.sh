#!/usr/bin/env bash
# 服务器基础防护（随时可以重复运行）：
#   1. 系统安全补丁自动安装
#   2. fail2ban：有人反复猜 SSH 密码、或者扫漏洞，就把他的 IP 封 1 天
#   3. nginx 不再对外显示版本号；常见的扫漏洞路径直接断开
# 用法（在服务器终端里）：
#   curl -fsSL https://raw.githubusercontent.com/Ziyuan3123/Ziyuan3123.github.io/main/deploy/harden.sh | sudo bash
set -euo pipefail
SITE_CONF=/etc/nginx/sites-available/site
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y fail2ban unattended-upgrades

# ---------- 1. 自动安装安全补丁 ----------
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'APT'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT

# ---------- 3. nginx ----------
echo 'server_tokens off;' > /etc/nginx/conf.d/hide-version.conf
cat > /etc/nginx/snippets/block-scanners.conf <<'NGINX'
# 网站是纯静态页面，没有这些东西；来找的都是扫漏洞的机器人，直接断开不回话
location ~* (/\.(?!well-known)|\.php|wp-|cgi-bin|phpmyadmin|/actuator|/boaform|/HNAP1) { return 444; }
NGINX
if ! grep -q 'snippets/block-scanners.conf' "$SITE_CONF"; then
  cp "$SITE_CONF" "/root/site.nginx.bak.$(date +%Y%m%d%H%M%S)"
  sed -i '/^\s*root \/var\/www\/site;/a\  include snippets/block-scanners.conf;' "$SITE_CONF"
fi
if ! nginx -t; then
  echo "nginx 配置有问题，已还原，网站不受影响。请把上面的报错截图发给 Claude。" >&2
  rm -f /etc/nginx/conf.d/hide-version.conf
  sed -i '/snippets\/block-scanners.conf/d' "$SITE_CONF"
  nginx -t && systemctl reload nginx
  exit 1
fi
systemctl reload nginx

# ---------- 2. fail2ban ----------
cat > /etc/fail2ban/filter.d/nginx-scanner.conf <<'F2B'
[Definition]
# 被上面规则断开（444）或者乱发数据（400）的请求
failregex = ^<HOST> - \S+ \[[^\]]*\] "[^"]*" (444|400)
ignoreregex =
F2B
cat > /etc/fail2ban/jail.local <<'F2B'
[DEFAULT]
bantime  = 1d
findtime = 10m
backend  = auto

[sshd]
enabled  = true
maxretry = 5

[nginx-scanner]
enabled  = true
port     = http,https
filter   = nginx-scanner
logpath  = /var/log/nginx/access.log
maxretry = 3
F2B
systemctl enable fail2ban >/dev/null 2>&1 || true
systemctl restart fail2ban

echo
echo "======================================"
echo " 防护已开启："
echo "  - 系统安全补丁每天自动装"
echo "  - 猜 SSH 密码 5 次或扫漏洞 3 次的 IP 封 1 天"
echo "  - 网站不再显示 nginx 版本，扫漏洞的请求直接断开"
echo " 查看被封的 IP：sudo fail2ban-client status nginx-scanner"
echo "======================================"
