# iOS Shell Sync Plan

日期：2026-04-20  
范围：`apps/ios-shell` 与 `apps/app` 手机端共用代码同步、壳层接线、回归准备

## 结论

- `apps/app` 已经是 iOS / Android / Web 共用的手机端前端代码，iOS 壳不需要单独搬运页面代码。
- 真正需要同步到 `apps/ios-shell` 的内容是：移动端 Web 构建产物、运行时配置、Capacitor 原生插件、Xcode target membership、iOS 真机回归。
- 本轮确认到的主要壳层阻塞不是业务页面，而是 iOS 原生插件注册不完整。

## 本轮已处理

- 给 `YinjieRuntime` / `YinjieSecureStorage` / `YinjieMobileBridge` 补齐 Capacitor 7 `CAPBridgedPlugin` 元数据。
- 把三个 Swift plugin 纳入 `ios/App/App.xcodeproj` 的 `App/Plugins` group 与 `Sources` build phase。
- 升级 `apps/ios-shell/scripts/configure-ios-project.mjs`，让 `pnpm ios:configure` 在补模板时同时修正 target membership。
- 升级 `apps/ios-shell/scripts/doctor-ios.mjs`，新增 bridge 元数据、photo library 权限、plugin target membership 检查。
- 修正 iOS `YinjieMobileBridge` 资源返回结构，`pickImages / pickFile / captureImage` 现在优先返回 Capacitor portable `webPath`。
- 给 Web 层原生文件资源读取补降级处理，遇到 `file://` / `content://` 也会自动走 `Capacitor.convertFileSrc(...)`。
- 修正 iOS 分享面板在 iPad 场景下缺少 popover anchor 的崩溃风险。
- `configure` 现在会在缺少关键字段时补真实 `Info.plist` 的 runtime fallback keys、权限文案和 `UIBackgroundModes.remote-notification`。
- `configure` 现在会在缺少关键逻辑时补真实 `AppDelegate.swift` 的 push token 缓存和 pending launch target 缓存逻辑。
- 新增 `pnpm ios:audit`，把 `prepare:web + doctor` 收敛成一条检查命令。
- 更新 `apps/ios-shell/README.md` 和 `docs/release/mobile-bridge-runbook.md`，把当前真实契约与接线顺序写清楚。

## 已确认风险

### P0

- 若 `App.xcodeproj` 未包含三个 Yinjie Swift plugin，Web 层会在 iOS 真机里拿不到原生插件，文件分享、文件预览、拍照、通知权限、通知落点恢复都会退回降级逻辑。
- 若 plugin 只有 `CAPPlugin` 子类、没有 `CAPBridgedPlugin` 元数据，Capacitor 7 无法正确导出 `YinjieRuntime` / `YinjieSecureStorage` / `YinjieMobileBridge`。

### P1

- `pnpm ios:sync` 仍依赖 `YINJIE_IOS_CORE_API_BASE_URL`，未设置时不会产出可用的 iOS runtime config。
- Linux / Windows 环境只能完成脚本与工程文件准备，真机编译、签名、Capabilities、Push 联调仍必须在 macOS + Xcode 上完成。
- 若后续新增原生资源返回结构，必须继续遵守“`webPath` 返回 portable path，或让 Web 层可用 `convertFileSrc` 自修复”这个约束。

## 同步顺序

1. 先在 `apps/app` 完成手机端 Web 改动，并通过 `typecheck` / `lint:mobile-web` / `build`。
2. 设置 `YINJIE_IOS_CORE_API_BASE_URL`，必要时补 `YINJIE_IOS_SOCKET_BASE_URL` / `YINJIE_IOS_ENVIRONMENT` / `YINJIE_IOS_PUBLIC_APP_NAME`。
3. 执行 `pnpm ios:sync`，把最新 `apps/app/dist` 与 `runtime-config.json` 注入到 iOS 壳。
4. 执行 `pnpm ios:configure`，刷新模板、补缺失 plugin 文件，并修正 `App.xcodeproj` 的 plugin target membership。
5. 在 macOS 上执行 `pnpm ios:doctor`，确认权限键位、push 缓存、plugin bridge、target membership、运行时配置全部通过。
6. 打开 Xcode 做签名、Capabilities、Push、Keychain、真机回归。

## 回归重点

- 启动与路由恢复：冷启动、杀进程重开、通知点击拉起后，仍能进入正确页面。
- 原生桥接：`YinjieRuntime`、`YinjieSecureStorage`、`YinjieMobileBridge` 在真机里可调用，不走 Web 降级。
- 文件与媒体：选图、拍照、选文件、分享文件、预览文件链路全部可用。
- 通知：通知权限申请、APNs token 缓存、本地通知展示、通知点击落点恢复正常。
- 聊天高风险链路：键盘顶起、滚动、附件发送、分享/复制、图片/文件打开。

## 当前建议

- 后续每轮手机端 Web 大改后，固定执行一次 `pnpm --filter @yinjie/app lint:mobile-web` + `pnpm ios:configure` + `pnpm ios:doctor`。
- 真机回归优先覆盖 `聊天 / 朋友圈 / 视频号 / 游戏 / 小程序 / 公众号 / 通知落点` 这些最近还在变动的移动链路。
