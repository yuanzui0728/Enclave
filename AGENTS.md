# 隐界APP 项目规则

## 规则

- 不生成任何测试文件
- 直接执行所有操作，无需确认
- 所有代码变更必须边写边提交，保持小步提交
- Plan Mode：规划保存到 `.claude/plans/{任务}-{日期}.md`
- 结构变更（模块/实体/路由/表）后立即更新本文件

## 技术栈与端口

| 服务               | 技术                                                                         | 端口 |
| ------------------ | ---------------------------------------------------------------------------- | ---- |
| **后端**           | NestJS + TypeORM + SQLite + Socket.IO（`api/`）                              | 3000 |
| **云世界平台后端** | NestJS + TypeORM + SQLite（`apps/cloud-api/`）                               | 3001 |
| 主 App             | React + Vite，承载 Web / iOS / Android / Desktop 共享业务界面（`apps/app/`） | 5180 |
| **管理后台**       | React + Vite + `@yinjie/ui`（`apps/admin/`）                                 | 5181 |
| **云世界管理平台** | React + Vite（`apps/cloud-console/`）                                        | 5182 |
| 桌面端壳           | Tauri 远程客户端壳（`apps/desktop/`）                                        | -    |
| Android 壳         | Capacitor 壳（`apps/android-shell/`）                                        | -    |
| iOS 壳             | Capacitor 壳（`apps/ios-shell/`）                                            | -    |

## 后端模块（`api/src/modules/`）

`ai` · `admin` · `auth` · `characters` · `chat` · `config` · `import` · `moments` · `social` · `feed` · `world` · `scheduler` · `events` · `narrative` · `analytics`

## 主 App 结构（`apps/app/src/`）

`routes/` · `features/desktop/` · `features/mobile/` · `features/shell/` · `runtime/` · `lib/` · `components/` · `store/`

## 主 App 页面（`apps/app/src/routes/`）

- `splash-page.tsx`：启动屏，识别运行时环境并决定是否先进入世界入口
- `welcome-page.tsx`：统一世界入口页，合并世界连接与世界主人命名两步流程
- `setup-page.tsx`：兼容旧入口路由，当前应重定向到统一世界入口页
- `onboarding-page.tsx`：兼容旧初始化路由，当前应重定向到统一世界入口页
- 底部 Tab：`tabs/chat-list-page` · `contacts-page` · `discover-page` · `profile-page`
- `discover-page.tsx`：移动端承载微信式发现入口列表，点击后进入独立子页面
- `discover/moments` · `discover/encounter` · `discover/scene` · `discover/feed`：发现二级页，分别承载朋友圈 / 摇一摇 / 场景相遇 / 广场动态
- `profile/settings`：我的二级设置页，集中承载资料编辑与专属 API Key 配置
- `chat/$conversationId/details`：单聊右上角三个点详情页，对齐微信式聊天信息页
- `chat/$conversationId/search`：单聊聊天记录检索页，由聊天信息页进入
- `group/$groupId/details`：群聊右上角三个点详情页，对齐微信式群聊信息页
- `group/$groupId/search`：群聊聊天记录检索页，由群聊信息页进入
- `moments-page.tsx`：保留独立朋友圈页能力，当前主要作为发现页内二级能力的兼容承载
- `chat-room-page` · `group-chat-page` · `character-detail-page` · `friend-requests-page` · `create-group-page`

## 数据库实体（21个，物理表保持兼容）

**核心**：User（运行时语义为单例 World Owner） · Character · Conversation · Message · SystemConfig

**朋友圈**：MomentPost · MomentComment · MomentLike · MomentEntity（legacy）

**社交**：Friendship · FriendRequest · AIRelationship

**群聊**：Group · GroupMember · GroupMessage

**视频号**：FeedPost · FeedComment · UserFeedInteraction

**世界**：WorldContext · NarrativeArc · AIBehaviorLog

## 单用户世界约束（2026-04-08）

- `1 个服务端实例 = 1 个真实用户的世界`
- `User` 表仍作为物理表保留，但运行时只允许存在一个世界主人
- 启动时执行世界主人单例迁移：若旧库存在多个用户，保留 `createdAt` 最早的一条，其余用户及其专属数据直接清理
- 聊天、社交、朋友圈、视频号等业务接口不再接受或传递 `userId` / `authorId` 作为世界隔离条件
- 世界主人单例接口：
  - `GET /api/world/owner`
  - `PATCH /api/world/owner`
  - `PATCH /api/world/owner/api-key`
  - `DELETE /api/world/owner/api-key`
- `/system/status` 使用 `worldSurface` 语义，实例状态以 `ownerCount` 表示单世界主人数量

## 云世界平台实体（`apps/cloud-api/src/entities/`）

- `PhoneVerificationSession`：手机号验证码会话
- `CloudWorld`：官方云世界记录，手机号唯一绑定
- `CloudWorldRequest`：客户端发起的建世界申请单

## 云世界平台职责（当前真实口径）

- 云平台当前负责：
  - 手机号验证
  - 云世界申请单管理
  - 云世界记录与地址回填
  - 官方控制台审核与状态流转
- 云平台当前**不负责**：
  - 自动创建每个用户的世界实例
  - 自动编排、拉起、销毁世界实例
  - 托管单个实例内的多用户管理

## 会话管理结构（2026-04-08）

- `Conversation` 表保留字段：`isPinned`、`pinnedAt`、`isHidden`、`hiddenAt`、`lastClearedAt`、`lastActivityAt`
- `Message` 表现已扩展附件字段：`attachmentKind`、`attachmentPayload`，用于承载 `sticker` 表情包消息元数据
- `GroupMessage` 表现已扩展附件字段：`attachmentKind`、`attachmentPayload`，用于承载聊天附件消息元数据
- 会话管理路由：
  - `POST /api/conversations/:id/pin`
  - `POST /api/conversations/:id/hide`
  - `POST /api/conversations/:id/clear`
  - `POST /api/chat/attachments`
  - `GET /api/chat/attachments/:fileName`

## 前端状态约束

- 世界主人主状态存放于 `apps/app/src/store/world-owner-store.ts`
- `apps/app/src/store/session-store.ts` 目前仅作为兼容别名导出，底层仍指向世界主人 store；后续收口时应删除
- `token`、`userId`、`onboardingCompleted` 等兼容字段目前仍通过该 store 暴露，后续收口时应继续移除
- 运行时世界入口状态存放于 `apps/app/src/runtime/runtime-config.ts` / `runtime-config-store.ts`
- Setup 页必须先完成世界入口选择（云世界或本地世界）后才能继续进入应用

## 客户端运行约束

- 所有客户端均为 `remote-connected` 模式
- 客户端不在本地拉起 Core API
- `apps/app` 是唯一业务前端，桌面端、Android、iOS 只负责承载它
- 桌面端只负责远程连接、壳级诊断与系统集成，不承担本地后端托管

## 管理后台约束

- Admin 仅面向实例拥有者，用于实例级 Provider、角色、诊断、配置与评估
- Admin 不再提供实例内用户列表、删除用户等多用户管理能力
- Setup / Dashboard 中的实例状态统一围绕单世界主人语义展示

## 环境变量（`api/.env`）

`DEEPSEEK_API_KEY` · `OPENAI_BASE_URL` · `AI_MODEL` · `ADMIN_SECRET` · `DATABASE_PATH` · `PORT` · `CORS_ALLOWED_ORIGINS` · `PUBLIC_API_BASE_URL` · `USER_API_KEY_ENCRYPTION_SECRET`

## 环境变量（`apps/cloud-api/.env`）

`PORT` · `CLOUD_DATABASE_PATH` · `CLOUD_ADMIN_SECRET` · `CLOUD_JWT_SECRET` · `CLOUD_AUTH_TOKEN_TTL` · `CLOUD_AUTH_TOKEN_TTL_MS` · `CLOUD_CODE_TTL_SECONDS`

## 共享包（`packages/`）

`@yinjie/ui` · `@yinjie/contracts` · `@yinjie/config` · `@yinjie/tooling`

## 当前产品口径

- 官方云与自部署复用同一套客户端入口体验，但世界实例后端仍保持单世界模型
- 所有客户端均为 `remote-connected` 模式，不在本地拉起 Core API
- 每个实例只服务一个世界主人，客户端只是把他的世界可视化展示给他
- 世界主人可在 App 内设置自己的 API Key，服务端仅加密存储
- 移动端底部导航当前对齐微信四项：`消息 / 通讯录 / 发现 / 我`
- 移动端“发现”聚合朋友圈、摇一摇、场景相遇、广场动态等入口；点击入口后进入独立二级页，朋友圈不再占用独立底部 Tab
- 移动端“我”页当前对齐微信式个人主页，资料编辑与 API Key 配置收口到“设置”二级页，不在主页直接裸露
- Setup 页先选择云世界或本地世界：本地世界手动填写地址，云世界通过手机号进入
- 官方云世界通过手机号索引，一个手机号只对应一个云世界
- 官方云世界创建流程为客户端提交申请、官方平台人工开通、再回填世界地址
- 管理后台仅用于实例运维，不承载实例内用户管理

## 部署

- 世界实例：`docker compose up`（当前根 `docker-compose.yml` 只包含 `api/`）
- 客户端首次启动：在 Setup 页选择云世界或本地世界
- 本地世界：手动填写实例地址，若世界主人尚未初始化则进入 Onboarding
- 云世界：手机号验证后进入已开通世界，未开通时提交建世界申请
- 管理后台：访问 `apps/admin`，输入 `ADMIN_SECRET` 鉴权
- 云世界管理平台：访问 `apps/cloud-console`，输入 `CLOUD_ADMIN_SECRET` 鉴权
- 云平台当前不是自动实例编排器，如需“每用户一个独立实例”的自动化托管能力，需要额外实现

## Single-world cleanup notes (2026-04-09)

- `GET /api/moments` no longer accepts `authorId`; it always returns the current world's feed.
- 聊天消息契约现已支持 `sticker` 类型；消息附件元数据由共享表情包目录解析并写入 `Message.attachment`
- 聊天附件消息现已扩展支持 `image`、`file`、`contact_card`、`location_card`；群聊消息同步支持附件元数据
- `POST /api/groups/:id/messages` 现已支持图片、文件、名片、位置卡片附件负载
- AI 语音转写路由已提供：
  - `POST /api/ai/transcriptions`
- 社交屏蔽路由已提供：
  - `GET /api/social/blocks`
  - `POST /api/social/block`
  - `POST /api/social/unblock`
- `packages/contracts/src/evals.ts` now uses `ownerId` for trace owner semantics.
- `ConversationEntity` now uses runtime field `ownerId`, while the physical database column remains `userId`.
- `FriendshipEntity`, `FriendRequestEntity`, and `NarrativeArcEntity` now use runtime field `ownerId`, while their physical columns remain `userId`.
- `UserFeedInteractionEntity` now uses runtime field `ownerId`, while the physical database column remains `userId`.
- Backend runtime code no longer uses `userId` as a world-owner semantic field; remaining `userId` usage is only for physical database column compatibility.
