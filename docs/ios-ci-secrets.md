# iOS Release CI Secrets 配置说明

`.github/workflows/ios-release.yml` 在 GitHub 的 `macos-14` runner 上编译并签名 iOS IPA，
**不需要你本地有 Mac**。它从仓库 Secrets 读取证书/描述文件/签名信息。本文件列出所有
需要配置的 Secrets，以及怎么拿到它们。

> 配置位置：仓库 → Settings → Secrets and variables → Actions → New repository secret

前置条件：已加入 Apple Developer Program（$99/年），并在 App Store Connect 注册了 App ID
`com.yinjie.ios`。

---

## 必填 Secrets（缺任一则 workflow 的「Validate required signing secrets」步骤会 fail）

| Secret 名 | 含义 | 怎么拿 |
|---|---|---|
| `IOS_DISTRIBUTION_CERT_BASE64` | Apple Distribution 证书（含私钥）的 `.p12`，base64 编码 | Keychain 导出 `.p12`（见下方「导出证书」）后 `base64 -i cert.p12 \| pbcopy` |
| `IOS_DISTRIBUTION_CERT_PASSWORD` | 导出 `.p12` 时设置的密码 | 你导出时自己定的 |
| `IOS_PROVISIONING_PROFILE_BASE64` | App Store 类型的 `.mobileprovision`，base64 编码 | 开发者后台 Profiles 下载 `.mobileprovision` 后 `base64 -i xx.mobileprovision \| pbcopy` |
| `IOS_PROVISIONING_PROFILE_NAME` | 上面那个描述文件的 **Name**（不是 UUID） | 创建 profile 时起的名字，如 `Yinjie App Store` |
| `IOS_DEVELOPMENT_TEAM` | 10 位 Apple Developer Team ID | 开发者后台 Membership 页 / App Store Connect |
| `IOS_CODE_SIGN_IDENTITY` | 签名身份字符串 | 通常是 `Apple Distribution`（或 `Apple Distribution: 你的公司名 (TEAMID)`） |
| `IOS_KEYCHAIN_PASSWORD` | CI 临时 keychain 的密码 | 任意强随机字符串，自己定，仅 CI 内部用 |
| `IOS_BUNDLE_IDENTIFIER` | Bundle ID | `com.yinjie.ios` |
| `IOS_APS_ENVIRONMENT` | 推送环境 | App Store / TestFlight 用 `production`；纯调试用 `development` |

## 选填 Secrets（仅当手动触发时勾选 `uploadTestFlight=true`，自动上传 TestFlight）

| Secret 名 | 含义 | 怎么拿 |
|---|---|---|
| `IOS_APPSTORE_API_KEY_BASE64` | App Store Connect API Key（`.p8`）base64 | App Store Connect → Users and Access → Integrations → App Store Connect API → 生成 Key，下载 `AuthKey_XXX.p8`，`base64 -i AuthKey_XXX.p8 \| pbcopy` |
| `IOS_APPSTORE_API_KEY_ID` | 该 Key 的 Key ID（10 位） | 生成 Key 后页面显示 |
| `IOS_APPSTORE_API_ISSUER_ID` | Issuer ID（UUID） | API Keys 页面顶部 |

---

## 导出 Distribution 证书为 .p12

1. macOS 上（或借一台）打开「钥匙串访问」。
2. 找到 `Apple Distribution: ...` 证书，确认它下面挂着对应的私钥（展开三角箭头）。
3. 右键证书 →「导出」→ 选 `.p12` 格式 → 设一个密码（即 `IOS_DISTRIBUTION_CERT_PASSWORD`）。
4. `base64 -i 导出的.p12 | pbcopy`，粘贴进 `IOS_DISTRIBUTION_CERT_BASE64`。

> 没有 Mac 也可以：证书可在 Apple 开发者后台用 CSR 在线生成，但 `.p12`（带私钥）通常要在
> 生成 CSR 的那台机器的钥匙串里导出。首次建议借一次 Mac 把 `.p12` 导出存好，之后纯靠 CI。

---

## 触发方式

- **手动**：仓库 → Actions → 「iOS Release」→ Run workflow。可填 `marketingVersion` /
  `buildNumber`（留空用 run number）/ `exportMethod`（上架选 `app-store-connect`）/
  勾选 `uploadTestFlight` 自动上传。
- **打 tag**：`git tag app-v1.0.1 && git push origin app-v1.0.1` —— 自动从 tag 名提取
  marketing version 并跑构建。

产物：成功后在该次 run 的 Artifacts 里下载 `yinjie-ios-ipa-<run>`（`.ipa`）；失败时上传
`.xcarchive` 便于排查。

---

## 注意

- 本 workflow 默认 `CODE_SIGN_STYLE=Manual`（用上面的证书 + 描述文件），不依赖 Xcode 自动签名。
- 内部 `ipa:release` 会自动跑 `prepare:web → cap sync → configure → archive → export`，
  无需在 workflow 里单独 build 前端。
- **后端域名**：`prepare:web` 会把 `apps/ios-shell/ios-shell.config.json` 里的 `runtime.apiBaseUrl`
  烤进 `runtime-config.json`。上架前务必把它从 `1gw06751dd053.vicp.fun` 改成正式生产域名，
  否则审核员访问到临时内网穿透域名会拒审。
