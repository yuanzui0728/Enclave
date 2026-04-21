# YinjieMobileBridge Plugin Spec

## 作用

为 `apps/app` 提供移动端原生能力桥接，但不把这些能力散落到业务页面。

当前 Web 侧对应文件：

- `apps/app/src/runtime/mobile-bridge.ts`

## 期望方法

1. `openExternalUrl({ url })`
2. `share({ title?, text?, url? })`
3. `shareFile({ base64Data, fileName, mimeType?, title? })`
4. `openFile({ base64Data, fileName, mimeType?, title? })`
5. `pickImages({ multiple? })`
6. `pickFile()`
7. `captureImage()`
8. `getPushToken()`
9. `getNotificationPermissionState()`
10. `requestNotificationPermission()`
11. `showLocalNotification({ id?, title, body, route?, conversationId?, groupId?, source? })`
12. `getPendingLaunchTarget()`
13. `clearPendingLaunchTarget()`

## 返回结构

### pickImages

```json
{
  "assets": [
    {
      "path": "/native/path/to/file.jpg",
      "webPath": "capacitor://localhost/_capacitor_file_/file.jpg",
      "mimeType": "image/jpeg",
      "fileName": "file.jpg"
    }
  ]
}
```

### captureImage

```json
{
  "asset": {
    "path": "/native/path/to/captured.jpg",
    "webPath": "capacitor://localhost/_capacitor_file_/native/path/to/captured.jpg",
    "mimeType": "image/jpeg",
    "fileName": "captured.jpg"
  }
}
```

### shareFile

```json
{
  "base64Data": "<base64>",
  "fileName": "需求文档.pdf",
  "mimeType": "application/pdf",
  "title": "保存文件"
}
```

### openFile

```json
{
  "base64Data": "<base64>",
  "fileName": "需求文档.pdf",
  "mimeType": "application/pdf",
  "title": "打开文件"
}
```

### pickFile

```json
{
  "asset": {
    "path": "/native/path/to/file.pdf",
    "webPath": "capacitor://localhost/_capacitor_file_/native/path/to/file.pdf",
    "mimeType": "application/pdf",
    "fileName": "需求文档.pdf"
  }
}
```

### getPushToken

```json
{
  "token": "apns-or-fcm-token"
}
```

### getNotificationPermissionState / requestNotificationPermission

```json
{
  "state": "granted"
}
```

### showLocalNotification

```json
{
  "id": "reminder-message-123",
  "title": "消息提醒",
  "body": "该回这条消息了",
  "conversationId": "conversation-123",
  "source": "local_reminder"
}
```

### getPendingLaunchTarget

```json
{
  "target": {
    "kind": "conversation",
    "conversationId": "conversation-123",
    "source": "push"
  }
}
```

## Swift 侧建议

建议实现：

- `@objc(YinjieMobileBridgePlugin)`
- `openExternalUrl(_ call: CAPPluginCall)`
- `share(_ call: CAPPluginCall)`
- `shareFile(_ call: CAPPluginCall)`
- `openFile(_ call: CAPPluginCall)`
- `pickImages(_ call: CAPPluginCall)`
- `pickFile(_ call: CAPPluginCall)`
- `captureImage(_ call: CAPPluginCall)`
- `getPushToken(_ call: CAPPluginCall)`
- `getNotificationPermissionState(_ call: CAPPluginCall)`
- `requestNotificationPermission(_ call: CAPPluginCall)`
- `showLocalNotification(_ call: CAPPluginCall)`
- `getPendingLaunchTarget(_ call: CAPPluginCall)`
- `clearPendingLaunchTarget(_ call: CAPPluginCall)`

数据来源建议：

1. 打开外链：`UIApplication.shared.open`
2. 分享：`UIActivityViewController`，iPad 需要同时配置 `popoverPresentationController`
3. 文件分享：把 base64 文件落到临时目录，再通过 `UIActivityViewController` 交给系统“存储到文件/转发”
4. 文件预览：把 base64 文件落到临时目录，再通过 `UIDocumentInteractionController` 打开系统预览/“在其他应用中打开”
5. 图片选择：`PHPickerViewController`
6. 文件选择：`UIDocumentPickerViewController`
7. 拍照：`UIImagePickerController(sourceType: .camera)`
8. Push token：已注册到 APNs 后缓存于原生层
9. 通知权限：`UNUserNotificationCenter`
10. 本地提醒通知：`UNUserNotificationCenter` 本地通知
11. 通知点击落点：建议原生层把 payload 缓存到 `UserDefaults["YinjiePendingLaunchTarget"]`

当前 stub 行为：

- `pickImages` 会通过 `PHPickerViewController` 选择图片
- `shareFile` 会把 Web 层传入的二进制文件写到临时目录，再打开系统分享面板
- `openFile` 会把 Web 层传入的二进制文件写到临时目录，再打开系统文件预览或“在其他应用中打开”
- `pickFile` 会通过 `UIDocumentPickerViewController` 选择文件，并把结果复制到临时目录再返回给 Web 层
- `captureImage` 会通过系统相机拍照，并把结果写到临时目录再返回给 Web 层
- 选中的资源会复制到临时目录，再以 `path / webPath / fileName / mimeType` 返回给 Web 层
- iOS 的 `webPath` 应优先返回 Capacitor portable path，而不是裸 `file://`，避免 WebView 内 `fetch/预览` 失败
- `getPendingLaunchTarget` / `clearPendingLaunchTarget` 当前读取和清理 `UserDefaults["YinjiePendingLaunchTarget"]`

## 失败策略

如果 plugin 未接通，Web 层会自动回退到：

- 外链：浏览器 `window.open`
- 分享：返回失败，不阻断主流程
- 图片选择：返回空数组
- Push token：返回 `null`
- 通知权限：返回 `unknown`
