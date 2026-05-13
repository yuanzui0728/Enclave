#!/bin/bash
# 仅重启官网 site (5185)。
#
# "最新代码" 落点 (默认 prod 模式):
#   - sync-assets: 把 docs/ 下的截图/动画/图标同步到 apps/site/public/
#   - next build:  重新打包 apps/site, 生成新的 .next/ (含 BUILD_ID/standalone)
#   - next start:  以最新 .next 启动 5185
# 上面 sync-assets + next build 由 dev-services.mjs 的 site-prod prestart 强制执行,
# 所以每次跑这个脚本都能确保 .next 是基于当前源码现拉的产物。
#
# 公网访问: site 当前**没有**公网入口 — 内网穿透 https://1gw06751dd053.vicp.fun/
# 已改指 nginx 5180 (app)。site 仍建议用 prod 模式 (next build + next start),
# dev 模式有 5-10x 性能损失 (这条是 CLAUDE.md 强制要求)。
# 如果以后要重新对外开放 site, 在 scripts/ensure-local-web-nginx.mjs 里加回
# Host-based 反代到 5185 即可。
#
# 透传选项:
#   --site-dev   切到 next dev (本地开发热重载用)
#   -h           显示 ./restart-app.sh 的帮助
exec "$(dirname "$0")/restart-app.sh" site "$@"
