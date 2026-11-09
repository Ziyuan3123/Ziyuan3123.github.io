#!/usr/bin/env bash
# 访问统计页：https://wangziyuan.cn/stats/ （带密码，只有自己能看）
#   用 GoAccess 读取服务器自己的访问日志，每 10 分钟生成一次图表页面。
#   数据只在这台服务器上，不经过任何第三方。
# 用法（在服务器终端里）：
#   curl -fsSL https://raw.githubusercontent.com/Ziyuan3123/Ziyuan3123.github.io/main/deploy/stats.sh | sudo bash
# 再运行一次可以改密码。
set -euo pipefail

OUT=/var/www/stats                 # 放在网站同步目录之外，GitHub 同步不会碰它
PASSFILE=/etc/nginx/.private-pass  # 私人页面共用的密码文件
USER_NAME="${STATS_USER:-ziyuan}"
SITE_CONF=/etc/nginx/sites-available/site

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y goaccess openssl

# ---------- 设置密码（已经设过的话，直接回车就保留原密码） ----------
HAVE=0; [ -f "$PASSFILE" ] && grep -q "^$USER_NAME:" "$PASSFILE" && HAVE=1
if [ -z "${STATS_PASS:-}" ]; then
  if ( : > /dev/tty ) 2>/dev/null; then
    while :; do
      if [ "$HAVE" = 1 ]; then printf '要改统计页密码就输入新密码，不改直接按回车：' > /dev/tty
      else printf '请设置统计页密码（输入时不显示，至少 8 位）：' > /dev/tty; fi
      if ! read -rs P1 < /dev/tty 2>/dev/null; then
        [ "$HAVE" = 1 ] && { P1=; break; }
        echo "没法读取密码输入，请用：STATS_PASS='你的密码' bash stats.sh" >&2; exit 1
      fi
      echo > /dev/tty
      if [ -z "$P1" ] && [ "$HAVE" = 1 ]; then echo '密码不变。' > /dev/tty; break; fi
      printf '再输入一次：' > /dev/tty
      read -rs P2 < /dev/tty; echo > /dev/tty
      if [ "$P1" != "$P2" ]; then echo '两次不一样，再来一次。' > /dev/tty
      elif [ "${#P1}" -lt 8 ]; then echo '太短了，至少 8 位。' > /dev/tty
      else break; fi
    done
    STATS_PASS="$P1"
  elif [ "$HAVE" = 0 ]; then
    echo "没法读取密码输入，请用：STATS_PASS='你的密码' bash stats.sh" >&2; exit 1
  fi
fi
if [ -n "${STATS_PASS:-}" ]; then
  HASH=$(printf '%s' "$STATS_PASS" | openssl passwd -6 -stdin)
  touch "$PASSFILE"
  grep -v "^$USER_NAME:" "$PASSFILE" > "$PASSFILE.tmp" || true
  echo "$USER_NAME:$HASH" >> "$PASSFILE.tmp"
  mv "$PASSFILE.tmp" "$PASSFILE"
fi
chown root:www-data "$PASSFILE"; chmod 640 "$PASSFILE"

# ---------- IP 归属地数据库（免费版 DB-IP，按月更新；下载失败就不显示城市） ----------
mkdir -p /var/lib/site-stats
cat > /usr/local/bin/site-stats-geo <<'GEO'
#!/usr/bin/env bash
M=$(date +%Y-%m); P=$(date -d "$(date +%Y-%m-01) -1 month" +%Y-%m)
for m in "$M" "$P"; do
  if curl -fsSL --max-time 120 "https://download.db-ip.com/free/dbip-city-lite-$m.mmdb.gz" -o /tmp/dbip.mmdb.gz; then
    gunzip -f /tmp/dbip.mmdb.gz && mv /tmp/dbip.mmdb /var/lib/site-stats/city.mmdb && exit 0
  fi
done
exit 0
GEO
chmod 755 /usr/local/bin/site-stats-geo
/usr/local/bin/site-stats-geo || true

# ---------- 生成报告的脚本 ----------
mkdir -p "$OUT"
cat > /usr/local/bin/site-stats <<'GEN'
#!/usr/bin/env bash
# 读全部访问日志（含已压缩的旧日志），生成 /var/www/stats/index.html。
# 只算真人：去掉看统计页自己的记录、搜索引擎爬虫、不认识的程序，
# 不是浏览器的程序，以及扫漏洞的机器人（只要某个 IP 访问过 .git/.env/wp-/php 这类网站根本没有的路径，它的所有记录都不算）。
OUT=/var/www/stats
TMP=$(mktemp); trap 'rm -f "$TMP"' EXIT
zcat -f /var/log/nginx/access.log* 2>/dev/null | grep -v ' "GET /stats' > "$TMP"
BAD='"[A-Z]+ [^"]*(\.git|\.env|wp-|\.php|cgi-bin|phpmyadmin|/admin|actuator|boaform|HNAP|/vendor/|\.\./)|\\x[0-9a-fA-F]{2}|"(POST|PUT|DELETE|CONNECT|OPTIONS|PROPFIND)'
filtered() {
  awk 'NR==FNR{bad[$1]=1;next} !($1 in bad)' <(grep -E "$BAD" "$TMP" | awk '{print $1}' | sort -u) "$TMP" \
    | grep '"Mozilla/[^"]*"$'   # 真浏览器都以 Mozilla/ 开头；curl、python 这类程序去掉
}
run() {
  filtered | goaccess - --log-format=COMBINED --ignore-crawlers --unknowns-as-crawlers --real-os \
      --ignore-status=400 --ignore-status=401 --ignore-status=403 --ignore-status=404 \
      --ignore-status=405 --ignore-status=444 \
      --html-report-title='wangziyuan.cn 访问统计（已去掉机器人）' "$@" \
      -o "$OUT/index.tmp.html" >/dev/null 2>&1
}
DB=/var/lib/site-stats/city.mmdb
{ [ -s "$DB" ] && run --geoip-database="$DB"; } || run || exit 1
mv -f "$OUT/index.tmp.html" "$OUT/index.html"
GEN
chmod 755 /usr/local/bin/site-stats
/usr/local/bin/site-stats || true
[ -s "$OUT/index.html" ] || echo '<meta charset="utf-8"><p>还没有访问记录，10 分钟后再来看。</p>' > "$OUT/index.html"

cat > /etc/cron.d/site-stats <<'CRON'
*/10 * * * * root /usr/local/bin/site-stats
17 4 3 * * root /usr/local/bin/site-stats-geo
CRON

# 访问日志多留一段时间（默认只留 14 天，改成 365 天）
if [ -f /etc/logrotate.d/nginx ]; then
  sed -i 's/^\(\s*rotate\s*\)[0-9]\+/\1365/' /etc/logrotate.d/nginx
fi

# ---------- nginx：/stats/ 需要密码 ----------
cat > /etc/nginx/snippets/private-stats.conf <<NGINX
location ^~ /stats/ {
  alias $OUT/;
  index index.html;
  auth_basic "Private";
  auth_basic_user_file $PASSFILE;
  add_header Cache-Control "no-store";
  add_header X-Robots-Tag "noindex, nofollow";
}
location = /stats { return 301 /stats/; }
NGINX
if ! grep -q 'snippets/private-stats.conf' "$SITE_CONF"; then
  # 加在每个真正放网站的 server 段里（有 root /var/www/site; 的那几段，包括 HTTPS 那段）
  sed -i '/^\s*root \/var\/www\/site;/a\  include snippets/private-stats.conf;' "$SITE_CONF"
fi
nginx -t
systemctl reload nginx

echo
echo "======================================"
echo " 统计页已开通： https://wangziyuan.cn/stats/"
echo " 用户名：$USER_NAME   密码：你设的那个"
echo " 每 10 分钟自动更新一次"
echo "======================================"
