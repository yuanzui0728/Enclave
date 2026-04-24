# 多平台联系人导入层与平台支持状态

## 定位

管理后台当前入口名仍然叫“微信朋友同步”，但 `apps/wechat-connector` 的真实职责已经不应再被理解成“只给微信写一个临时适配器”。

更准确的定位应该是：

`平台数据源 / 导出文件 / 本地桥接服务 -> 标准化导入层 -> 联系人 bundle -> Admin 预览/导入 -> 角色与好友关系`

当前链路已经有两层是可复用的：

- 本地连接器 provider 层：负责读不同来源的数据。
- Admin / Core API 的预览与导入层：负责把联系人 bundle 变成角色草稿、导入记录与回滚历史。

当前还没有彻底泛化的一层是最后一公里：

- 现有 bundle 名字仍是 `WechatSyncContactBundle`
- 现有角色来源仍是 `sourceType: wechat_import`
- 现有 `sourceKey` 仍是 `wechat:${username}`

这意味着我们已经具备“多平台导入层”的雏形，但还没有完成“多平台导入语义”的收口。

## 当前真实支持矩阵

| 平台 / 来源 | 当前状态 | 当前入口 | 说明 |
| --- | --- | --- | --- |
| 微信 4.x 本机历史 | 已落地 | `wechat-decrypt HTTP` | 当前最完整的真实链路，读取本机 `5678` 服务，再走 Admin 预览/导入。 |
| 微信生态导出桥接 | 已落地 | `weflow-http` | 连接器已支持通过本地 HTTP 桥读取 WeFlow 导出的联系人/消息摘要。 |
| 标准化文件 / JSON | 已落地 | `manual-json` | 已支持 `WechatSyncContactBundle`、`ContactImportBundle`、ChatLab `JSON/JSONL`。这是 QQ / Telegram / Discord 当前可用的统一文件导入入口。 |
| QQ | 已落地（文件导入） | ChatLab / 原生导出 / 中间 JSON | 当前通过标准化文件导入接入，不提供原生在线桥接。 |
| Telegram | 已落地（文件导入） | ChatLab / 原生导出 / 中间 JSON | 当前通过标准化文件导入接入，适合先吃导出文件而不是 bot/runtime bridge。 |
| Discord | 已落地（文件导入） | ChatLab / 第三方导出 / 中间 JSON | 当前通过标准化文件导入接入，复用同一套 bundle 映射与预览链路。 |
| WhatsApp / LINE / Instagram / Slack | 计划中 | 标准化文件导入 | 等前面三项跑通之后再接。 |

结论很简单：

- 现在已经真实可用：微信实时链路 + 多平台标准化文件导入。
- 现在“已经值得按多平台来设计”的，是连接器和中间标准化层。
- 现在“还必须改”的，是 Admin/Core API 最后一公里的 WeChat 专属语义。

## 为什么 ChatLab 值得抄

本次规划参考的不是 ChatLab 的桌面产品形态，而是它对“多平台聊天导入”这件事的拆法。

最值得借鉴的四部分：

1. `docs/cn/standard/chatlab-format.md`
   价值：先把不同平台映射到统一 `meta / members / messages` 模型，再谈分析与 UI。
2. `docs/cn/standard/chatlab-import.md`
   价值：Push / Pull 协议与去重、分批、增量同步语义都定义得很清楚。
3. `electron/main/parser/types.ts` + `sniffer.ts`
   价值：把标准层、嗅探层、解析层拆开，新增平台时不会动下游消费逻辑。
4. `electron/main/parser/formats/index.ts`
   价值：格式注册表很适合我们未来把 QQ / Telegram / Discord / WhatsApp / LINE 导出逐个挂进来。

对我们最重要的一点不是“兼容 ChatLab 本身”，而是接受这种设计方法：

- 先统一数据模型
- 再做格式识别与 parser registry
- 最后把统一结果映射到隐界自己的联系人导入 bundle

## 推荐的统一分层

### 1. Source Adapter 层

职责：

- 读取本地桥接服务、标准导出文件或用户脚本产物
- 产出统一的 `session / member / message` 流

候选输入：

- `wechat-decrypt HTTP`
- `weflow-http`
- ChatLab JSON / JSONL
- QQ 原生 TXT / JSON 导出
- Telegram JSON 导出
- Discord 导出文件

### 2. Standardized Import Schema 层

职责：

- 定义平台无关的导入载荷
- 不带“微信”命名，也不写死 `wechat:${id}`

建议收口到一个泛型契约：

- `platform`
- `platformId`
- `displayName`
- `tags`
- `messageCount`
- `sampleMessages`
- `topicKeywords`

仓库里这次已经先补了一个起点：

- `packages/contracts/src/contact-import.ts`

它还没有完全替代 `WechatSyncContactBundle`，但已经把“平台无关 bundle”这个概念立住了。

### 3. Bundle Builder 层

职责：

- 从标准化消息流推导联系人卡片
- 生成管理后台真正消费的预览输入

这里继续保留我们自己产品化的判断逻辑：

- 双向发言占比
- 最近互动时间
- 摘要与关键词
- 脱敏样本
- 群聊过滤或拆解策略

### 4. Admin / Core API 导入层

职责：

- 生成角色草稿
- 建立好友关系
- 保留导入历史、版本与回滚

这里是当前最大的泛化缺口：

- 页面命名仍是“微信朋友同步”
- 后端导入 sourceType 仍是 `wechat_import`
- 回滚/审计也按微信来源组织

## 当前关键阻塞

### 阻塞 1：最后一公里还是 WeChat-shaped

表现：

- `api/src/modules/admin/wechat-sync-admin.service.ts` 里仍然用 `wechat_import`
- source key 仍然固定写成 `wechat:${username}`

影响：

- 即使前面已经能把 QQ/Telegram/Discord 映射成联系人 bundle，最后保存到角色时也会丢平台语义。

### 阻塞 2：连接器 provider 有了，parser registry 还没有

现状：

- 现在 `apps/wechat-connector` 还是 provider 分支判断。

缺少：

- 像 ChatLab 那样的 format registry / sniffer / parser module 注册表。

影响：

- 每接一个平台都容易继续堆 if/else，而不是往统一格式模块里挂。

### 阻塞 3：页面文案还是“微信专项”

现状：

- 用户入口、导入历史、bundle 命名都默认是微信语义。

影响：

- 即使技术上接通 QQ / Telegram，产品表述仍然会让人以为这是“绕着微信改出来的例外功能”。

## 路线图

### Phase 1：标准层先行

目标：

- 保持现有微信功能不动
- 在 contracts 和 connector 中明确“多平台联系人导入层”概念

仓库落点：

- `packages/contracts/src/contact-import.ts`
- `apps/wechat-connector/src/platforms.ts`
- 文档与 README

### Phase 2：文件导入优先

目标：

- 先接导出文件，不先接在线桥接
- 以最小风险覆盖 QQ / Telegram / Discord

优先顺序：

1. ChatLab JSON / JSONL（已完成）
2. QQ 原生导出
3. Telegram 导出
4. Discord 导出

原因：

- 风险低
- 可复测
- 不依赖用户持续在线或 bot 权限

### Phase 3：后端语义泛化

目标：

- 把 `wechat_import` 泛化成 `contact_import`
- 让 source key 变成 `{platform}:{platformId}`

必改文件：

- `packages/contracts/src/characters.ts`
- `packages/contracts/src/wechat-sync.ts`
- `api/src/modules/admin/wechat-sync-admin.service.ts`
- `apps/admin/src/routes/wechat-sync-page.tsx`

### Phase 4：UI 与审计升级

目标：

- 页面从“微信朋友同步”升级成“联系人导入”
- 历史记录展示平台来源、导入方式、导出格式

这一步完成后，产品口径才算真正从“微信专项功能”升级成“多平台联系人导入层”。

## 结论

这条线的正确做法不是“继续给微信页面塞更多平台特例”，而是：

1. 保留现有微信链路继续可用
2. 把连接器正式定位成标准化导入层
3. 用 ChatLab 的拆法来接新平台
4. 最后把 Admin/Core API 的 WeChat 专属语义收口掉

所以对外口径应该非常明确：

- 现在已经落地：微信实时链路 + QQ / Telegram / Discord 文件导入
- 现在已经按这个方向设计：多平台标准化导入层
- 现在下一步最值得做：QQ / Telegram / Discord 的原生导出适配，以及后端 source metadata 去 WeChat 化
