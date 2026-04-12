# Web端电脑版代码同步到 Windows 和 mac 版执行规划

日期：2026-04-12
仓库：`/home/ps/claude/yinjie-app`
目标：把近期 Web 端电脑版的功能/UI 改动完整落到 Windows 与 macOS 桌面包，而不是再维护一套独立桌面业务代码。

## 任务判断

- 当前桌面业务前端只有一套：`apps/app`
- Windows / macOS 共用一个 Tauri 壳：`apps/desktop`
- `apps/desktop/src-tauri/tauri.conf.json` 已明确通过：
  - `beforeBuildCommand = YINJIE_APP_BUILD_BASE=relative pnpm --dir ../app build`
  - `frontendDist = ../../app/dist`
- 这意味着 Web 电脑版的大多数页面改动理论上会自动进入桌面包
- 真正要补的是：
  - 桌面运行时分支是否都兼容 Tauri
  - 新增桌面交互是否需要原生壳能力
  - Windows / macOS 打包、安装、回归链路是否跟上

## 当前基线

### 已确认事实

- `apps/app` 最近连续有大量桌面工作区提交，主要集中在：
  - 聊天工作区
  - 通讯录与资料工作区
  - 朋友圈 / 广场动态 / 视频号
  - 收藏 / 搜索 / 游戏 / 小程序 / 笔记 / 反馈 / 设置
  - `desktop-shell` 导航与工作区框架
- `apps/desktop` 最近只补过一次构建链路修正：
  - `fix(app): use absolute base for web builds`
- `apps/desktop/src-tauri/src/main.rs` 当前只承接少量原生差异：
  - Windows acrylic
  - macOS vibrancy
  - 系统托盘
  - 窗口拖拽 / 最小化 / 最大化 / 关闭
  - 远程服务诊断
- Windows 已有安装包整理脚本：`scripts/build-windows-installers.mjs`
- macOS 目前只有构建命令，尚未看到对等的产物整理 / 发布脚本
- 仓库当前已有未提交改动：
  - `apps/app/src/components/chat-composer.tsx`
  - 执行本计划时必须避开该文件，防止覆盖用户现场

### 当前缺口判断

1. 缺的不是“把 Web 代码复制到 Windows/mac 两份”
2. 缺的是“把 Web 电脑版最近这些改动按桌面包实际运行路径做一次系统接入和验收”
3. 风险最高的地方不是纯 UI，而是：
   - `runtimeConfig.appPlatform === "desktop"` 分支
   - `@tauri-apps/api` 的延迟加载与降级
   - 桌面锁屏、窗口控制、独立页、文件/外链类操作
   - Windows / macOS 打包产物和回归清单不对称

## 完成定义

满足以下条件才算这轮同步完成：

1. `apps/app` 中近期桌面 Web 改动在 Tauri 桌面运行时下都能正常工作
2. 新增桌面交互不再只在浏览器里成立，在 Windows / macOS 原生壳里也有闭环
3. Windows x64、macOS arm64、macOS x86_64 都有明确构建入口和产物整理方式
4. 桌面发布回归清单覆盖：
   - 安装与启动
   - 远程连接
   - 聊天主路径
   - 通讯录 / 内容流 / 工具页
   - 原生窗口行为
   - 平台特有问题
5. 全过程采用小步提交，不混入用户当前未提交改动

## 执行范围

### A. Web 电脑版改动盘点

目标：先把“哪些变动需要同步”收成清单，而不是一上来盲改。

范围：

- `apps/app/src/features/desktop/**`
- `apps/app/src/features/shell/**`
- `apps/app/src/routes/**`
- `apps/app/src/runtime/**`

执行方式：

- 以 2026-04-09 之后的桌面相关提交为起点做分组盘点
- 给每一项改动标记类型：
  - 纯共享前端改动
  - 依赖桌面运行时判断
  - 依赖 Tauri 原生能力
  - 依赖发布/安装链路

产出：

- 一份“桌面 Web 变动 -> Windows/mac 落点”的同步矩阵

### B. App 层桌面运行时收口

目标：确保桌面 Web 的业务代码在 Tauri 中不是“能编”，而是真能跑。

重点文件：

- `apps/app/src/features/shell/desktop-shell.tsx`
- `apps/app/src/runtime/adapters/desktop.ts`
- `apps/app/src/runtime/platform.ts`
- 近期桌面改动涉及的工作区页面

重点检查：

- `nativeDesktopShell` 分支是否覆盖完整
- `@tauri-apps/api` 动态导入失败时是否有安全降级
- 浏览器行为是否被误当作原生能力使用
- `localStorage`、独立工作区状态、锁屏状态在桌面包里是否稳定
- 新增桌面工作区是否存在只在 Web 浏览器里有效的链接/跳转/打开方式

完成标准：

- 桌面工作区主路径在浏览器桌面态和 Tauri 桌面态表现一致
- 不再出现原生壳点击无反应、窗口控制失效、状态丢失或错误回退

### C. Tauri 壳能力补齐

目标：把 `apps/app` 里真正需要原生配合的部分落到 `apps/desktop`。

重点文件：

- `apps/desktop/src-tauri/src/main.rs`
- `apps/desktop/src-tauri/tauri.conf.json`
- `apps/desktop/src-tauri/capabilities/default.json`
- `apps/desktop/scripts/run-tauri.mjs`

重点检查：

- 新桌面能力是否需要新增 Tauri command
- 现有窗口控制 command 是否足够覆盖新的桌面交互
- Windows/macOS 的视觉差异是否只停留在 acrylic / vibrancy，而没有遗漏行为差异
- 托盘、主窗口恢复、关闭即隐藏、拖拽区是否仍适配新版桌面壳布局
- 资源路径、构建 base、图标资源在不同平台下是否稳定

预期动作：

- 只补真正必要的原生桥接
- 不把业务逻辑回灌到 Tauri 壳
- 继续保持 remote-connected client 约束

### D. Windows / macOS 发布链路补齐

目标：让“Web 电脑版改动已进入桌面包”从理论成立变成可发布成立。

Windows 侧：

- 延续现有命令：
  - `pnpm desktop:build:windows:x64`
  - `pnpm desktop:installer:windows`
  - `pnpm desktop:release:windows`
- 核对安装包归档目录、版本号、bundle 产物路径是否稳定

macOS 侧：

- 基于现有命令：
  - `pnpm desktop:build:mac:aarch64`
  - `pnpm desktop:build:mac:x86_64`
- 补齐缺失项：
  - 产物整理脚本
  - 发布目录约定
  - 必要的签名 / 公证占位说明

文档侧：

- 扩充桌面发布说明
- 将回归清单从“泛桌面”拆成 Windows / macOS 两端都可执行的验收步骤

### E. 双平台回归

目标：避免“代码进包了，但安装包不可用”。

统一回归项：

- 首启进入 `Splash -> Setup`
- 远程地址配置、重启恢复、健康检查
- 聊天列表 / 单聊 / 群聊
- 通讯录、朋友圈、广场动态、视频号、收藏、搜索、设置
- 世界主人资料、API Key、桌面锁屏
- 窗口拖拽、最小化、最大化、关闭到托盘 / 恢复

Windows 专项：

- 安装包安装 / 卸载
- 托盘恢复与任务栏表现
- MSVC 构建链路和重试逻辑是否稳定

macOS 专项：

- `icon.icns`、`.app` / `.dmg` 产物完整性
- vibrancy、窗口按钮、前后台切换
- 签名 / 公证前后的运行提示风险

## 批次安排

### 批次 1：盘点与同步矩阵

内容：

- 盘 2026-04-09 以来的桌面 Web 提交
- 列出每个改动在 Windows/mac 是否需要额外处理

提交建议：

- `docs(plan): map desktop web changes to native shells`

### 批次 2：App 层桌面运行时修复

内容：

- 修 `apps/app` 中桌面态与 Tauri 态不一致的问题
- 补桌面分支的降级、状态恢复和跳转闭环

提交建议：

- `fix(app): align desktop web flows with tauri runtime`

### 批次 3：Tauri 壳补齐

内容：

- 在 `apps/desktop` 中补窗口命令、壳层行为或配置
- 保持业务逻辑仍在 `apps/app`

提交建议：

- `feat(desktop): bridge native shell for desktop workspace`

### 批次 4：Windows 发布链路核实

内容：

- 校正 Windows 打包与安装包归档
- 更新回归文档

提交建议：

- `build(desktop): stabilize windows release pipeline`

### 批次 5：macOS 发布链路补齐

内容：

- 增加 macOS 产物整理与发布说明
- 补双架构交付路径

提交建议：

- `build(desktop): add mac release workflow`

## 验证策略

本地可先做的验证：

- `pnpm --filter @yinjie/app typecheck`
- `pnpm --filter @yinjie/app build`
- `pnpm --filter @yinjie/app lint`
- `pnpm desktop:build`

平台机验证：

- Windows：
  - `pnpm desktop:build:windows:x64`
  - `pnpm desktop:installer:windows`
- macOS：
  - `pnpm desktop:build:mac:aarch64`
  - `pnpm desktop:build:mac:x86_64`

注意：

- Windows 和 macOS 的最终安装包验证仍然必须在对应平台主机执行
- 当前 Linux 工作区可以完成共享前端和部分桌面壳静态校验，但不能替代原生安装验证

## 执行原则

- 不新建测试文件
- 每一批只改与该批次直接相关的文件
- 每一批完成立即提交
- 不覆盖用户当前未提交改动
- 若发现新的结构变更涉及模块 / 路由 / 实体 / 表，再同步更新 `AGENTS.md`

## 结论

这轮工作的正确做法不是“再做一套 Windows 版和 mac 版前端”，而是：

1. 盘清 `apps/app` 最近的桌面 Web 变动
2. 把需要原生壳支持的点补到 `apps/desktop`
3. 把 Windows / macOS 的构建、产物和回归流程补完整

按这个路径推进，才能真正做到“Web 电脑版的改动已经同步到 Windows 和 mac 版”。
