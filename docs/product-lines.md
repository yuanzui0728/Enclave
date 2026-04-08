# 隐界多端产品线说明
日期：2026-04-08

## 当前结论

隐界不再区分“桌面宿主端”和“移动连接端”两种运行模型。

当前统一口径：
- Windows / macOS：Tauri 客户端壳
- iOS / Android：Capacitor 客户端壳
- Web：浏览器客户端

它们都连接同一个远程世界实例，无论该实例部署在官方云还是用户自己的服务器。

## 统一原则

- 所有端都是 remote-connected client
- 不在本地拉起 Core API
- 世界主人初始化、聊天、社交、个人 API Key 设置共用 `apps/app` 业务前端
- 原生壳只负责窗口、深链、安全存储、诊断和平台桥接

## 代码落点

### 共享前端
- `apps/app`
- `packages/contracts`
- `packages/config`
- `packages/ui`

### 桌面壳
- `apps/desktop`

### Android 壳
- `apps/android-shell`

### iOS 壳
- `apps/ios-shell`

### 实例管理后台
- `apps/admin`

### 官方云平台
- `apps/cloud-api`
- `apps/cloud-console`

## 首次启动流程

1. `Splash`
2. `Setup`
3. 选择云世界或本地世界
4. 本地世界填写服务器地址，云世界通过手机号进入
5. 若世界主人尚未初始化则进入 `Onboarding`
6. 进入聊天与社交流程

## 管理职责

### 世界主人
- 只使用 App、Web 或桌面壳进入自己的世界
- 连接自己的实例
- 可选配置自己的 API Key

### 实例拥有者
- 部署世界实例
- 配置实例默认 Provider
- 使用实例管理后台查看系统状态和诊断信息

### 官方云平台运营侧
- 审核云世界申请单
- 维护云世界记录和地址
- 不负责实例内用户管理
- 当前也不负责自动实例编排

## 后续约束

- 新功能默认按远程世界实例接入设计
- 不再新增任何本地宿主依赖
- 不再引入历史登录产品语义
- 文档、发布流程、回归清单统一以远程接入为基准
