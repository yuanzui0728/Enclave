# 一键同步微信朋友操作指南

这份文档说明隐界 APP 管理后台里的“微信朋友同步”是如何工作的、依赖哪些第三方开源项目，以及从准备环境到完成导入的完整操作流程。

## 1. 整体架构

当前“一键同步微信朋友”使用的是三层结构：

1. `微信客户端`
   - 提供正在运行的微信进程和本地数据库。
2. `ylytdeng/wechat-decrypt`
   - 从微信进程中提取数据库密钥。
   - 解密微信数据库。
   - 通过 `http://127.0.0.1:5678` 提供 `/api/history`、`/api/tags` 等 HTTP 接口。
3. `apps/wechat-connector`
   - 运行在 `http://127.0.0.1:17364`。
   - 读取 `5678` 的原始历史和标签数据。
   - 聚合为项目自己的联系人快照格式。
   - 给管理后台提供稳定的本地接口。
4. `apps/admin`
   - 运行在 `http://127.0.0.1:5181`。
   - 提供“选择联系人 -> 生成预览 -> 导入角色”的完整 UI。

可以把它理解为：

`微信 -> wechat-decrypt:5678 -> wechat-connector:17364 -> admin:5181`

## 2. 用到的第三方开源项目

### 2.1 实际使用中的项目

#### `ylytdeng/wechat-decrypt`

- 仓库地址：<https://github.com/ylytdeng/wechat-decrypt>
- 当前本地代码位置：`./.cache/upstreams/wechat-decrypt`
- 用途：
  - 适配微信 4.x 的本地数据库结构
  - 从运行中的微信进程提取 key
  - 解密联系人、会话、消息数据库
  - 提供本机 `5678` HTTP 服务

当前项目实际就是基于这个项目来读取微信历史和标签。

> 说明：本仓库里的本地 clone 做过一个小 patch，用于让 `/api/history` 能读到近期历史消息，而不只是服务启动后的新增消息。这是为了让管理后台扫描联系人时能拿到可用历史。

### 2.2 仅作参考，不参与当前实际运行

#### `hellodigua/ChatLab`

- 仓库地址：<https://github.com/hellodigua/ChatLab>
- 用途：
  - 更偏向聊天记录导入后的本地分析和展示
  - 可以作为 schema、分析流程、界面交互的参考

当前“一键同步微信朋友”**不依赖** `ChatLab`。要跑通后台导入流程，不需要安装或启动它。

## 3. 项目内各模块的职责

### `ylytdeng/wechat-decrypt`

- 负责直接面对微信进程和本地数据库
- 负责提 key、解密、提供 `5678` HTTP 接口

### `apps/wechat-connector`

- 负责把 `wechat-decrypt` 的原始数据转成隐界项目自己的统一格式
- 负责提供：
  - `/health`
  - `/api/config`
  - `/api/scan`
  - `/api/contacts`
  - `/api/contact-bundles`

### `apps/admin`

- 负责“数据源配置、联系人筛选、角色预览、导入历史”的界面
- 不直接读取微信数据库
- 不直接启动 `wechat-decrypt`
- 只通过 `17364` 与本地连接器交互

## 4. 端口说明

| 服务 | 作用 | 地址 |
| --- | --- | --- |
| `wechat-decrypt` | 读取微信历史与标签 | `http://127.0.0.1:5678` |
| `wechat-connector` | 本地适配层 | `http://127.0.0.1:17364` |
| `admin` | 管理后台页面 | `http://127.0.0.1:5181` |

## 5. 前置条件

在开始“一键同步微信朋友”前，请确认：

1. 本机已安装并登录微信 4.x
2. 微信正在运行
3. 能定位到微信的本地数据目录
4. 本机可访问 `127.0.0.1`
5. 当前后台页面不会自动帮你启动 `wechat-decrypt`

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

- <http://127.0.0.1:5678>
- <http://127.0.0.1:5678/api/history?limit=5>
- <http://127.0.0.1:5678/api/tags>

### 6.2 启动项目内的 `wechat-connector`

在仓库根目录执行：

```powershell
cd C:\Users\86177\Desktop\yinjieAPP
pnpm dev:wechat-connector
```

启动后可检查：

- <http://127.0.0.1:17364/health>

## 7. 管理后台的一键同步操作流程

### 7.1 打开后台

打开：

- <http://127.0.0.1:5181>

进入“微信朋友同步”页面。

### 7.2 配置数据源

在“步骤 1 · 连接数据源”中：

1. `连接器地址` 填 `http://127.0.0.1:17364`
2. `数据源` 选择 `wechat-decrypt HTTP`
3. `wechat-decrypt 地址` 填 `http://127.0.0.1:5678`
4. 点击：
   - `保存数据源配置`
   - `刷新连接状态`
   - `刷新本地索引`

如果这一步成功，页面会显示连接成功和联系人数量。

### 7.3 选择联系人

在“步骤 2 · 选择联系人”中：

1. 使用搜索框筛选联系人
2. 勾选要导入的联系人
3. 点击 `生成预览`

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

如果你不想启动 `wechat-decrypt`，也可以使用页面里的 `本地 JSON / 文件` 模式。

这种模式下：

1. 不依赖 `5678`
2. 只要你手头已经有 `WechatSyncContactBundle[]` 格式的联系人快照 JSON
3. 直接粘贴到后台手动导入区
4. 一样可以走“生成预览 -> 导入”的后续流程

## 9. 当前限制

目前这套链路有这些限制：

1. 只支持导入单聊联系人
2. 群聊目前不会真正导入为角色
3. 后台当前不能一键启动 `wechat-decrypt`
4. 当前链路是“从微信读取到隐界”，不是“反向控制真实微信”
5. 不会主动给真实微信好友或群聊发消息

## 10. 常见问题排查

### 10.1 后台显示 `fetch failed`

优先检查两层服务：

1. `5678` 是否已启动
2. `17364` 是否已启动

可以分别访问：

- <http://127.0.0.1:5678/api/history?limit=5>
- <http://127.0.0.1:17364/health>

### 10.2 `5678` 能打开，但后台仍读不到联系人

通常要再确认：

1. `config.json` 的 `db_dir` 是否指向当前登录微信账号的数据目录
2. 是否已经执行过一次 `python main.py decrypt`
3. 是否点击过后台里的 `刷新本地索引`

### 10.3 后台提示连接器不可达

说明 `wechat-connector` 没启动，执行：

```powershell
cd C:\Users\86177\Desktop\yinjieAPP
pnpm dev:wechat-connector
```

### 10.4 联系人能看到，但导入按钮不可用

说明当前导入目标里还有未通过校验的草稿字段，需要先在预览区补齐必要信息。

## 11. 推荐的实际使用顺序

推荐每次按下面顺序操作：

1. 启动微信
2. 启动 `wechat-decrypt`
3. 启动 `wechat-connector`
4. 打开管理后台微信同步页
5. 刷新连接状态
6. 刷新本地索引
7. 选择联系人
8. 生成预览
9. 校验并导入
10. 到导入历史区复核结果

---

如果后续要把这套能力扩展成“主动在真实微信里发消息”，需要新增独立的发送桥接层；当前这份文档只覆盖“读取微信资料并导入隐界角色”的链路。
