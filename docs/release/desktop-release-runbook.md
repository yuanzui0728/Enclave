# Desktop Release Runbook

日期：2026-04-28
范围：Windows、macOS、Linux

## 目标

把桌面端发布从“能 build”提升到“可重复产出、可回归、可归档”。

当前桌面产品线约束：

- 业务前端统一来自 `apps/app`
- Windows / macOS / Linux 共用 `apps/desktop` Tauri 壳
- 桌面端只作为 `remote-connected` client 发版

## 产物入口

### Windows

构建命令：

- `pnpm desktop:build:windows:x64`
- `pnpm desktop:installer:windows`
- `pnpm desktop:installer:windows:exe`
- `pnpm desktop:installer:windows:msi`
- `pnpm desktop:release:windows`
- `pnpm desktop:release:windows:exe`
- `pnpm desktop:release:windows:msi`

最新产物目录：

- `dist/windows-installer`

版本归档目录：

- `dist/releases/windows/<ProductName>-<Version>`

说明：

- `desktop:installer:*` 会先触发 Tauri Windows build，再把 `.exe` / `.msi` 整理到最新产物目录
- `desktop:release:*` 会额外按版本归档

### macOS

构建命令：

- `pnpm desktop:build:mac:aarch64`
- `pnpm desktop:build:mac:x86_64`
- `pnpm desktop:bundle:mac:aarch64`
- `pnpm desktop:bundle:mac:x86_64`
- `pnpm desktop:release:mac:aarch64`
- `pnpm desktop:release:mac:x86_64`

最新产物目录：

- `dist/macos-bundle/aarch64-apple-darwin`
- `dist/macos-bundle/x86_64-apple-darwin`

版本归档目录：

- `dist/releases/macos/<ProductName>-<Version>/aarch64-apple-darwin`
- `dist/releases/macos/<ProductName>-<Version>/x86_64-apple-darwin`

说明：

- `desktop:bundle:mac:*` 会先触发对应架构的 Tauri macOS build，再整理 `.app` 和 `.dmg`
- `desktop:release:mac:*` 会额外按版本归档

### Linux

验证命令：

- `pnpm desktop:build`
- 或在 `apps/desktop/src-tauri` 下执行 `cargo check`

说明：

- Linux 当前优先作为本机桌面壳可运行性验证，不单独整理 release 归档目录
- 缺失 GTK/WebKit 等系统依赖时，`apps/desktop/scripts/run-tauri.mjs` 会先输出缺失的 `pkg-config` 包名
- 安装依赖后再继续执行 Tauri build 或 cargo check

## 环境前置

### Windows

- 安装 Rust / rustup
- 安装 `x86_64-pc-windows-msvc` target
- 安装 Visual Studio Build Tools 和 Windows SDK
- 若终端没有 MSVC 环境，`apps/desktop/scripts/run-tauri.mjs` 会尝试加载 `vcvars64.bat`

### macOS

- 在 Mac 主机上执行
- 安装 Rust / rustup
- 安装 Xcode Command Line Tools
- 确认 `src-tauri/icons/icon.icns` 存在

### Linux

- 安装 Rust / rustup
- 安装 `pkg-config`
- 安装 GTK/WebKit/Tauri Linux 系统依赖，Debian/Ubuntu 通常包括：
  - `libglib2.0-dev`
  - `libgtk-3-dev`
  - `libwebkit2gtk-4.1-dev`
  - `libsoup-3.0-dev`
  - `libgdk-pixbuf-2.0-dev`
  - `libpango1.0-dev`
  - `libcairo2-dev`
  - `libatk1.0-dev`

签名与公证：

- 本地验证可不签名直接 build
- 直接下载分发建议配置 `APPLE_SIGNING_IDENTITY`
- 若使用 `Developer ID Application`，还需要配置 notarization 凭据：
  - `APPLE_API_ISSUER`
  - `APPLE_API_KEY`
  - `APPLE_API_KEY_PATH`
- 或者改用：
  - `APPLE_ID`
  - `APPLE_PASSWORD`
  - `APPLE_TEAM_ID`
- 若只做 Apple Silicon 本地验证，可用 ad-hoc 签名：
  - `APPLE_SIGNING_IDENTITY=-`

## 推荐流程

### Windows 推荐流程

1. 执行 `pnpm desktop:installer:windows`
2. 检查 `dist/windows-installer`
3. 若用于正式留档，执行 `pnpm desktop:release:windows`
4. 按 `docs/release/desktop-host-regression.md` 完成 Windows 回归

### macOS 推荐流程

1. 在对应架构主机执行 `pnpm desktop:bundle:mac:<arch>`
2. 检查 `dist/macos-bundle/<target>`
3. 若用于正式留档，执行 `pnpm desktop:release:mac:<arch>`
4. 按 `docs/release/desktop-host-regression.md` 完成 macOS 回归
5. 对外分发前补签名 / notarization 校验

### Linux 推荐流程

1. 执行 `pnpm desktop:build`
2. 如果预检提示缺包，先安装提示里的系统依赖
3. 依赖齐全后再次执行 `pnpm desktop:build` 或 `cargo check`
4. 按 `docs/release/desktop-host-regression.md` 完成 Linux 回归

## 产物要求

### Windows

- 至少产出一种安装包：
  - `.exe`
  - `.msi`
- 打包产物中不包含 `yinjie-core-api` sidecar

### macOS

- 至少产出：
  - `.app`
  - `.dmg`
- 对外分发版本必须明确：
  - 是否已签名
  - 是否已 notarized

### Linux

- 至少保留一次成功的 `pnpm desktop:build` 或 `cargo check` 记录
- 若当前机器缺少系统依赖，保留预检输出作为环境诊断记录

## 回归要求

- 首次启动进入 `Splash -> Setup`
- 不误连 `localhost`
- 远程地址保存后可恢复
- 聊天、联系人、朋友圈、视频号、设置主路径可进入
- 窗口拖拽、最小化、最大化、关闭/恢复可用
- 不包含本地 Core API 托管语义

## 常见失败点

### Windows

- 缺少 MSVC Build Tools
- 缺少 Rust target
- WiX 工具瞬时失败导致打包中断

### macOS

- 未在 Mac 主机上执行
- 缺少 `icon.icns`
- 未配置签名导致下载分发时出现 Gatekeeper 警告
- 未配置 notarization 导致对外直装体验不稳定

### Linux

- 缺少 `pkg-config`
- 缺少 GTK/WebKit 开发包
- `PKG_CONFIG_PATH` 未指向已安装 `.pc` 文件目录

## 参考

- Tauri distribute 概览：`https://v2.tauri.app/distribute/`
- Tauri macOS application bundle：`https://v2.tauri.app/distribute/macos-application-bundle/`
- Tauri macOS code signing：`https://v2.tauri.app/zh-cn/distribute/sign/macos/`
