# 桌面端壳四语言切换支持计划

## Summary

实现桌面端 `zh-CN / en-US / ja-JP / ko-KR` 多语言闭环：首次启动按系统语言选择；用户切换后按当前设备保存；WebView 桌面界面、Tauri 托盘菜单、窗口标题、保存对话默认标题和壳层返回文案同步切换。

## Key Changes

- 扩展 `@yinjie/i18n`：`AppLocaleProvider` 增加 `initialLocale` 与 `preferSystemLocale` 选项；桌面端启动时使用 `query > localStorage > native persisted > system > zh-CN`。
- 扩展桌面 Tauri API：
  - `desktop_get_locale(): { locale, systemLocale, source }`
  - `desktop_set_locale({ locale }): DesktopOperationResult`
  - Rust 侧新增 `desktop-locale.json` 持久化，并在启动和切换时刷新 tray menu、tooltip、window title。
- 原生壳固定文案表：
  - `打开隐界 / Open Yinjie / Yinjieを開く / Yinjie 열기`
  - `退出 / Quit / 終了 / 종료`
  - `保存附件 / Save Attachment / 添付ファイルを保存 / 첨부 파일 저장`
  - `已取消保存。 / Save cancelled. / 保存をキャンセルしました。 / 저장을 취소했습니다.`
  - `已保存到 {path} / Saved to {path}. / {path} に保存しました。 / {path}에 저장했습니다.`
- 补齐桌面 WebView 硬编码文案：重点处理 `desktop-shell.tsx` 的锁屏弹层、owner 快捷卡片、窗口按钮 aria label、更多菜单辅助文案，以及保存/打开文件 runtime helper 的中文 fallback。
- 更新 catalogs：执行 Lingui extract 后补全 `app` 与 `shared` catalog 中新增/变化的英文、日语、韩语翻译，并重新 compile。

## Implementation Details

- `apps/app/src/main.tsx` 在 `hydrateNativeRuntimeConfig()` 后读取 Tauri locale；桌面平台向 `AppLocaleProvider` 传入 native locale 和 `preferSystemLocale=true`。
- 新增桌面 locale bridge 组件：在 `AppLocaleProvider` 内监听 `useAppLocale().locale`，调用 `desktop_set_locale`，保证设置页切换后原生壳立即同步。
- `packages/ui/src/runtime/desktop-runtime.ts` 暴露 locale 类型与 wrapper；`apps/desktop/src-tauri/src/main.rs` 注册新命令，并用 `sys-locale` 解析系统语言。
- 保持后端、数据库、路由结构不变；无需更新 `AGENTS.md` 的结构清单。
- 执行任务时将本计划保存到 `.Codex/plans/desktop-shell-i18n-2026-04-27.md`，完成后按项目规则提交一次 git commit。

## Test Plan

- `pnpm i18n:extract`
- `pnpm i18n:compile`
- `pnpm i18n:missing:changed`
- `pnpm i18n:audit:changed`
- `pnpm i18n:hardcode:changed`
- `pnpm --filter @yinjie/i18n typecheck`
- `pnpm --filter @yinjie/app typecheck`
- `pnpm --filter @yinjie/desktop audit:desktop-shell:static`
- `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check`
- `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
- 手动 smoke：桌面端分别切换四种语言，确认设置页、侧栏、锁屏弹层、托盘菜单、窗口标题、保存图片/文件对话默认标题与保存结果提示同步变化。

## Assumptions

- 语言偏好为当前设备本地偏好，不写入世界实例。
- 首次默认跟随系统语言；用户手动切换后优先使用保存偏好。
- 品牌英文、日文、韩文窗口标题统一使用 `Yinjie`，中文使用 `隐界`。
