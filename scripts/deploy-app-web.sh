#!/usr/bin/env bash
#
# 只重建并零停机切换「公网 App SPA」（nginx 直 serve apps/app/dist）。
# 不碰任何后端：不重启 shared-world :4100 / cloud-api / wiki-api / site。
#
#   用法:  bash scripts/deploy-app-web.sh
#   跳过类型检查（并发会话改坏了其它文件时的逃生口）:
#          SKIP_TYPECHECK=1 bash scripts/deploy-app-web.sh
#
# 机制（见 MEMORY: app SPA 构建/部署机制）:
#   1) typecheck 闸（默认开）
#   2) vite 构建到 staging 目录（apps/app/.env 的 VITE_GOOGLE_OAUTH_CLIENT_ID
#      会被 vite 自动加载；构建期生成 .gz/.br 供 nginx gzip_static/brotli_static）
#   3) 守卫：校验 Google OAuth client id 真打进了包（否则 Google 登录会消失 → 中止不切换）
#   4) 同文件系统 mv 原子切换 dist，旧版留到 dist-prev-walk 供回滚
#
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$REPO/apps/app"
DIST="$APP_DIR/dist"
STAGING="$APP_DIR/dist-staging"
BACKUP="$APP_DIR/dist-prev-walk"
GOOGLE_ID="662873041260-l8o4rdpsr1mkclvo5slhabgsl1cbbvbm.apps.googleusercontent.com"
SKIP_TYPECHECK="${SKIP_TYPECHECK:-0}"

cd "$REPO"

echo "[app-deploy] 1/4 typecheck"
if [ "$SKIP_TYPECHECK" = "1" ]; then
  echo "  (已跳过：SKIP_TYPECHECK=1)"
else
  if ! pnpm --filter @yinjie/app typecheck; then
    echo "[app-deploy] ✗ typecheck 失败。若错误在并发会话正在改的其它文件，可：SKIP_TYPECHECK=1 bash scripts/deploy-app-web.sh" >&2
    exit 1
  fi
fi

echo "[app-deploy] 2/4 构建 → staging ($STAGING)"
rm -rf "$STAGING"
# vite 自动加载 apps/app/.env（含 VITE_GOOGLE_OAUTH_CLIENT_ID）；base 走默认 "/"，对齐 nginx 根。
pnpm --filter @yinjie/app exec vite build --outDir "$STAGING" --emptyOutDir

echo "[app-deploy] 3/4 守卫校验"
if [ ! -f "$STAGING/index.html" ]; then
  echo "[app-deploy] ✗ staging 缺 index.html，构建异常 → 中止，不切换。" >&2
  rm -rf "$STAGING"
  exit 1
fi
if ! grep -rqs "$GOOGLE_ID" "$STAGING/assets"; then
  echo "[app-deploy] ✗ 包里没有 VITE_GOOGLE_OAUTH_CLIENT_ID（Google 登录会消失）→ 中止，不切换。请检查 apps/app/.env。" >&2
  rm -rf "$STAGING"
  exit 1
fi

echo "[app-deploy] 4/4 零停机切换（旧版 → dist-prev-walk）"
rm -rf "$BACKUP.tmp"
[ -d "$DIST" ] && mv "$DIST" "$BACKUP.tmp"   # 把旧 dist 挪走（同 fs 原子 rename）
mv "$STAGING" "$DIST"                          # 新版就位（紧接上一步，间隙微秒级）
rm -rf "$BACKUP"
[ -d "$BACKUP.tmp" ] && mv "$BACKUP.tmp" "$BACKUP"

echo "[app-deploy] ✅ 完成：nginx 直接吐新 dist，无需重启任何进程。"
echo "[app-deploy] 回滚：rm -rf '$DIST' && mv '$BACKUP' '$DIST'"
