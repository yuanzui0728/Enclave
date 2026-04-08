# 隐界

隐界是一个面向“单用户世界实例”的 AI 社交产品仓库。

核心口径：
- `1 个服务端实例 = 1 个真实用户的世界`
- `app / web / desktop / mobile shell` 都只是连接这个世界的可视化壳
- 官方云与自部署复用同一套客户端入口体验
- 管理后台只负责实例运维，不承载实例内用户管理
- 云平台当前负责手机号验证、世界记录与地址回填，不负责自动编排世界实例

## 当前架构

- 世界实例后端：`api/`
  - NestJS + TypeORM + SQLite + Socket.IO
- 共享业务前端：`apps/app/`
  - React + Vite
- 桌面端壳：`apps/desktop/`
  - Tauri 远程客户端壳
- 移动端壳：
  - `apps/android-shell/`
  - `apps/ios-shell/`
  - 通过 Capacitor 承载同一套前端
- 实例管理后台：`apps/admin/`
- 官方云平台：
  - `apps/cloud-api/`
  - `apps/cloud-console/`

## 运行模式

- 所有客户端都连接远程世界实例
- 客户端不在本地拉起 Core API
- 服务端启动时会执行“世界主人单例迁移”
  - 旧库中若存在多个用户，只保留 `createdAt` 最早的一条作为世界主人
  - 其余用户及其专属数据会被清理
- 聊天、社交、朋友圈、视频号等业务不再依赖外部传入 `userId` 选世界

## 世界主人 API

```http
GET    /api/world/owner
PATCH  /api/world/owner
PATCH  /api/world/owner/api-key
DELETE /api/world/owner/api-key
```

## 快速开始

```bash
pnpm install
cp api/.env.example api/.env
docker compose up -d
```

健康检查：

```bash
curl http://localhost:3000/health
```

首次进入客户端后的流程：

1. 进入 `Setup`
2. 选择云世界或本地世界
3. 填写世界实例地址，或通过手机号进入云世界
4. 若世界主人尚未初始化，则进入 `Onboarding`
5. 进入聊天、社交与世界内容流

## Android 启动

首次运行前确认本地后端可访问，并按需调整 `apps/android-shell/android-shell.config.local.json` 中的 `apiBaseUrl` / `socketBaseUrl`。

```bash
pnpm android:run
```

这个命令会自动：
- 补全 `ANDROID_SDK_ROOT`
- 检查并在本地下载 JDK 21（当系统 Java 低于 21 时）
- 连接现有模拟器，或自动启动第一个可用 AVD
- 构建 Web 包、同步 Capacitor、安装 Debug 包并拉起 App

如果你要本地联调后端和安卓壳，直接执行：

```bash
pnpm android:run:local
```

或者直接运行仓库根目录脚本：

```bash
./start-android-emulator.sh
```

这个命令会先在 `127.0.0.1:39092` 启动隐界 API，再把安卓模拟器配置成访问 `10.0.2.2:39092`。

## 文档

- [部署指南](DEPLOY.md)
- [多端产品线说明](docs/product-lines.md)
- [桌面端回归清单](docs/release/desktop-host-regression.md)
- [移动端回归清单](docs/release/mobile-client-regression.md)
