# Android 壳多语言切换支持计划

日期：2026-04-27

## Summary

为 Android 壳补齐中文、英文、日语、韩语的完整语言链路：首次启动跟随系统语言，用户在 App 设置页切换后同步 Android 原生应用语言，Android 13+ 系统“应用语言”设置变更也同步回 Web UI。业务 UI 继续复用现有 `@yinjie/i18n` / Lingui catalog，原生壳补资源、桥接和通知文案。

## Public Interfaces

- 扩展 `YinjieRuntime` Capacitor 插件：
  - `getLocale(): Promise<{ locale: "zh-CN" | "en-US" | "ja-JP" | "ko-KR"; source: "app" | "system" | "default" }>`
  - `setLocale({ locale }): Promise<{ locale; source: "app" }>`
- 扩展 `AppLocaleProvider`：
  - 新增 `initialLocale?: string | null`，Android 启动时注入原生解析出的初始语言。
  - 新增 `onLocaleChange?: (locale: SupportedLocale) => void | Promise<void>`，仅用户主动切换时同步原生。
  - Context 新增外部同步方法，用于 Android 系统设置变更回写 Web UI，但不反向覆盖系统设置。
- 不把 locale 混入 `AppRuntimeConfig`，避免语言偏好和 API endpoint/runtime 配置耦合。

## Implementation Changes

- Android 原生资源：
  - 新增 `res/xml/locales_config.xml`，声明 `zh-CN`、`en-US`、`ja-JP`、`ko-KR`。
  - `AndroidManifest.xml` 的 `<application>` 增加 `android:localeConfig="@xml/locales_config"`。
  - 新增 `values-en-rUS`、`values-ja-rJP`、`values-ko-rKR` 的 `strings.xml`，默认 `values/strings.xml` 作为中文兜底。
  - `app_name` / `title_activity_main` 各语言统一保持 `Yinjie`，不翻译品牌名。
- Android 原生文案：
  - 把分享面板默认标题、打开文件标题、通知渠道名/说明、推送默认标题/正文全部改为 `getString(...)`。
  - 新建轻量 Java helper 统一创建/更新消息通知渠道，`YinjieMobileBridgePlugin` 和 `YinjieFirebaseMessagingService` 共用，避免两处硬编码。
- Android locale 桥接：
  - 在 `YinjieRuntimePlugin` 中用 `AppCompatDelegate` + `LocaleListCompat` 实现 `getLocale` / `setLocale`。
  - 解析规则：`zh`/`zh-CN`/`zh-Hans` -> `zh-CN`，`en` -> `en-US`，`ja` -> `ja-JP`，`ko` -> `ko-KR`；其他语言回落 `zh-CN`。
  - Android 13+ 通过系统 per-app language 生效；低版本通过 AppCompat 存储和应用 locale。
- Web App 同步：
  - 新增 `apps/app/src/runtime/native-locale.ts` 封装原生 locale 读取/设置。
  - `main.tsx` 在渲染前读取 Android 原生 locale，并传给 `AppLocaleProvider initialLocale`。
  - 新增 `NativeLocaleSync` 组件：用户在 App 内切换时调用 `setLocale` 同步原生；App 回到前台时读取 Android 当前应用语言，如系统设置已变化则切换 Web UI。
  - `LanguageSwitcher` 默认说明改为“语言偏好保存在当前设备并立即应用”，避免“只影响当前页面会话”的旧描述。
- Android 配置脚本与文档：
  - 更新 `scripts/run-capacitor.mjs`，`android:configure` 继续维护 app id/app name/version，并检查 locale config 与多语言资源存在。
  - 更新 `apps/android-shell/README.md` 的 Web-to-Shell Contract，补充语言桥接方法和 Android 13+ 应用语言行为。

## Test Plan

- `pnpm --filter @yinjie/i18n typecheck`
- `pnpm --filter @yinjie/app typecheck`
- `pnpm i18n:extract && pnpm i18n:compile`
- `pnpm android:doctor`
- `pnpm android:apk`，用于验证 Java/Android 资源能完整编译；如果本机 Android SDK 不可用，记录阻塞并至少完成前四项。

## Assumptions

- 只做 UI locale，不改变 AI 生成内容、聊天内容、朋友圈正文等用户/内容语言。
- 品牌名在 Android launcher 和 activity title 中统一保持 `Yinjie`。
- App 内语言切换入口继续放在现有 `资料/设置 -> 语言`，不新增独立首屏或弹窗。
- 不新增测试文件；使用现有 typecheck、i18n、Android doctor/build 做最小验证。
