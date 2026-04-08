import Foundation
import Capacitor
import UIKit
import UserNotifications

@objc(YinjieMobileBridgePlugin)
public class YinjieMobileBridgePlugin: CAPPlugin {
    @objc func openExternalUrl(_ call: CAPPluginCall) {
        guard let rawUrl = call.getString("url"),
              let url = URL(string: rawUrl.trimmingCharacters(in: .whitespacesAndNewlines)) else {
            call.reject("url is required")
            return
        }

        DispatchQueue.main.async {
            UIApplication.shared.open(url, options: [:]) { success in
                if success {
                    call.resolve()
                } else {
                    call.reject("failed to open external url")
                }
            }
        }
    }

    @objc func share(_ call: CAPPluginCall) {
        let title = call.getString("title")?.trimmingCharacters(in: .whitespacesAndNewlines)
        let text = call.getString("text")?.trimmingCharacters(in: .whitespacesAndNewlines)
        let urlString = call.getString("url")?.trimmingCharacters(in: .whitespacesAndNewlines)

        var items: [Any] = []
        if let title, !title.isEmpty {
            items.append(title)
        }
        if let text, !text.isEmpty {
            items.append(text)
        }
        if let urlString, !urlString.isEmpty, let url = URL(string: urlString) {
            items.append(url)
        }

        guard !items.isEmpty else {
            call.reject("share payload is empty")
            return
        }

        DispatchQueue.main.async {
            let controller = UIActivityViewController(activityItems: items, applicationActivities: nil)
            if let presenter = self.bridge?.viewController {
                presenter.present(controller, animated: true) {
                    call.resolve()
                }
            } else {
                call.reject("missing presenter for share sheet")
            }
        }
    }

    @objc func pickImages(_ call: CAPPluginCall) {
        call.resolve([
            "assets": []
        ])
    }

    @objc func getPushToken(_ call: CAPPluginCall) {
        let token = UserDefaults.standard.string(forKey: "YinjiePushToken")
        call.resolve([
            "token": token ?? NSNull()
        ])
    }

    @objc func getNotificationPermissionState(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            call.resolve([
                "state": self.mapAuthorizationStatus(settings.authorizationStatus)
            ])
        }
    }

    @objc func requestNotificationPermission(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { _, error in
            if let error {
                call.reject("failed to request notification permission", nil, error)
                return
            }

            UNUserNotificationCenter.current().getNotificationSettings { settings in
                DispatchQueue.main.async {
                    UIApplication.shared.registerForRemoteNotifications()
                }

                call.resolve([
                    "state": self.mapAuthorizationStatus(settings.authorizationStatus)
                ])
            }
        }
    }

    private func mapAuthorizationStatus(_ status: UNAuthorizationStatus) -> String {
        switch status {
        case .authorized, .provisional, .ephemeral:
            return "granted"
        case .denied:
            return "denied"
        case .notDetermined:
            return "prompt"
        @unknown default:
            return "unknown"
        }
    }
}
