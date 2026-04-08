# Desktop Client Regression Checklist

日期：2026-04-08
范围：Windows、macOS

## 目标

验证桌面端作为远程客户端是否完整可用，而不是验证本地宿主能力。

## 安装与启动

- 安装包可以正常安装
- 首次启动进入 `Splash -> Setup`
- 未配置服务器地址时不会误连 `localhost`
- 保存服务器地址后可继续进入 Onboarding 或直接进入世界

## 远程连接

- API 地址可保存并在重启后恢复
- Socket 地址可留空或与 API 地址一致
- `/health` 可通过反向代理访问
- WebSocket 可以连接、断线重连和恢复聊天刷新

## 业务入口

- 聊天列表可打开
- 单聊、群聊可正常进入
- 朋友圈、联系人、发现页、个人页可正常进入
- 个人页可读取世界主人资料与自定义 API Key 状态

## 世界主人 API Key

- 可设置个人 API Key
- 可设置可选 API Base URL
- 可清除个人 API Key
- 不回显明文 Key

## 桌面端专属能力

- 原生壳可以提供运行时诊断
- 深链不会破坏世界主人状态
- 本地存储可恢复服务器地址与世界主人信息
- 不再要求桌面端具备 start/stop/restart 本地 Core API 能力

## 发布验收

- Tauri bundle 可产出
- 打包产物中不包含 `yinjie-core-api` sidecar
- 安装后只需要服务器地址即可使用
