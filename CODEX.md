# 隐界APP Codex 协作说明

`AGENTS.md` 是本仓库的唯一项目规则与结构事实源。Codex 在本仓库执行任务时，默认先读取并严格遵循 `AGENTS.md`；若本文件与 `AGENTS.md` 冲突，以 `AGENTS.md` 为准。

本文件只保留 Codex 视角下的快速入口，避免把完整项目手册复制成第二份并继续漂移。

## Codex 快速入口

- 当前仓库是 monorepo，核心目录：
  - `api/`：主后端，NestJS + TypeORM + SQLite + Socket.IO，端口 `3000`
  - `apps/cloud-api/`：云世界平台后端，端口 `3001`
  - `apps/app/`：主 App，React + Vite，端口 `5180`
  - `apps/admin/`：管理后台，React + Vite + `@yinjie/ui`，端口 `5181`
  - `apps/cloud-console/`：云世界管理平台，端口 `5182`
  - `apps/wechat-connector/`：微信同步本地连接器，端口 `17364`
- 主 App 路由集中在 `apps/app/src/routes/`
- 后端模块集中在 `api/src/modules/`
- 当前项目采用单世界主人约束：`1 个服务端实例 = 1 个真实用户的世界`
- 所有客户端均为 `remote-connected` 模式，客户端不在本地拉起 Core API
- Admin 只面向实例拥有者，不承担实例内多用户管理

## Codex 执行约定

- 直接执行所有操作，无需确认
- 功能开发后必须做简单测试，至少执行一次与改动直接相关的最小验证；非必要不新增测试文件
- 所有代码变更采用阶段性提交，不必边写边提交，但至少每次执行完任务后自动提交一次
- Plan Mode：规划保存到 `.Codex/plans/{任务}-{日期}.md`
- 结构变更（模块 / 实体 / 路由 / 表）后立即更新 `AGENTS.md`
- 不覆盖、回滚或清理用户已有的未提交改动，除非任务明确要求
- 若工作区本身已存在未提交改动，只提交本次任务相关文件，不顺手回滚其他文件

## 文档维护边界

- 项目结构、页面清单、数据库实体、接口路由、环境变量、运行约束：全部以 `AGENTS.md` 当前内容为准
- 如需写规划文档，放入 `.Codex/plans/`
- 如需补充 Codex 专属协作说明，优先追加到本文件
- 如涉及项目事实变更，先更新 `AGENTS.md`，再按需同步本文件
