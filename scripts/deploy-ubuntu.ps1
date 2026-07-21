<#
.SYNOPSIS
构建 ZForm 并部署到 Ubuntu 服务器，默认安装到 /root/zai。

.EXAMPLE
.\scripts\deploy-ubuntu.ps1

.EXAMPLE
# 覆盖默认服务器、密钥和环境文件
.\scripts\deploy-ubuntu.ps1 -Server zai.example.com -IdentityFile ~/.ssh/id_ed25519 -EnvFile deploy/zai.env
#>
[CmdletBinding()]
param(
    [string]$Server = "172.16.52.11",

    [string]$User = "root",
    [int]$SshPort = 22,
    [string]$IdentityFile = "~/.ssh/id_rsa",
    [string]$DeployPath = "/root/zai",
    [string]$EnvFile = "apps/api/.env",
    [string]$ServiceName = "zai",
    [switch]$Seed
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Assert-LastExitCode {
    param([string]$Action)

    if ($LASTEXITCODE -ne 0) {
        throw "$Action 失败，退出码：$LASTEXITCODE"
    }
}

function Assert-Command {
    param([string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "未找到命令 '$Name'，请先安装或加入 PATH。"
    }
}

if ($Server -notmatch '^[a-zA-Z0-9.:-]+$') {
    throw "Server 必须是有效的主机名或 IP 地址。"
}

if ($User -notmatch '^[a-z_][a-z0-9_-]*$') {
    throw "User 必须是有效的 Ubuntu 用户名。"
}

if ($DeployPath -notmatch '^/[a-zA-Z0-9._/-]+$' -or $DeployPath -eq "/") {
    throw "DeployPath 必须是安全的 Ubuntu 绝对路径，且不能为根目录。"
}

if ($ServiceName -notmatch '^[a-zA-Z0-9_.@-]+$') {
    throw "ServiceName 只能包含字母、数字、下划线、点、@ 和连字符。"
}

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if ($EnvFile) {
    $envFilePath = if ([System.IO.Path]::IsPathRooted($EnvFile)) {
        $EnvFile
    }
    else {
        Join-Path $repositoryRoot $EnvFile
    }
    $EnvFile = (Resolve-Path -LiteralPath $envFilePath).Path
}

$timestamp = Get-Date -Format "yyyyMMddHHmmss"
$archiveName = "zai-$timestamp.tar.gz"
$archivePath = Join-Path ([System.IO.Path]::GetTempPath()) $archiveName
$remoteArchive = "/tmp/$archiveName"
$remoteEnv = "/tmp/zai-env-$timestamp"
$target = "$User@$Server"

Assert-Command "ssh"
Assert-Command "scp"
Assert-Command "tar"

$sshOptions = @("-p", "$SshPort", "-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=10")
$scpOptions = @("-P", "$SshPort", "-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=10")
if ($IdentityFile) {
    $resolvedIdentityFile = (Resolve-Path -LiteralPath $IdentityFile).Path
    $sshOptions += @("-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes", "-i", $resolvedIdentityFile)
    $scpOptions += @("-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes", "-i", $resolvedIdentityFile)
}

try {
    Push-Location $repositoryRoot
    try {
        Write-Host "[1/5] 打包工作区..." -ForegroundColor Cyan
        $tarArguments = @(
            "-czf", $archivePath,
            "--exclude=.git",
            "--exclude=.env",
            "--exclude=*/.env",
            "--exclude=node_modules",
            "--exclude=*/node_modules",
            "--exclude=dist",
            "--exclude=*/dist",
            "--exclude=*.tsbuildinfo",
            "-C", $repositoryRoot,
            "."
        )
        & tar @tarArguments
        Assert-LastExitCode "项目打包"
    }
    finally {
        Pop-Location
    }

    Write-Host "[2/5] 检查 Ubuntu 服务器连接..." -ForegroundColor Cyan
    & ssh @sshOptions $target "true"
    if ($LASTEXITCODE -ne 0 -and $IdentityFile) {
        throw "SSH 密钥认证失败。服务器未接受私钥 '$resolvedIdentityFile'，请确认 -User/-IdentityFile，或先将对应公钥加入 ${target}:~/.ssh/authorized_keys。退出码：$LASTEXITCODE"
    }
    Assert-LastExitCode "SSH 连接"

    Write-Host "[3/5] 上传部署包..." -ForegroundColor Cyan
    & scp @scpOptions $archivePath "${target}:$remoteArchive"
    Assert-LastExitCode "上传部署包"

    $hasUploadedEnv = "0"
    if ($EnvFile) {
        & scp @scpOptions $EnvFile "${target}:$remoteEnv"
        Assert-LastExitCode "上传环境变量文件"
        & ssh @sshOptions $target "chmod 600 '$remoteEnv'"
        Assert-LastExitCode "保护远端环境变量文件"
        $hasUploadedEnv = "1"
    }

    Write-Host "[4/5] 安装远端依赖、迁移数据库并切换版本..." -ForegroundColor Cyan
    $seedValue = if ($Seed) { "1" } else { "0" }
    $remoteScript = @'
set -Eeuo pipefail

deploy_path="$1"
archive_path="$2"
release_id="$3"
service_name="$4"
uploaded_env="$5"
remote_env="$6"
run_seed="$7"

if [ "$(id -u)" -ne 0 ]; then
  echo "部署 /root 路径和安装 systemd 服务需要 root 用户。" >&2
  exit 1
fi

case "$deploy_path" in
  /*) ;;
  *) echo "部署目录必须是绝对路径。" >&2; exit 1 ;;
esac
if [ "$deploy_path" = "/" ]; then
  echo "拒绝部署到根目录。" >&2
  exit 1
fi

for command_name in node npm tar systemctl; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "服务器缺少 $command_name，请先安装 Node.js 20+、npm、tar 和 systemd。" >&2
    exit 1
  }
done

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$node_major" -lt 20 ]; then
  echo "服务器 Node.js 版本必须为 20+，当前为 $(node --version)。" >&2
  exit 1
fi

releases_path="$deploy_path/releases"
shared_path="$deploy_path/shared"
release_path="$releases_path/$release_id"
current_path="$deploy_path/current"
environment_path="$shared_path/apps-api.env"
previous_release=""

mkdir -p "$releases_path" "$shared_path"
if [ -L "$current_path" ]; then
  previous_release="$(readlink -f "$current_path")"
fi

mkdir "$release_path"
cleanup_failed_release() {
  rm -f "$archive_path" "$remote_env"
  if [ -d "$release_path" ] && [ "$(readlink -f "$current_path" 2>/dev/null || true)" != "$release_path" ]; then
    rm -rf -- "$release_path"
  fi
}
trap cleanup_failed_release ERR

tar -xzf "$archive_path" -C "$release_path"
rm -f "$archive_path"

if [ "$uploaded_env" = "1" ]; then
  install -m 600 "$remote_env" "$environment_path"
  rm -f "$remote_env"
elif [ ! -f "$environment_path" ]; then
  if [ -f "$current_path/apps/api/.env" ]; then
    install -m 600 "$current_path/apps/api/.env" "$environment_path"
  else
    echo "服务器尚无环境配置。首次部署请通过 -EnvFile 指定生产 .env。" >&2
    exit 1
  fi
fi

ln -s "$environment_path" "$release_path/apps/api/.env"
cd "$release_path"
npm ci
npm run build
npm run db:deploy
if [ "$run_seed" = "1" ]; then
  npm run db:seed
fi
npm prune --omit=dev

node_path="$(command -v node)"
unit_path="/etc/systemd/system/$service_name.service"
cat > "$unit_path" <<UNIT
[Unit]
Description=ZForm Framework
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$deploy_path/current
Environment=NODE_ENV=production
EnvironmentFile=$environment_path
ExecStart=$node_path apps/api/dist/index.js
Restart=on-failure
RestartSec=5
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
UNIT

ln -sfn "$release_path" "$current_path"
systemctl daemon-reload
systemctl enable "$service_name.service" >/dev/null
if ! systemctl restart "$service_name.service"; then
  if [ -n "$previous_release" ] && [ -d "$previous_release" ]; then
    ln -sfn "$previous_release" "$current_path"
    systemctl restart "$service_name.service" || true
  fi
  exit 1
fi

sleep 2
if ! systemctl is-active --quiet "$service_name.service"; then
  systemctl status "$service_name.service" --no-pager || true
  if [ -n "$previous_release" ] && [ -d "$previous_release" ]; then
    ln -sfn "$previous_release" "$current_path"
    systemctl restart "$service_name.service" || true
  fi
  exit 1
fi

trap - ERR
printf '%s\n' "部署成功：$release_path" "服务状态：$(systemctl is-active "$service_name.service")"
'@

    $remoteScript | & ssh @sshOptions $target "bash -s -- '$DeployPath' '$remoteArchive' '$timestamp' '$ServiceName' '$hasUploadedEnv' '$remoteEnv' '$seedValue'"
    Assert-LastExitCode "远端部署"

    Write-Host "[5/5] 部署完成。" -ForegroundColor Green
    Write-Host "服务：$ServiceName"
    Write-Host "目录：$DeployPath/current"
    Write-Host "查看日志：ssh $target 'journalctl -u $ServiceName -f'"
}
finally {
    if (Test-Path -LiteralPath $archivePath) {
        Remove-Item -LiteralPath $archivePath -Force
    }
}
