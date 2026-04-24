# 一键同步微信朋友操作指南

这份文档说明隐界 APP 管理后台里的“微信朋友同步”现在支持哪些接入方式、
依赖哪些第三方开源项目，以及从准备环境到完成导入的完整操作流程。

> 说明：页面名称当前仍然是“微信朋友同步”，但底层 `apps/wechat-connector`
> 已经按“多平台标准化导入层”方向推进。现阶段真实可用的是“微信实时链路 +
> 标准化文件导入”，其中 QQ / Telegram / Discord 通过文件导入支持，不是原生实时连接器。

## 1. 整体架构

当前微信同步页由三层组成：

1. `第三方上游数据源`
   - `ylytdeng/wechat-decrypt`
   - `hicccc77/WeFlow`
   - 或者手动准备的 JSON 快照
2. `apps/wechat-connector`
   - 运行在 `http://127.0.0.1:17364`
   - 把不同来源的数据统一整理成项目自己的联系人快照格式
3. `apps/admin`
   - 运行在 `http://127.0.0.1:5181`
   - 提供“选择联系人 -> 生成预览 -> 导入角色”的完整 UI

可以把它理解为：

- `微信 -> wechat-decrypt:5678 -> wechat-connector:17364 -> admin:5181`
- `WeFlow -> weflow-http:5031 -> wechat-connector:17364 -> admin:5181`
- `JSON 快照 -> wechat-connector:17364 / 页面手动导入 -> admin:5181`

## 2. 用到的第三方开源项目

### 2.1 当前实际支持的上游

#### `ylytdeng/wechat-decrypt`

- 仓库地址：[github.com/ylytdeng/wechat-decrypt](https://github.com/ylytdeng/wechat-decrypt)
- 当前本地代码位置：`C:\Users\86177\Desktop\yinjieAPP\.cache\upstreams\wechat-decrypt`
- 作用：
  - 适配微信 4.x 本地数据库结构
  - 从运行中的微信进程提取 key
  - 解密联系人、会话、消息数据库
  - 通过 `http://127.0.0.1:5678` 提供 `/api/history`、`/api/tags`

说明：

- 本仓库里的本地 clone 做过一个小 patch，让 `/api/history` 不只返回服务启动后
  监听到的新消息，也会读取近期解密历史
- 这条链路更适合“我现在就登录着微信，想直接把联系人和聊天摘要同步进来”

#### `hicccc77/WeFlow`

- 仓库地址：[github.com/hicccc77/WeFlow](https://github.com/hicccc77/WeFlow)
- 参考代码位置：`C:\Users\86177\Desktop\yinjieAPP\.cache\upstreams\WeFlow`
- 作用：
  - 提供本地微信数据查看、分析、导出和 HTTP API
  - 可通过 `http://127.0.0.1:5031` 暴露联系人、会话、消息等 API

当前项目里，我们接的是它的 HTTP API：

- 联系人列表：`/api/v1/contacts`
- 会话摘要：`/api/v1/sessions`
- 预览时按需拉取消息：`/api/v1/messages`

说明：

- WeFlow 的 `/api/v1/*` 接口需要 Access Token
- 需要先在 WeFlow 的设置中开启 API 服务
- 这条链路更适合“你已经在用 WeFlow 管理本地微信数据，想把其中一部分联系人导入隐界”

### 2.2 仅作参考，不参与当前运行

#### `hellodigua/ChatLab`

- 仓库地址：[github.com/hellodigua/ChatLab](https://github.com/hellodigua/ChatLab)
- 作用：
  - 聊天记录导入后的本地分析、查询、可视化、AI 工作台
  - 它的 standardized format、parser registry、push/pull import
    protocol 很适合我们借鉴到多平台导入层里

当前“一键同步微信朋友”**不依赖** `ChatLab`，也不需要启动它。

### 2.3 平台支持状态

| 平台 / 来源 | 状态 | 说明 |
| --- | --- | --- |
| 微信 4.x + `wechat-decrypt HTTP` | 已落地 | 当前最完整的真实同步链路。 |
| 微信生态导出 + `weflow-http` | 已落地 | 连接器已支持作为本地 HTTP 桥接来源。 |
| 标准化文件 / JSON | 已落地 | 支持 `WechatSyncContactBundle[]`、`ContactImportBundle[]`、ChatLab `JSON/JSONL`。 |
| QQ | 已落地（文件导入） | 当前通过标准化文件导入接入，不提供原生实时连接器。 |
| Telegram | 已落地（文件导入） | 当前通过标准化文件导入接入，不提供原生实时连接器。 |
| Discord | 已落地（文件导入） | 当前通过标准化文件导入接入，不提供原生实时连接器。 |
| WhatsApp / LINE / Instagram | 计划中 | 等标准化导入层前几站跑通后接入。 |

需要特别区分两件事：

1. 当前“页面与后端最后一公里”仍然是 WeChat-shaped，导入契约还是
   `WechatSyncContactBundle`。
2. 当前“连接器与文档规划”已经按多平台导入层思路推进。

## 3. 项目内各模块的职责

### `wechat-decrypt` / `WeFlow`

- 负责面对真实微信数据
- 提供联系人、会话、消息等上游接口

### `apps/wechat-connector`

- 当前负责把不同微信相关上游数据统一转换成项目内部格式
- 长期负责承接 QQ / Telegram / Discord 等平台的标准化导入层
- 负责提供：
  - `GET /health`
  - `GET /api/config`
  - `PATCH /api/config`
  - `POST /api/scan`
  - `GET /api/contacts`
  - `POST /api/contact-bundles`

### `apps/admin`

- 负责“数据源配置、联系人筛选、角色预览、导入历史”的界面
- 不直接读取微信数据库
- 不直接启动 `wechat-decrypt` 或 WeFlow
- 只通过 `17364` 与本地连接器交互

## 4. 端口说明

| 服务 | 作用 | 地址 |
| --- | --- | --- |
| `wechat-decrypt` | 读取微信历史与标签 | `http://127.0.0.1:5678` |
| `WeFlow API` | 读取联系人、会话、消息 | `http://127.0.0.1:5031` |
| `wechat-connector` | 本地适配层 | `http://127.0.0.1:17364` |
| `admin` | 管理后台页面 | `http://127.0.0.1:5181` |

## 5. 前置条件

在开始“一键同步微信朋友”前，请确认：

1. 本机已安装并登录微信 4.x
2. 微信正在运行
3. 本机可访问 `127.0.0.1`
4. 已启动 `wechat-connector`
5. 如果用 `wechat-decrypt`，要先把 `5678` 跑起来
6. 如果用 WeFlow，要先在设置里开启 API 并拿到 Access Token

## 6. 第三方项目操作方法

### 6.1 准备并启动 `wechat-decrypt`

当前本地目录：

```powershell
cd C:\Users\86177\Desktop\yinjieAPP\.cache\upstreams\wechat-decrypt
```

如果第一次使用，先安装依赖：

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

确认 `config.json` 中的 `db_dir` 指向当前微信账号的数据目录，例如：

```json
{
  "db_dir": "C:\\Users\\86177\\xwechat_files\\你的微信ID\\db_storage",
  "keys_file": "all_keys.json",
  "decrypted_dir": "decrypted",
  "wechat_process": "Weixin.exe"
}
```

首次建议先执行一次全量解密：

```powershell
.\.venv\Scripts\python.exe main.py decrypt
```

然后启动 `5678` HTTP 服务：

```powershell
.\.venv\Scripts\python.exe main.py
```

启动后可在浏览器检查：

- [http://127.0.0.1:5678](http://127.0.0.1:5678)
- [http://127.0.0.1:5678/api/history?limit=5](http://127.0.0.1:5678/api/history?limit=5)
- [http://127.0.0.1:5678/api/tags](http://127.0.0.1:5678/api/tags)

### 6.2 准备并启动 `WeFlow API`

参考项目：

- [github.com/hicccc77/WeFlow](https://github.com/hicccc77/WeFlow)
- 本地参考 clone：`C:\Users\86177\Desktop\yinjieAPP\.cache\upstreams\WeFlow`

操作流程：

1. 启动 WeFlow
2. 打开 WeFlow 设置
3. 开启 HTTP API 服务
4. 记下 API 地址，默认一般是 `http://127.0.0.1:5031`
5. 复制 WeFlow 生成或配置的 Access Token

启动后至少检查：

- [http://127.0.0.1:5031/health](http://127.0.0.1:5031/health)

如果你要自己对 API 做验证，WeFlow 文档里推荐用 Header：

```http
Authorization: Bearer <你的Token>
```

### 6.3 启动项目内的 `wechat-connector`

在仓库根目录执行：

```powershell
cd C:\Users\86177\Desktop\yinjieAPP
pnpm dev:wechat-connector
```

启动后可检查：

- [http://127.0.0.1:17364/health](http://127.0.0.1:17364/health)

## 7. 管理后台的一键同步操作流程

### 7.1 打开后台

打开：

- [http://127.0.0.1:5181](http://127.0.0.1:5181)

进入“微信朋友同步”页面。

### 7.2 配置数据源

在“步骤 1 · 连接数据源”中：

1. `连接器地址` 填 `http://127.0.0.1:17364`
2. `数据源` 三选一：
   - `wechat-decrypt HTTP`
   - `WeFlow API`
   - `本地 JSON / 文件`
3. 如果选择 `wechat-decrypt HTTP`
   - `wechat-decrypt 地址` 填 `http://127.0.0.1:5678`
4. 如果选择 `WeFlow API`
   - `WeFlow API 地址` 填 `http://127.0.0.1:5031`
   - `WeFlow Access Token` 填你在 WeFlow 设置中看到的 Token
5. 点击：
   - `保存数据源配置`
   - `刷新连接状态`
   - `刷新本地索引`

如果这一步成功，页面会显示连接成功和联系人数量。

### 7.3 选择联系人

在“步骤 2 · 选择联系人”中：

1. 使用搜索框筛选联系人
2. 勾选要导入的联系人
3. 点击 `生成预览`

说明：

- WeFlow 模式下，扫描阶段先读联系人和会话摘要
- 真正生成预览时，连接器会按需补拉最近消息样本

### 7.4 检查角色预览

在“步骤 3 · 预览、校验与导入”中：

1. 检查系统生成的角色草稿
2. 如有需要，补齐：
   - 角色名
   - 关系定位
   - 简介
   - 领域标签
   - 记忆摘要
3. 如果只想导入一部分预览项，可以只勾选目标项
4. 点击 `导入当前目标`

### 7.5 查看导入结果

导入过程中页面会显示：

- 当前阶段
- 已处理数量
- 当前正在处理的联系人
- 导入成功 / 跳过数量

导入完成后可到“步骤 4 · 导入历史与回滚”中查看：

- 已导入角色
- 好友关系状态
- 回滚入口
- 历史快照恢复入口

## 8. 纯手动 JSON 模式

如果你不想启动 `wechat-decrypt` 或 WeFlow，也可以使用页面里的
`本地 JSON / 文件` 模式。

这种模式下：

1. 不依赖 `5678`
2. 不依赖 `5031`
3. 只要你手头已有 `WechatSyncContactBundle[]`、`ContactImportBundle[]` 或 ChatLab `JSON/JSONL`
4. 一样可以走“生成预览 -> 导入”的后续流程

## 9. 当前限制

目前这套链路有这些限制：

1. 只支持真正导入单聊联系人
2. 群聊目前会出现在列表里，但不会真正导入为角色
3. 后台当前不能一键启动 `wechat-decrypt` 或 WeFlow
4. 当前链路是“从联系人资料读取到隐界”，实时链路目前仍主要面向微信，不是“反向控制真实微信”
5. 不会主动给真实微信好友或群聊发消息
6. WeFlow 的朋友圈、媒体、群成员等更丰富能力当前还没有接进导入链路

## 10. 常见问题排查

### 10.1 后台显示 `fetch failed`

优先检查两层服务：

1. `17364` 是否已启动
2. 当前选中的上游地址是否可访问：
   - `5678`
   - 或 `5031`

可以分别访问：

- [http://127.0.0.1:17364/health](http://127.0.0.1:17364/health)
- [http://127.0.0.1:5678/api/history?limit=5](http://127.0.0.1:5678/api/history?limit=5)
- [http://127.0.0.1:5031/health](http://127.0.0.1:5031/health)

### 10.2 `5678` 能打开，但后台仍读不到联系人

通常要再确认：

1. `config.json` 的 `db_dir` 是否指向当前登录微信账号的数据目录
2. 是否已经执行过一次 `python main.py decrypt`
3. 是否点击过后台里的 `刷新本地索引`

### 10.3 WeFlow 健康检查正常，但扫描失败

通常要再确认：

1. WeFlow API 服务是否真的已开启
2. `WeFlow Access Token` 是否填写正确
3. 当前填的是不是 `http://127.0.0.1:5031`
4. 连接器侧是否已经保存过新的数据源配置

### 10.4 后台提示连接器不可达

说明 `wechat-connector` 没启动，执行：

```powershell
cd C:\Users\86177\Desktop\yinjieAPP
pnpm dev:wechat-connector
```

### 10.5 联系人能看到，但导入按钮不可用

说明当前导入目标里还有未通过校验的草稿字段，需要先在预览区补齐必要信息。

## 11. 推荐的实际使用顺序

### 方案 A：`wechat-decrypt`

1. 启动微信
2. 启动 `wechat-decrypt`
3. 启动 `wechat-connector`
4. 打开管理后台微信同步页
5. 把数据源切到 `wechat-decrypt HTTP`
6. 刷新连接状态
7. 刷新本地索引
8. 选择联系人
9. 生成预览
10. 校验并导入

### 方案 B：`WeFlow API`

1. 启动微信
2. 启动 WeFlow，并在设置里开启 API
3. 记下 `5031` 地址和 Access Token
4. 启动 `wechat-connector`
5. 打开管理后台微信同步页
6. 把数据源切到 `WeFlow API`
7. 填写地址和 Token
8. 保存配置
9. 刷新连接状态
10. 刷新本地索引
11. 选择联系人
12. 生成预览并导入

### 方案 C：手动 JSON

1. 准备好 `WechatSyncContactBundle[]` JSON
2. 打开管理后台微信同步页
3. 直接粘贴或导入 JSON
4. 生成预览并导入

---

如果后续要把这套能力扩展成“主动在真实微信里发消息”，需要新增独立的发送桥接层；
当前这份文档只覆盖“读取微信资料并导入隐界角色”的链路。
