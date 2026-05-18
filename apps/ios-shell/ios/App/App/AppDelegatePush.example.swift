// 参考实现：configure-ios-project.mjs 的 ensureAppDelegatePushHooks() 会把
// ios/App/App/AppDelegate.swift 自动 patch 成下面这个形状。这份文件不参与
// 编译（不在 xcodeproj Sources phase 里），只是给读者看「configure 加完之后
// AppDelegate 长啥样」的留底，方便 Code Review / 手动复现。
//
// 关键点（前几轮真机走查踩过的）：
//   Round 1: cacheLaunchTarget 调 normalize 但没定义 → 整个 iOS 壳编译失败
//   Round 6: 缺 willPresent 实现，前台收到强提醒 / 会话提醒被 iOS 静默丢掉
//   Round 20: handlePushTokenChanged listener 走 NotificationCenter，AppDelegate
//     的 didRegister / didFail 要 post 出来，YinjieMobileBridgePlugin.load()
//     才能收到再 notifyListeners("pushTokenChanged") 给 JS

import UIKit
import Capacitor
import UserNotifications

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    var window: UIWindow?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        cacheLaunchTarget(from: launchOptions?[.remoteNotification] as? [AnyHashable: Any], defaultSource: "push")
        // Round 39: 已授权时每次冷启 re-register 一次，让 APNs 把可能轮换过
        // 的新 device token 推下来（iCloud restore / iOS 大版本升级 / SIM
        // 换卡 / 删 reinstall 等场景）。.notDetermined 不动，保留首次弹权限
        // 走业务侧 requestNotificationPermission 的路径。
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            guard settings.authorizationStatus == .authorized ||
                    settings.authorizationStatus == .provisional else {
                return
            }
            DispatchQueue.main.async {
                UIApplication.shared.registerForRemoteNotifications()
            }
        }
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        UserDefaults.standard.set(token, forKey: "YinjiePushToken")
        NotificationCenter.default.post(
            name: Notification.Name("YinjiePushTokenChanged"),
            object: nil,
            userInfo: ["token": token]
        )
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        UserDefaults.standard.removeObject(forKey: "YinjiePushToken")
        print("Yinjie push registration failed: \(error.localizedDescription)")
        NotificationCenter.default.post(
            name: Notification.Name("YinjiePushTokenChanged"),
            object: nil,
            userInfo: ["error": error.localizedDescription]
        )
    }

    // App 处于前台时，iOS 默认会把通知静默丢掉。我们走 showLocalNotification
    // 的入口（强提醒 / 会话提醒）前已经在 JS 侧排除了「用户正在看这条会话」
    // 的情况，所以走到这里的都应当弹 banner + 出声。
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        if #available(iOS 14.0, *) {
            completionHandler([.banner, .list, .sound, .badge])
        } else {
            completionHandler([.alert, .sound, .badge])
        }
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        defer { completionHandler() }
        cacheLaunchTarget(from: response.notification.request.content.userInfo, defaultSource: "local_reminder")
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    private func cacheLaunchTarget(from userInfo: [AnyHashable: Any]?, defaultSource: String) {
        guard let userInfo else {
            return
        }

        let kind = normalize(userInfo["kind"])
        let route = normalize(userInfo["route"])
        let conversationId = normalize(userInfo["conversationId"])
        let groupId = normalize(userInfo["groupId"])
        let source = normalize(userInfo["source"])

        let resolvedKind: String?
        if let kind {
            resolvedKind = kind
        } else if conversationId != nil {
            resolvedKind = "conversation"
        } else if groupId != nil {
            resolvedKind = "group"
        } else if route != nil {
            resolvedKind = "route"
        } else {
            resolvedKind = nil
        }

        guard let resolvedKind else {
            return
        }

        var payload: [String: String] = [
            "kind": resolvedKind,
            "source": source ?? defaultSource
        ]

        if let route {
            payload["route"] = route
        } else if resolvedKind == "route" {
            payload["route"] = "/tabs/chat"
        }

        if let conversationId {
            payload["conversationId"] = conversationId
        }

        if let groupId {
            payload["groupId"] = groupId
        }

        UserDefaults.standard.set(payload, forKey: "YinjiePendingLaunchTarget")
    }

    private func normalize(_ value: Any?) -> String? {
        guard let stringValue = value as? String else {
            return nil
        }

        let normalized = stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        return normalized.isEmpty ? nil : normalized
    }
}
