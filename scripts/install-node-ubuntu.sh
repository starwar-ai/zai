#!/usr/bin/env bash
set -Eeuo pipefail

readonly NODE_VERSION="24.11.1"
readonly NODE_BASE_URL="https://nodejs.org/dist/v${NODE_VERSION}"
readonly INSTALL_ROOT="/usr/local/lib/nodejs"
readonly INSTALL_DIR="${INSTALL_ROOT}/node-v${NODE_VERSION}"

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

case "$(uname -m)" in
  x86_64|amd64)
    node_arch="x64"
    expected_sha256="60e3b0a8500819514aca603487c254298cd776de0698d3cd08f11dba5b8289a8"
    ;;
  aarch64|arm64)
    node_arch="arm64"
    expected_sha256="6b0863fb9f627bf4a6c5948dce1de4398174a2e05dbe717503d828e211ca01f0"
    ;;
  *)
    echo "不支持的 CPU 架构：$(uname -m)，仅支持 x86_64 和 ARM64。" >&2
    exit 1
    ;;
esac

archive_name="node-v${NODE_VERSION}-linux-${node_arch}.tar.xz"
download_url="${NODE_BASE_URL}/${archive_name}"
temporary_dir="$(mktemp -d /tmp/node-install.XXXXXXXX)"
staging_dir="${INSTALL_DIR}.new"

cleanup() {
  rm -rf -- "$temporary_dir" "$staging_dir"
}
trap cleanup EXIT

echo "[1/4] 安装下载和解压依赖..."
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends ca-certificates curl xz-utils

echo "[2/4] 下载 Node.js v${NODE_VERSION} (${node_arch})..."
curl --fail --location --silent --show-error \
  --proto '=https' --tlsv1.2 \
  --output "${temporary_dir}/${archive_name}" \
  "$download_url"

echo "[3/4] 校验 SHA256 并安装..."
printf '%s  %s\n' "$expected_sha256" "${temporary_dir}/${archive_name}" | sha256sum --check --status || {
  echo "Node.js 安装包 SHA256 校验失败，已终止安装。" >&2
  exit 1
}

mkdir -p "$INSTALL_ROOT"
rm -rf -- "$staging_dir"
mkdir "$staging_dir"
tar -xJf "${temporary_dir}/${archive_name}" -C "$staging_dir" --strip-components=1

# 只替换脚本固定版本对应的精确目录，不影响其他已安装版本。
rm -rf -- "$INSTALL_DIR"
mv "$staging_dir" "$INSTALL_DIR"

ln -sfn "${INSTALL_DIR}/bin/node" /usr/local/bin/node
ln -sfn "${INSTALL_DIR}/bin/npm" /usr/local/bin/npm
ln -sfn "${INSTALL_DIR}/bin/npx" /usr/local/bin/npx
ln -sfn "${INSTALL_DIR}/bin/corepack" /usr/local/bin/corepack

echo "[4/4] 验证安装结果..."
hash -r
installed_version="$(/usr/local/bin/node --version)"
if [[ "$installed_version" != "v${NODE_VERSION}" ]]; then
  echo "版本验证失败：期望 v${NODE_VERSION}，实际 ${installed_version}。" >&2
  exit 1
fi

echo "Node.js ${installed_version} 安装成功。"
echo "Node 路径：$(readlink -f /usr/local/bin/node)"
echo "npm 版本：$(/usr/local/bin/npm --version)"
