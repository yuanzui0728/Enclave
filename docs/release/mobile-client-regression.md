# Mobile Client Regression Checklist

日期：2026-04-08
范围：iOS、Android

## 目标

验证移动端作为远程客户端是否完整可用。

## 首启与配置

- `Splash` 在缺少远程配置时进入 `Setup`
- 可填写服务器地址并保存
- 重启后仍能恢复该地址
- 未配置地址时不会回落到 `localhost`

## 世界主人状态

- Onboarding 完成后重启 App 可恢复世界主人状态
- 清理本地状态后会重新进入 Setup / Onboarding
- 安全存储不可用时可以正确回退

## 远程连接

- REST 与 Socket 指向同一实例
- 远程服务不可达时有清晰错误提示
- 反向代理和 HTTPS 下可正常工作

## 业务入口

- 聊天列表、单聊、群聊可打开
- 朋友圈、发现、联系人、个人页可打开
- 个人页可设置、更新、清除个人 API Key

## 原生桥接

- 运行时配置可由原生层注入
- 安全存储可读写世界主人状态
- 原生桥未接通时主流程不崩溃

## 平台专项

### iOS
- `doctor/configure/sync` 可通过
- Safe Area 正常
- 键盘顶起聊天输入区正常

### Android
- 可继续产出 APK / AAB
- 通知、分享、图片选择链路不阻塞主流程
