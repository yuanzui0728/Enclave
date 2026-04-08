# 隐界APP 项目规则

## 规则
- 不生成任何测试文件
- 直接执行所有操作，无需确认
- 所有代码变更必须边写边提交，保持小步提交
- Plan Mode：规划保存到 `.claude/plans/{任务}-{日期}.md`
- 结构变更（模块/实体/路由/表）后立即更新本文件

## 技术栈与端口
| 服务 | 技术 | 端口 |
|------|------|------|
| **后端** | NestJS + TypeORM + SQLite + Socket.IO（`api/`） | 3000 |
| **云世界平台后端** | NestJS + TypeORM + SQLite（`apps/cloud-api/`） | 3001 |
| 主 App | React + Vite，iOS / Android / Web（`apps/app/`） | 5180 |
| **管理后台** | React + Vite + `@yinjie/ui`（`apps/admin/`） | 5181 |
| **云世界管理平台** | React + Vite（`apps/cloud-console/`） | 5182 |
| 桌面端 | Tauri 壳，远程连接后端（`apps/desktop/`） | - |
| Android | Capacitor 壳（`apps/android-shell/`） | - |
| iOS | Capacitor 壳（`apps/ios-shell/`） | - |

## 后端模块（`api/src/modules/`）
`ai` · `admin` · `auth` · `characters` · `chat` · `config` · `import` · `moments` · `social` · `feed` · `world` · `scheduler` · `events` · `narrative` · `analytics`

## 主 App 结构（`apps/app/src/`）
`routes/` · `features/desktop/` · `features/mobile/` · `features/shell/` · `runtime/` · `lib/` · `components/` · `store/`

## 主 App 页面（`apps/app/src/routes/`）
- `splash-page.tsx`：启动屏，识别运行时环境
- `setup-page.tsx`：世界入口，支持云世界与本地世界选择
- `onboarding-page.tsx`：叙事入场流程
- `login-page.tsx`：传统登录
- `tabs/chat-list-page` · `moments-page` · `contacts-page` · `discover-page` · `profile-page`

## 数据库实体（21个）
**核心**：User · Character · Conversation · Message · SystemConfig

**朋友圈**：MomentPost · MomentComment · MomentLike · MomentEntity（legacy）

**社交**：Friendship · FriendRequest · AIRelationship

**群聊**：Group · GroupMember · GroupMessage

**视频号**：FeedPost · FeedComment · UserFeedInteraction

**世界**：WorldContext · NarrativeArc · AIBehaviorLog

## 云世界平台实体（`apps/cloud-api/src/entities/`）
- `PhoneVerificationSession`：手机号验证码会话
- `CloudWorld`：官方云世界记录，手机号唯一绑定
- `CloudWorldRequest`：客户端发起的建世界申请单

## 会话管理结构（2026-04-08）
- `Conversation` 表新增字段：`isPinned`、`pinnedAt`、`isHidden`、`hiddenAt`、`lastClearedAt`、`lastActivityAt`
- 新增会话管理路由：`POST /api/conversations/:id/pin`、`POST /api/conversations/:id/hide`、`POST /api/conversations/:id/clear`

## 环境变量（`api/.env`）
`DEEPSEEK_API_KEY` · `OPENAI_BASE_URL` · `AI_MODEL` · `JWT_SECRET` · `ADMIN_SECRET` · `DATABASE_PATH` · `PORT` · `CORS_ALLOWED_ORIGINS` · `PUBLIC_API_BASE_URL` · `USER_API_KEY_ENCRYPTION_SECRET`

## 环境变量（`apps/cloud-api/.env`）
`PORT` · `CLOUD_DATABASE_PATH` · `CLOUD_ADMIN_SECRET` · `CLOUD_JWT_SECRET` · `CLOUD_AUTH_TOKEN_TTL` · `CLOUD_AUTH_TOKEN_TTL_MS` · `CLOUD_CODE_TTL_SECONDS`

## 共享包（`packages/`）
`@yinjie/ui` · `@yinjie/contracts` · `@yinjie/config` · `@yinjie/tooling`

## 当前产品口径
- 世界实例后端继续保持单世界模型；官方云世界运营能力独立放在 `apps/cloud-api`
- 所有客户端均为 `remote-connected` 模式，不在本地拉起 Core API
- 用户可在 App 内设置自己的 API Key，服务端仅加密存储
- 管理后台仅面向实例拥有者，用于实例级 Provider 与系统诊断
- 官方云世界通过手机号索引，一个手机号只对应一个云世界
- 官方云世界创建流程为客户端提交申请、官方平台人工开通、再回填世界地址

## 部署
- 云端：`docker compose up`（`api/` + SQLite 数据卷）
- 客户端首次启动：在 Setup 页选择云世界或本地世界；本地世界手动填地址，云世界通过手机号进入
- 管理后台：访问 `apps/admin`，输入 `ADMIN_SECRET` 鉴权
- 云世界管理平台：访问 `apps/cloud-console`，输入 `CLOUD_ADMIN_SECRET` 鉴权
