# @yinjie/desktop

隐界桌面壳，基于 Tauri 2 + Rust，前端复用 `apps/app` 构建产物。

## 运行时定位

- **远程模式**：壳本身不启动 Core API，加载远程世界地址即可
- **托盘 + 主窗口**：关闭主窗口隐藏到托盘（macOS / Linux）或弹关闭选择（Windows）
- **本地化**：菜单 / 托盘 / 关闭对话框文案随系统语言自动切换（zh / en / ja / ko）

## 开发

```bash
pnpm --dir apps/desktop dev
```

会自动 `pnpm --dir ../app dev` 起前端，再启动 Tauri 主进程。

## 构建

| 目标 | 命令 |
|---|---|
| Windows x64 | `pnpm --dir apps/desktop build:windows:x64` |
| macOS Apple Silicon | `pnpm --dir apps/desktop build:mac:aarch64` |
| macOS Intel | `pnpm --dir apps/desktop build:mac:x86_64` |

macOS 构建必须在 macOS 上执行（依赖 `iconutil`），并安装 Rust 对应 target：

```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
```

快速无签名出 dmg 自测：

```bash
APPLE_SIGNING_IDENTITY=- pnpm desktop:bundle:mac:aarch64
APPLE_SIGNING_IDENTITY=- pnpm desktop:bundle:mac:x86_64
# 产物：dist/macos-bundle/{aarch64,x86_64}-apple-darwin/Yinjie-*.dmg
```

正式分发（Developer ID 签名 + notarization）走 GitHub Actions workflow `desktop-macos-release.yml`，详细签名/公证三种模式 + secrets 清单 + 排错见根目录 [`DEPLOY.md`](../../DEPLOY.md#macos-代码签名--公证) 桌面端章节。

## 审计

```bash
# 全量：capability/permission 一致性 + 4 语种翻译表完整性
pnpm --dir apps/desktop audit:desktop-shell

# 仅静态部分（不跑 web build）
pnpm --dir apps/desktop audit:desktop-shell:static

# 仅校验 desktop_text() 与 InfoPlist.strings 的 4 语种覆盖
pnpm --dir apps/desktop audit:desktop-shell:text-only
```

## 关键文件

- `src-tauri/tauri.conf.json` — Tauri 配置（窗口、bundle、macOS 资源）
- `src-tauri/src/main.rs` — Rust 主程序，含菜单 / 托盘 / 平台分支
- `src-tauri/entitlements.plist` — macOS 权限声明
- `src-tauri/Info.plist` — macOS 包元信息（含相机/麦克风/相册说明）
- `src-tauri/{en,ja,ko,zh-Hans}.lproj/InfoPlist.strings` — macOS 系统弹窗本地化
- `scripts/run-tauri.mjs` — 构建入口（处理 macOS 资源前置检查）
- `scripts/audit-desktop-shell.mjs` — Tauri capability ↔ web 调用一致性
- `scripts/audit-desktop-text.mjs` — 4 语种翻译表完整性
