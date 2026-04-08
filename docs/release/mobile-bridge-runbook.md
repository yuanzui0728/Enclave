# Mobile Bridge Runbook

日期：2026-04-08
范围：iOS、Android 壳与 `apps/app` Web 层之间的桥接协议

## 目标

统一移动端的运行时注入、安全存储和原生能力桥接，避免后续在 iOS/Android 真机接线时反复改 Web 层接口。

## 当前 Web 层契约

### Runtime

文件：

- `apps/app/src/runtime/native-runtime.ts`

期望来源：

- iOS：`YinjieRuntime.getConfig()`
- Android：manifest/config 注入 + `apps/app/public/runtime-config.json`

至少提供：

- `apiBaseUrl`
- `socketBaseUrl`
- `environment`
- `publicAppName`
- `applicationId`
- `appVersionName`
- `appVersionCode`

### Secure Storage

文件：

- `apps/app/src/runtime/native-secure-storage.ts`
- `apps/app/src/runtime/session-storage.ts`

期望原生插件：

- `YinjieSecureStorage`

方法：

- `get({ key })`
- `set({ key, value })`
- `remove({ key })`

失败策略：

- Web 层自动回退到 `localStorage` / memory

### Mobile Bridge

文件：

- `apps/app/src/runtime/mobile-bridge.ts`

期望原生插件：

- `YinjieMobileBridge`

方法：

- `openExternalUrl({ url })`
- `share({ title?, text?, url? })`
- `pickImages({ multiple? })`
- `getPushToken()`

失败策略：

- 打开外链回退到浏览器
- 分享返回失败但不阻塞主流程
- 图片选择返回空数组
- push token 返回 `null`

## iOS 执行面

已有内容：

- `apps/ios-shell/plugins/YinjieRuntime.md`
- `apps/ios-shell/plugins/YinjieSecureStorage.md`
- `apps/ios-shell/plugins/YinjieMobileBridge.md`
- `apps/ios-shell/plugins/swift-stub/*.swift`
- `apps/ios-shell/scripts/configure-ios-project.mjs`
- `apps/ios-shell/scripts/doctor-ios.mjs`

接线顺序：

1. `pnpm ios:sync`
2. `pnpm ios:configure`
3. 把 `Plugins/*.swift` 加入 Xcode target
4. 先实现 `YinjieRuntime`
5. 再实现 `YinjieSecureStorage`
6. 最后实现 `YinjieMobileBridge`

建议优先级：

1. `getConfig`
2. secure storage
3. push token
4. external url / share
5. image picker

## Android 执行面

已有内容：

- `apps/android-shell/scripts/run-capacitor.mjs`
- `apps/android-shell/android-shell.config.json`
- `apps/android-shell/README.md`

接线顺序：

1. `pnpm android:configure`
2. 确认 `apps/app/public/runtime-config.json` 已写入 fallback 配置
3. 在 Android 原生层补 `YinjieSecureStorage`
4. 在 Android 原生层补 `YinjieMobileBridge`
5. 补 FCM token 与媒体选择

建议优先级：

1. runtime config 注入
2. secure storage
3. push token
4. external url / share
5. image picker

## 真机前检查

- Web 层类型检查通过
- iOS 脚本 `node --check` 通过
- Android 配置脚本可正常生成 runtime fallback 文件
- `Mobile Setup` 能看到：
  - `bootstrapSource`
  - `sessionStorageMode`
  - native bridge 状态

## 完成定义

满足以下条件可认为移动桥接进入可联调状态：

- Web 层已有稳定接口
- iOS/Android 壳已有清晰的接线目标
- 未接通原生桥时主流程不会崩溃
