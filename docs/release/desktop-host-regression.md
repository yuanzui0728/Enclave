# Desktop Client Regression Checklist

日期：2026-04-28
范围：Windows、macOS、Linux

## 目标

验证桌面端作为远程客户端是否完整可用，而不是验证本地宿主能力。

## 构建与产物

### Windows

- `pnpm desktop:installer:windows` 可稳定产出安装包
- `dist/windows-installer` 内至少存在一个可安装产物：
  - `.exe`
  - `.msi`
- `pnpm desktop:release:windows` 可完成版本归档

### macOS

- `pnpm desktop:bundle:mac:aarch64` 可整理出 Apple Silicon 桌面包
- `pnpm desktop:bundle:mac:x86_64` 可整理出 Intel 桌面包
- `dist/macos-bundle/<target>` 内至少存在：
  - `.app`
  - `.dmg`
- `pnpm desktop:release:mac:<target>` 可完成版本归档
- 对外分发版本需记录：
  - 是否已签名
  - 是否已 notarized

### Linux

- `pnpm --filter @yinjie/desktop build` 可在安装 Tauri Linux 系统依赖后完成
- 缺失系统依赖时，`apps/desktop/scripts/run-tauri.mjs` 会明确列出缺失的 `pkg-config` 包
- Linux 验证至少记录 `pkg-config` 预检结果或 `cargo check` 结果

## 安装与启动

- 安装包 / 桌面包可以正常安装或挂载打开
- 首次启动进入 `Splash -> Setup`
- 未配置服务器地址时不会误连 `localhost`
- 保存服务器地址后可继续进入 Onboarding 或直接进入世界

## 远程连接

- API 地址可保存并在重启后恢复
- Socket 地址可留空或与 API 地址一致
- `/health` 可通过反向代理访问
- WebSocket 可以连接、断线重连和恢复聊天刷新

## 业务入口

- 聊天列表可打开
- 单聊、群聊可正常进入
- 朋友圈、联系人、发现页、个人页可正常进入
- 个人页可读取世界主人资料与自定义 API Key 状态

## 世界主人 API Key

- 可设置个人 API Key
- 可设置可选 API Base URL
- 可清除个人 API Key
- 不回显明文 Key

## 桌面端专属能力

- 原生壳可以提供运行时诊断
- 深链不会破坏世界主人状态
- 本地存储可恢复服务器地址与世界主人信息
- 不再要求桌面端具备 start/stop/restart 本地 Core API 能力
- 自定义标题栏窗口拖拽、最小化、最大化、关闭 / 恢复行为正常
- 托盘存在时，关闭主窗口后可恢复主窗口
- 独立聊天窗口 / 图片窗口不会破坏主聊天上下文

## 发布验收

- Tauri bundle 可产出
- 打包产物中不包含 `yinjie-core-api` sidecar
- 安装后只需要服务器地址即可使用
- 回归结果至少保留一种证据：
  - 命令结论
  - 截图
  - 录屏
  - 手工执行记录

## 平台专项

### Windows

- NSIS / MSI 任一安装包可安装和卸载
- 任务栏和托盘恢复行为一致
- 不因 WiX 瞬时错误导致假成功产物

### macOS

- `.app` 可直接启动
- `.dmg` 可正常挂载并拖拽安装
- 未签名 / 未 notarized 的测试包风险已明确记录
- vibrancy、红黄绿窗口按钮和前后台切换行为正常

### Linux

- 系统已安装 GTK/WebKit 运行依赖
- 无边框窗口拖拽、最小化、最大化、关闭 / 托盘恢复行为正常
- 缺失依赖时不会进入含糊的 Rust 编译失败，而是先给出可执行的安装提示

## 参考流程

- 发布流程：`docs/release/desktop-release-runbook.md`
