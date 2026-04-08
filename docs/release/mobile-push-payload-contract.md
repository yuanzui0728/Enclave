# Mobile Push Payload Contract

日期：2026-04-08
范围：iOS、Android、推送发送侧

## 目标

固定移动端推送点击后的最小 payload 合同，避免服务端、Android、iOS、Web 各自推导不同字段。

## 适用范围

- Android `FCM data` payload
- iOS `APNs userInfo`
- 原生壳写入 `YinjiePendingLaunchTarget`
- `apps/app` Web 层读取通知点击落点

## 标准字段

必填字段：
- `kind`
  - `route`
  - `conversation`
  - `group`

可选字段：
- `route`
- `conversationId`
- `groupId`
- `title`
- `body`
- `source`

## 语义规则

1. `kind=route`
   - 应提供 `route`
   - 若缺失，客户端默认回落到 `/tabs/chat`
2. `kind=conversation`
   - 必须提供 `conversationId`
3. `kind=group`
   - 必须提供 `groupId`
4. `source`
   - 建议由原生层补成 `push`
   - Web 层只读，不依赖它做路由判断

## Android FCM data 示例

### 打开单聊

```json
{
  "kind": "conversation",
  "conversationId": "direct_char_doctor",
  "title": "林医生",
  "body": "我刚想到一件事，想先和你确认。"
}
```

### 打开群聊

```json
{
  "kind": "group",
  "groupId": "group_20260408_design_review",
  "title": "协作群聊",
  "body": "新消息来自多人会话。"
}
```

### 打开聊天列表

```json
{
  "kind": "route",
  "route": "/tabs/chat",
  "title": "隐界",
  "body": "有人在等你回到世界。"
}
```

## iOS APNs userInfo 示例

```json
{
  "aps": {
    "alert": {
      "title": "隐界",
      "body": "你有一条新的消息。"
    }
  },
  "kind": "conversation",
  "conversationId": "direct_char_doctor"
}
```

## 原生壳落地约定

### Android

- `YinjieFirebaseMessagingService` 从通知 payload 中读取 `kind / route / conversationId / groupId`
- 点击通知时通过 `Intent extras` 带回 `MainActivity`
- `YinjieMobileBridgePlugin.cacheLaunchTarget()` 将其落到 `SharedPreferences`

### iOS

- `UNUserNotificationCenterDelegate.didReceive` 从 `userInfo` 读取相同字段
- 将其写入 `UserDefaults.standard["YinjiePendingLaunchTarget"]`

## Web 层消费约定

- `apps/app/src/features/shell/mobile-notification-launch-bridge.tsx` 负责读取 pending target
- 世界主人状态可用时：
  - `conversation` -> `/chat/:conversationId`
  - `group` -> `/group/:groupId`
  - `route` -> 指定 route
- 世界主人状态尚未建立时先保留原生缓存，等 Setup / Onboarding 完成后再消费

## 发送侧禁忌

- 不要同时发送互相矛盾的 `conversationId` 和 `groupId`
- 不要把桌面宿主路径或本地文件路径写进 `route`
- 不要依赖客户端自己猜目标类型
- 不要发送需要客户端拼接业务上下文才能理解的半截字段

## 当前版本结论

当前移动端已经消费以上最小合同。后续如果扩展到：
- moment / friend-request / moderation-report
- Web URL deep link
- notification action buttons

应在这份文档上增量扩展，而不是另起一套字段。
