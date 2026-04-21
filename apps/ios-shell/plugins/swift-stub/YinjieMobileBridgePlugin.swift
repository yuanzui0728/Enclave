import Foundation
import Capacitor
import PhotosUI
import UniformTypeIdentifiers
import UIKit
import UserNotifications

@objc(YinjieMobileBridgePlugin)
public class YinjieMobileBridgePlugin: CAPPlugin, CAPBridgedPlugin, PHPickerViewControllerDelegate, UIImagePickerControllerDelegate, UINavigationControllerDelegate, UIDocumentPickerDelegate, UIDocumentInteractionControllerDelegate {
    public let identifier = "YinjieMobileBridgePlugin"
    public let jsName = "YinjieMobileBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "openExternalUrl", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openAppSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "share", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "shareFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pickImages", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pickFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "captureImage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPushToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getNotificationPermissionState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestNotificationPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showLocalNotification", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPendingLaunchTarget", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearPendingLaunchTarget", returnType: CAPPluginReturnPromise)
    ]

    private var pendingImagePickerCall: CAPPluginCall?
    private var pendingFilePickerCall: CAPPluginCall?
    private var pendingCameraCaptureCall: CAPPluginCall?
    private var activeDocumentInteractionController: UIDocumentInteractionController?

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

    @objc func openAppSettings(_ call: CAPPluginCall) {
        guard let url = URL(string: UIApplication.openSettingsURLString) else {
            call.reject("failed to resolve app settings url")
            return
        }

        DispatchQueue.main.async {
            UIApplication.shared.open(url, options: [:]) { success in
                if success {
                    call.resolve()
                } else {
                    call.reject("failed to open app settings")
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
                self.configurePopoverPresentation(for: controller, presenter: presenter)
                presenter.present(controller, animated: true) {
                    call.resolve()
                }
            } else {
                call.reject("missing presenter for share sheet")
            }
        }
    }

    @objc func shareFile(_ call: CAPPluginCall) {
        guard let base64Data = normalize(call.getString("base64Data")),
              let fileName = normalize(call.getString("fileName")),
              let fileData = Data(base64Encoded: base64Data, options: [.ignoreUnknownCharacters]),
              let presenter = bridge?.viewController else {
            call.reject("base64Data and fileName are required")
            return
        }

        let title = normalize(call.getString("title"))

        guard let fileUrl = writeSharedFile(data: fileData, fileName: fileName) else {
            call.reject("failed to prepare shared file")
            return
        }

        DispatchQueue.main.async {
            let controller = UIActivityViewController(activityItems: [fileUrl], applicationActivities: nil)
            if let title, !title.isEmpty {
                controller.setValue(title, forKey: "subject")
            }
            self.configurePopoverPresentation(for: controller, presenter: presenter)

            presenter.present(controller, animated: true) {
                call.resolve()
            }
        }
    }

    @objc func openFile(_ call: CAPPluginCall) {
        guard let base64Data = normalize(call.getString("base64Data")),
              let fileName = normalize(call.getString("fileName")),
              let fileData = Data(base64Encoded: base64Data, options: [.ignoreUnknownCharacters]),
              let presenter = bridge?.viewController else {
            call.reject("base64Data and fileName are required")
            return
        }

        let title = normalize(call.getString("title"))

        guard let fileUrl = writeSharedFile(data: fileData, fileName: fileName) else {
            call.reject("failed to prepare preview file")
            return
        }

        DispatchQueue.main.async {
            let controller = UIDocumentInteractionController(url: fileUrl)
            controller.delegate = self
            if let fileType = UTType(filenameExtension: fileUrl.pathExtension)?.identifier {
                controller.uti = fileType
            }

            self.activeDocumentInteractionController = controller

            if controller.presentPreview(animated: true) {
                call.resolve()
                return
            }

            let presented =
                controller.presentOptionsMenu(
                    from: presenter.view.bounds,
                    in: presenter.view,
                    animated: true
                )
            if presented {
                call.resolve()
                return
            }

            self.activeDocumentInteractionController = nil
            call.reject(title != nil ? "failed to open \(title!)" : "failed to open file preview")
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

    @objc func captureImage(_ call: CAPPluginCall) {
        guard let presenter = bridge?.viewController else {
            call.reject("missing presenter for camera picker")
            return
        }

        guard UIImagePickerController.isSourceTypeAvailable(.camera) else {
            call.reject("camera is unavailable")
            return
        }

        pendingCameraCaptureCall = call

        DispatchQueue.main.async {
            let picker = UIImagePickerController()
            picker.sourceType = .camera
            picker.cameraDevice = .rear
            picker.modalPresentationStyle = .fullScreen
            picker.delegate = self
            presenter.present(picker, animated: true)
        }
    }

    @objc func pickFile(_ call: CAPPluginCall) {
        guard let presenter = bridge?.viewController else {
            call.reject("missing presenter for document picker")
            return
        }

        pendingFilePickerCall = call

        DispatchQueue.main.async {
            let picker = UIDocumentPickerViewController(
                forOpeningContentTypes: [UTType.item],
                asCopy: true
            )
            picker.allowsMultipleSelection = false
            picker.delegate = self
            picker.modalPresentationStyle = .formSheet
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

    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        let call = pendingFilePickerCall
        pendingFilePickerCall = nil

        DispatchQueue.main.async {
            controller.dismiss(animated: true) {
                call?.resolve([
                    "asset": NSNull()
                ])
            }
        }
    }

    public func documentInteractionControllerViewControllerForPreview(_ controller: UIDocumentInteractionController) -> UIViewController {
        bridge?.viewController ?? UIViewController()
    }

    public func documentInteractionControllerDidEndPreview(_ controller: UIDocumentInteractionController) {
        if activeDocumentInteractionController === controller {
            activeDocumentInteractionController = nil
        }
    }

    public func documentInteractionControllerDidDismissOptionsMenu(_ controller: UIDocumentInteractionController) {
        if activeDocumentInteractionController === controller {
            activeDocumentInteractionController = nil
        }
    }

    public func documentInteractionControllerDidDismissOpenInMenu(_ controller: UIDocumentInteractionController) {
        if activeDocumentInteractionController === controller {
            activeDocumentInteractionController = nil
        }
    }

    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        let call = pendingFilePickerCall
        pendingFilePickerCall = nil

        DispatchQueue.main.async {
            controller.dismiss(animated: true) {
                guard let call else {
                    return
                }

                guard let sourceUrl = urls.first,
                      let asset = self.copyFileAsset(from: sourceUrl) else {
                    call.resolve([
                        "asset": NSNull()
                    ])
                    return
                }

                call.resolve([
                    "asset": asset
                ])
            }
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
                    "fileName": fileName
                ]

                if let webPath = self.resolvePortableWebPath(for: destination) {
                    asset["webPath"] = webPath
                }

                if let mimeType = mimeType(forExtension: ext) {
                    asset["mimeType"] = mimeType
                }

                completion(asset)
            } catch {
                completion(nil)
            }
        }
    }

    public func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
        let call = pendingCameraCaptureCall
        pendingCameraCaptureCall = nil

        DispatchQueue.main.async {
            picker.dismiss(animated: true) {
                call?.resolve([
                    "asset": NSNull()
                ])
            }
        }
    }

    public func imagePickerController(
        _ picker: UIImagePickerController,
        didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
    ) {
        let call = pendingCameraCaptureCall
        pendingCameraCaptureCall = nil

        DispatchQueue.main.async {
            picker.dismiss(animated: true) {
                guard let call else {
                    return
                }

                if let imageUrl = info[.imageURL] as? URL,
                   let asset = self.copyImageAsset(from: imageUrl) {
                    call.resolve([
                        "asset": asset
                    ])
                    return
                }

                guard let image = info[.originalImage] as? UIImage,
                      let imageData = image.jpegData(compressionQuality: 0.92),
                      let asset = self.writeCapturedCameraImage(data: imageData) else {
                    call.resolve([
                        "asset": NSNull()
                    ])
                    return
                }

                call.resolve([
                    "asset": asset
                ])
            }
        }
    }

    private func copyImageAsset(from sourceUrl: URL) -> [String: Any]? {
        let fileManager = FileManager.default
        let tempDir = fileManager.temporaryDirectory.appendingPathComponent("yinjie-picker", isDirectory: true)

        do {
            try fileManager.createDirectory(at: tempDir, withIntermediateDirectories: true)
            let ext = sourceUrl.pathExtension.isEmpty ? "jpg" : sourceUrl.pathExtension
            let fileName = "\(UUID().uuidString).\(ext)"
            let destination = tempDir.appendingPathComponent(fileName)

            if fileManager.fileExists(atPath: destination.path) {
                try fileManager.removeItem(at: destination)
            }

            try fileManager.copyItem(at: sourceUrl, to: destination)

            return buildImageAsset(destination: destination, fileName: fileName, ext: ext)
        } catch {
            return nil
        }
    }

    private func copyFileAsset(from sourceUrl: URL) -> [String: Any]? {
        let securityScoped = sourceUrl.startAccessingSecurityScopedResource()
        defer {
            if securityScoped {
                sourceUrl.stopAccessingSecurityScopedResource()
            }
        }

        let fileManager = FileManager.default
        let tempDir = fileManager.temporaryDirectory.appendingPathComponent("yinjie-documents", isDirectory: true)

        do {
            try fileManager.createDirectory(at: tempDir, withIntermediateDirectories: true)
            let ext = sourceUrl.pathExtension
            let destinationFileName = ext.isEmpty
                ? UUID().uuidString
                : "\(UUID().uuidString).\(ext)"
            let destination = tempDir.appendingPathComponent(destinationFileName)

            if fileManager.fileExists(atPath: destination.path) {
                try fileManager.removeItem(at: destination)
            }

            try fileManager.copyItem(at: sourceUrl, to: destination)

            let displayName = sourceUrl.lastPathComponent.isEmpty
                ? destinationFileName
                : sourceUrl.lastPathComponent
            let mimeType = mimeType(forFileExtension: ext)
            return buildFileAsset(
                destination: destination,
                fileName: displayName,
                mimeType: mimeType
            )
        } catch {
            return nil
        }
    }

    private func writeSharedFile(data: Data, fileName: String) -> URL? {
        let fileManager = FileManager.default
        let tempDir = fileManager.temporaryDirectory.appendingPathComponent("yinjie-shared", isDirectory: true)

        do {
            try fileManager.createDirectory(at: tempDir, withIntermediateDirectories: true)
            let destination = tempDir.appendingPathComponent(sanitizeFileName(fileName))

            if fileManager.fileExists(atPath: destination.path) {
                try fileManager.removeItem(at: destination)
            }

            try data.write(to: destination, options: .atomic)
            return destination
        } catch {
            return nil
        }
    }

    private func writeCapturedCameraImage(data: Data) -> [String: Any]? {
        let fileManager = FileManager.default
        let tempDir = fileManager.temporaryDirectory.appendingPathComponent("yinjie-camera", isDirectory: true)

        do {
            try fileManager.createDirectory(at: tempDir, withIntermediateDirectories: true)
            let fileName = "\(UUID().uuidString).jpg"
            let destination = tempDir.appendingPathComponent(fileName)

            if fileManager.fileExists(atPath: destination.path) {
                try fileManager.removeItem(at: destination)
            }

            try data.write(to: destination, options: .atomic)
            return buildImageAsset(destination: destination, fileName: fileName, ext: "jpg")
        } catch {
            return nil
        }
    }

    private func buildImageAsset(destination: URL, fileName: String, ext: String) -> [String: Any] {
        return buildFileAsset(
            destination: destination,
            fileName: fileName,
            mimeType: mimeType(forExtension: ext)
        )
    }

    private func buildFileAsset(destination: URL, fileName: String, mimeType: String?) -> [String: Any] {
        var asset: [String: Any] = [
            "path": destination.path,
            "fileName": fileName
        ]

        if let webPath = resolvePortableWebPath(for: destination) {
            asset["webPath"] = webPath
        }

        if let mimeType, !mimeType.isEmpty {
            asset["mimeType"] = mimeType
        }

        return asset
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

    private func mimeType(forFileExtension ext: String) -> String? {
        let normalizedExt = ext.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if normalizedExt.isEmpty {
            return nil
        }

        return UTType(filenameExtension: normalizedExt)?.preferredMIMEType
    }

    private func sanitizeFileName(_ fileName: String) -> String {
        let invalidCharacters = CharacterSet(charactersIn: "\\/:*?\"<>|")
        let sanitizedScalars = fileName.unicodeScalars.map { scalar in
            invalidCharacters.contains(scalar) ? "_" : Character(scalar)
        }
        let sanitized = String(sanitizedScalars).trimmingCharacters(in: .whitespacesAndNewlines)
        return sanitized.isEmpty ? "shared-file" : sanitized
    }

    private func resolvePortableWebPath(for localUrl: URL) -> String? {
        if let portableUrl = bridge?.portablePath(fromLocalURL: localUrl) {
            return portableUrl.absoluteString
        }

        return nil
    }

    private func configurePopoverPresentation(
        for controller: UIActivityViewController,
        presenter: UIViewController
    ) {
        guard let popover = controller.popoverPresentationController else {
            return
        }

        popover.sourceView = presenter.view
        popover.sourceRect = presenter.view.bounds
    }
}
