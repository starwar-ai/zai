#!/usr/bin/env bash
set -Eeuo pipefail

readonly SITE_NAME="zai"
readonly UPSTREAM_HOST="127.0.0.1"
readonly UPSTREAM_PORT="3100"
readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPOSITORY_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
readonly WEB_DIST="${ZAI_WEB_DIST:-${REPOSITORY_ROOT}/apps/web/dist}"
readonly WEB_ROOT="/var/www/${SITE_NAME}"
readonly SITE_AVAILABLE="/etc/nginx/sites-available/${SITE_NAME}"
readonly SITE_ENABLED="/etc/nginx/sites-enabled/${SITE_NAME}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "请使用 root 权限运行：sudo bash $0" >&2
  exit 1
fi

if [[ ! -r /etc/os-release ]]; then
  echo "无法识别操作系统；此脚本仅支持 Ubuntu。" >&2
  exit 1
fi

# shellcheck disable=SC1091
source /etc/os-release
if [[ "${ID:-}" != "ubuntu" ]]; then
  echo "当前系统为 ${PRETTY_NAME:-unknown}；此脚本仅支持 Ubuntu。" >&2
  exit 1
fi

if [[ ! -f "${WEB_DIST}/index.html" ]]; then
  echo "未找到前端构建产物：${WEB_DIST}/index.html" >&2
  echo "请先在仓库根目录执行 npm run build，或通过 ZAI_WEB_DIST 指定构建目录。" >&2
  exit 1
fi

temporary_config="$(mktemp /tmp/zai-nginx.XXXXXXXX)"
cleanup() {
  rm -f -- "$temporary_config"
}
trap cleanup EXIT

echo "[1/5] 安装 Nginx..."
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends nginx ca-certificates curl

echo "[2/5] 部署 ZAI 前端构建产物..."
install -d -o root -g root -m 0755 "$WEB_ROOT"
cp -a -- "${WEB_DIST}/." "${WEB_ROOT}/"

echo "[3/5] 生成 ZAI 前端入口配置..."
cat >"$temporary_config" <<'NGINX_CONFIG'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    root /var/www/zai;
    index index.html;
    client_max_body_size 10m;

    # 后端 API、健康检查和 OpenAPI 文档统一转发到 3100 端口。
    location ~ ^/(?:api(?:/|$)|api-docs(?:/|$)|health$) {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_connect_timeout 10s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # React 单页应用路由回退到入口文件。
    location / {
        try_files $uri $uri/ /index.html;
    }
}
NGINX_CONFIG

if [[ -f "$SITE_AVAILABLE" ]] && ! cmp -s "$temporary_config" "$SITE_AVAILABLE"; then
  backup_path="${SITE_AVAILABLE}.bak.$(date +%Y%m%d%H%M%S)"
  cp --preserve=mode,ownership,timestamps -- "$SITE_AVAILABLE" "$backup_path"
  echo "已备份原配置到：${backup_path}"
fi

install -o root -g root -m 0644 "$temporary_config" "$SITE_AVAILABLE"
ln -sfn "$SITE_AVAILABLE" "$SITE_ENABLED"
rm -f -- /etc/nginx/sites-enabled/default

echo "[4/5] 校验 Nginx 配置..."
nginx -t

echo "[5/5] 启动 Nginx、设置开机自启并验证..."
systemctl enable --now nginx
systemctl reload nginx

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q '^Status: active'; then
  echo "检测到 UFW 已启用，放行 Nginx HTTP/HTTPS 流量..."
  ufw allow 'Nginx Full'
fi

if ! systemctl is-active --quiet nginx; then
  echo "Nginx 未正常运行，请执行 journalctl -u nginx 查看日志。" >&2
  exit 1
fi

if curl --fail --silent --show-error --max-time 5 http://127.0.0.1/ >/dev/null; then
  echo "ZAI 前端入口检查通过。"
else
  echo "ZAI 前端入口检查失败。" >&2
  exit 1
fi

if curl --fail --silent --show-error --max-time 5 http://127.0.0.1/health >/dev/null; then
  echo "ZAI 后端健康检查通过。"
else
  echo "警告：前端可访问，但 3100 端口的 ZAI 后端尚未通过健康检查。" >&2
  echo "请确认已在仓库中执行 npm run start。" >&2
fi

echo "Nginx 安装及 ZAI 入口配置完成。"
echo "访问地址：http://<服务器IP>/"
echo "前端目录：${WEB_ROOT}"
echo "后端地址：http://${UPSTREAM_HOST}:${UPSTREAM_PORT}"
