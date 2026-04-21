# Desktop Shell Sync Plan

日期：2026-04-20
范围：`apps/desktop`，Windows / macOS Tauri 桌面壳

## 目标

把 web 电脑版最近的代码变动稳定带到 Windows 和 macOS 桌面端，并在发包前先做壳层预检，而不是等到平台构建或手工回归时才暴露问题。

## 当前结论

- `apps/app` 承载桌面业务 UI、路由、工作区和大部分桌面交互。
- `apps/desktop` 不复制业务页面代码，主要负责：
  - Tauri 原生窗口与托盘
  - Tauri `invoke` 命令
  - 文件保存、本地 JSON 存储等桌面宿主能力
  - Windows / macOS 打包入口
- 因此，web 电脑版“同步到 Windows / macOS”本质上是检查 `apps/desktop` 是否继续覆盖了 `apps/app` 新增的桌面能力边界。

## 本轮已完成

- 已执行 `pnpm audit:desktop-web`
  - `typecheck` 通过
  - `lint:desktop-web` 通过
  - `build` 通过
- 已修复 Tauri capability 窗口白名单滞后问题：
  - 新增 `desktop-note-window:*`
  - 新增 `desktop-official-article-window:*`
- 已新增桌面壳专项审计命令：
  - `pnpm --filter @yinjie/desktop audit:desktop-shell`
  - `pnpm --filter @yinjie/desktop audit:desktop-shell:static`

## 审计覆盖内容

`pnpm --filter @yinjie/desktop audit:desktop-shell` 会做两层检查：

1. 先跑 `apps/app` 的桌面 web 审计
- `typecheck`
- `lint:desktop-web`
- `build`

2. 再做 Tauri 壳静态比对
- 比对 `apps/app` / `packages/ui` 里实际调用的桌面 `invoke` 命令，是否都已在 `apps/desktop/src-tauri/src/main.rs` 注册
- 比对 web 桌面已声明的独立窗口标签前缀，是否都已在 `apps/desktop/src-tauri/capabilities/default.json` 放行

## 后续更新流程

1. Web 桌面功能改动先落在 `apps/app`
2. 运行 `pnpm --filter @yinjie/desktop audit:desktop-shell`
3. 如果审计提示新增 `invoke` / 独立窗口未接入，再修改 `apps/desktop`
4. 审计通过后，再进入平台构建：
- Windows：`pnpm desktop:installer:windows`
- macOS Apple Silicon：`pnpm desktop:bundle:mac:aarch64`
- macOS Intel：`pnpm desktop:bundle:mac:x86_64`
5. 按回归清单完成手工验证：
- `docs/release/desktop-host-regression.md`
- `docs/release/desktop-release-runbook.md`

## 当前已知限制

- 当前 Linux 环境无法完成本地 `cargo check`，缺少 Tauri Linux 依赖：
  - `glib-2.0`
  - `gobject-2.0`
  - `gtk+-3.0`
  - 以及 WebKitGTK 相关系统库
- 这不会阻塞 Windows / macOS 发包准备，但说明桌面壳的最终构建验证仍应在对应平台环境执行。

## 发包前建议

- 先执行 `pnpm --filter @yinjie/desktop audit:desktop-shell`
- 再执行对应平台构建命令
- Windows 和 macOS 各保留至少一种回归证据：
  - 命令结论
  - 截图
  - 录屏
  - 手工执行记录
