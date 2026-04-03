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
- `crates/inference-gateway/`：Rust 推理网关骨架
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
- `POST /system/provider/test`
- `GET /system/scheduler`
- `GET /system/logs`
- `POST /system/diag/export`
- `POST /system/backup/create`
- `POST /system/backup/restore`

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
