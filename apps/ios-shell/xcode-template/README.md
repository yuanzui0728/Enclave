# Xcode Template Notes

这个目录用于承接 `apps/ios-shell` 对真实 Xcode 工程的占位模板。

当前不会尝试在 Linux 环境里生成 `.xcodeproj`，但会把后续必须落位的文件、配置项和目录结构先固定下来，方便在 macOS 上照着接入。

建议真实工程结构：

1. `ios/App/App/Info.plist`
2. `ios/App/App/PrivacyInfo.xcprivacy`
3. `ios/App/App/App.entitlements`
4. `ios/App/App/AppDelegate.swift`
5. `ios/App/App/Plugins/`
6. `ios/App/Podfile`

接入顺序：

1. 通过 `pnpm ios:sync` 生成/同步 Capacitor iOS 工程
2. 把本目录样例内容复制进真实 iOS 工程
3. 将 `plugins/swift-stub/` 迁移进 `Plugins/`
4. 将 `AppDelegatePush.example.swift` 中的 push token 缓存和通知点击落点缓存逻辑并入真实 `AppDelegate.swift`
5. 在 Xcode 中补 Team、Signing、Bundle Identifier 和 Capabilities
