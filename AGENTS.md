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

`ai` · `admin` · `auth` · `characters` · `chat` · `config` · `import` · `moments` · `social` · `moderation` · `feed` · `official-accounts` · `world` · `scheduler` · `events` · `narrative` · `analytics`

## 主 App 结构（`apps/app/src/`）

`routes/` · `features/desktop/` · `features/mobile/` · `features/games/` · `features/shell/` · `runtime/` · `lib/` · `components/` · `store/`

## 主 App 页面（`apps/app/src/routes/`）

- `splash-page.tsx`：启动屏，识别运行时环境并决定是否先进入世界入口
- `welcome-page.tsx`：统一世界入口页，合并世界连接与世界主人命名两步流程
- `setup-page.tsx`：兼容旧入口路由，当前应重定向到统一世界入口页
- `onboarding-page.tsx`：兼容旧初始化路由，当前应重定向到统一世界入口页
- 底部 Tab：`tabs/chat-list-page` · `contacts-page` · `discover-page` · `profile-page`
- 桌面端一级 Tab：`tabs/chat` · `tabs/contacts` · `tabs/favorites` · `tabs/moments` · `tabs/feed` · `tabs/channels` · `tabs/search` · `tabs/games` · `tabs/mini-programs`
- `discover-page.tsx`：移动端承载微信式发现入口列表，点击后进入独立子页面
- `discover/moments` · `discover/encounter` · `discover/scene` · `discover/feed` · `discover/channels` · `discover/games` · `discover/mini-programs`：发现二级页，分别承载朋友圈 / 摇一摇 / 场景相遇 / 广场动态 / 视频号 / 游戏中心 / 小程序
- `favorites-page.tsx`：桌面端收藏工作区入口，后续承接跨聊天与内容流收藏
- `feed-page.tsx`：桌面端广场动态一级入口，承载居民公开动态流
- `channels-page.tsx`：桌面端视频号一级入口，后续承接短视频与直播内容流
- `search-page.tsx`：桌面端搜一搜一级入口，后续承接全局聚合搜索
- `games-page.tsx`：桌面端游戏中心一级入口；移动端复用为发现页内“游戏”二级页
- `mini-programs-page.tsx`：桌面端小程序面板一级入口；移动端复用为发现页内“小程序”二级页
- `starred-friends-page.tsx`：星标朋友页，移动端承载通讯录内“星标朋友”入口，桌面端承载双栏星标好友工作区
- `world-characters-page.tsx`：世界角色列表页，移动端承载通讯录内“世界角色”入口，独立展示尚未成为朋友的世界角色
- `group-contacts-page.tsx`：群聊列表页，移动端承载通讯录内“群聊”入口，桌面端承载已保存群聊工作区
- `tags-page.tsx`：联系人标签页，移动端承载通讯录内“标签”入口，桌面端承载标签分组与联系人详情工作区
- `official-accounts-page.tsx`：公众号列表页，移动端承载通讯录内“公众号”入口，桌面端承载公众号工作区路由入口
- `official-account-detail-page.tsx`：公众号主页，承载账号资料、关注状态与最近文章列表
- `official-account-article-page.tsx`：公众号文章详情页，移动端承载独立阅读页，桌面端复用工作区阅读面板
- `official-account-service-page.tsx`：服务号消息页，移动端承载服务号独立消息线程，桌面端复用消息工作区右侧服务号面板
- `subscription-inbox-page.tsx`：订阅号消息页，移动端承载“消息 -> 订阅号消息”聚合流，桌面端承载消息工作区内的订阅号阅读面板
- `profile/settings`：我的二级设置页，集中承载资料编辑与专属 API Key 配置
- `desktop/mobile`：桌面端底部“手机”入口承接页，后续承接设备联动能力
- `desktop/chat-files`：桌面端“聊天文件”页，承接会话附件聚合浏览
- `desktop/chat-history`：桌面端“聊天记录管理”页，承接会话记录查看与管理
- `desktop/chat-image-viewer`：桌面端图片独立窗口路由，承接聊天图片的新窗口预览、打印与回跳原消息
- `desktop/chat-window`：桌面端独立聊天窗口路由，承接会话右键“在独立窗口打开”
- `desktop/note-window`：桌面端独立笔记窗口路由，承接“收藏 -> 新建笔记”和已保存笔记的独立编辑窗口
- `desktop/feedback`：桌面端“意见反馈”页
- `desktop/add-friend`：桌面端“添加朋友”独立工作区，承接微信电脑版式搜索、资料预览与发送好友申请
- `desktop/settings`：桌面端“设置”页
- `desktop/channels/live-companion`：桌面端“视频号直播伴侣”工具页
- `chat-background-page.tsx`：聊天背景设置页，承载默认背景图与好友专属背景图配置
- `chat-voice-call-page.tsx`：Web 手机版 AI 语言通话页，承载单聊语音回合制对话、AI 语音播报与挂断回跳
- `chat-video-call-page.tsx`：Web 手机版 AI 数字人视频通话页，承载单聊数字人会话、本地摄像头预览、舞台播放与挂断回跳
- `group-voice-call-page.tsx`：Web 手机版群语音通话页，承载移动端群通话工作台、成员在线状态同步与结束回跳
- `group-video-call-page.tsx`：Web 手机版群视频通话页，承载移动端群视频工作台、成员画面状态同步与结束回跳
- `chat/$conversationId/background`：单聊聊天背景设置路由，对齐微信式“聊天信息 -> 聊天背景”
- `chat/$conversationId/voice-call`：单聊 AI 语言通话路由，承载“录音 -> 转写 -> AI 回复 -> TTS 播放”的半双工通话体验
- `chat/$conversationId/video-call`：单聊 AI 数字人视频通话路由，承载“本地摄像头预览 + 数字人舞台 + 录音 -> 转写 -> AI 回复 -> TTS 播放”的半双工视频通话体验
- `chat/$conversationId/details`：单聊右上角三个点详情页，对齐微信式聊天信息页
- `chat/$conversationId/search`：单聊聊天记录检索页，由聊天信息页进入
- `group/$groupId/details`：群聊右上角三个点详情页，对齐微信式群聊信息页
- `group/$groupId/edit/name`：群聊名称编辑页，承载微信式二级表单编辑而非浏览器原生 prompt
- `group/$groupId/edit/nickname`：我在本群的昵称编辑页，承载微信式群内昵称二级编辑
- `group/$groupId/background`：群聊聊天背景设置路由，对齐微信式“群聊信息 -> 聊天背景”
- `group/$groupId/voice-call`：群语音通话路由，承载移动端群通话工作台、成员在线状态同步与回到群聊
- `group/$groupId/video-call`：群视频通话路由，承载移动端群视频工作台、成员状态同步与回到群聊
- `group/$groupId/announcement`：群公告独立页，承载群公告阅读与编辑
- `group/$groupId/qr`：群二维码页，承载群邀请卡、群链接与邀请码分享
- `group/$groupId/search`：群聊聊天记录检索页，由群聊信息页进入
- `group/$groupId/members/add`：群成员添加页，承载群成员微信式多选添加
- `group/$groupId/members/remove`：群成员移除页，承载群成员微信式减号选择移除
- `notes-page.tsx`：收藏笔记兼容编辑页，桌面端在主窗口内兜底承接收藏笔记编辑
- `moments-page.tsx`：保留独立朋友圈页能力，当前主要作为发现页内二级能力的兼容承载
- `chat-room-page` · `group-chat-page` · `character-detail-page` · `friend-requests-page` · `create-group-page`

## 数据库实体（29个，物理表保持兼容）

**核心**：User（运行时语义为单例 World Owner） · Character · Conversation · Message · SystemConfig

**表情**：ChatCustomSticker

**朋友圈**：MomentPost · MomentComment · MomentLike · MomentEntity（legacy）

**社交**：Friendship · FriendRequest · AIRelationship

**安全**：ModerationReport

**群聊**：Group · GroupMember · GroupMessage · GroupReplyTask

**视频号**：FeedPost · FeedComment · UserFeedInteraction

**公众号**：OfficialAccount · OfficialAccountArticle · OfficialAccountFollow · OfficialAccountDelivery · OfficialAccountServiceMessage

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
  - `PATCH /api/world/owner/chat-background`
  - `DELETE /api/world/owner/chat-background`
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

- `Conversation` 表保留字段：`isPinned`、`pinnedAt`、`isHidden`、`hiddenAt`、`strongReminderUntil`、`lastClearedAt`、`lastActivityAt`
- `Conversation` 表现已扩展背景字段：`chatBackgroundMode`、`chatBackgroundPayload`，用于承载会话专属聊天背景配置
- `Message` 表现已扩展附件字段：`attachmentKind`、`attachmentPayload`，用于承载 `sticker` 表情包消息元数据
- `Group` 表现已扩展字段：`announcement`、`isMuted`、`mutedAt`、`isPinned`、`pinnedAt`、`savedToContacts`、`savedToContactsAt`、`showMemberNicknames`、`notifyOnAtMe`、`notifyOnAtAll`、`notifyOnAnnouncement`、`lastClearedAt`、`lastReadAt`、`isHidden`、`hiddenAt`、`lastActivityAt`
- `Group` 表现已扩展背景字段：`chatBackgroundMode`、`chatBackgroundPayload`，用于承载群聊专属聊天背景配置
- `GroupMessage` 表现已扩展附件字段：`attachmentKind`、`attachmentPayload`，用于承载聊天附件消息元数据
- `GroupReplyTask`：用于持久化群聊 AI 回复任务，状态包含 `pending`、`processing`、`sent`、`cancelled`、`failed`；现已额外记录选角分数、命中情况、最近发言惩罚、选中/跳过原因与本轮 planner 快照；同群新用户消息到来后会取消未发送的旧轮任务
- `User` 表现已扩展字段：`defaultChatBackgroundPayload`，用于承载实例默认聊天背景配置
- `Character` 表现已扩展字段：`onlineMode`、`activityMode`，用于区分在线状态 / 当前活动由调度器自动驱动还是后台人工锁定
- `Character` 表现已扩展字段：`sourceType`、`sourceKey`、`deletionPolicy`，用于区分默认保底角色 / 名人预设角色 / 后台手工角色，以及是否允许后台删除
- 会话管理路由：
  - `GET /api/conversations/:id/messages`，现已支持 `limit` 与 `aroundMessageId / before / after`
  - `GET /api/conversations/:id/message-search`
  - `POST /api/conversations/:id/pin`
  - `POST /api/conversations/:id/strong-reminder`
  - `POST /api/conversations/:id/unread`
  - `POST /api/conversations/:id/hide`
  - `POST /api/conversations/:id/clear`
  - `POST /api/conversations/:id/messages/:messageId/recall`
  - `DELETE /api/conversations/:id/messages/:messageId`
  - `GET /api/conversations/:id/background`
  - `PATCH /api/conversations/:id/background`
  - `DELETE /api/conversations/:id/background`
  - `PATCH /api/groups/:id`
  - `GET /api/groups/saved`
  - `GET /api/groups/:id/messages`，现已支持 `limit` 与 `aroundMessageId / before / after`
  - `GET /api/groups/:id/message-search`
  - `GET /api/groups/:id/background`
  - `PATCH /api/groups/:id/background`
  - `DELETE /api/groups/:id/background`
  - `PATCH /api/groups/:id/preferences`
  - `POST /api/groups/:id/pin`
  - `POST /api/groups/:id/clear`
  - `POST /api/groups/:id/read`
  - `POST /api/groups/:id/unread`
  - `POST /api/groups/:id/hide`
  - `POST /api/groups/:id/messages/:messageId/recall`
  - `DELETE /api/groups/:id/messages/:messageId`
  - `PATCH /api/groups/:id/me`
  - `POST /api/groups/:id/leave`
  - `DELETE /api/groups/:id/members/:memberId`
  - `POST /api/chat/attachments`
  - `GET /api/chat/attachments/:fileName`
  - `GET /api/chat/stickers/catalog`
  - `POST /api/chat/stickers/custom`
  - `POST /api/chat/stickers/custom/from-message`
  - `DELETE /api/chat/stickers/custom/:id`
  - `GET /api/chat/stickers/assets/:fileName`
  - `POST /api/chat/backgrounds`
  - `GET /api/chat/backgrounds/:fileName`
  - `POST /api/chat/digital-human-calls/sessions`
  - `GET /api/chat/digital-human-calls/sessions/:sessionId`
  - `GET /api/chat/digital-human-calls/sessions/:sessionId/player`
  - `GET /api/chat/digital-human-calls/sessions/:sessionId/events`
  - `PATCH /api/chat/digital-human-calls/sessions/:sessionId/provider-state`
  - `DELETE /api/chat/digital-human-calls/sessions/:sessionId`
  - `POST /api/chat/digital-human-calls/sessions/:sessionId/turns`
- 收藏路由：
  - `GET /api/favorites`
  - `GET /api/favorites/notes`
  - `GET /api/favorites/notes/:id`
  - `POST /api/favorites/notes`
  - `PATCH /api/favorites/notes/:id`
  - `DELETE /api/favorites/notes/:id`
  - `POST /api/favorites/messages`
  - `DELETE /api/favorites/:sourceId`
- 消息提醒路由：
  - `GET /api/reminders/messages`
  - `POST /api/reminders/messages`
  - `POST /api/reminders/messages/:sourceId/notified`
  - `DELETE /api/reminders/messages/:sourceId`
- 安全举报路由：
  - `GET /api/moderation/reports`
  - `POST /api/moderation/reports`
  - `PATCH /api/moderation/reports/:id/status`
- 公众号消息路由：
  - `GET /api/official-accounts/message-entries`
  - `GET /api/official-accounts/subscription-inbox`
  - `GET /api/official-accounts/service-conversations`
  - `POST /api/official-accounts/subscription-inbox/read`
  - `GET /api/official-accounts/:id/service-messages`
  - `POST /api/official-accounts/:id/service-messages/read`
  - `POST /api/official-accounts/deliveries/:deliveryId/read`

## 前端状态约束

- 世界主人主状态存放于 `apps/app/src/store/world-owner-store.ts`
- 世界主人资料契约现已支持 `defaultChatBackground`，用于承载实例默认聊天背景配置
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

## 管理后台页面（`apps/admin/src/routes/`）

- `dashboard-page.tsx`：实例级概览、Provider、诊断与运维入口
- `characters-page.tsx`：角色注册表，查看在线状态与活动状态摘要，并支持名人预设分组筛选与批量安装
- `character-editor-page.tsx`：角色画像编辑页，维护 prompt、traits、memory 与 reasoning
- `character-factory-page.tsx`：角色工厂页，查看来源、草稿配方、字段来源、发布映射 diff、已发布版本与版本记录
- `character-runtime-page.tsx`：角色运行逻辑台，查看单角色回复快照、scheduler 最近执行结果、生活状态、记忆摘要、叙事进度与生活逻辑可观测性，并直接修改运行时字段
- `evals-page.tsx`：生成评估、trace 与实验对比页
- `setup-page.tsx`：运行时与 Provider 初始化配置页
- `reply-logic-page.tsx`：AI 回复逻辑总览页，查看实际链路、effective prompt、上下文窗口、记忆与硬编码常量

## 管理后台回复逻辑路由

- `GET /api/admin/reply-logic/overview`
- `GET /api/admin/reply-logic/rules`
- `PATCH /api/admin/reply-logic/rules`
- `GET /api/admin/reply-logic/characters/:id`
- `POST /api/admin/reply-logic/characters/:id/preview`
- `GET /api/admin/reply-logic/conversations/:id`
- `POST /api/admin/reply-logic/group-reply-tasks/cleanup`
- `POST /api/admin/reply-logic/group-reply-tasks/:taskId/retry`
- `POST /api/admin/reply-logic/conversations/:id/preview`

## 管理后台角色工厂路由

- `GET /api/admin/characters/:id/factory`
- `PATCH /api/admin/characters/:id/factory`
- `POST /api/admin/characters/:id/factory/generate`
- `POST /api/admin/characters/:id/factory/publish`
- `GET /api/admin/characters/:id/factory/revisions`
- `POST /api/admin/characters/:id/factory/revisions/:revisionId/restore`

## 管理后台角色预设路由

- `GET /api/admin/characters/presets`
- `POST /api/admin/characters/presets/:presetKey/install`
- `POST /api/admin/characters/presets/install-batch`

## 系统评测路由

- `GET /api/system/evals/overview`
- `GET /api/system/evals/datasets`
- `GET /api/system/evals/datasets/:id`
- `GET /api/system/evals/strategies`
- `GET /api/system/evals/prompt-variants`
- `GET /api/system/evals/experiments`
- `GET /api/system/evals/reports`
- `GET /api/system/evals/runs`
- `GET /api/system/evals/runs/:id`
- `GET /api/system/evals/comparisons`
- `GET /api/system/evals/traces`
- `GET /api/system/evals/traces/:id`

## 环境变量（`api/.env`）

`DEEPSEEK_API_KEY` · `OPENAI_BASE_URL` · `AI_MODEL` · `ADMIN_SECRET` · `DATABASE_PATH` · `PORT` · `CORS_ALLOWED_ORIGINS` · `PUBLIC_API_BASE_URL` · `USER_API_KEY_ENCRYPTION_SECRET` · `DIGITAL_HUMAN_PROVIDER_MODE` · `DIGITAL_HUMAN_PLAYER_URL_TEMPLATE` · `DIGITAL_HUMAN_PROVIDER_CALLBACK_TOKEN`

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
- 桌面端左侧导航当前收口为：`消息 / 通讯录 / 收藏 / 朋友圈 / 广场动态 / 视频号 / 搜一搜 / 游戏中心 / 小程序面板`，底部为 `手机 / 更多`
- 移动端“发现”聚合朋友圈、摇一摇、场景相遇、广场动态、视频号、游戏中心、小程序等入口；点击入口后进入独立二级页，朋友圈不再占用独立底部 Tab
- 移动端“公众号”当前收口在“通讯录”固定服务项内，不单独占用底部 Tab，也不放进“发现”
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
- `FeedPost` 表现已扩展字段：`surface`，用于区分 `feed`（广场动态）与 `channels`（视频号），物理表仍保持兼容扩展
- `GET /api/feed` 现已支持 `surface=feed|channels`
- `POST /api/feed/channels/generate` 现已提供，用于生成一条新的视频号 AI 内容
- 聊天消息契约现已支持 `sticker` 类型；消息附件元数据由共享表情包目录解析并写入 `Message.attachment`
- 聊天附件消息现已扩展支持 `image`、`file`、`contact_card`、`location_card`、`note_card`；群聊消息同步支持附件元数据
- `POST /api/groups/:id/messages` 现已支持图片、文件、名片、位置卡片附件负载
- AI 语音转写路由已提供：
  - `POST /api/ai/transcriptions`
- AI 语音合成路由已提供：
  - `POST /api/ai/speech`
  - `GET /api/ai/speech/:fileName`
- AI 语言通话路由已提供：
  - `POST /api/chat/voice-calls/turns`
- AI 数字人 provider 现已支持：
  - `DIGITAL_HUMAN_PROVIDER_MODE=mock_stage|mock_iframe|external_iframe`
  - `DIGITAL_HUMAN_PLAYER_URL_TEMPLATE`，可通过 `{sessionId}` / `{conversationId}` / `{characterId}` / `{characterName}` / `{callbackUrl}` / `{callbackToken}` 注入外部播放器地址
  - `DIGITAL_HUMAN_PROVIDER_CALLBACK_TOKEN`，用于保护 `PATCH /api/chat/digital-human-calls/sessions/:sessionId/provider-state` 回调鉴权
- AI 数字人视频通话会话路由已提供：
  - `POST /api/chat/digital-human-calls/sessions`
  - `GET /api/chat/digital-human-calls/sessions/:sessionId`
  - `GET /api/chat/digital-human-calls/sessions/:sessionId/player`
  - `GET /api/chat/digital-human-calls/sessions/:sessionId/events`
  - `PATCH /api/chat/digital-human-calls/sessions/:sessionId/provider-state`
  - `DELETE /api/chat/digital-human-calls/sessions/:sessionId`
  - `POST /api/chat/digital-human-calls/sessions/:sessionId/turns`
- AI 数字人视频通话路由已提供：
  - `POST /api/chat/digital-human-calls/sessions`
  - `GET /api/chat/digital-human-calls/sessions/:sessionId`
  - `POST /api/chat/digital-human-calls/sessions/:sessionId/turns`
  - `DELETE /api/chat/digital-human-calls/sessions/:sessionId`
- 社交屏蔽路由已提供：
  - `GET /api/social/blocks`
  - `POST /api/social/block`
  - `POST /api/social/unblock`
- `Friendship` 表现已扩展字段：`isStarred`、`starredAt`，用于承载好友星标状态
- `Friendship` 表现已扩展联系人资料字段：`remarkName`、`region`、`source`、`tags`，用于承载微信式联系人备注/地区/来源/标签资料
- 社交星标路由已提供：
  - `POST /api/social/friends/:characterId/star`
- 社交联系人资料路由已提供：
  - `PATCH /api/social/friends/:characterId/profile`
- 社交删除联系人路由已提供：
  - `DELETE /api/social/friends/:characterId`
- `Friendship.status` 现已支持 `removed`，用于承载已从通讯录移除但需保留关系记录的联系人状态
- `packages/contracts/src/evals.ts` now uses `ownerId` for trace owner semantics.
- `ConversationEntity` now uses runtime field `ownerId`, while the physical database column remains `userId`.
- `FriendshipEntity`, `FriendRequestEntity`, and `NarrativeArcEntity` now use runtime field `ownerId`, while their physical columns remain `userId`.
- `UserFeedInteractionEntity` now uses runtime field `ownerId`, while the physical database column remains `userId`.
- Backend runtime code no longer uses `userId` as a world-owner semantic field; remaining `userId` usage is only for physical database column compatibility.
