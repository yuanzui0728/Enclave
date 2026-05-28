#!/usr/bin/env bash
# 重启 shared-world —— 多租户 world 核心进程 (:4100)。
# ⚠️ 这是全体真实用户共用的单进程，重启会短暂中断所有线上用户。低峰执行。
#
# 形态: MAIN_MODE=shared-world 的 node 进程，直起 api/dist/main-shared-world.js，
#       服务共享库 data/shared-world/database.sqlite（按 x-cloud-user-phone 分租户）。
# 最新代码: 默认先 `cd api && pnpm build`；传 --no-build 跳过（用现有 dist）。
set -uo pipefail
cd "$(dirname "$0")"
source ./restart-lib.sh

echo "▶ restart shared-world (:4100)  ⚠️ 影响全体线上用户"
if [[ "${1:-}" != "--no-build" ]]; then
  echo "  [api] 构建 (pnpm build)..."
  ( cd "$ROOT_DIR/api" && pnpm build ) || { echo "❌ api 构建失败" >&2; exit 1; }
fi

# 起新 dist 前先补 schema：shared-world synchronize:false，新实体列/表不会自动建出，
# 漏跑迁移就 `no such column` 全员崩（2026-05-28 isPaid 事故）。runner 幂等、排除
# 2026-mt-* cutover、按 _schema_migrations ledger 跳过已应用，失败即中止重启。
# 与 --no-build 无关（schema 跟代码 build 解耦），故放在 build 块之外、stop_port 之前。
echo "  [api] 跑启动前幂等 schema 迁移..."
node "$ROOT_DIR/api/scripts/run-shared-world-migrations.mjs" \
  "$ROOT_DIR/data/shared-world/database.sqlite" \
  || { echo "❌ 迁移失败，中止重启（不拿半迁移 schema 起新码）" >&2; exit 1; }

stop_port 4100 shared-world || exit 1
start_bg shared-world "cd '$ROOT_DIR/api' && MAIN_MODE=shared-world SHARED_WORLD_PORT=4100 SHARED_WORLD_HOST=127.0.0.1 DATABASE_PATH='$ROOT_DIR/data/shared-world/database.sqlite' YINJIE_DATA_ROOT='$ROOT_DIR/data/shared-world' exec node dist/main-shared-world.js"
wait_health shared-world http://127.0.0.1:4100/health 120 200
write_state shared-world 4100
