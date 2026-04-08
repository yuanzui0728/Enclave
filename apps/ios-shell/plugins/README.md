# Native Plugins

`apps/ios-shell/plugins/` 用来放 iOS 原生桥接实现说明与占位模板。

当前 Web 侧已经声明了两个 Capacitor plugin：

1. `YinjieRuntime`
2. `YinjieSecureStorage`
3. `YinjieMobileBridge`

后续在 Xcode 工程内接入时，应保持方法名与返回结构不变，避免再次改动 Web 业务层。
