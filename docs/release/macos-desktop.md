# macOS Desktop Release

日期：2026-04-05
范围：`apps/desktop` 的本地构建、CI 构建、签名、公证、发布验收

## 1. 目标

这份文档对应当前仓库里的 mac 发布链骨架：

- 桌面壳会在构建前自动准备 `core-api` sidecar
- mac 产物默认目标是 `aarch64-apple-darwin`
- CI 工作流位于 `.github/workflows/desktop-macos-release.yml`

当前目标是先完成：

- 可重复构建 `.app` / `.dmg`
- 可接入 Apple Developer 签名
- 可接入 notarization
- 可上传 workflow artifact 或 release asset

当前默认发布路线：

- 先发 `aarch64-apple-darwin`
- Intel 包保留单独命令和 workflow 输入，但不是默认首发产物

## 2. 本地构建

在 mac 机器上执行：

```bash
pnpm install
pnpm --filter @yinjie/desktop build:mac:aarch64
```

如需 Intel 包：

```bash
pnpm --filter @yinjie/desktop build:mac:x86_64
```

构建前提：

- 已安装 Xcode Command Line Tools
- `iconutil` 可用
- Rust 对应 target 已安装
- 当前仓库可完成 `pnpm install`

产物目录：

```bash
apps/desktop/src-tauri/target/<target-triple>/release/bundle
```

## 3. sidecar 行为

桌面壳现在的 `core-api` 解析优先级是：

1. `YINJIE_CORE_API_CMD`
2. 桌面包内置 sidecar
3. PATH 中的 `yinjie-core-api`

构建阶段会自动生成：

```bash
apps/desktop/src-tauri/binaries/yinjie-core-api-<target-triple>
```

这个文件会通过 `bundle.externalBin` 被打进桌面包。

## 4. GitHub Actions

工作流文件：

```text
.github/workflows/desktop-macos-release.yml
```

触发方式：

- 手工 `workflow_dispatch`
- 推送 tag：`desktop-v*`

手工触发参数：

- `target_mode=single`：只构建一个 target
- `target_mode=both`：同时构建 `aarch64` 和 `x86_64`
- `target`：仅在 `target_mode=single` 时生效

默认 runner：

- `macos-14`

默认 target：

- `aarch64-apple-darwin`

tag 发版默认行为：

- 自动构建 `aarch64-apple-darwin`
- 自动构建 `x86_64-apple-darwin`
- 自动开启 release asset 上传

当前 workflow 还会做：

- `pnpm typecheck`
- `pnpm build`
- `cargo check --manifest-path crates/core-api/Cargo.toml --target <target>`
- 校验 tag 与 `tauri.conf.json` 的 version 一致
- 临时 keychain 配置
- 构建结束后的签名材料清理

## 5. 需要的 Secrets

### 必需

如果只想产出未签名 artifact：

- 无额外 Apple secrets 也可跑构建

如果要正式签名和 notarization，至少准备：

- `APPLE_CERTIFICATE`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_API_KEY`
- `APPLE_API_ISSUER`

说明：

- `APPLE_CERTIFICATE`：base64 编码后的 `.p12` 证书内容
- `APPLE_CERTIFICATE_PASSWORD`：证书密码
- `APPLE_SIGNING_IDENTITY`：签名 identity
- `APPLE_API_KEY`：App Store Connect API 私钥内容
- `APPLE_API_ISSUER`：Issuer ID

建议额外准备：

- `APPLE_KEYCHAIN_PASSWORD`

如果不提供：

- workflow 会自动生成临时 keychain 密码

工作流会把 `APPLE_API_KEY` 写入：

```text
$GITHUB_WORKSPACE/.ci-secrets/AuthKey.p8
```

并通过 `APPLE_API_KEY_PATH` 暴露给 Tauri bundler。

工作流还会：

- 导入临时 keychain
- 把 signing certificate 导入该 keychain
- 在 job 结束时删除临时 keychain 和敏感文件

## 6. 当前状态说明

当前工作流已经覆盖：

- 安装 Node / pnpm / Rust
- cache pnpm / cargo 依赖
- 安装 Rust target
- 安装 workspace 依赖
- 执行 `pnpm typecheck`
- 执行 `pnpm build`
- 预检 `core-api`
- 调用桌面 build 脚本
- 自动准备 `core-api` sidecar
- 自动导入临时签名 keychain
- 上传 `.app.tar.gz` / `.dmg` / `.sig`
- 单架构或双架构矩阵构建
- 额外上传 `yinjie-desktop-diagnostics-<version>-<target>` 诊断归档
- 额外上传 `yinjie-desktop-release-manifest-<version>` 汇总清单
- 额外上传 `yinjie-desktop-release-notes-<version>` 发布说明模板

当前还未额外做的增强项：

- 公证结果额外校验输出
- Release checklist 自动化脚本
- 双架构 release 聚合页

更细的发版检查与排障请看：

```text
docs/release/macos-desktop-checklist.md
```

面向用户的安装说明请看：

```text
docs/release/macos-user-install-guide.md
```

面向发布执行人的 handoff 请看：

```text
docs/release/macos-release-handoff.md
```

真实 mac 验收时，优先关注这些运行时信号：

- `commandSource`
- `managedByDesktopShell`
- `managedChildPid`
- `desktopLogPath`
- `lastCoreApiError`

CI 失败时，优先回看：

- job summary
- `yinjie-desktop-diagnostics-<version>-<target>` artifact
- `yinjie-desktop-release-manifest-<version>` artifact
- `yinjie-desktop-release-notes-<version>` artifact

正式 tag 规则：

- `desktop-v<version>`

例如当前版本是 `0.1.0`，则正式 tag 必须是：

- `desktop-v0.1.0`

## 7. Smoke Checklist

每次 mac 发版后至少检查：

1. 下载 DMG
2. 拖入 `Applications`
3. 首次打开 App
4. 进入 `/setup`
5. Core API 自动拉起
6. `GET /health` 可达
7. 保存 provider 配置
8. 重启 App
9. 确认 session / runtime 状态恢复

额外建议检查：

10. `codesign --verify --deep --strict /Applications/Yinjie.app`
11. `spctl --assess --type execute /Applications/Yinjie.app`

## 8. 已知限制

- 当前 Linux 环境无法替代 mac 验证签名、公证、Gatekeeper 行为。
- `icon.icns` 已入库，但后续建议替换为正式设计稿导出的高分辨率资产。
- 当前 workflow 假设 `APPLE_CERTIFICATE` 是 base64 编码后的 `.p12` 内容。
