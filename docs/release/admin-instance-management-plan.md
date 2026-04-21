# Admin 实例管理后台规划

日期：2026-04-20
范围：`apps/admin`、`apps/cloud-console`、`apps/cloud-api`

## 结论

- `apps/admin` 继续作为单世界实例内的运维后台。
- `apps/cloud-console` + `apps/cloud-api` 继续作为跨实例的云控制台与编排面。
- 不建议把“实例内运维”和“跨实例编排”继续混在同一个前端里，否则权限、信息密度和操作风险都会失控。

## 当前基线

- `pnpm --filter @yinjie/admin typecheck` 通过。
- `pnpm --filter @yinjie/admin lint` 通过，仍有少量 Hooks 依赖 warning。
- `pnpm --filter @yinjie/admin build` 通过。
- `pnpm --filter @yinjie/cloud-console typecheck` 通过。
- `pnpm --filter @yinjie/cloud-api typecheck` 通过。

## 本轮已修复的阻塞问题

- 补齐了 `apps/admin/src/lib/admin-api.ts` 中缺失的实例后台接口映射：
  - 游戏目录 / 投稿 / 运营编排
  - 微信导入
  - 需求发现 / 主动跟进
  - Action Runtime
  - Cyber Avatar
  - Real World Sync
- 补齐了共享 contracts 中缺失的 `wechat-sync` 历史类型和 `real-world-sync` 执行结果类型。
- 修正了后台侧边栏路由类型过窄导致的新页面无法通过类型检查的问题。
- 修正了 `wechat-sync-page` 的条件 Hooks 错误。
- 清理了若干未使用导入和未使用函数，使 `apps/admin` 恢复可编译。

## 职责边界

### `apps/admin`

- 面向单个世界实例拥有者。
- 管实例内运行状态、模型 Provider、角色、聊天审计、调度规则、动作连接器、现实联动。
- 所有操作默认假设“我已经连上某一个具体实例”。

### `apps/cloud-console`

- 面向官方云运营或平台运维。
- 管世界申请单、世界记录、实例状态、漂移告警、唤起 / 休眠 / 重试 / 对账。
- 所有操作默认假设“我要同时观察和操作多台实例”。

## 一期建议范围

### `apps/admin` 一期

- 运行总览：实例健康、Provider、数字人、关键异常。
- 配置中心：实例默认 Provider、预算、调度规则、回流规则。
- 内容与角色：角色中心、角色工厂、聊天记录、微信导入。
- 自动化运行台：Need Discovery、Followup Runtime、Action Runtime、Cyber Avatar、Real World Sync。

### `apps/cloud-console` 一期

- 世界列表与筛选：状态、地区、Provider、最近活跃、告警。
- 世界详情：实例信息、启动配置、运行态、回调、最近作业。
- 运维动作：`resume`、`suspend`、`retry`、`reconcile`。
- 漂移告警：心跳过期、Provider 状态漂移、恢复队列。

## 下一轮实现建议

1. 继续收敛接口边界。
- `apps/admin` 只走实例内 `/admin/*`。
- `apps/cloud-console` 只走云平台 `/admin/cloud/*` 或等价控制面接口。

2. 把后台类型继续下沉到 `packages/contracts`。
- 当前 `wechat-sync` 与部分运行结果类型刚补齐，后续应继续清掉前后端私有重复定义。

3. 给高风险运维动作补统一协议。
- 所有 `retry / restore / publish / reconcile / suspend / resume` 应统一返回操作摘要、影响对象和下一步建议。

4. 给 `cloud-console` 增加实例视角过滤器。
- 现在更偏 world 视角，后续应补 provider / zone / powerState / driftReason 维度，方便做实例池运营。

5. 给 `apps/admin` 做最小化回归清单。
- 重点验证 `games`、`wechat-sync`、`action-runtime`、`cyber-avatar`、`real-world-sync` 五个新工作台的联调链路。

## 剩余风险

- `apps/admin` 还存在 8 条 `react-hooks/exhaustive-deps` warning，当前不阻塞构建，但后续仍应逐页清理。
- `apps/admin` 的页面能力扩张很快，后续如果继续加模块，应优先补导航分组和权限分层，否则信息噪声会继续上升。
- `apps/cloud-console` 当前已经有世界管理能力，但“实例池运营”视图还不够强，后面做真正的云编排时需要再补一层按实例聚合的视角。
