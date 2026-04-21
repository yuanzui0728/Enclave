# Android Shell Fix Plan

日期：2026-04-20
范围：`apps/android-shell` 与 `apps/app` 手机 Web 包同步、Android 壳更新与修复准备

## 当前基线

- `pnpm --filter @yinjie/app audit:mobile-web` 通过。
- `pnpm android:sync` 通过，最新 `apps/app/dist` 已同步到 `apps/android-shell/android/app/src/main/assets/public`。
- `pnpm android:apk` 通过，当前机器已经可以完成 Android Debug 包构建验证。
- `pnpm android:doctor` 已确认 Web 打包链路、Capacitor 同步链路和原生桥接契约没有静态阻塞。
- Android 壳仍然是 `Capacitor + apps/app/dist` 的模式，手机 Web 的主线更新不需要单独复制页面代码，只需要保证构建、runtime 配置和原生桥接继续对齐。

## 本轮已确认问题

### P0

- 系统 Java 版本仍是 8，环境变量里也没有配置 `ANDROID_HOME` / `ANDROID_SDK_ROOT`。
- 结果：原始系统环境本身不满足 Android 壳要求，但现在脚本已能自动探测 `~/Android/Sdk` 并复用仓库本地 JDK 21 缓存，所以 `android:apk` 已可直接完成。

- 跟踪配置 `apps/android-shell/android-shell.config.json` 仍处于 `production`，但 `runtime.apiBaseUrl` 和 `runtime.socketBaseUrl` 为空。
- 结果：如果既不填 tracked 配置、也不提供 `YINJIE_ANDROID_*` release 环境变量，正式包仍会因为缺少 API / Socket 入口而被脚本直接拦住。

### P1

- `apps/android-shell/android-signing.local.properties` 缺失。
- 结果：当前仓库具备同步和未签名构建准备，但还不具备正式签名发版条件。

- `android-shell.config.local.json` 开启了 cleartext 流量并切到开发环境。
- 结果：这对本地联调是正确的，但发布前必须确认不会把本地覆盖配置带进正式构建链路。

## 本轮已完成处理

- 已确认移动 Web 当前使用的 Android bridge 方法与原生实现匹配，包含最近移动端会实际触发的 `openAppSettings`。
- 已执行 `pnpm android:sync`，确认最新手机 Web 产物可以正常同步进 Android 壳。
- 已修正 `apps/android-shell/scripts/run-capacitor.mjs` 中 `android:doctor` 的漏检问题：
  - 以前只检查“合并本地覆盖后的生效配置”。
  - 现在在存在 `android-shell.config.local.json` 时，仍会额外检查跟踪的发布配置，避免本地开发配置把 release 问题遮住。
- 已补 Android 构建环境兜底：
  - `android:doctor` 会自动探测常见 Android SDK 目录。
  - `android:apk` / `android:bundle` 会自动复用或下载本地 JDK 21 缓存，不再依赖系统 Java 先满足 21。
- 已修正 release 发版风险：
  - `android:bundle` 不再吃本地 `android-shell.config.local.json`。
  - `android:bundle` 现在支持 `YINJIE_ANDROID_*` release 环境变量覆盖 runtime 配置。
  - `android:bundle` 会先校验最终 release runtime 配置，再继续构建，避免把开发地址打进 release 包。
- 已补 Android release signing 环境变量支持：
  - Gradle 现在既支持 `android-signing.local.properties`，也支持直接读取 `YINJIE_UPLOAD_*` 环境变量。
- 已补 Android release 一键入口：
  - `pnpm android:release:doctor`
  - `pnpm android:release:bundle`
  - 两者都会优先读取 `apps/android-shell/android-release.env.local`，不需要手工先 `source`。
- 已补仓库根命令：
  - `pnpm audit:mobile-web`
  - `pnpm audit:android-shell`

## 建议执行顺序

1. 先补构建环境
- 安装并切换到 Java 21。
- 配置 `ANDROID_HOME` 或 `ANDROID_SDK_ROOT`。
- 确认 Android SDK platform / build-tools / cmdline-tools 已安装并接受 license。

2. 再补发布配置
- 在 `apps/android-shell/android-shell.config.json` 或 `YINJIE_ANDROID_CORE_API_BASE_URL` 里提供 production `apiBaseUrl`。
- 明确 production `socketBaseUrl`，如果与 API 同域，也可以只提供 `apiBaseUrl` 让其回退复用。
- 准备 `apps/android-shell/android-signing.local.properties` 与 keystore，或者直接提供 `YINJIE_UPLOAD_*` 环境变量。

3. 然后做一键审计与构建
- 执行 `pnpm audit:android-shell`。
- 执行 `pnpm android:apk` 做 Debug 包验证。
- 需要正式发版时，先执行 `pnpm android:release:doctor`，再执行 `pnpm android:release:bundle`。

## Android 回归重点

1. 壳层与启动
- 冷启动、热启动、任务恢复时是否进入上次手机页面。
- Safe Area、启动页高度、地址栏伸缩时是否抖动。

2. 原生桥接
- 外链打开。
- 分享文本、分享文件、打开文件。
- 选图、选文件、拍照。
- 通知权限申请、FCM token 读取、本地提醒通知。

3. 高风险业务链路
- 消息 / 通讯录 / 发现 / 我 四个主 tab 恢复。
- 朋友圈 / 广场动态 / 视频号 / 游戏 / 小程序 的返回链路与恢复态。
- 聊天输入框被键盘顶起、长列表滚动、附件发送、语音/视频权限。

## 当前结论

- 手机 Web 代码已经可以更新进 Android 壳，当前不是“同步失败”问题。
- 阻塞 Android 发包和真机验证的主要问题在构建环境与 release 配置，不在 WebView 页面代码本身。
