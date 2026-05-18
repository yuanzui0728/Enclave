# 在 Mac 上出 .ipa 完整步骤

本文档给出"用户从 Linux/Windows 切到 Mac 后，按顺序跑完即可拿到可装机的 `.ipa`"的最短路径。所有命令在仓库根 `~/yinjie-app/` 下运行（除非另行说明）。

> **为什么需要 Mac**：iOS 代码签名、`xcodebuild archive/exportArchive`、CocoaPods 都依赖 Apple 工具链，只有 macOS 支持。Linux/Windows 上可以做代码改动 + 配置就绪 + `pnpm ios:doctor:release` 验证，但不能产出 `.ipa`。

---

## 0. 一次性准备（首次跑）

### 0.1 工具链

```bash
# Xcode（≥ 15）+ Command Line Tools
xcode-select --install
sudo xcodebuild -license accept

# CocoaPods
sudo gem install cocoapods
pod --version            # 期望 1.14+

# Node 与 pnpm（仓库已锁版本）
node --version           # 期望 ≥ 20
pnpm --version           # 期望 ≥ 9
```

### 0.2 Apple Developer 后台

> 需要付费 Apple Developer 账户（个人 $99/年 或企业 $299/年）。

1. **拿 Team ID**：登录 [Apple Developer](https://developer.apple.com/account) → Membership → 复制 10 字符 Team ID
2. **创建 App ID**：Identifiers → `+` → App IDs → App
   - Bundle ID：`com.yinjie.ios`（或自定，与 `YINJIE_IOS_BUNDLE_IDENTIFIER` 保持一致）
   - Capabilities 勾上：
     - **Push Notifications**（必须）
     - **Associated Domains**（如启用 Universal Links）
     - **Keychain Sharing**（YinjieSecureStorage 用）
3. **生成 Distribution 证书**：Certificates → `+` → Apple Distribution
   - 用 Xcode 或 Keychain Access 生成 CSR
   - 下载 `.cer` → 双击装进 Keychain
   - 在 Keychain Access 里右键 → Export → 选 `.p12` 格式 → 设密码并记好
4. **生成 Provisioning Profile**：Profiles → `+`
   - **App Store 路线**：选 "App Store Connect"，绑定 App ID + Distribution 证书
   - **Ad Hoc 路线**：选 "Ad Hoc"，需先在 Devices 里注册测试设备 UDID
   - 下载 `.mobileprovision` → 双击装入

### 0.3 APNs key（可选 —— 仅当 cloud-api 推送服务还没配 APNs 时）

- Keys → `+` → 勾 "Apple Push Notifications service (APNs)"
- 下载 `.p8` → 给 cloud-api 用（不影响 App 端打包）

---

## 1. 项目准备

```bash
# 1.1 同步代码
cd ~/yinjie-app
git pull --ff-only

# 1.2 装依赖
pnpm install

# 1.3 准备 ios-shell 配置（gitignored 本地文件）
cd apps/ios-shell
cp ios-release.env.example ios-release.env.local
```

编辑 `apps/ios-shell/ios-release.env.local`，填入：

```bash
# 运行时配置（必填）
export YINJIE_IOS_CORE_API_BASE_URL="https://your.api.host"
export YINJIE_IOS_CLOUD_API_BASE_URL="https://your.cloud-api.host"
export YINJIE_IOS_ENVIRONMENT="production"

# Bundle / 版本（必填）
export YINJIE_IOS_BUNDLE_IDENTIFIER="com.yinjie.ios"
export YINJIE_IOS_MARKETING_VERSION="1.0.0"
export YINJIE_IOS_BUILD_NUMBER="1"          # 每次上传 App Store 必须递增

# 签名（必填）
export YINJIE_IOS_DEVELOPMENT_TEAM="ABCDE12345"   # 你的 Apple Team ID
export YINJIE_IOS_CODE_SIGN_STYLE="Automatic"     # 或 Manual

# Manual 签名才需要填这两行；Automatic 留空
# export YINJIE_IOS_PROVISIONING_PROFILE_SPECIFIER="Yinjie App Store"
# export YINJIE_IOS_CODE_SIGN_IDENTITY="Apple Distribution: Your Org Name (ABCDE12345)"

# 推送（必填）
export YINJIE_IOS_APS_ENVIRONMENT="production"   # TestFlight / App Store 用 production；Xcode Run 调试用 development

# Universal Links（可选；不开就留空）
# export YINJIE_IOS_ASSOCIATED_DOMAIN="applinks:yinjie.app"

# 导出方式
export YINJIE_IOS_EXPORT_METHOD="app-store-connect"   # 上 TestFlight/App Store 用这个；分发给指定设备用 ad-hoc
```

> **多人协作或 CI 场景**：所有变量也可以直接 `export` 到 shell 或 GitHub Actions secrets，不必走 `.env.local`。`doctor:release` 三层都认（process.env > env file）。

---

## 2. 配置验证 + 工程生成

```bash
cd ~/yinjie-app

# 2.1 验证 release 配置（Linux 上也可跑，先在 Mac 上一遍）
pnpm ios:doctor:release
# 期望：所有 PASS（platform: INFO）；如出现 WARN 按提示填 env 或跑 configure

# 2.2 验证 shell sanity（macOS-agnostic）
pnpm ios:doctor

# 2.3 构建 Web bundle + 注入 runtime-config
pnpm --filter @yinjie/ios-shell run prepare:web
# 产物：apps/app/dist-mobile/ + apps/app/dist-mobile/runtime-config.json

# 2.4 把 webDir + plugins 同步到 ios 工程
pnpm ios:sync
# 等价于：cap sync ios

# 2.5 应用 Xcode 工程配置（写 Bundle ID / Team ID / 版本号 /
#      entitlements aps-environment / Info.plist / InfoPlist.strings 等）
pnpm ios:configure
# 此步之后 pbxproj / App.entitlements / Info.plist 都会被更新；
# 改完后重跑 doctor:release 应全 PASS（除 platform INFO）
pnpm ios:doctor:release

# 2.6 装 CocoaPods 依赖
cd apps/ios-shell/ios/App
pod install
cd -
```

---

## 3. 出 IPA

```bash
cd ~/yinjie-app

# 3.1 完整流（archive + export）
pnpm ios:ipa:release

# 等价于（如需分步排查问题）：
# pnpm ios:archive    # 仅跑到 xcarchive
# pnpm ios:export     # 从 xcarchive 出 IPA
```

**产物路径**：`apps/ios-shell/build/ios/Export/*.ipa`

预计耗时：首次 5-15 分钟（pod install + 编译 + archive + export），后续增量 1-3 分钟。

---

## 4. 装机测试

### 4.1 TestFlight 路线（推荐 —— App Store 内测）

```bash
# 用 Transporter.app（Mac App Store 免费下载）拖 .ipa 上传
open -a Transporter apps/ios-shell/build/ios/Export/*.ipa

# 或脚本里启用 altool 自动上传（需 ios-release.env.local 填 APPSTORE_API_*）：
# YINJIE_IOS_APPSTORE_API_KEY_ID=... \
# YINJIE_IOS_APPSTORE_API_ISSUER_ID=... \
# YINJIE_IOS_APPSTORE_API_KEY_PATH=... \
# pnpm ios:ipa:release
```

上传完成后到 [App Store Connect](https://appstoreconnect.apple.com) → TestFlight → 等审核（~30 分钟）→ 邀请测试员安装。

### 4.2 Ad Hoc 路线（直接装到注册设备）

```bash
# 用 Apple Configurator 2（Mac App Store 免费）：
#   1. iPhone 用 Lightning/USB-C 连 Mac
#   2. Configurator 2 选设备 → "Add" → "Apps" → 选 .ipa
#   3. 等装完，可在 iPhone 桌面看到 app
```

或用 [Diawi](https://www.diawi.com)（第三方上传服务）扫码装。

### 4.3 装机后走查

按 `REAL-DEVICE-WALKTHROUGH.md` 30 项依次跑一遍。任何失败项记录到该文件的"走查记录区"。

---

## 5. 常见故障兜底

### 5.1 签名错误

**症状**：`xcodebuild archive` 报 `Code signing is required for product type 'Application'` 或 `No signing certificate "iOS Distribution" found`

**排查**：
- `security find-identity -v -p codesigning` 看 Keychain 里有没有 "Apple Distribution: ..." 项
- 检查 `ios-release.env.local`：`CODE_SIGN_STYLE=Manual` 时必须填 `PROVISIONING_PROFILE_SPECIFIER` 和 `CODE_SIGN_IDENTITY`
- Automatic 签名失败：Xcode → Settings → Accounts → 加 Apple ID 让 Xcode 自动 fetch profile

### 5.2 CocoaPods 卡 / fetch 失败

```bash
cd apps/ios-shell/ios/App
pod repo update
pod install --repo-update
# 还不行：rm -rf Pods Podfile.lock && pod install
```

### 5.3 archive 卡 "fresh keychain"

`build-ios-ipa.mjs` 已加 `-allowProvisioningUpdates` flag，绝大多数情况自动解决。若仍卡：
- Keychain Access → 双击证书 → Trust → 选 "Always Trust"
- 或在 Terminal 跑：`security unlock-keychain -p <你的Mac密码> ~/Library/Keychains/login.keychain-db`

### 5.4 推送 token 不到 cloud-api

**症状**：装机后冷启、登录都正常，但 cloud-api 数据库里没新增 push token 记录

**排查**：
- 检查 `App.entitlements` 的 `aps-environment` 是否 `production`（TestFlight）或 `development`（Xcode Run）
- 检查 `ios-release.env.local.YINJIE_IOS_APS_ENVIRONMENT` 与上面一致
- 检查 iPhone Settings → 隐界 → 通知是否打开
- 用 Xcode → Devices and Simulators → Console 接 iPhone 看 `Yinjie push registration failed` 日志（在 `AppDelegate.didFailToRegisterForRemoteNotificationsWithError` 里 print）
- cloud-api 侧：检查 `/api/push/tokens` 接口收到 POST 后入库的逻辑

### 5.5 冷启卡在 splash

**症状**：装机后开 app 长时间停在深蓝 splash 不进入

**排查**：
- `dist-mobile/runtime-config.json` 必须存在且含 `cloudApiBaseUrl`（doctor:release 的 `bundled-runtime-config` 检查会 catch）
- `YinjieRuntimePlugin.getConfig()` 返回的 `cloudApiBaseUrl` 必须是 https，否则 Capacitor App Transport Security 会拒绝
- Xcode Console 看 JS 端有没有 `[runtime] config payload`、`splash hydrating` 等日志

### 5.6 Info.plist 权限文案是英文（非系统语言）

**症状**：系统语言 zh-Hans，但相机权限弹窗显示英文

**排查**：
- `apps/ios-shell/ios/App/App/zh-Hans.lproj/InfoPlist.strings` 必须存在且非空（doctor 的 `info-plist-strings-coverage` 会 catch）
- 重跑 `pnpm ios:configure` 让 `ios-shell.config.json.localization.permissions` 注入 4 语 InfoPlist.strings
- pbxproj 里 `*.lproj` 目录必须加入 PBXVariantGroup（configure 自动处理）

### 5.7 Universal Link 不唤起

- App.entitlements 必须含 `<key>com.apple.developer.associated-domains</key>` 和 `applinks:yourdomain.com`（doctor 的 `entitlements-associated-domains-when-configured` 会 catch）
- 域名服务器必须返回 `https://yourdomain.com/.well-known/apple-app-site-association` 文件，含本 app 的 bundle id
- iOS Settings → Developer → Universal Links 调试开关确保打开（开发模式可强制刷新关联）

---

## 6. 版本递增与重打

每次新出 .ipa 上 TestFlight：

1. 编辑 `ios-release.env.local`：
   - `YINJIE_IOS_BUILD_NUMBER`：**必须递增**（如 1 → 2 → 3，App Store 不允许相同 build number 重复上传）
   - `YINJIE_IOS_MARKETING_VERSION`：UI 显示版本，按语义化版本走（1.0.0 → 1.0.1 → 1.1.0）
2. `pnpm ios:configure` 把新版本刷进 pbxproj
3. `pnpm ios:ipa:release`
4. 装机 + 走查

---

## 7. CI / GitHub Actions

仓库已有 `.github/workflows/ios-release.yml`，配齐 secrets 后即可：
- **手动触发**：Actions → "iOS Release" → "Run workflow" → 填 marketingVersion / buildNumber / exportMethod
- **tag 触发**：`git tag app-v1.0.0 && git push origin app-v1.0.0`

需配 9 个必需 secrets：
- `IOS_DISTRIBUTION_CERT_BASE64` / `IOS_DISTRIBUTION_CERT_PASSWORD`
- `IOS_PROVISIONING_PROFILE_BASE64` / `IOS_PROVISIONING_PROFILE_NAME`
- `IOS_DEVELOPMENT_TEAM` / `IOS_CODE_SIGN_IDENTITY`
- `IOS_BUNDLE_IDENTIFIER` / `IOS_APS_ENVIRONMENT` / `IOS_KEYCHAIN_PASSWORD`

可选 3 个（TestFlight 自动上传）：
- `APPSTORE_API_KEY_ID` / `APPSTORE_API_ISSUER_ID` / `APPSTORE_API_KEY_BASE64`

证书 base64：`base64 -i cert.p12 -o cert.p12.base64` → 把内容粘到 GitHub Secret。
