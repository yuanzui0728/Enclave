# Desktop Host Regression Checklist

日期：2026-04-08
范围：Windows、macOS

## 目标

验证 Desktop Host 作为“世界宿主端”是否闭环，而不是只验证桌面壳能否打开。

## 安装与启动

- 安装包可正常安装
- 首次打开桌面壳成功
- 桌面壳进入 `Splash -> Setup`
- `DesktopRuntimeGuard` 不会卡死在无信息状态

## 本地 Core API

- 桌面壳能自动尝试拉起本地 `core-api`
- `Setup` 可读到 Core API 状态
- `Profile` 的桌面运行时区块可读到状态
- 启动、停止、重启、探测按钮可用
- Core API 不依赖用户机器 PATH

## Runtime Data

- runtime data 路径可读
- 数据库路径可读
- 日志路径可定位
- 诊断状态可读

## Provider

- Desktop Setup 可读取 provider 当前配置
- 测试连接可执行
- 保存 provider 可执行
- provider 保存后再次打开应用仍可恢复

## 业务入口

- 未登录时：
  - `Setup -> Onboarding/Login` 路径正确
- 已登录时：
  - `Setup -> Tabs/Chat` 路径正确
- 聊天列表、聊天页、朋友圈、联系人、发现页可进入

## 错误诊断

- sidecar 缺失时文案明确
- 端口占用时文案明确
- 最近错误可在 guard 或 profile 中看到
- diagnostics summary 可显示

## 平台专项

### Windows

- 安装、升级、卸载链路可跑通
- Defender / SmartScreen 风险可说明
- `%AppData%` 下 runtime-data 行为符合预期

### macOS

- `.app/.dmg` 首启行为符合预期
- Gatekeeper / 签名 / 公证状态明确
- Apple Silicon 机器可跑通

## 验收结论

满足以下条件才算 Desktop Host 可用：

- 世界可在本地被托管
- provider 可配置
- 运行时状态可诊断
- 用户无需理解 PATH、Cargo 或手工命令
