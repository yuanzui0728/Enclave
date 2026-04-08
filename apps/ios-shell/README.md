# iOS Shell

`apps/ios-shell` 是隐界 iOS 上架路线的原生壳骨架，当前采用 Capacitor 方向。

## 当前状态

- 已提供基础 `package.json`
- 已提供 `capacitor.config.ts`
- 已预留 `sync` / `open` / `doctor` / `configure` 脚本
- 预期复用 `apps/app/dist` 作为 Web UI 产物
- 已补 `plugins/` 规范与 `xcode-template/` 样例文件
- `doctor` 会检查是否在 macOS、是否已生成 `ios/` 工程、是否已配置远程 Core API 地址

## 后续接入顺序

1. 在 macOS 上安装依赖
2. 执行 `pnpm --dir apps/ios-shell install`
3. 执行 `pnpm --dir apps/ios-shell doctor`
4. 执行 `pnpm --dir apps/ios-shell sync`
5. 执行 `pnpm --dir apps/ios-shell configure`
6. 执行 `pnpm --dir apps/ios-shell open`
7. 参考 `xcode-template/` 与 `docs/ios-xcode-integration-checklist.md`
8. 在 Xcode 中补齐签名、Capabilities、Keychain、Push、Privacy 文案
9. 将 `xcode-template/AppDelegatePush.example.swift` 的 APNs token 缓存逻辑并入真实 `AppDelegate`

## iOS Runtime 注入

当前 iOS 壳优先从以下位置向 Web 层提供运行时配置：

1. `Info.plist`
   - `YinjieApiBaseUrl`
   - `YinjieSocketBaseUrl`
   - `YinjieEnvironment`
   - `YinjiePublicAppName`
2. bundle 内 `runtime-config.json`

原生 plugin：

- `YinjieRuntime`
- `YinjieSecureStorage`
- `YinjieMobileBridge`

Push token 约定：

- APNs token 由原生 `AppDelegate` 写入 `UserDefaults.standard["YinjiePushToken"]`
- `YinjieMobileBridge.getPushToken()` 读取该值并返回给 Web 层

## 关键环境变量

- `YINJIE_IOS_CORE_API_BASE_URL`

这条变量用于标记 iOS 发布链路连接的远程 Core API 地址。Web 层仍通过 `VITE_CORE_API_BASE_URL` 注入实际请求地址。
