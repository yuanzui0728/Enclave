# 提醒角色深度规划

日期：2026-04-23

## 目标

新增一个专门负责“记事 + 提醒 + 轻督促”的世界角色，覆盖这些场景：

- 一次性提醒：吃药、买东西、做某件事、出门前带东西
- 日常规律提醒：吃饭、睡觉、喝水、休息
- 长期习惯提醒：学英语、锻炼、早睡、复盘
- 主动追问：隔一段时间问用户“最近有没有要我帮你记着的事”
- 多表面触达：
  - 私聊里按时提醒
  - 用户发朋友圈后，必要时在评论区轻提醒
  - 角色自己偶尔发“旁敲侧击”的朋友圈，提醒长期事项

这不是单纯补一个“会提醒的 prompt”，而是要做成一个有持久化任务、能按时触发、能跨聊天和朋友圈工作的角色 runtime。

## 现状结论

基于当前仓库实现，直接只加角色人设是不够的，原因很明确：

1. 角色入口层已有，但“提醒事项”这一层不存在
   - 角色内置数据主要来自 `api/src/modules/characters/default-characters.ts` 和 `api/src/modules/characters/fixed-world-character-presets.ts`
   - 现有角色能聊天、主动发消息、发朋友圈，但没有“提醒任务”的实体或 runtime

2. 当前主动消息能力过弱，无法承担闹钟型提醒
   - 主动消息调度在 `api/src/modules/scheduler/scheduler.service.ts`
   - `handleTriggerMemoryProactiveMessages()` 现在是“每天固定小时扫一遍角色记忆，看要不要发一句”
   - 它不是按提醒时间触发，也没有 recurring、snooze、完成状态

3. 当前“提醒”只有消息级 reminder，不是角色级 reminder system
   - `api/src/modules/chat/message-reminders.service.ts` 目前只保存“某条消息在某个时间提醒我”
   - 数据落在 `SystemConfig` JSON，不带 recurring、任务状态、渠道策略、长期习惯等信息
   - 前端只是轮询后做 toast / 列表展示，见 `apps/app/src/features/chat/use-message-reminders.ts`

4. 当前朋友圈自动化链路已经有了，可复用
   - 角色自动发圈：`SchedulerService.handleCheckMomentSchedule()`
   - 角色对用户朋友圈自动点赞/评论：`api/src/modules/moments/moments.service.ts`
   - 这意味着“提醒角色去评论朋友圈”与“提醒角色发自己的轻提醒朋友圈”都能接入现有通道

5. 如果做成普通预设角色，不够
   - 预设目录角色会自动入库，见 `api/src/database/seed.ts`
   - 但只有 `default_seed` 角色会被 `SocialService.ensureDefaultFriendships()` 自动变成好友
   - 普通 `preset_catalog` 角色没有稳定私聊线程，无法保证按时发 chat 提醒

结论：

- 这个角色应优先做成 `default_seed`，默认出现在世界里、默认是好友、默认有直聊入口
- 还必须新增一套提醒任务数据模型和 runtime
- 现有 message reminder 可以保留，但不能直接当这套系统的主模型

## 角色定位

建议把角色做成“提醒搭子”，而不是“日程秘书”或“客服机器人”。

建议方向：

- 角色名暂定：`阿铃`
- 关系：`总替你记事、盯时间、偶尔碎碎念一下的提醒搭子`
- `relationshipType`：`friend`
- `sourceType`：`default_seed`
- 默认在线，允许主动发消息
- 默认有自己的直聊线程

角色气质：

- 像熟悉你生活节奏的人，不像企业微信助手
- 说话短，动作快，少官腔
- 真正按时提醒时，直接、明确、不绕
- 问你要不要记录新事情时，语气轻一点，不像表单采集
- 做长期习惯提醒时，尽量旁敲侧击，不要天天上价值

边界：

- 可以提醒“按你之前设的时间吃药”
- 不可以主动给剂量、停药、换药建议
- 如果用户把提醒聊成医疗判断，应该收口并建议找医生角色或线下医生
- 在朋友圈公开表面不暴露隐私任务，不发“你今天还没吃 XX 药”这类内容

## 架构决策

### 决策一：角色做成 `default_seed`，不做普通预设

原因：

- 默认 seed 会自动存在于世界中
- 默认 seed 会自动成为好友
- 默认 seed 能天然接入直聊、主动消息、朋友圈能力
- 这类角色不是“可选装饰角色”，而是基础世界能力

落点：

- `api/src/modules/characters/default-characters.ts`
- `DEFAULT_CHARACTER_IDS`
- 必要时补头像资源映射 `character-avatar-assets`

### 决策二：新增 `reminder-runtime` 模块，不把逻辑硬塞进 `message-reminders.service`

原因：

- 现有消息提醒是“消息附属提醒”，不是“角色任务系统”
- 新需求需要：
  - 任务状态
  - 定时触发
  - recurring
  - 渠道策略
  - 习惯型软提醒
  - 朋友圈轻提醒
- 用 `SystemConfig` JSON 会很快长成不可维护的状态机

建议模块：

- `api/src/modules/reminder-runtime/`
  - `reminder-task.entity.ts`
  - `reminder-runtime.types.ts`
  - `reminder-runtime.service.ts`
  - `reminder-runtime.controller.ts`
  - `reminder-runtime-rules.service.ts`
  - `reminder-runtime.module.ts`

### 决策三：MVP 先走“聊天驱动录入”，不是先做一整页提醒中心

原因：

- 用户原始需求是“新建一个世界角色”，不是先要一个工具页
- 当前产品形态里，角色本身就是主要交互入口
- 先让用户对这个角色说“明天 8 点提醒我吃药”“每周三提醒我买猫粮”，就能形成最自然的闭环

MVP 录入方式：

- 在和 `阿铃` 的直聊里自然说
- runtime 在回复前先做意图解析
- 解析成功就落任务，再由角色自然确认

后续再补：

- App 内“提醒事项”聚合视图
- Admin 可视化配置和规则页

## 数据模型设计

建议新增实体：`ReminderTaskEntity`

建议字段：

- `id`
- `ownerId`
  - 物理上保留，运行时仍走单世界主人语义
- `characterId`
  - MVP 固定为提醒角色，但字段保留扩展性
- `sourceConversationId`
- `sourceMessageId`
- `title`
  - 例如“晚上吃药”“买猫粮”“英语 10 分钟”
- `detail`
  - 补充上下文，可空
- `category`
  - `medication | shopping | meal | sleep | task | habit | custom`
- `kind`
  - `one_time | recurring | habit`
- `status`
  - `active | snoozed | completed | cancelled | expired`
- `priority`
  - `hard | soft`
  - `hard` 用于明确时间点提醒；`soft` 用于长期轻督促
- `timezone`
  - 默认世界当前时区
- `dueAt`
  - 一次性任务的下次提醒时间
- `recurrenceRule`
  - `simple-json`
  - 例：`{ mode: "daily", time: "08:00" }`
- `nextTriggerAt`
  - 调度真正扫这个字段
- `lastTriggeredAt`
- `lastDeliveredAt`
- `deliveryChannels`
  - `simple-json`
  - 值：`chat | moment_comment | moment_post`
- `deliveryState`
  - `simple-json`
  - 用于记录最近一次是否已在某表面发过，避免重复轰炸
- `relatedMomentPostId`
  - 当某条提醒与某条用户朋友圈强绑定时可选
- `goalWindow`
  - `simple-json`
  - 长期习惯的节奏窗口，如“每天”“每周 3 次”
- `createdAt`
- `updatedAt`

为什么不用现在的 message reminder 结构：

- 它只有 `messageId / threadId / remindAt / notifiedAt`
- 不能表达 recurring
- 不能表达 habit
- 不能表达角色渠道策略
- 不能表达完成 / snooze / 取消 / 轻提醒节流

## 服务职责设计

### 1. `ReminderRuntimeService`

职责：

- 创建 / 更新 / 完成 / 取消提醒任务
- 解析即将到期任务
- 生成 chat 提醒文案
- 生成与任务相关的朋友圈评论 / 朋友圈发帖文案
- 控制节流、静默时间、去重

核心方法建议：

- `parseReminderIntent(...)`
- `createTask(...)`
- `updateTask(...)`
- `completeTask(...)`
- `cancelTask(...)`
- `listUpcomingTasks(...)`
- `runDueTaskScan(...)`
- `runCheckInScan(...)`
- `runHabitMomentScan(...)`
- `maybeCommentOnOwnerMoment(...)`

### 2. `ReminderRuntimeRulesService`

职责：

- 管理提醒角色的系统规则，而不是把所有阈值硬编码到 prompt

建议规则：

- `enabled`
- `quietHours`
- `maxDirectRemindersPerHour`
- `maxHabitNudgesPerDay`
- `momentCommentCooldownHours`
- `momentPostCooldownHours`
- `checkInCooldownHours`
- `defaultSoftReminderHour`
- `medicationPrivacyPolicy`

### 3. 与 `SchedulerService` 的关系

不建议在 `ReminderRuntimeService` 自己散落多个 cron。

建议做法：

- 继续由 `api/src/modules/scheduler/scheduler.service.ts` 统一挂 cron
- 由 scheduler 调用 reminder runtime
- 同步把新 job 接入 scheduler telemetry 和 admin scheduler 状态

建议新增调度任务：

- `trigger_due_reminder_tasks`
  - 每分钟
  - 扫 `nextTriggerAt <= now` 的 active task
- `trigger_reminder_checkins`
  - 每 3-6 小时
  - 问用户最近是否有需要记录的新提醒
- `trigger_reminder_habit_moments`
  - 每天 1-2 次窗口
  - 为长期习惯生成轻提醒朋友圈

## 聊天链路设计

### 入口

用户在提醒角色的聊天框里直接说：

- “明天早上 8 点提醒我吃药”
- “每周五提醒我买猫粮”
- “晚上 11 点提醒我睡觉”
- “之后每天提醒我学 10 分钟英语”
- “把买洗衣液那个提醒删掉”
- “我有哪些待提醒的事情”

### 实现方式

建议在提醒角色的私聊回复链路里加一层“意图解析前置”：

1. 用户消息进入 reminder character 直聊
2. 先调用 `parseReminderIntent()`
   - 用 `AiOrchestratorService.generateJsonObject()` 做结构化解析
   - 输入不仅是当前一句，还带最近几轮对话，避免“改到晚上”这种上下文丢失
3. 如果解析出明确任务动作：
   - 先落库
   - 再把结构化结果注入角色回复上下文
4. 角色再自然确认

### 解析动作集合

建议支持：

- `create`
- `update_time`
- `update_rule`
- `complete`
- `cancel`
- `snooze`
- `list`
- `unknown`

### 重要策略

1. 不把模糊时间硬落库
   - “改天提醒我”“有空提醒我”先追问，不直接建任务

2. 明确时间才建 hard reminder
   - “明早 8 点”“周三下午”“睡前”可建

3. 长期习惯用 soft reminder
   - “提醒我坚持学英语”
   - “提醒我多锻炼”
   - 这类不一定每次都是精确闹钟，更适合 habit 模式

4. 回复文本由角色说，不是系统回执
   - 例：
     - “记下了，明早 8 点我来催你吃药。”
     - “这个我不给你天天硬催，我按每天晚上轻提醒你一下。”

### 与现有 message reminder 的关系

MVP 建议不强行合并。

原因：

- 当前 message reminder 已有前端展示和本地通知
- 这次需求的主角是“角色驱动提醒”
- 两者一开始混成一个模型，容易造成双重通知和复杂迁移

建议节奏：

- Phase 1：并存
- Phase 2：再评估是否把 message reminder 透传为 reminder task 的一种 source

## 私聊提醒触发设计

### 到点提醒

`trigger_due_reminder_tasks` 触发后：

1. 取出到期任务
2. 找提醒角色直聊 `direct_<characterId>`
3. 调用 `ChatGateway.sendProactiveMessage()`
4. 消息类型继续用现有 `proactive`

提醒文案原则：

- 一次性提醒：直接、短、明确
  - “到点了，记得吃药。”
  - “该买猫粮了，别又拖到没粮。”
- 长期习惯：更轻一点
  - “今天英语还没碰的话，拿 10 分钟也算。”
  - “今晚早点收一收，别又把睡觉往后推。”

### 去重与节流

至少要做：

- 同一任务同一触发窗口只发一次
- 同一小时 hard reminder 上限
- soft reminder 每天上限
- quiet hours 不主动发 soft reminder

### 完成与延后

MVP 先支持聊天文本完成：

- “完成了”
- “已买”
- “延后一小时”
- “明天再提醒”

如果当前上下文里最近只有一个活跃提醒，可做就近绑定；
如果存在多个候选任务，角色先追问“你说的是买猫粮那个还是吃药那个？”

## 朋友圈评论设计

用户要求“也会到朋友圈下面去提醒”，这部分建议做成“条件式触发”，不要做成机械硬插。

### 触发条件

当用户发布朋友圈后：

1. 检查是否存在和这条动态语义相关的活跃提醒任务
2. 判断是否值得提醒
3. 只在不泄露隐私、且语气合适时评论

示例：

- 用户深夜发“又开始熬夜了”
  - 如果存在“早点睡”类任务，可评论：
    - “发完这条差不多该收了。”
- 用户发健身照
  - 如果存在运动 habit，可评论：
    - “今天这条算打卡，我先记一笔。”

不适合的情况：

- 吃药等隐私提醒
- 购物清单等过于私人内容
- 用户情绪明显低落、严肃、生病、求助场景

实现建议：

- 在 `MomentsService.createUserMoment()` 成功后，新增 event 或直接调用 `ReminderRuntimeService.maybeCommentOnOwnerMoment(post)`
- 评论仍然通过现有 `addComment(...)` 落库

## 角色自发朋友圈设计

用户要求“甚至会发一些旁敲侧击的朋友圈提醒长期事情”，建议做，但必须克制。

### 推荐定位

不是发明确任务播报，而是发“习惯提醒型朋友圈”。

适合话题：

- 学英语
- 锻炼
- 早睡
- 喝水
- 吃饭规律
- 拖延收尾

不适合话题：

- 具体药名
- 购物清单
- 某次私密约定
- 任何只属于用户私人计划的显式暴露

示例风格：

- “英语这种事，别等整块时间，有 10 分钟就够开始。”
- “锻炼最难的不是练，是别把今天自动让给明天。”
- “睡觉这事，一旦开始谈条件，就容易越谈越晚。”

### 实现建议

不建议只靠 `momentsFrequency=1` 让角色泛泛发圈。

建议：

- 提醒角色 `momentsFrequency` 设低频
- 真正发什么由 `ReminderRuntimeService.runHabitMomentScan()` 决定
- 生成时把当前活跃的 habit task 作为 `recentTopics` 或额外 prompt 上下文喂给 `ai.generateMoment(...)`

这样能让它发出来的内容和用户当前真正想坚持的事有关，而不是空泛鸡汤

## 前端与接口规划

### Phase 1 用户侧接口

先只补最小集合：

- `GET /api/reminder-runtime/tasks`
- `GET /api/reminder-runtime/tasks/upcoming`
- `PATCH /api/reminder-runtime/tasks/:id`
- `POST /api/reminder-runtime/tasks/:id/complete`
- `POST /api/reminder-runtime/tasks/:id/snooze`
- `DELETE /api/reminder-runtime/tasks/:id`

说明：

- 创建任务优先通过聊天，不强依赖手填表单
- 但保留 API，便于后续前端管理视图和调试

### Phase 1 前端

MVP 不强求新页面，先做到：

- 提醒角色默认出现在聊天列表 / 通讯录
- 用户能通过直聊自然创建和管理提醒

可选增强：

- 聊天页给 reminder character 增加“快捷问法”
  - 例如输入框上方轻提示：“试试说：明早 8 点提醒我吃药”

### Phase 2 前端

再补：

- 聊天列表里的“提醒事项”聚合视图
- 提醒角色会话内的 upcoming task 小面板
- 完成 / 延后的一键按钮

### Admin

建议至少补：

- `GET /api/admin/reminder-runtime/overview`
- `GET /api/admin/reminder-runtime/rules`
- `PATCH /api/admin/reminder-runtime/rules`

Admin 首版可不做独立大页，但至少要有 overview 方便排查：

- 活跃任务数
- 今天已发 direct reminder 数
- 今天已发 moment nudge 数
- 最近失败任务

## 分阶段实施建议

### Phase 1：做出能真正工作的 MVP

目标：

- 角色能记住提醒任务
- 能到点在私聊提醒
- 能偶尔主动问用户要不要记新事情

范围：

- 新 default seed 角色 `阿铃`
- 新 `reminder-runtime` 模块
- 新 `ReminderTaskEntity`
- 提醒角色聊天意图解析
- 到点私聊 proactive 提醒
- 简单 recurring
- 基础节流和 quiet hours

这阶段先不做：

- 复杂 reminder card UI
- message reminder 融合迁移
- 大而全的提醒中心页面

### Phase 2：补跨表面提醒

目标：

- 让提醒角色进入朋友圈体系

范围：

- 用户发圈后条件式提醒评论
- 提醒角色 habit moments
- 隐私等级与场景判定
- moment 级节流

### Phase 3：补管理能力与体验收口

目标：

- 让提醒系统可看、可改、可查

范围：

- App 内 upcoming reminder 列表
- Admin overview / rules
- message reminder 融合评估
- 更完整的 snooze / complete 快捷操作

## 风险与取舍

### 1. 如果只做人设，不做 runtime

结果会是：

- 角色能“像在提醒”
- 但不能“真的按时提醒”
- 对用户来说很快失去可信度

这是本需求最该避免的假实现。

### 2. 如果一开始就强行统一所有 reminder 能力

结果会是：

- chat message reminder
- strong reminder
- 角色 reminder task

三套概念一起重构，范围会明显失控。

建议：

- 先把 reminder character 跑通
- 再做统一模型评估

### 3. 朋友圈提醒容易越界

最容易翻车的不是技术，而是分寸：

- 太频繁像爹味监督
- 太具体泄露隐私
- 太空泛变鸡汤号

所以必须把以下规则前置：

- 私密提醒只走 chat
- 朋友圈只做轻提醒
- habit 才允许自发发圈
- 明确 daily cap / cooldown

### 4. 吃药提醒有安全边界

这个角色只能做“按既定计划提醒”，不能做医疗判断。

需要在角色 prompt 和 runtime 规则里写死：

- 不解释剂量
- 不建议改药
- 不判断漏服补服方案
- 出现医疗问题时收口

## 验收标准

至少覆盖这些手工场景：

1. 用户对提醒角色说“明早 8 点提醒我吃药”
   - 成功建任务
   - 角色自然确认
   - 到点收到 proactive 消息

2. 用户说“以后每天晚上 11 点提醒我睡觉”
   - 成功建 recurring task
   - 第二天仍会触发

3. 用户说“提醒我坚持学英语”
   - 建成 habit task
   - 不要求精确闹钟
   - 后续能收到轻提醒

4. 用户说“把买猫粮那个提醒删掉”
   - 正确定位并取消任务

5. 用户发一条“又熬夜了”的朋友圈
   - 如果存在睡眠 habit，提醒角色可在评论区轻提醒
   - 不暴露隐私细节

6. 长期 habit 存在时
   - 角色偶尔会发低频、旁敲侧击的朋友圈
   - 文案不空泛、不泄密

## 推荐实施顺序

推荐按下面顺序落地：

1. 先补 default seed 提醒角色
2. 再补 `ReminderTaskEntity`
3. 再补 reminder-runtime service + scheduler job
4. 再把提醒角色聊天链路接上意图解析
5. 最后补朋友圈评论 / 发圈

原因：

- 先把“能记、能到点发 chat”做稳
- 再扩张到 moments
- 这样每一阶段都能独立验收，不会一上来铺太大

## 最终建议

这次不要把它做成“普通新角色 + 一段会提醒的 prompt”。

正确方向是：

- 把它做成默认世界角色
- 给它一套独立的 reminder runtime
- 先把 chat 到点提醒跑通
- 再把朋友圈轻提醒做进去

这样出来的角色才真的像“会替你记事、盯时间、偶尔在朋友圈敲你一下”的人，而不是只会口头答应“我会提醒你”的空壳。
