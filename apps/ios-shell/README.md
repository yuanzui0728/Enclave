# iOS Shell

`apps/ios-shell` 是隐界 iOS 上架路线的 Capacitor 原生壳。

## 当前状态

- 已提供基础 `package.json`
- 已提供 `capacitor.config.ts`
- 已接通 `sync` / `open` / `doctor` / `configure` 脚本
- 预期复用 `apps/app/dist` 作为 Web UI 产物
- `ios/App/App/Plugins/` 已有 `YinjieRuntime` / `YinjieSecureStorage` / `YinjieMobileBridge` 实现
- `YinjieMobileBridge` 当前已接通系统图片选择、系统文件选择、系统相机拍照、外链、文本分享、文件分享、通知权限与通知落点恢复
- 真实 `AppDelegate.swift` 已缓存 APNs token 与通知点击落点
- 真实 `Info.plist` 已补运行时键位和相机 / 麦克风权限文案
- `doctor` 会检查是否在 macOS、是否已生成 `ios/` 工程、`Info.plist` 权限文案、`AppDelegate` push 缓存逻辑以及远程 Core API 地址

## 后续接入顺序

1. 在 macOS 上安装依赖
2. 执行 `pnpm --dir apps/ios-shell install`
3. 执行 `pnpm --dir apps/ios-shell run doctor`
4. 执行 `pnpm --dir apps/ios-shell run sync`
5. 执行 `pnpm --dir apps/ios-shell run configure`
6. 执行 `pnpm --dir apps/ios-shell run open`
7. 参考 `xcode-template/` 与 `docs/ios-xcode-integration-checklist.md`
8. 在 Xcode 中补齐签名、Capabilities、Keychain、Push、Privacy 文案
9. 按需把 `xcode-template/` 里的示例能力同步到真实工程；`configure` 现在只会补种子，不会覆盖已有 plugin

## iOS Runtime 注入

当前 iOS 壳优先从以下位置向 Web 层提供运行时配置：

1. bundle 内 `runtime-config.json`
2. `Info.plist`
   - `YinjieApiBaseUrl`
   - `YinjieSocketBaseUrl`
   - `YinjieEnvironment`
   - `YinjiePublicAppName`

其中 `apiBaseUrl` / `socketBaseUrl` / `environment` 现在以同步进壳的 `runtime-config.json` 为准，`Info.plist` 只保留兜底与静态展示字段。

原生 plugin：

- `YinjieRuntime`
- `YinjieSecureStorage`
- `YinjieMobileBridge`

Push token 约定：

- APNs token 由原生 `AppDelegate` 写入 `UserDefaults.standard["YinjiePushToken"]`
- `YinjieMobileBridge.getPushToken()` 读取该值并返回给 Web 层

通知点击落点约定：

- 原生 `AppDelegate` 在通知点击回调里把 payload 写入 `UserDefaults.standard["YinjiePendingLaunchTarget"]`
- payload 支持 `kind / route / conversationId / groupId / source`
- `YinjieMobileBridge.getPendingLaunchTarget()` / `clearPendingLaunchTarget()` 负责让 Web 层消费这条落点

## 关键环境变量

- `YINJIE_IOS_CORE_API_BASE_URL`
- `YINJIE_IOS_SOCKET_BASE_URL`（可选，默认等于 `YINJIE_IOS_CORE_API_BASE_URL`）
- `YINJIE_IOS_ENVIRONMENT`（可选，默认 `production`）
- `YINJIE_IOS_PUBLIC_APP_NAME`（可选，默认 `Yinjie`）

`pnpm ios:sync` 会基于这些变量生成打包进 iOS App 的 `runtime-config.json`。
其中 `YINJIE_IOS_CORE_API_BASE_URL` 是必填项；未设置时，同步会直接失败，避免把示例地址打进壳里。

## configure 行为

- `pnpm ios:configure` 会始终刷新 `xcode-template/` 下的示例文件
- `ios/App/App/Plugins/` 下的三个 plugin 文件只会在缺失时补种子，不会覆盖现有实现
