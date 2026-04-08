import UIKit
import UserNotifications

@main
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { _, _ in }
        application.registerForRemoteNotifications()
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        UserDefaults.standard.set(token, forKey: "YinjiePushToken")
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        UserDefaults.standard.removeObject(forKey: "YinjiePushToken")
        print("Yinjie push registration failed: \\(error.localizedDescription)")
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        defer { completionHandler() }

        let userInfo = response.notification.request.content.userInfo
        let kind = normalize(userInfo["kind"] as? String)
        let route = normalize(userInfo["route"] as? String)
        let conversationId = normalize(userInfo["conversationId"] as? String)
        let groupId = normalize(userInfo["groupId"] as? String)

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
            "source": "push"
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

    private func normalize(_ value: String?) -> String? {
        guard let value else {
            return nil
        }

        let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return normalized.isEmpty ? nil : normalized
    }
}
