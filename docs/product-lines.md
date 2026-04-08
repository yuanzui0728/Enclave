# 隐界双产品线说明

日期：2026-04-08

## 结论

隐界后续不再按 Windows、macOS、iOS、Android 四端并列推进，而是按两条产品线推进：

- `Desktop Host`
  - Windows
  - macOS
- `Mobile Client`
  - iOS
  - Android

这两条线进入的是同一个隐界实例，但承担的职责不同。

## Desktop Host

定位：

- 世界宿主端
- 本地自托管入口
- provider、runtime、diagnostics、backup 的控制端

代码落点：

- `apps/desktop`
- `apps/app/src/features/desktop`
- `apps/app/src/features/profile/desktop-runtime-panel.tsx`
- `packages/ui/src/runtime/desktop-runtime.ts`

运行模式：

- 桌面壳拉起本地 `core-api`
- `runtime-data`、数据库、日志、诊断都在宿主机本地

## Mobile Client

定位：

- 世界连接端
- 高使用频率的聊天与社交入口
- 推送、媒体选择、安全存储、深链接的主要承载端

代码落点：

- `apps/android-shell`
- `apps/ios-shell`
- `apps/app/src/features/mobile`
- `apps/app/src/runtime/mobile-bridge.ts`
- `apps/app/src/runtime/native-secure-storage.ts`

运行模式：

- 连接远程 Core API
- 不在手机本地拉起 `core-api`
- 配置优先来自原生注入，失败时回退到 `runtime-config.json`

## 共享层

以下层对两条产品线共享：

- `apps/app` 的共享业务页面
- `packages/contracts`
- `packages/config`
- `packages/ui`
- `crates/core-api`

共享原则：

- 共享业务语义和接口契约
- 不共享本地宿主假设
- 不把桌面能力直接暴露到手机版

## 入口规则

当前入口规则固定为：

1. `Splash`
   - 先识别 runtime context
   - 再判断是否缺配置
2. `Setup`
   - Desktop Host 进入本地世界 setup
   - Mobile Client 进入远程连接 setup
3. `Profile`
   - Desktop Host 才显示桌面运行时区块

## 当前执行状态

截至 2026-04-08：

- runtime context 已支持 `channel / deploymentMode / hostRole`
- `/setup` 已拆成 `DesktopSetupPanel / MobileSetupPanel`
- `DesktopRuntimeGuard` 已补桌面诊断摘要
- Mobile Setup 已开始感知安全存储模式、bootstrap 来源和原生桥状态

## 相关阅读

- `docs/release/desktop-host-regression.md`
- `docs/release/mobile-client-regression.md`
- `docs/release/mobile-bridge-runbook.md`
