# Mobile Client Regression Checklist

日期：2026-04-08
范围：iOS、Android

## 目标

验证 Mobile Client 作为“世界连接端”是否闭环，而不是只验证页面能否在小屏上显示。

## 首启与配置

- `Splash` 会在缺远程配置时进入 `Setup`
- `Mobile Setup` 可输入远程 Core API 地址
- 远程地址可校验
- 保存配置后可继续进入世界
- `Setup` 中会显示：
  - 配置来源
  - 会话恢复模式
  - 原生桥状态

## 登录态与安全存储

- 登录后重启 App 仍可恢复会话
- 注销后安全存储和内存态都被清空
- 无原生 secure storage 时会回退到 web storage
- 回退路径不会阻塞主流程

## 远程服务连接

- REST 与 Socket 指向同一实例
- 缺配置时不会偷偷回落到 `localhost`
- 远程服务不可达时，文案明确

## 业务入口

- 聊天列表可打开
- 聊天页可连接实时消息
- 朋友圈、发现、联系人、个人页可打开
- 法律页、社区规范、举报与拉黑入口可触达

## 原生桥接

- `YinjieRuntime` 可提供运行时配置，或正确回退到 `runtime-config.json`
- `YinjieSecureStorage` 可读写 session，或正确回退
- `YinjieMobileBridge` 未接通时不会导致主流程崩溃

## 推送与媒体

- push token 可被原生层读取或返回 `null`
- 图片选择接口未接通时返回空数组，不阻塞主流程
- 外链打开接口未接通时能回退浏览器行为

## 平台专项

### iOS

- Safe Area 正常
- 键盘顶起聊天输入区正常
- Keychain 路径符合预期
- APNs token 获取策略明确
- 提审所需账号删除与治理入口可演示

### Android

- `android-shell.config.json` 的 runtime 配置可写入 Web 层 fallback 文件
- Keystore / 安全存储路径符合预期
- FCM token 获取策略明确
- 通知权限、分享、图片选择的原生实现项有执行单

## 验收结论

满足以下条件才算 Mobile Client 可用：

- 能连接同一个隐界实例
- 能稳定恢复登录态
- 不承担本地宿主职责
- 原生桥未接通时也不会让主流程崩溃
