# WeChat Connector Notes

`apps/wechat-connector` 是管理后台微信同步页使用的本地适配层，默认跑在
`http://127.0.0.1:17364`。

它不直接碰微信进程，也不直接解密数据库；它的职责是把不同上游来源统一整理成
项目内部使用的 `WechatSyncContactBundle`，再暴露给后台页面。

## 当前支持的数据源

### 1. `manual-json`

- 直接读取本地 JSON 文件，或通过请求体传入联系人快照
- 适合调试、回放、离线导入

### 2. `wechat-decrypt-http`

- 上游项目：`ylytdeng/wechat-decrypt`
- 默认地址：`http://127.0.0.1:5678`
- 适合直接从运行中的微信 4.x 本地数据库读取历史和标签
- 当前本机验证过的上游 clone 位于：
  `C:\Users\86177\Desktop\yinjieAPP\.cache\upstreams\wechat-decrypt`

说明：

- 上游原始 Web UI 的 `/api/history` 更偏向服务启动后的新增消息
- 本仓库使用的本地 clone 做过一个小 patch，会额外读取解密后的
  `message_*.db`，这样后台扫描联系人时能拿到近期历史

### 3. `weflow-http`

- 上游项目：`hicccc77/WeFlow`
- 默认地址：`http://127.0.0.1:5031`
- 需要在 WeFlow 设置里开启 API 服务，并填写 Access Token
- 第一版接入目前会：
  - 读取联系人列表
  - 读取会话摘要
  - 在生成预览时按需拉取最近消息样本

## 连接器接口

- `GET /health`
- `GET /api/config`
- `PATCH /api/config`
- `POST /api/scan`
- `GET /api/contacts`
- `POST /api/contact-bundles`

## 常用配置字段

- `providerKey`: `manual-json` / `wechat-decrypt-http` / `weflow-http`
- `manualJsonPath`
- `wechatDecryptBaseUrl`
- `weflowBaseUrl`
- `weflowAccessToken`

## 本机运行提示

### 启动连接器

```powershell
cd C:\Users\86177\Desktop\yinjieAPP
pnpm dev:wechat-connector
```

### 检查健康状态

- [http://127.0.0.1:17364/health](http://127.0.0.1:17364/health)

### 常见组合

#### `wechat-decrypt`

1. 启动微信
2. 启动 `wechat-decrypt`
3. 确认 `http://127.0.0.1:5678/api/history?limit=5` 可访问
4. 在后台把数据源切到 `wechat-decrypt HTTP`

#### `WeFlow`

1. 启动 WeFlow
2. 在 WeFlow 设置中开启 HTTP API
3. 记下 API 地址和 Access Token
4. 在后台把数据源切到 `WeFlow API`

## 当前边界

- 连接器目前只负责“读取和整理”，不负责发送微信消息
- 群聊会被读到，但后端当前仍只支持真正导入单聊联系人
- WeFlow 的朋友圈、媒体、群成员等更丰富能力还没有接到当前导入链路里
