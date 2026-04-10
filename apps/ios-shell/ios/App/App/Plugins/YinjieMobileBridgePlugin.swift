import Foundation
import Capacitor
import PhotosUI
import UIKit
import UserNotifications

@objc(YinjieMobileBridgePlugin)
public class YinjieMobileBridgePlugin: CAPPlugin, PHPickerViewControllerDelegate {
    private var pendingImagePickerCall: CAPPluginCall?

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
        guard let presenter = bridge?.viewController else {
            call.reject("missing presenter for image picker")
            return
        }

        pendingImagePickerCall = call

        var configuration = PHPickerConfiguration(photoLibrary: .shared())
        configuration.filter = .images
        configuration.selectionLimit = call.getBool("multiple", false) ? 0 : 1

        let picker = PHPickerViewController(configuration: configuration)
        picker.delegate = self

        DispatchQueue.main.async {
            presenter.present(picker, animated: true)
        }
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

    @objc func getPendingLaunchTarget(_ call: CAPPluginCall) {
        guard let payload = UserDefaults.standard.dictionary(forKey: "YinjiePendingLaunchTarget") else {
            call.resolve([
                "target": NSNull()
            ])
            return
        }

        call.resolve([
            "target": payload
        ])
    }

    @objc func showLocalNotification(_ call: CAPPluginCall) {
        let title = call.getString("title")?.trimmingCharacters(in: .whitespacesAndNewlines)
        let body = call.getString("body")?.trimmingCharacters(in: .whitespacesAndNewlines)
        let route = normalize(call.getString("route"))
        let conversationId = normalize(call.getString("conversationId"))
        let groupId = normalize(call.getString("groupId"))
        let source = normalize(call.getString("source")) ?? "local_reminder"
        let identifier = normalize(call.getString("id")) ?? UUID().uuidString

        guard let title, !title.isEmpty, let body, !body.isEmpty else {
            call.reject("title and body are required")
            return
        }

        UNUserNotificationCenter.current().getNotificationSettings { settings in
            let state = self.mapAuthorizationStatus(settings.authorizationStatus)
            guard state == "granted" else {
                call.reject("notification permission is not granted")
                return
            }

            let content = UNMutableNotificationContent()
            content.title = title
            content.body = body

            var userInfo: [String: Any] = [
                "source": source
            ]

            if let route {
                userInfo["route"] = route
            }

            if let conversationId {
                userInfo["conversationId"] = conversationId
                userInfo["kind"] = "conversation"
            }

            if let groupId {
                userInfo["groupId"] = groupId
                userInfo["kind"] = "group"
            }

            if userInfo["kind"] == nil {
                userInfo["kind"] = "route"
                if userInfo["route"] == nil {
                    userInfo["route"] = "/tabs/chat"
                }
            }

            content.userInfo = userInfo

            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 0.3, repeats: false)
            let request = UNNotificationRequest(identifier: identifier, content: content, trigger: trigger)

            UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [identifier])
            UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: [identifier])
            UNUserNotificationCenter.current().add(request) { error in
                if let error {
                    call.reject("failed to schedule local notification", nil, error)
                    return
                }

                call.resolve()
            }
        }
    }

    @objc func clearPendingLaunchTarget(_ call: CAPPluginCall) {
        UserDefaults.standard.removeObject(forKey: "YinjiePendingLaunchTarget")
        call.resolve()
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

    public func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        let call = pendingImagePickerCall
        pendingImagePickerCall = nil

        DispatchQueue.main.async {
            picker.dismiss(animated: true)
        }

        guard let call else {
            return
        }

        if results.isEmpty {
            call.resolve([
                "assets": []
            ])
            return
        }

        let group = DispatchGroup()
        let lock = NSLock()
        var assets: [[String: Any]] = []

        for result in results {
            group.enter()
            loadImageAsset(from: result) { asset in
                if let asset {
                    lock.lock()
                    assets.append(asset)
                    lock.unlock()
                }
                group.leave()
            }
        }

        group.notify(queue: .main) {
            call.resolve([
                "assets": assets
            ])
        }
    }

    private func loadImageAsset(from result: PHPickerResult, completion: @escaping ([String: Any]?) -> Void) {
        let provider = result.itemProvider
        guard provider.hasItemConformingToTypeIdentifier("public.image") else {
            completion(nil)
            return
        }

        provider.loadFileRepresentation(forTypeIdentifier: "public.image") { url, _ in
            guard let url else {
                completion(nil)
                return
            }

            let fileManager = FileManager.default
            let tempDir = fileManager.temporaryDirectory.appendingPathComponent("yinjie-picker", isDirectory: true)

            do {
                try fileManager.createDirectory(at: tempDir, withIntermediateDirectories: true)
                let ext = url.pathExtension.isEmpty ? "jpg" : url.pathExtension
                let fileName = "\(UUID().uuidString).\(ext)"
                let destination = tempDir.appendingPathComponent(fileName)

                if fileManager.fileExists(atPath: destination.path) {
                    try fileManager.removeItem(at: destination)
                }

                try fileManager.copyItem(at: url, to: destination)

                var asset: [String: Any] = [
                    "path": destination.path,
                    "webPath": destination.absoluteString,
                    "fileName": fileName
                ]

                if let mimeType = mimeType(forExtension: ext) {
                    asset["mimeType"] = mimeType
                }

                completion(asset)
            } catch {
                completion(nil)
            }
        }
    }

    private func mimeType(forExtension ext: String) -> String? {
        switch ext.lowercased() {
        case "jpg", "jpeg":
            return "image/jpeg"
        case "png":
            return "image/png"
        case "gif":
            return "image/gif"
        case "heic":
            return "image/heic"
        case "webp":
            return "image/webp"
        default:
            return nil
        }
    }
}
