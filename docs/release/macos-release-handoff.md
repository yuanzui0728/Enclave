# macOS Release Handoff

日期：2026-04-06
目标：给执行发布的人一页纸入口，避免在多份文档里来回跳转。

## 1. 日常入口

本地命令：

```bash
pnpm desktop:build:mac:aarch64
pnpm desktop:build:mac:x86_64
```

CI 工作流：

```text
.github/workflows/desktop-macos-release.yml
```

## 2. 正式发版规则

- 版本来源：`apps/desktop/src-tauri/tauri.conf.json`
- 正式 tag：`desktop-v<version>`
- tag 发版默认双架构

## 3. 必看文档

- 发布总说明：`docs/release/macos-desktop.md`
- 发版检查单：`docs/release/macos-desktop-checklist.md`
- 用户安装指南：`docs/release/macos-user-install-guide.md`

## 4. 关键产物

- `yinjie-desktop-<version>-<target>`
- `yinjie-desktop-diagnostics-<version>-<target>`
- `yinjie-desktop-release-manifest-<version>`
- `yinjie-desktop-release-notes-<version>`

## 5. 失败先看哪里

1. GitHub Actions job summary
2. diagnostics artifact
3. release manifest
4. release notes
5. `/setup` 中的桌面诊断

## 6. 安装失败时最重要的字段

- `commandSource`
- `managedByDesktopShell`
- `managedChildPid`
- `desktopLogPath`
- `lastCoreApiError`
