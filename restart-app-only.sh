#!/bin/bash
# 仅重启主 App 前端 (5180)。脚本名加 -only 是为了和编排脚本 restart-app.sh 区分。
#
# "最新代码" 落点:
#   - apps/app: pnpm --dir apps/app build → apps/app/dist
#   - nginx (端口 5180): ensure-local-web-nginx.mjs 用最新 dist 重载配置
#
# 公网访问: 两条花生壳隧道现在都指向 nginx 5180:
#   HTTPS https://1gw06751dd053.vicp.fun/         → 127.0.0.1:5180
#   HTTP  http://1gw06751dd053.vicp.fun:29490     → 127.0.0.1:5180
# 本地 5180 一换 dist, 两条公网入口同步生效。
#
# 透传选项: --no-build (跳过 vite build, 只重载 nginx; 此时 dist 是上次的)
exec "$(dirname "$0")/restart-app.sh" app "$@"
