# iOS Shell

`apps/ios-shell` 是隐界 iOS 上架路线的 Capacitor 原生壳。

## 当前能力

- Capacitor 7.x，`ios.scheme = "capacitor"`，`server.androidScheme` / `hostname` 一律不写
- `apps/app/dist` 作为 Web UI 产物；`runtime-config.json` 注入 `apiBaseUrl/socketBaseUrl/environment/publicAppName`
- 三个 Swift plugin：`YinjieRuntime`（含 `getConfig` / `getLocale` / `setLocale`）、`YinjieSecureStorage`（Keychain 包装）、`YinjieMobileBridge`（系统图片选择 / 文件选择 / 拍照 / 外链 / 分享 / 文件预览 / 通知权限 / 通知落点恢复）
- 完整 4 语本地化（zh-Hans / en / ja / ko）通过 `InfoPlist.strings` 驱动 App 显示名、`YinjiePublicAppName` 与系统权限弹窗
- `Info.plist` 已声明 `NSAppTransportSecurity`（严格 HTTPS）、`UIRequiredDeviceCapabilities = arm64`、`ITSAppUsesNonExemptEncryption=false`（跳过 App Store 出口合规弹窗）、`CFBundleLocalizations` + `CFBundleAllowMixedLocalizations`、`LSApplicationQueriesSchemes`
- `capacitor.config.ts` 强制 iPad 跑手机布局（`preferredContentMode="mobile"`）
- `App.entitlements` / `PrivacyInfo.xcprivacy` 已就位；`AppDelegate.swift` 已缓存 APNs token 与通知落点
- 全量 release 流：`ios:doctor:release` → `ios:ipa:release`（archive + export 一条龙），支持自动 / 手动签名、可选 App Store Connect 上传

## 快速上手（macOS 上）

1. `pnpm install`（仓库根目录，第一次需要装齐全部依赖）
2. `cp apps/ios-shell/ios-release.env.example apps/ios-shell/ios-release.env.local`
3. 填好 `ios-release.env.local` 里至少这些字段：
   - `YINJIE_IOS_CORE_API_BASE_URL`
   - `YINJIE_IOS_BUNDLE_IDENTIFIER`
   - `YINJIE_IOS_MARKETING_VERSION`
   - `YINJIE_IOS_BUILD_NUMBER`
   - `YINJIE_IOS_DEVELOPMENT_TEAM`
   - `YINJIE_IOS_CODE_SIGN_STYLE`（`Automatic` 或 `Manual`）
   - `YINJIE_IOS_APS_ENVIRONMENT`（`production` 配 app-store / ad-hoc 走 TestFlight、外发）
   - `YINJIE_IOS_EXPORT_METHOD`（`app-store-connect` / `release-testing` / `debugging` / `enterprise`）
4. `pnpm ios:doctor:release` — 把所有 env 项 + 工程当前状态过一遍；任意 WARN 都阻断
5. `pnpm ios:doctor` — 加上工程结构相关的检查
6. `pnpm ios:ipa:release` — 一条龙：`prepare:web` → `cap sync ios` → `configure` → `pod install` → `xcodebuild archive` → `xcodebuild exportArchive`
7. IPA 产出位置：`apps/ios-shell/build/ios/Export/*.ipa`

中间可断点：

| 命令 | 作用 |
| --- | --- |
| `pnpm ios:archive` | 跑到 archive 为止，产物 `build/ios/App.xcarchive` |
| `pnpm ios:export` | archive + export，产物 `build/ios/Export/*.ipa` |
| `pnpm ios:ipa` / `pnpm ios:ipa:release` | 同 export，外加可选 App Store Connect 上传 |

`build-ios-ipa.mjs` 支持额外参数：

- `--skip-prepare-web`：跳过 web 打包（用于已 prepare:web 之后只重打原生层）
- `--skip-sync` / `--skip-configure` / `--skip-pod-install`：分阶段跳过
- `--stop-at=configure|archive|export`：到指定阶段停

## 自动 vs 手动签名

- **自动签名（默认）**：把 `YINJIE_IOS_CODE_SIGN_STYLE=Automatic` 留着，Xcode 会按 `DEVELOPMENT_TEAM` + bundle id 自动找/拉 provisioning profile。第一次构建需要本机已登录 Apple ID 且 Apple Developer 账号已 invite 加成员。CI 上跑这条路要确保 `keychain` 已经 `unlock` 并装好对应 certificate。
- **手动签名**：`YINJIE_IOS_CODE_SIGN_STYLE=Manual` + `YINJIE_IOS_PROVISIONING_PROFILE_SPECIFIER` + `YINJIE_IOS_CODE_SIGN_IDENTITY`。`build-ios-ipa.mjs` 会把这些值塞进 `xcodebuild` 命令行 + 渲染 ExportOptions.plist 的手动签名段落。

## App Store Connect 自动上传（可选）

`ios-release.env.local` 里同时设置：

```
export YINJIE_IOS_APPSTORE_API_KEY_ID="ABCD123456"
export YINJIE_IOS_APPSTORE_API_ISSUER_ID="abcd1234-ef56-7890-ab12-cdef34567890"
export YINJIE_IOS_APPSTORE_API_KEY_PATH="/absolute/path/to/AuthKey_ABCD123456.p8"
```

`pnpm ios:ipa:release` 会在 export 成功后自动 `xcrun altool --upload-app` 推到 App Store Connect 处理队列。

## iOS Runtime 注入

iOS 壳优先从以下位置读取运行时配置：

1. bundle 内 `runtime-config.json`（由 `pnpm ios:sync` 通过 `inject-runtime-config.mjs` 注入）
2. `Info.plist`
   - `YinjieApiBaseUrl`
   - `YinjieSocketBaseUrl`
   - `YinjieCloudApiBaseUrl`
   - `YinjieEnvironment`
   - `YinjiePublicAppName`

`apiBaseUrl` / `socketBaseUrl` / `cloudApiBaseUrl` / `environment` 以 `runtime-config.json` 为准，`Info.plist` 只是兜底。

原生 plugin 列表：

- `YinjieRuntime`：`getConfig` 暴露 platform/env/版本号/preferredLocales/bundled config；`getLocale` / `setLocale` 处理 zh-CN / en-US / ja-JP / ko-KR 4 个 locale 的持久化偏好
- `YinjieSecureStorage`：Keychain `genericPassword` 包装的 get/set/remove
- `YinjieMobileBridge`：openExternalUrl / openAppSettings / share / shareFile / openFile / pickImages / pickFile / captureImage / getPushToken / get|requestNotificationPermission / showLocalNotification / get|clearPendingLaunchTarget

Push token 约定：

- APNs token 由原生 `AppDelegate` 写入 `UserDefaults.standard["YinjiePushToken"]`
- `YinjieMobileBridge.getPushToken()` 读取该值并返回给 Web 层

通知点击落点约定：

- 原生 `AppDelegate` 在通知点击回调里把 payload 写入 `UserDefaults.standard["YinjiePendingLaunchTarget"]`
- payload 支持 `kind / route / conversationId / groupId / source`
- `getPendingLaunchTarget` / `clearPendingLaunchTarget` 让 Web 层消费这条落点

## 多语言约定

- iOS 壳支持简体中文、英文、日语、韩语
- `YinjieRuntime.getConfig()` 会把 `Locale.preferredLanguages` 作为 `preferredLocales` 返回给 `apps/app`，业务界面据此跟随 iOS 系统语言
- 用户在 App 内「我 → 设置 → 语言」手动切换后，`YinjieRuntime.setLocale` 会把偏好持久化到 `UserDefaults["YinjieAppLocale"]` + `AppleLanguages`，下次启动自动恢复
- iOS 系统可见文案（App 显示名、权限弹窗）由 `InfoPlist.strings` 本地化，由 iOS 系统读取，不会被 Web 内即时语言切换改写

## 关键环境变量

| 变量 | 必填 | 说明 |
| --- | :-: | --- |
| `YINJIE_IOS_CORE_API_BASE_URL` | ✓ | 业务后端入口（https） |
| `YINJIE_IOS_SOCKET_BASE_URL` |  | 默认等于 `YINJIE_IOS_CORE_API_BASE_URL` |
| `YINJIE_IOS_CLOUD_API_BASE_URL` | ✓ | cloud-api 多租户反代入口；不显式设（env 或 `ios-shell.config(.local).json` 任一处）`inject-runtime-config.mjs` 会 `process.exit(1)`，跟 `YINJIE_IOS_CORE_API_BASE_URL` 同等约束（capacitor:// 没法 origin 回落） |
| `YINJIE_IOS_ENVIRONMENT` |  | 默认 `production` |
| `YINJIE_IOS_PUBLIC_APP_NAME` |  | 默认 `Yinjie` |
| `YINJIE_IOS_BUNDLE_IDENTIFIER` | ✓ | reverse-DNS bundle id |
| `YINJIE_IOS_MARKETING_VERSION` | ✓ | 形如 `1.0.0` |
| `YINJIE_IOS_BUILD_NUMBER` | ✓ | 整数；每次上传必须递增 |
| `YINJIE_IOS_DEVELOPMENT_TEAM` | ✓ | 10 字符 Team ID |
| `YINJIE_IOS_CODE_SIGN_STYLE` | ✓ | `Automatic` / `Manual` |
| `YINJIE_IOS_PROVISIONING_PROFILE_SPECIFIER` | * | 手动签名时必填 |
| `YINJIE_IOS_CODE_SIGN_IDENTITY` | * | 手动签名时必填 |
| `YINJIE_IOS_APS_ENVIRONMENT` | * | `production` 上 TestFlight / App Store / Ad-Hoc |
| `YINJIE_IOS_ASSOCIATED_DOMAIN` |  | universal link 域名，形如 `applinks:yinjie.app` |
| `YINJIE_IOS_EXPORT_METHOD` | ✓ | `app-store-connect` / `release-testing` / `debugging` / `enterprise` |
| `YINJIE_IOS_EXPORT_OPTIONS_PLIST` |  | 指定自定义 ExportOptions.plist；不写则按模板自动渲染 |
| `YINJIE_IOS_XCODE_SCHEME` |  | 默认 `App` |
| `YINJIE_IOS_XCODE_CONFIGURATION` |  | 默认 `Release` |
| `YINJIE_IOS_APPSTORE_API_KEY_ID` |  | 三个都设则 export 后自动 `xcrun altool` 上传 |
| `YINJIE_IOS_APPSTORE_API_ISSUER_ID` |  | 同上 |
| `YINJIE_IOS_APPSTORE_API_KEY_PATH` |  | 同上；`.p8` 私钥绝对路径 |

`YINJIE_IOS_RELEASE_ENV_FILE`：可选，指向 `ios-release.env.local` 之外的 env 文件路径。

## WebView origin & ATS 契约

- iOS 壳使用 Capacitor 默认 WebView origin（`capacitor://localhost`），不在 `capacitor.config.ts` 设置 `server.hostname`。WKWebView 把 origin 当作 cookie / `localStorage` / `IndexedDB` 的分区键，**一旦带 `hostname` 的版本上了 TestFlight，再改或删 `hostname` 会导致已安装设备的 Web 持久化数据丢失**。当前壳尚未 TestFlight，所以现在切回默认 origin 是安全的；后续不再改。
- 已声明 `NSAppTransportSecurity`，禁止 `NSAllowsArbitraryLoads`：业务接口必须全 HTTPS（与 `YINJIE_IOS_CORE_API_BASE_URL` 契约一致）。如果未来需要走 HTTP 的 dev/admin 链路，请显式加 `NSExceptionDomains` 子项而不是开 `NSAllowsArbitraryLoads`。
- `UIRequiredDeviceCapabilities` 已升到 `arm64`（取代过期的 `armv7`），符合 App Store 仅接受 arm64 的提交规则。

## configure 行为

- `pnpm ios:configure` 会始终刷新 `xcode-template/` 下的示例文件
- `ios/App/App/Plugins/` 下的三个 plugin 文件只会在缺失时补种子，不会覆盖现有实现
- 若 `ios/App/App.xcodeproj/project.pbxproj` 存在，`configure` 还会确保三个 plugin 文件处于 `App/Plugins` group，并加入 `Sources` build phase
- `ios/App/App/App.entitlements` 与 `ios/App/App/PrivacyInfo.xcprivacy` 会在缺失时按模板补种子，并接入 `CODE_SIGN_ENTITLEMENTS` / `Resources`
- `ios/App/App/Info.plist` 与 `ios/App/App/AppDelegate.swift` 会在缺少关键键位或 push 落点缓存逻辑时补齐，但不会覆盖已有实现
- `ios/App/App/{zh-Hans,en,ja,ko}.lproj/InfoPlist.strings` 会按当前壳内置文案同步，并确保 `InfoPlist.strings` 加入 Xcode resources
- 检测到 `Info.plist` 里的显示名 / 权限文案仍是历史硬编码 zh/英文，会自动改空让 `InfoPlist.strings` 接管；`UIRequiredDeviceCapabilities = armv7` 会自动改 `arm64`；缺 `NSAppTransportSecurity` 会自动补严格块；缺 `ITSAppUsesNonExemptEncryption` / `CFBundleLocalizations` / `CFBundleAllowMixedLocalizations` / `LSApplicationQueriesSchemes` 也会自动补
- 当 `YINJIE_IOS_BUNDLE_IDENTIFIER` / `MARKETING_VERSION` / `BUILD_NUMBER` / `DEVELOPMENT_TEAM` / `CODE_SIGN_STYLE` / `PROVISIONING_PROFILE_SPECIFIER` / `CODE_SIGN_IDENTITY` 任一存在，会把对应字段刷进 `project.pbxproj`
- 当 `YINJIE_IOS_APS_ENVIRONMENT` / `YINJIE_IOS_ASSOCIATED_DOMAIN` / `YINJIE_IOS_BUNDLE_IDENTIFIER` 存在，会把对应字段写入 `App.entitlements`（aps-environment / associated-domains / keychain-access-groups）
- 检测到 `capacitor.config.ts` 仍写了 `server.androidScheme` / `server.hostname` 或没声明 `ios.scheme`，会打印 `warn`（TS 不自动改写，避免破坏注释结构；按 doctor 输出手改一次即可）

## 建议检查命令

| 命令 | 作用 |
| --- | --- |
| `pnpm ios:doctor` | 工程结构 + 模板 + 文件落点检查（macOS / Linux 都能跑） |
| `pnpm ios:doctor:release` | release env + 工程签名一致性检查（按 `ios-release.env.local` 加载） |
| `pnpm ios:audit` | 等价于 `pnpm ios:doctor` + 顺手把 web 产物准备好（不能裸出 IPA） |

## CI 备忘

- macOS runner 上至少安装：Xcode（≥ 15）、CocoaPods（`sudo gem install cocoapods`）、Node 18+
- 签名证书：手动签名走 keychain import；自动签名要求 Apple ID 已登录 Xcode
- `ios-release.env.local` 不要 commit；在 CI 上用 secret 写出 `ios-release.env.local` 或导出环境变量后跑 `pnpm ios:ipa:release`
- 单次 build 输出已 gitignore，不会污染工作区

## GitHub Actions（`.github/workflows/ios-release.yml`）

仓库带了一个 macOS 14 runner 的 workflow，触发方式：

- **手动**：Actions tab → "iOS Release" → Run workflow，可指定 marketingVersion / buildNumber / exportMethod / 是否上传 TestFlight；不填走 `ios-shell.config.json` 的默认值
- **打 tag**：`git tag app-v1.0.1 && git push origin app-v1.0.1`

成功后产物在 Actions run 的 **Artifacts** 区：`yinjie-ios-ipa-<run_number>.zip`，里面是 `.ipa`，下载后用 Apple Configurator 2 / Xcode Devices / TestFlight 装到真机即可。

### 必需 GitHub Secrets

| Secret 名 | 说明 | 怎么得到 |
| --- | --- | --- |
| `IOS_DISTRIBUTION_CERT_BASE64` | iOS Distribution 证书的 .p12 文件 base64 | Keychain Access 选中证书 → Export → 导出 .p12 → `base64 -i cert.p12 \| pbcopy` |
| `IOS_DISTRIBUTION_CERT_PASSWORD` | 上面 .p12 的密码 | 导出时设的 |
| `IOS_PROVISIONING_PROFILE_BASE64` | .mobileprovision 文件 base64 | Apple Developer → Profiles → 下载 → `base64 -i profile.mobileprovision \| pbcopy` |
| `IOS_PROVISIONING_PROFILE_NAME` | profile 的 "Name"（不是 UUID 不是文件名） | 下载页能看到，或 `security cms -D -i profile.mobileprovision \| grep -A1 "<key>Name</key>"` |
| `IOS_DEVELOPMENT_TEAM` | 10 位 Apple Developer Team ID | Apple Developer → Membership 页 |
| `IOS_CODE_SIGN_IDENTITY` | 完整签名身份字符串 | 通常是 `Apple Distribution: Your Org Name (TEAMID)` —— 在本机 Keychain 里证书的 Common Name |
| `IOS_KEYCHAIN_PASSWORD` | CI 临时 keychain 密码（任意字符串即可） | 自定 |
| `IOS_BUNDLE_IDENTIFIER` | bundle id | `com.yinjie.ios`（或你自己注册的） |
| `IOS_APS_ENVIRONMENT` | APNs 环境 | `production`（TestFlight / App Store） / `development`（Xcode 直跑真机） |

### 可选 secrets（启用 TestFlight 自动上传）

只在 workflow_dispatch 时把 `uploadTestFlight=true` 才用。

| Secret | 说明 |
| --- | --- |
| `IOS_APPSTORE_API_KEY_ID` | App Store Connect API Key ID（10 位） |
| `IOS_APPSTORE_API_ISSUER_ID` | Issuer ID（UUID） |
| `IOS_APPSTORE_API_KEY_BASE64` | .p8 文件 base64：`base64 -i AuthKey_XXX.p8 \| pbcopy` |

> 三个一起配齐才有意义；缺一个 step 会 fail。

### Apple 后台必做的事

1. App ID `com.yinjie.ios` 启用 **Push Notifications** capability
2. 创 **APNs Auth Key (.p8)**（Keys → Apple Push Notifications service），下载备好（只能下载一次）
3. 创/下载对应 bundle id 的 **iOS Distribution Certificate** + **Provisioning Profile**（profile 类型选 `App Store` 用于 TestFlight，或 `Ad Hoc` 用于内部分发）
4. 装 IPA 到真机后 → 在 App 内授权通知 → 后端 `push_tokens` 表会自动出现新行（`platform=ios, environment=production`）

### 排查

- workflow 第一步 `Validate required signing secrets` 会列出所有缺的 secret 名，按提示加上即可
- `Build IPA via ipa:release` 失败时，xcarchive 会被上传成 artifact `yinjie-ios-xcarchive-*`，下载后用 macOS Xcode 打开 → Show in Organizer 可以看完整签名 / 编译日志
