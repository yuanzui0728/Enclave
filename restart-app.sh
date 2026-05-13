#!/bin/bash
# 并行重启脚本：可选指定服务、可选跳过构建。
# 默认：cloud-api / app / wiki / admin / cloud-console / site 全部并行重启。
#
# 关于"运行最新代码"的设计前提：
#   1) app  (5180): 走 vite build → apps/app/dist，nginx 静态服务。脚本会
#      pnpm --dir apps/app build 后 ensure-local-web-nginx，
#      公网 HTTPS https://1gw06751dd053.vicp.fun/ 与 HTTP :29490 两条隧道
#      都打 nginx 5180，dist 一换公网立即生效。
#   2) site (5185): 当前**没有公网入口**（HTTPS 隧道已改指 5180/app）。
#      site 仍建议跑 site-prod (next build + next start)：保证 .next 是基于
#      当前源码现拉的产物。本地想要 HMR 热重载请加 --site-dev，切到 next dev。
#      site 与 site-prod 共用 5185、互斥，本脚本会在启动前显式 stop 另一边。
#   3) cloud-api (3001): dev-services.mjs 的 prestart 会无条件 nest build，
#      所以 --no-build 不影响它（仍然会构建）。
#   4) main-api (3000) 默认不直接启动，由 cloud-api 按手机号 spawn 到 3010+。
#      但 worker 用的是 api/dist 产物，所以脚本里 main-api-build 是必须的；
#      --no-build 会跳过，意味着 worker 跑的是上次构建的代码。
#   5) wiki / admin / cloud-console: 都是 vite dev，重启即拿最新源码。
set -uo pipefail

cd "$(dirname "$0")"

export CLOUD_LOCAL_PROCESS_PROVIDER="${CLOUD_LOCAL_PROCESS_PROVIDER:-1}"

# ---------- 参数解析 ----------
DO_BUILD=1
SKIP_ACCOUNT_PREP=0
SITE_MODE=prod   # prod = next build + next start (默认，公网用)；dev = next dev (本地热重载)
SERVICES=()

usage() {
  cat <<EOF
用法: $(basename "$0") [选项] [服务名...]

可选服务 (不传则全部并行重启):
  cloud-api  app  wiki  admin  cloud-console  site

选项:
  --no-build           跳过 main-api 与 app 的构建（仅重启服务进程）
                       注意: cloud-api / site-prod 的构建由 dev-services 的
                       prestart 强制执行，本开关不影响它们。
  --site-dev           site 走 next dev (本地开发热重载, 5-10x 慢于 prod)
                       默认 site 走 site-prod (next build + next start)，
                       保证 .next 是基于当前源码现拉的产物。
  --skip-account-prep  跳过账号目录初始化检查
  -h, --help           显示此帮助

示例:
  $(basename "$0")                      # 全部并行重启，site 走 prod 模式
  $(basename "$0") --site-dev           # 全部重启，site 走 dev 模式（本地调试）
  $(basename "$0") wiki admin           # 只重启 wiki 与 admin
  $(basename "$0") --no-build cloud-api # 仅重启 cloud-api，跳过预构建
  $(basename "$0") cloud-console        # 只重启云世界控制台
  $(basename "$0") site                 # 只重启官网 site-prod (5185, 仅本地访问)
  $(basename "$0") --site-dev site      # 只把官网切到 dev 模式
EOF
}

while (( $# > 0 )); do
  case "$1" in
    --no-build) DO_BUILD=0; shift ;;
    --site-dev) SITE_MODE=dev; shift ;;
    --skip-account-prep) SKIP_ACCOUNT_PREP=1; shift ;;
    -h|--help) usage; exit 0 ;;
    -*) echo "未知参数: $1" >&2; usage; exit 2 ;;
    cloud-api|app|wiki|admin|cloud-console|site) SERVICES+=("$1"); shift ;;
    *) echo "未知服务: $1" >&2; usage; exit 2 ;;
  esac
done

if (( ${#SERVICES[@]} == 0 )); then
  SERVICES=(cloud-api app wiki admin cloud-console site)
fi

want() {
  local t="$1" s
  for s in "${SERVICES[@]}"; do [[ "$s" == "$t" ]] && return 0; done
  return 1
}

# ---------- 0. 账号数据准备 ----------
if (( SKIP_ACCOUNT_PREP == 0 )); then
  if [ ! -f data/accounts/17757541197/database.sqlite ]; then
    if [ -f data/database.sqlite ]; then
      echo "[restart-app] 迁移老 data/database.sqlite -> data/accounts/17757541197/..."
      node scripts/migrate-account-data.mjs 17757541197
    else
      mkdir -p data/accounts/17757541197
    fi
  fi
fi

# ---------- 并行任务调度 ----------
LOG_DIR="logs/restart-app"
mkdir -p "$LOG_DIR"
TS=$(date +%Y%m%d-%H%M%S)
START_TIME=$SECONDS

JOB_NAMES=()
declare -A JOB_PID JOB_LOG JOB_CRITICAL

launch() {
  # launch <name> <critical:0|1> <cmd...>
  local name="$1" critical="$2"; shift 2
  local log="$LOG_DIR/${name}.${TS}.log"
  ( "$@" ) >"$log" 2>&1 &
  local pid=$!
  JOB_NAMES+=("$name")
  JOB_PID[$name]=$pid
  JOB_LOG[$name]=$log
  JOB_CRITICAL[$name]=$critical
  echo "[restart-app] ▶ $name (pid=$pid)"
}

# ---------- 任务定义 ----------
build_main_api() {
  cd api && pnpm exec nest build
}

restart_cloud_api() {
  node scripts/dev-services.mjs restart cloud-api
  node scripts/wait-for-service-ready.mjs cloud-api http://127.0.0.1:3001/ 60000 1000
  # cloud-api 起来后还要等它把 desiredState=running 的 per-account worker spawn 起来。
  # wiki/vite 的 /api 代理写死 127.0.0.1:3010，那是 LPP 第一个 worker。spawn 由
  # world-lifecycle-worker 在 cloud-api 起来后异步 tick 触发，通常滞后 cloud-api 自身
  # 就绪 60-120s。健康前任何对 /api 的请求都会 500，wiki 看起来"空白/请求失败"。
  node scripts/wait-for-service-ready.mjs lpp-3010 http://127.0.0.1:3010/health 180000 1500
}

restart_app_full() {
  node scripts/dev-services.mjs stop app
  # 脚本顶部只设了 set -uo pipefail，没有 -e，build 退出非零不会终止函数；
  # 但 build 产物 dist 是 nginx 静态服务的入口，build 失败 silent 吞掉会让
  # 公网/本地继续 serve 旧（可能损坏的）dist。这里显式失败让 critical job 报错。
  if ! pnpm --dir apps/app build; then
    echo "[restart-app] ❌ app build 失败，跳过后续 nginx/wait 步骤" >&2
    return 1
  fi
  node scripts/ensure-local-web-nginx.mjs
  node scripts/wait-for-service-ready.mjs web http://127.0.0.1:5180/healthz 30000 1000
}

restart_app_nobuild() {
  node scripts/ensure-local-web-nginx.mjs
  node scripts/wait-for-service-ready.mjs web http://127.0.0.1:5180/healthz 30000 1000
}

restart_wiki() {
  node scripts/dev-services.mjs restart wiki
  # vite 一启动就能 200 返回 index.html，所以原先只探 /，无法发现 /api 代理目标
  # （127.0.0.1:3010 的 per-account worker）尚未就绪。这里改成穿透代理探一个真实
  # 后端路由，确保整条 wiki UI → vite proxy → LPP worker 链路活着才算 ready。
  # 等到 LPP worker(3010) 起来才能 200，所以超时要给到 ≥ cloud-api 段的 180s + 余量。
  node scripts/wait-for-service-ready.mjs wiki http://127.0.0.1:5184/api/wiki/recent-changes 210000 1500
}

restart_admin() {
  node scripts/dev-services.mjs restart admin
  node scripts/wait-for-service-ready.mjs admin http://127.0.0.1:5181/ 30000 1000
  # vite 启动后 GET / 永远 200（SPA fallback 返回 index.html），无法发现 /api
  # 代理未配置 / main-api 未起这类问题，UI 表现为 "Failed to fetch"。
  # 这里直接穿透代理探一个真实 admin 路由：若 content-type 不是 JSON 就说明
  # vite proxy 没把 /api 转给 127.0.0.1:3000，提前报错。
  local probe ct
  probe=$(curl -fsS --max-time 5 \
    -o /dev/null \
    -H "X-Admin-Secret: ${ADMIN_SECRET:-yinjie-admin-dev-local}" \
    -w "%{content_type}" \
    "http://127.0.0.1:5181/api/admin/stats" 2>/dev/null) || {
      echo "[restart-app] ⚠ admin /api 代理探测失败（vite proxy 未生效或 main-api 不在 3000）" >&2
      return 1
    }
  ct="$probe"
  if [[ "$ct" != *"json"* ]]; then
    echo "[restart-app] ⚠ admin /api/admin/stats 返回 content-type=$ct，不是 JSON" >&2
    echo "[restart-app]   多半是 vite proxy 配置丢失，admin UI 会到处 'Failed to fetch'" >&2
    return 1
  fi
}

restart_cloud_console() {
  node scripts/dev-services.mjs restart cloud-console
  node scripts/wait-for-service-ready.mjs cloud-console http://127.0.0.1:5182/ 30000 1000
}

restart_site_prod() {
  # site (5185) 当前**没有公网入口** (HTTPS 隧道已改指 nginx 5180 → app)。
  # 仍用 site-prod (next build + next start) 是为了避免 dev 模式 5-10x 性能损耗，
  # 也保证 .next 是基于当前源码现拉的产物 — site-prod 的 prestart 会无条件
  # sync-assets → next build。
  # 与 site (next dev) 共用 5185 端口，启动前先确保 dev 端不在跑，避免抢端口失败。
  node scripts/dev-services.mjs stop site >/dev/null 2>&1 || true
  node scripts/dev-services.mjs restart site-prod
  # prestart 同步执行 next build (60-120s)，restart 返回时构建已完成、next start
  # 正在 spawn，60s 足够等到监听就绪。
  node scripts/wait-for-service-ready.mjs site http://127.0.0.1:5185/ 60000 1000
}

restart_site_dev() {
  # 本地开发模式：next dev，HMR 友好但运行时 5-10x 慢；仅供本地调试。
  # 与 site-prod 共用 5185 端口，先停掉 prod 端。
  node scripts/dev-services.mjs stop site-prod >/dev/null 2>&1 || true
  # 如果 .next 里残留 standalone / BUILD_ID / prerender-manifest 等 build 产物，
  # 会与 dev 运行时写入的 server/chunks 文件结构冲突，导致 webpack-runtime 找不到 chunk
  # （症状：访问任意 locale 路由 500，日志报 Cannot find module './933.js' 之类）。
  # 检测到污染就清掉。
  if [ -d apps/site/.next/standalone ] \
     || [ -f apps/site/.next/BUILD_ID ] \
     || [ -f apps/site/.next/prerender-manifest.json ]; then
    echo "[restart-app] apps/site/.next 含 build 产物残留，清理后重新启动 next dev"
    rm -rf apps/site/.next
  fi
  node scripts/dev-services.mjs restart site
  node scripts/wait-for-service-ready.mjs site http://127.0.0.1:5185/ 60000 1000
}

# ---------- 启动并行任务 ----------
# main-api 构建仅在需要 cloud-api 且未禁用构建时执行
# (per-account 子进程依赖 api/dist)
if want cloud-api && (( DO_BUILD == 1 )); then
  launch main-api-build 1 build_main_api
fi

if want cloud-api; then
  launch cloud-api 1 restart_cloud_api
fi

if want app; then
  if (( DO_BUILD == 1 )); then
    launch app 1 restart_app_full
  else
    launch app 1 restart_app_nobuild
  fi
fi

# wiki / admin / cloud-console / site 是 vite/next dev，失败不阻塞主链路
if want wiki;          then launch wiki          0 restart_wiki;          fi
if want admin;         then launch admin         0 restart_admin;         fi
if want cloud-console; then launch cloud-console 0 restart_cloud_console; fi
if want site; then
  if [[ "$SITE_MODE" == "dev" ]]; then
    launch site 0 restart_site_dev
  else
    launch site 0 restart_site_prod
  fi
fi

# ---------- 等待并汇总结果 ----------
FAILED=0
for name in "${JOB_NAMES[@]}"; do
  pid=${JOB_PID[$name]}
  if wait "$pid"; then
    echo "[restart-app] ✓ $name"
  else
    if [[ "${JOB_CRITICAL[$name]}" == "1" ]]; then
      echo "[restart-app] ✗ $name (关键步骤失败)"
      tail -n 40 "${JOB_LOG[$name]}" || true
      FAILED=1
    else
      echo "[restart-app] ⚠ $name 未就绪，跳过 (见 ${JOB_LOG[$name]})"
      tail -n 20 "${JOB_LOG[$name]}" || true
    fi
  fi
done

ELAPSED=$(( SECONDS - START_TIME ))

if (( FAILED != 0 )); then
  echo ""
  echo "[restart-app] ❌ 关键步骤失败，用时 ${ELAPSED}s"
  exit 1
fi

echo ""
echo "[restart-app] ✅ 完成 (用时 ${ELAPSED}s)"
echo ""
echo "服务地址："
want cloud-api     && echo "  Cloud API:      http://127.0.0.1:3001  (按手机号 spawn 独立 main-api 子进程)"
want app           && echo "  主 App:         http://127.0.0.1:5180  (公网入口: https://1gw06751dd053.vicp.fun/)"
want wiki          && echo "  Wiki 角色平台:  http://127.0.0.1:5184"
want admin         && echo "  管理后台:       http://127.0.0.1:5181"
want cloud-console && echo "  云世界控制台:   http://127.0.0.1:5182"
if want site; then
  if [[ "$SITE_MODE" == "dev" ]]; then
    echo "  官网 (dev):     http://127.0.0.1:5185  (next dev, 仅本地访问)"
  else
    echo "  官网 (prod):    http://127.0.0.1:5185  (next start, 仅本地访问)"
  fi
fi
echo ""
echo "日志: $LOG_DIR/*.${TS}.log    每账号子进程: logs/dev-services/api-{phone}.{out,err}.log"
