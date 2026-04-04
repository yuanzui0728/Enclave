# 隐界APP 项目规则

## 规则

- 不生成任何测试文件
- 直接执行所有操作，无需确认
- Plan Mode：规划保存到 `.Codex/plans/{任务}-{日期}.md`
- 结构变更（模块/实体/路由/表）后立即更新本文件

## 当前架构状态

项目正在从原始 Demo 结构迁移到生产级单用户自部署架构。

### 新结构（生产级重构进行中）

- `apps/app/`：新主产品前端，桌面内嵌 WebView 使用
- `apps/admin/`：新本地后台前端，由本地服务托管或浏览器访问
- `apps/desktop/`：Tauri 2 桌面壳
- `crates/core-api/`：Rust Core API
- `crates/core-api/src/persistence.rs`：运行态 snapshot 持久化与备份恢复
- `crates/core-api/src/runtime_paths.rs`：runtime/logs/diagnostics 路径与本地操作日志
- `crates/core-api/src/generation.rs`：gateway 优先、占位文案回退的内容生成辅助层
- `crates/inference-gateway/`：Rust 推理网关，已具备 provider 配置 / 探活 / 队列指标运行时
- `packages/contracts/`：共享接口契约与 typed client
- `packages/config/`：共享配置 schema
- `packages/ui/`：共享设计系统与基础组件
- `packages/tooling/`：共享工程配置

### 旧结构（保留作为行为基线）

- `api/`：旧 NestJS 后端，当前仍是业务行为对照基线
- `web/`：旧 H5 主前端
- `admin/`：旧管理后台
- `mobile/`：冻结，不继续演进

## 技术栈与端口

| 服务 | 技术 | 端口 / 运行方式 |
|------|------|------|
| 桌面壳 | Tauri 2 + Rust | 桌面应用 |
| Core API | Rust + Axum + Tokio + SQLite(WAL 规划) | 默认 `39091` |
| 推理网关 | Rust（独立 crate） | 内嵌 / 同进程规划 |
| 主产品前端 | React 19 + Vite + TanStack Router + Query + Tailwind 4 | `5180` |
| 本地后台 | React 19 + Vite + typed schema 表单 | `5181` |
| 旧后端 | NestJS + TypeORM + SQLite + Socket.IO | `3000` |
| 旧前端 | React + Vite H5（`web/`） | `5174` |
| 旧后台 | React + Vite + Ant Design（`admin/`） | `5173` |

## 新 Core API 路由状态

### 系统接口

- `GET /health`
- `GET /system/status`
- `GET /system/realtime`
- `GET /system/provider`
- `PUT /system/provider`
- `POST /system/provider/test`
- `POST /system/inference/preview`
- `GET /system/scheduler`
- `POST /system/scheduler/run/:id`
- `GET /system/logs`
- `POST /system/diag/export`
- `POST /system/backup/create`
- `POST /system/backup/restore`

### 实时接口

- Socket.IO namespace `/chat`
- Socket path `/socket.io`

### 已迁移的兼容接口切片

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/init`
- `PATCH /api/auth/users/:id/onboarding-complete`
- `PATCH /api/auth/users/:id`
- `GET /api/config/ai-model`
- `PUT /api/config/ai-model`
- `GET /api/config/available-models`
- `GET /api/world/context`
- `GET /api/social/friend-requests`
- `POST /api/social/friend-requests/send`
- `POST /api/social/friend-requests/:id/accept`
- `POST /api/social/friend-requests/:id/decline`
- `GET /api/social/friends`
- `POST /api/social/shake`
- `POST /api/social/trigger-scene`
- `GET /api/conversations`
- `POST /api/conversations`
- `GET /api/conversations/:id/messages`
- `POST /api/conversations/:id/read`
- `POST /api/groups`
- `GET /api/groups/:id`
- `GET /api/groups/:id/members`
- `POST /api/groups/:id/members`
- `GET /api/groups/:id/messages`
- `POST /api/groups/:id/messages`
- `GET /api/characters`
- `GET /api/characters/:id`
- `POST /api/characters`
- `PATCH /api/characters/:id`
- `DELETE /api/characters/:id`
- `GET /api/moments`
- `POST /api/moments/user-post`
- `GET /api/moments/:id`
- `POST /api/moments/generate/:characterId`
- `POST /api/moments/generate-all`
- `POST /api/moments/:id/comment`
- `POST /api/moments/:id/like`
- `GET /api/feed`
- `GET /api/feed/:id`
- `POST /api/feed`
- `POST /api/feed/:id/comment`
- `POST /api/feed/:id/like`

## 共享契约状态（packages/contracts）

已建立 typed contracts：

- `system`
- `world`
- `social`
- `chat`
- `moments`
- `feed`
- `auth`
- `config`
- `characters`
- `ws`

当前 `/chat` 已有真实运行时：

- `join_conversation`
- `send_message`
- `new_message`
- `typing_start`
- `typing_stop`
- `conversation_updated`

当前 scheduler 主动消息已接入 `/chat`：

- scheduler 会把 proactive message 通过内部 realtime bus 推送为 `new_message`
- `/system/realtime` 会记录对应 internal realtime event

当前 Core API 已有本地运行态持久化：

- runtime 与 scheduler 状态会落盘到 `*.runtime.json`
- 进程重启会优先从 snapshot 恢复
- `/system/backup/create` 与 `/system/backup/restore` 已接到真实 snapshot 备份恢复

当前系统运维导出已真实落地：

- `/system/logs` 返回真实 runtime log 路径
- `/system/diag/export` 会导出 diagnostics 目录，包含 status / realtime / scheduler / snapshot / logs / recent backups
- `runtime-data/logs/core-api.log` 已有本地操作日志兜底

当前 inference gateway 已有真实 provider runtime：

- `/system/provider` 可读取与保存当前 provider 配置
- `/system/provider/test` 会通过真实 HTTP 探活更新队列指标
- `/system/inference/preview` 可通过 active provider 发送真实 `chat/completions` 预览请求
- `/system/status` 会返回 active provider、队列并发、成功/失败次数、最近成功时间与最近错误
- `/api/config/ai-model` 与 provider.model 已保持联动并随 snapshot 持久化恢复

当前内容生成链已开始接入 inference gateway：

- `POST /api/moments/generate/:characterId`
- `POST /api/moments/generate-all`
- scheduler `check-moment-schedule`
- scheduler `process-pending-feed-reactions`
- scheduler `trigger-memory-proactive-messages`

以上链路会在 provider 可用时走 gateway 生成，在 provider 缺失或失败时回退到当前占位文案，保证业务语义和触发条件不变

当前 scheduler 已有真实执行切片：

- world context 更新
- friend request 过期
- AI 在线状态刷新
- character activity 刷新
- moments 调度
- scene friend request 触发
- feed 待处理互动
- memory proactive messages

## 业务兼容要求（迁移期间保持）

以下接口语义必须保持不变：

- `/api/auth/*`
- `/api/characters/*`
- `/api/conversations/*`
- `/api/groups/*`
- `/api/moments/*`
- `/api/feed/*`
- `/api/social/*`
- `/api/config/*`
- `/api/world/*`
- WebSocket namespace `/chat`

## 旧后端模块（业务基线）

`ai` · `auth` · `characters` · `chat` · `config` · `import` · `moments` · `social` · `feed` · `world` · `scheduler` · `events` · `narrative` · `analytics`

## 旧前端页面（业务基线）

- `Onboarding.tsx`：5 幕叙事入场流程
- `Login.tsx`：传统登录
- `FriendRequests.tsx`：好友申请列表
- `tabs/ChatList`
- `tabs/Moments`
- `tabs/Contacts`
- `tabs/Discover`
- `tabs/Profile`

## 数据库实体基线（21 个）

核心：
`User` · `Character` · `Conversation` · `Message` · `SystemConfig`

朋友圈：
`MomentPost` · `MomentComment` · `MomentLike` · `MomentEntity(legacy)`

社交：
`Friendship` · `FriendRequest` · `AIRelationship`

群聊：
`Group` · `GroupMember` · `GroupMessage`

发现页：
`FeedPost` · `FeedComment` · `UserFeedInteraction`

世界：
`WorldContext` · `NarrativeArc` · `AIBehaviorLog`

## 环境与配置

### 旧后端环境变量（仍在使用）

- `DEEPSEEK_API_KEY`
- `OPENAI_BASE_URL`
- `JWT_SECRET`

### 新架构配置方向

- API Key 目标迁移到系统 keychain / keyring
- 运行配置进入本地 app data 目录
- SQLite 文件迁移到桌面运行时数据目录
## Current Migration Notes

- Realtime `/chat` replies now have a gateway-backed execution path in `crates/core-api/src/realtime.rs`.
- Chat reply prompt assembly lives in `crates/core-api/src/generation.rs` and uses recent message history, character memory, current activity, and optional world context.
- The realtime execution path now snapshots runtime state before inference so gateway waits do not hold the runtime write lock.
- Fallback placeholder replies are still preserved when the provider is unavailable or the gateway call fails.
- Social first-contact greetings in `/api/social/shake` and `/api/social/trigger-scene` now also use the gateway-backed generation layer with fallback copy preserved.
- Scheduler `trigger-scene-friend-requests` now reuses the same gateway-backed social greeting generation path before persisting pending friend requests.
- Realtime conversation turns now refresh character memory summaries every 10 messages through the gateway and persist both `profile.memorySummary` and `profile.memory.recentSummary`.
- Direct `/chat` conversations can now classify cross-domain intent and upgrade themselves into temporary group consultations with coordinator copy, system join messages, and invited character replies generated through the gateway-backed runtime.
- `POST /api/groups/:id/messages` now restores async group-member reply parity: user turns can trigger delayed character replies through the gateway-backed chat generation path, with activity-frequency gating and persisted group message history.
- Runtime state now carries `ai_behavior_logs` and `narrative_arcs` compatibility records, and `/system/status.legacySurface` exposes their live counts for migration tracking.
- Accepted friend requests now ensure a narrative arc, while scene-triggered requests, generated moments, scheduler feed reactions, and async group replies append AI behavior logs without changing business responses.
