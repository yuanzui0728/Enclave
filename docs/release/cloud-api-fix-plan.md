# Cloud API 后端规划与修复准备

日期：2026-04-21

## 当前定位

`apps/cloud-api` 是官方云平台后端，当前承接 5 条主链路：

- 手机号验证码登录与云端访问令牌签发
- 用户云世界申请单查询与提交流程
- 运营侧申请单审核、世界记录维护和运行状态查看
- 世界访问解析、唤起/创建等待态编排
- 世界运行时回调、心跳和健康状态回写

## 建议的后端边界

建议继续按下面 4 层演进，避免控制器和业务逻辑继续耦合：

1. `auth`
   负责手机号验证码、令牌签发、管理员鉴权和后续限流。
2. `application`
   负责申请单、世界台账、访问会话、运营动作等业务规则。
3. `orchestration/providers`
   负责生命周期任务、provider 适配、漂移检查和回调对账。
4. `runtime-callbacks`
   负责实例回调鉴权、状态推进、心跳/活动写回。

## 本轮已确认问题

- `npm run start:raw` 指向错误产物路径，构建后无法按脚本直接启动。
- 申请单被运营拒绝后会创建一个 `failed` 世界记录，导致用户再次申请被拦截。
- 管理端更新 `providerKey` 时，非法值会被静默降级成默认 provider，属于危险写入。
- 鉴权返回的 `expiresAt` 可能和 JWT 实际过期时间不一致，尤其在只配置 `CLOUD_AUTH_TOKEN_TTL` 时。
- 请求层还缺少 DTO / `ValidationPipe`，目前是裸对象入参。
- 短信验证码发送缺少基础限流，容易被重复触发。
- 生产态默认弱密钥仍可启动，存在明显安全风险。
- SQLite 仍依赖 `synchronize: true`，缺少可审计的 schema 演进路径。
- 管理控制台仍长期复用 `X-Admin-Secret`，缺少更合理的短时管理员会话。
- 客户端 token 和管理员 token 当前共享同一套 JWT secret，需要额外 claim 边界避免串用。
- 管理员会话还缺少持久化 refresh / logout 机制，控制台只能重复用 secret 重新换 token。
- 管理员改绑 `world.phone` 时缺少前置冲突校验；如果目标手机号已存在世界或活跃申请，会退化成数据库层 500。
- 管理员改绑 `world.phone` 后，旧手机号上的 waiting access session 不会立即失效，存在把新绑定世界状态继续暴露给旧手机号的风险。

## 本轮补充检查结果

- 已补：`updateWorld` 现在会在改绑手机号前复用手机号可用性校验，目标手机号若已有世界或活跃申请会直接返回明确 `400`。
- 已补：`updateWorld` 改绑成功后会立即失效旧手机号上的 waiting access session，避免旧手机号继续拿到这台世界的后续状态。
- 已补：`PhoneAuthService.sendCode` 现在会在短信 provider 失败时清理刚创建的验证码 session，并返回明确的 `503`，不再白白消耗 resend cooldown 和窗口限额。
- 已补：默认 provider 配置改成统一走显式校验；非法 `CLOUD_DEFAULT_PROVIDER_KEY` 会在启动期和运行期直接报错，不再静默回落到 mock provider。
- 已补：`updateRequest` 的 `request -> world` 写路径已收进同一事务；world 同步失败时，request 变更不会再留下半更新状态。
- 已补：waiting access session 的刷新/失效已切到 `WaitingSessionSyncService`；主流程会先提交 request/world/runtime/job 状态，再对 session 做“同步尝试一次 + 失败后台重试”，不再因为 access session 刷新失败把主状态写入一起打回。

## 修复优先级

1. 启动与发布可用性
   修正 raw 启动路径，确保 build 产物可以直接运行。
2. 核心状态流一致性
   阻止 rejected request 生成占位世界；兼容清理历史拒绝占位记录。
3. 配置写入安全
   providerKey 改为显式校验失败，不再静默落成默认值。
4. 运维可观测性
   补充烟测脚本和基础回归清单。
5. 安全与稳定性
   增加短信发送限流、管理员密钥必填校验、生命周期任务审计留痕。

## 下一步建议

- 回归入口：
  `cd apps/cloud-api && npm run test:e2e`
- 手动迁移入口：
  `cd apps/cloud-api && npm run db:migrate`
- 增加 `cloud-api` 最小 e2e 烟测，覆盖：
  - 登录发码/验码
  - 提交申请
  - 审核拒绝后重新申请
  - provider 非法值拦截
  - runtime bootstrap/heartbeat 回调
- 生产环境开启 `NODE_ENV=production`，或显式设置 `CLOUD_ENFORCE_STRICT_SECRETS=true`，强制校验 `CLOUD_JWT_SECRET` / `CLOUD_ADMIN_SECRET`。
- 管理控制台改为先通过 `CLOUD_ADMIN_SECRET` 交换短时 Bearer token，再访问 `admin/cloud` 业务接口；保留 header 兼容给旧脚本和烟测。
- 管理员 token 与客户端 token 应固定 `issuer` / `audience` / `purpose`，禁止跨入口复用。
- 增加持久化 `cloud_admin_sessions`，采用 refresh token 轮换续期，并提供 logout 撤销入口。
- `AdminGuard` 需要绑定 `cloud_admin_sessions` 状态，确保 logout 或手动撤销后，已签发 access token 也会立即失效。
- 运营控制台需要一个最小管理员会话视图，能列出当前 session 并按 id 撤销旧会话。
- 会话表建议继续保留来源审计字段，至少记录签发 IP / User-Agent 和最近一次使用的来源信息。
- 撤销事件建议记录 `revocationReason` 和 `revokedBySessionId`，否则无法区分 logout、手动撤销和 refresh token 重放。
- `admin/cloud/admin-sessions` 现在建议统一走服务端过滤、分页和排序：`status` / `revocationReason` / `currentOnly` / `query` / `sortBy` / `sortDirection` / `page` / `pageSize`；控制台 `/sessions` 已提供 `Current session`、`Recently revoked`、`Expiring soon` 快捷视图。
- 批量运维动作建议直接落在 `admin/cloud/admin-sessions/revoke`，按 `sessionIds` 批量撤销当前页已选会话；控制台 `/sessions` 已支持当前页多选和批量撤销确认。
- 当批量范围超过当前页时，建议改走 `admin/cloud/admin-sessions/revoke-filtered`，按当前过滤条件一次性撤销所有匹配的活跃会话；控制台 `/sessions` 已支持 `Revoke all matching`。
- 管理员会话现在额外提供 `admin/cloud/admin-session-source-groups`、`admin/cloud/admin-session-source-groups/revoke`、`admin/cloud/admin-session-source-groups/revoke-risk`、`admin/cloud/admin-session-source-groups/snapshot` 和 `admin/cloud/admin-session-source-groups/risk-snapshot`，可按“签发 IP + User-Agent”聚合来源、整组撤销、按风险等级批量处置，并导出单组或整档风险审计快照；来源组聚合还会附带 `riskLevel/riskSignals`，把 refresh token 重放和多活来源直接标成风险来源，控制台 `/sessions` 已支持独立分页/排序、来源聚焦、风险快捷视图、风险批量撤销、聚焦来源组风险时间线、事件视图/按日/按周聚合切换、阈值说明、当前时间线点命中原因、按点展开命中会话明细、从命中会话直接跳转到主列表过滤态、目标行高亮、目标行自动展开审计细节、在 detail row 内联显示来源组风险摘要、最近时间线快照、最近几次 revoke / snapshot 操作回执、回执里的 session id / source 摘要和 `request-id`、notice / error block 里的 `request-id`、`request/world` 保存成功与 lifecycle 成功 notice 里的 `request-id`，以及 `admin-sessions` 的批量 revoke / filtered revoke / risk revoke / snapshot / risk snapshot / risk CSV 成功 notice 里的 `request-id`、手动清除 receipts、导出 focused source snapshot，以及从 detail row 直接整组撤销 focused source；风险快照仍支持 JSON、来源组汇总 CSV、会话明细 CSV 和时间线 CSV 导出。
- 为 `admin/cloud` 和 `cloud/me` 增加 DTO + validation pipe。
- 给生命周期任务补“单世界串行锁”或 lease，防止多实例部署时重复消费。
- 将 `synchronize: true` 替换成正式 migration。
- 区分 dev/prod 安全策略，移除默认管理员密钥和弱默认 JWT secret。
- 可按需调节 `CLOUD_WAITING_SESSION_SYNC_RETRY_ATTEMPTS` / `CLOUD_WAITING_SESSION_SYNC_RETRY_DELAY_MS`，控制 waiting session 后台补偿次数和间隔。
