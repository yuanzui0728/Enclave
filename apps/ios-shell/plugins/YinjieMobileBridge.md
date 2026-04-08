# YinjieMobileBridge Plugin Spec

## 作用

为 `apps/app` 提供移动端原生能力桥接，但不把这些能力散落到业务页面。

当前 Web 侧对应文件：

- `apps/app/src/runtime/mobile-bridge.ts`

## 期望方法

1. `openExternalUrl({ url })`
2. `share({ title?, text?, url? })`
3. `pickImages({ multiple? })`
4. `getPushToken()`
5. `getNotificationPermissionState()`
6. `requestNotificationPermission()`

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

## Swift 侧建议

建议实现：

- `@objc(YinjieMobileBridgePlugin)`
- `openExternalUrl(_ call: CAPPluginCall)`
- `share(_ call: CAPPluginCall)`
- `pickImages(_ call: CAPPluginCall)`
- `getPushToken(_ call: CAPPluginCall)`
- `getNotificationPermissionState(_ call: CAPPluginCall)`
- `requestNotificationPermission(_ call: CAPPluginCall)`

数据来源建议：

1. 打开外链：`UIApplication.shared.open`
2. 分享：`UIActivityViewController`
3. 图片选择：`PHPickerViewController`
4. Push token：已注册到 APNs 后缓存于原生层
5. 通知权限：`UNUserNotificationCenter`

## 失败策略

如果 plugin 未接通，Web 层会自动回退到：

- 外链：浏览器 `window.open`
- 分享：返回失败，不阻断主流程
- 图片选择：返回空数组
- Push token：返回 `null`
- 通知权限：返回 `unknown`
