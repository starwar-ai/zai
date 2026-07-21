#!/usr/bin/env bash
set -Eeuo pipefail

readonly POSTGRESQL_MAJOR="16"
readonly OLD_POSTGRESQL_MAJOR="15"
readonly POSTGRESQL_PORT="5432"
readonly PGDG_KEY_URL="https://www.postgresql.org/media/keys/ACCC4CF8.asc"
readonly PGDG_REPOSITORY_URL="https://apt.postgresql.org/pub/repos/apt"
readonly PGDG_KEY_PATH="/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc"
readonly PGDG_SOURCE_PATH="/etc/apt/sources.list.d/pgdg.sources"

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

ubuntu_codename="${VERSION_CODENAME:-}"
if [[ -z "$ubuntu_codename" ]]; then
  echo "无法读取 Ubuntu 版本代号 VERSION_CODENAME。" >&2
  exit 1
fi

architecture="$(dpkg --print-architecture)"
case "$architecture" in
  amd64|arm64|ppc64el) ;;
  *)
    echo "PostgreSQL 官方仓库不支持当前架构：${architecture}。" >&2
    exit 1
    ;;
esac

export DEBIAN_FRONTEND=noninteractive

echo "[1/6] 清理冲突的旧 PGDG 源并安装 APT 仓库依赖..."

# 旧教程通常写入 http://apt.postgresql.org 且没有 Signed-By；它会导致首次
# apt-get update 在新密钥下载前就失败。先保留备份并禁用，随后写入官方新格式。
disable_legacy_pgdg_list() {
  local source_file="$1"
  if [[ -f "$source_file" ]] && grep -q 'apt\.postgresql\.org' "$source_file"; then
    if [[ ! -f "${source_file}.before-postgresql-16-install" ]]; then
      cp -a "$source_file" "${source_file}.before-postgresql-16-install"
    fi
    sed -i '\|apt\.postgresql\.org| s|^[[:space:]]*deb|# disabled-by-install-postgresql-16 deb|' "$source_file"
  fi
}

disable_legacy_pgdg_list /etc/apt/sources.list
while IFS= read -r -d '' source_file; do
  if [[ "$source_file" == "$PGDG_SOURCE_PATH" ]]; then
    rm -f -- "$source_file"
  elif [[ "$source_file" == *.list ]]; then
    disable_legacy_pgdg_list "$source_file"
  elif grep -q 'apt\.postgresql\.org' "$source_file"; then
    mv -f -- "$source_file" "${source_file}.disabled-by-install-postgresql-16"
  fi
done < <(find /etc/apt/sources.list.d -maxdepth 1 -type f \
  \( -name '*.list' -o -name '*.sources' \) -print0)

apt-get update
apt-get install -y --no-install-recommends ca-certificates curl postgresql-common

echo "[2/6] 配置 PostgreSQL 官方 APT 仓库..."
install -d -m 755 "$(dirname "$PGDG_KEY_PATH")"
temporary_key="$(mktemp /tmp/postgresql-pgdg-key.XXXXXXXX)"
cleanup() {
  rm -f -- "$temporary_key"
}
trap cleanup EXIT

curl --fail --location --silent --show-error \
  --proto '=https' --tlsv1.2 \
  --output "$temporary_key" \
  "$PGDG_KEY_URL"
install -m 644 "$temporary_key" "$PGDG_KEY_PATH"

cat > "$PGDG_SOURCE_PATH" <<EOF
Types: deb
URIs: ${PGDG_REPOSITORY_URL}
Suites: ${ubuntu_codename}-pgdg
Architectures: ${architecture}
Components: main
Signed-By: ${PGDG_KEY_PATH}
EOF

echo "[3/6] 停止并卸载 PostgreSQL ${OLD_POSTGRESQL_MAJOR}.x..."
if command -v pg_lsclusters >/dev/null 2>&1; then
  while read -r old_version old_cluster _ old_status _; do
    if [[ "$old_version" == "$OLD_POSTGRESQL_MAJOR" && "$old_status" == "online" ]]; then
      pg_ctlcluster "$old_version" "$old_cluster" stop --mode fast
    fi
  done < <(pg_lsclusters --no-header || true)
fi

mapfile -t old_packages < <(
  dpkg-query -W -f='${binary:Package}\t${db:Status-Abbrev}\n' 2>/dev/null \
    | awk -v version="$OLD_POSTGRESQL_MAJOR" \
      '$2 ~ /^ii/ && ($1 == "postgresql-" version || $1 == "postgresql-client-" version || $1 ~ ("^postgresql-" version "-")) { print $1 }'
)
if [[ "${#old_packages[@]}" -gt 0 ]]; then
  apt-get remove -y "${old_packages[@]}"
  echo "PostgreSQL ${OLD_POSTGRESQL_MAJOR} 软件包已卸载；原数据和配置目录已保留。"
else
  echo "未检测到已安装的 PostgreSQL ${OLD_POSTGRESQL_MAJOR} 软件包。"
fi

echo "[4/6] 安装 PostgreSQL ${POSTGRESQL_MAJOR}.x..."
apt-get update
if ! apt-cache show "postgresql-${POSTGRESQL_MAJOR}" >/dev/null 2>&1; then
  echo "官方仓库中没有适用于 Ubuntu ${ubuntu_codename}/${architecture} 的 PostgreSQL ${POSTGRESQL_MAJOR}。" >&2
  exit 1
fi

apt-get install -y \
  "postgresql-${POSTGRESQL_MAJOR}" \
  "postgresql-client-${POSTGRESQL_MAJOR}"

echo "[5/6] 初始化并启动默认数据库集群..."
cluster_name="$(pg_lsclusters --no-header | awk -v version="$POSTGRESQL_MAJOR" '$1 == version { print $2; exit }')"
if [[ -z "$cluster_name" ]]; then
  pg_createcluster "$POSTGRESQL_MAJOR" main --start
  cluster_name="main"
fi

# 允许所有 IPv4/IPv6 来源使用密码认证。生产公网环境应在外部防火墙限制来源。
pg_conftool "$POSTGRESQL_MAJOR" "$cluster_name" set port "$POSTGRESQL_PORT"
pg_conftool "$POSTGRESQL_MAJOR" "$cluster_name" set listen_addresses '*'

hba_file="/etc/postgresql/${POSTGRESQL_MAJOR}/${cluster_name}/pg_hba.conf"
remote_access_rules=(
  "host all all 0.0.0.0/0 scram-sha-256"
  "host all all ::/0 scram-sha-256"
)
for rule in "${remote_access_rules[@]}"; do
  if ! grep -Eq "^[[:space:]]*${rule// /[[:space:]]+}[[:space:]]*(#.*)?$" "$hba_file"; then
    printf '%s\n' "$rule" >> "$hba_file"
  fi
done

systemctl enable postgresql.service >/dev/null
# 只重启 16 集群；保留的 15 配置不会干扰新版本启动。
pg_ctlcluster "$POSTGRESQL_MAJOR" "$cluster_name" restart

if command -v ufw >/dev/null 2>&1 && LC_ALL=C ufw status | grep -q '^Status: active'; then
  ufw allow "${POSTGRESQL_PORT}/tcp"
fi

echo "[6/6] 验证安装结果..."
postgres_version="$("/usr/lib/postgresql/${POSTGRESQL_MAJOR}/bin/postgres" --version)"
if [[ "$postgres_version" != *" ${POSTGRESQL_MAJOR}."* ]]; then
  echo "版本验证失败：${postgres_version}" >&2
  exit 1
fi

cluster_line="$(pg_lsclusters --no-header | awk -v version="$POSTGRESQL_MAJOR" '$1 == version { print; exit }')"
if [[ -z "$cluster_line" ]]; then
  echo "未找到 PostgreSQL ${POSTGRESQL_MAJOR} 数据库集群。" >&2
  exit 1
fi

cluster_name="$(awk '{ print $2 }' <<< "$cluster_line")"
cluster_port="$(awk '{ print $3 }' <<< "$cluster_line")"
cluster_status="$(awk '{ print $4 }' <<< "$cluster_line")"
if [[ "$cluster_status" != "online" ]]; then
  echo "数据库集群 ${POSTGRESQL_MAJOR}/${cluster_name} 未正常运行：${cluster_status}" >&2
  exit 1
fi

if ! runuser -u postgres -- "/usr/lib/postgresql/${POSTGRESQL_MAJOR}/bin/pg_isready" \
  --host /var/run/postgresql --port "$cluster_port" --quiet; then
  echo "PostgreSQL 就绪检查失败。" >&2
  exit 1
fi

hba_errors="$(runuser -u postgres -- psql --port "$cluster_port" --dbname postgres --tuples-only --no-align \
  --command "SELECT line_number || ': ' || error FROM pg_hba_file_rules WHERE error IS NOT NULL")"
if [[ -n "$hba_errors" ]]; then
  echo "pg_hba.conf 配置存在错误：" >&2
  echo "$hba_errors" >&2
  exit 1
fi

echo "${postgres_version} 安装成功。"
echo "集群：${POSTGRESQL_MAJOR}/${cluster_name}"
echo "端口：${cluster_port}"
echo "状态：${cluster_status}"
echo "远程访问：允许所有 IPv4/IPv6 来源使用 SCRAM-SHA-256 密码认证"
echo "进入 psql：sudo -u postgres psql"
echo "设置 postgres 密码：sudo -u postgres psql -c '\password postgres'"
