import Foundation
import AVFoundation
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
        CAPPluginMethod(name: "clearPendingLaunchTarget", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "writeClipboardText", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readClipboardText", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "writeClipboardImage", returnType: CAPPluginReturnPromise)
    ]

    private var pendingImagePickerCall: CAPPluginCall?
    private var pendingFilePickerCall: CAPPluginCall?
    private var pendingCameraCaptureCall: CAPPluginCall?
    private var activeDocumentInteractionController: UIDocumentInteractionController?

    override public func load() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handlePushTokenChanged(_:)),
            name: Notification.Name("YinjiePushTokenChanged"),
            object: nil
        )

        // 真机走查 R4：AppDelegate.cacheLaunchTarget 写完 UserDefaults 后 post
        // 一条 NotificationCenter 信号；我们在这听到后 notifyListeners 把它转给
        // JS，让 MobileNotificationLaunchBridge 重读 UserDefaults 跑一次 sync。
        // 解决用户在前台收到 push、点横幅之后 didReceive 已经把 pending target
        // 写进 UserDefaults 但 JS 那条 focus/visibilitychange/pageshow 监听都
        // 没醒、横幅消失但没有 navigate 的死链问题。
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handlePendingLaunchTargetChanged(_:)),
            name: Notification.Name("YinjiePendingLaunchTargetChanged"),
            object: nil
        )

        // Round 48: 把上一次 app run 留在 4 个 tmp 子目录里的 stale 文件全清掉。
        // 历史问题：pickImages / captureImage / pickFile / shareFile / openFile
        // 这五条入口分别写到 yinjie-picker / yinjie-camera / yinjie-documents /
        // yinjie-shared 四个 subdir，全程没人清理 —— 每次用户「选图发出去」/
        // 「拍照发出去」/「转发文件」都留一份 5-50MB 的临时副本。日活用户一个
        // 月堆 GB 级 tmp 文件不是夸张，Settings → Storage 里就只显示成「其它」，
        // 用户也只能整 app 删重装才能腾出来。iOS 在磁盘吃紧时会自动清 tmp，
        // 但靠系统自动 GC 不可控（可能等几周也不动）。
        //
        // 不要在每条入口的 completion 里删 —— shareFile 的 receiver app（AirDrop
        // 异步发、Save to Files 等）有可能在 UIActivityViewController dismiss
        // 之后还要读这个 url 几秒到几十秒，立刻删容易撞它的异步路径；pickFile /
        // pickImages / captureImage 返回的 path JS 那边走 fetch → blob → upload，
        // 时机更不好框死。改在 plugin load 时一次性清干净：这条只在 app 真正
        // 冷启动 / kill-relaunch 时跑（不是 background→foreground），跑的时候
        // 整个 JS 还没 mount，肯定没人正在读这些 tmp 文件，是绝对安全的。
        //
        // 后果：JS 不能跨 app 重启依赖以前拿到的 file:// path。但本来 iOS 自己
        // 也会在 cross-launch 清理 tmp，apps 也不该依赖 tmp 跨进程持久化 ——
        // 跟 Apple 「files in tmp/ should be deleted when no longer needed」的
        // 指引一致。
        //
        // 真机走查 R1：CAPPlugin.load() 由 Capacitor 在 main thread 上同步调用，
        // 早于 WebView 创建 / web bundle parse / 首屏 React mount。上面那条说
        // 「JS 还没 mount，删什么都安全」是对的，但忽略了「同步删 = 卡 main =
        // 卡 launch 关键路径」。日活用户跑 30 天没清过的 tmp（每条入口平均 5-15MB
        // × N 次调用）能堆几百 MB 到 1GB+；冷启时 removeItem 在真机 NAND 上
        // 走目录遍历 + 逐文件 unlink，单次 GB 级目录能阻 100ms-1.5s。卡的不是
        // JS 跑代码，而是 splash 隐藏 → WebView 实际显第一帧之间的窗口被强行
        // 拉长，用户体感「splash 转完了，黑屏一下才出内容」。
        //
        // 挪到 utility background queue 异步跑：plugin load 本身瞬间返回不卡
        // launch；clean 完全在后台 NAND I/O，等 webview 跑起来时清理早已或正在
        // 后台完成。utility QoS 不抢 main thread 的 CPU/IO 调度，但比 background
        // 优先级高，能在合理时间内跑完。安全性论据不变（清的是上一次 run 留
        // 下的孤儿文件，本次 run 还没人会去读）。
        DispatchQueue.global(qos: .utility).async { [weak self] in
            self?.purgeOwnedTemporarySubdirectories()
        }
    }

    private func purgeOwnedTemporarySubdirectories() {
        let fileManager = FileManager.default
        let ownedSubdirNames = [
            "yinjie-picker",
            "yinjie-camera",
            "yinjie-documents",
            "yinjie-shared",
        ]

        // 真机走查 R2：原版本 removeItem 整个 subdir。R1 把它挪到 background queue
        // 之后引入了一条竞态：用户在冷启后很快就点「相册 → 选图」，PHPicker
        // 落 yinjie-picker/<UUID>.jpg → JS 立刻 fetch(webPath)。如果 background
        // 那条 removeItem(yinjie-picker) 正好在「文件写完」「JS fetch 之前」
        // 这段窗口里跑完，整个 yinjie-picker 连同新写的图一起被删。JS 收到
        // 404，用户看到「读取图片失败，请换一张再试」但实际上图是好的。
        //
        // 改成基于 mtime 的逐 child 清理：只删 cutoff(5 min 前) 之前 modify 过
        // 的条目。本次 run 刚写的 tmp 全部 mtime 在 now 附近，被 cutoff 过滤
        // 保留；前次 run 留下来的孤儿都比 cutoff 老，正常被清。对 yinjie-shared
        // 也成立：UUID subdir 里 atomic write 完成时 dir.mtime ≈ write 时刻，
        // 5 min 后才进入可清范围。新写入的 subdir/file 永远安全。
        //
        // 5 min 选型：iOS 自己的 tmp GC 通常 24h 起；5 min 已经远长于「用户
        // 选图 / 拍照 / 转发文件」单次操作 → JS fetch upload 的端到端时间
        // （正常 100ms-数秒），同时跑 5 min 之前留下的副本也覆盖绝大多数
        // stale 场景。
        let cutoff = Date().addingTimeInterval(-300)

        for name in ownedSubdirNames {
            let dir = fileManager.temporaryDirectory.appendingPathComponent(name, isDirectory: true)
            guard fileManager.fileExists(atPath: dir.path) else {
                continue
            }

            guard let entries = try? fileManager.contentsOfDirectory(
                at: dir,
                includingPropertiesForKeys: [.contentModificationDateKey],
                options: []
            ) else {
                continue
            }

            for entry in entries {
                let mtime =
                    (try? entry.resourceValues(forKeys: [.contentModificationDateKey])
                        .contentModificationDate) ?? Date.distantFuture
                if mtime < cutoff {
                    try? fileManager.removeItem(at: entry)
                }
            }
        }
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    @objc private func handlePushTokenChanged(_ notification: Notification) {
        let userInfo = notification.userInfo ?? [:]
        var payload: [String: Any] = [:]
        if let token = userInfo["token"] as? String {
            payload["token"] = token
        } else {
            payload["token"] = NSNull()
        }
        if let error = userInfo["error"] as? String {
            payload["error"] = error
        }
        notifyListeners("pushTokenChanged", data: payload)
    }

    @objc private func handlePendingLaunchTargetChanged(_ notification: Notification) {
        // 不带数据，JS 接到信号自己去 getPendingLaunchTarget 重读 UserDefaults。
        // 这样 payload 字段约束完全跟 getPendingLaunchTarget 那条同款 contract
        // 走 RawMobilePushLaunchTarget → normalizeMobilePushLaunchTarget，不用
        // 再单独维护一份 event payload 序列化逻辑。
        notifyListeners("pendingLaunchTargetChanged", data: [:])
    }

    @objc func openExternalUrl(_ call: CAPPluginCall) {
        guard let rawUrl = call.getString("url") else {
            call.reject("url is required")
            return
        }

        let trimmed = rawUrl.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = parseExternalUrl(trimmed) else {
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

        // title 是 navigator.share 语义里的 subject / 标题，不应该塞进 activityItems
        // 当正文用 —— UIActivityViewController 把 items[0] 当 body 的首段：
        //   - 分享到 Mail：title 变成 body 第一行（subject 反而空）
        //   - 分享到 Messages / WhatsApp / Line：拼成 "title text https://url"
        //     连发出去，正文里 title 又出现一次（caller 通常已经把 title 拼进 text
        //     了，比如「accountName\narticleTitle」），用户看到标题重复一遍。
        // shareFile 已经走 setValue(title, forKey: "subject") 把 title 当邮件
        // subject，share 这边没对齐，跟它统一：title 走 subject，items 只放
        // text + url。这是 UIActivityViewController 配 navigator.share-like
        // payload 的标准做法。
        var items: [Any] = []
        if let text, !text.isEmpty {
            items.append(text)
        }
        if let urlString, !urlString.isEmpty, let url = parseExternalUrl(urlString) {
            items.append(url)
        }

        guard !items.isEmpty else {
            call.reject("share payload is empty")
            return
        }

        DispatchQueue.main.async {
            let controller = UIActivityViewController(activityItems: items, applicationActivities: nil)
            if let title, !title.isEmpty {
                controller.setValue(title, forKey: "subject")
            }
            if let presenter = self.bridge?.viewController {
                self.configurePopoverPresentation(for: controller, presenter: presenter)
                // 不要在 present completion 里 resolve —— 那个回调只表示「sheet
                // 的入场动画跑完了」，用户连分享目标都还没点。JS 那边 await
                // share() 之后立刻闪「分享成功」toast，会比真的把链接发出去早
                // 好几秒。改成 completionWithItemsHandler：iOS 在用户挑完目标
                // 或者点取消把 sheet 关掉时才 fire，这才是真正的「完成」时机。
                controller.completionWithItemsHandler = { _, _, _, _ in
                    call.resolve()
                }
                presenter.present(controller, animated: true)
            } else {
                call.reject("missing presenter for share sheet")
            }
        }
    }

    @objc func shareFile(_ call: CAPPluginCall) {
        guard let base64Data = normalize(call.getString("base64Data")),
              let fileName = normalize(call.getString("fileName")),
              let presenter = bridge?.viewController else {
            call.reject("base64Data and fileName are required")
            return
        }

        let title = normalize(call.getString("title"))

        // 真机走查 R1：shareFile 的两笔重活——Data(base64Encoded:) 解码 +
        // writeSharedFile 里 data.write(.atomic) 落盘——原来全在 main 线程
        // 同步跑。saveRemoteFile 拉一张 10MB 照片 / saveGeneratedFile 出一个
        // 50MB PDF 走这条路径时，base64 串本身 ~13MB / ~67MB，解码 + 写盘
        // 加起来在真机 NAND 上能阻塞 main 100ms-700ms。WKWebView 整体卡顿，
        // 用户点「保存到文件」之后看到 + 按钮高亮但好几百 ms 没反应才弹出
        // 分享 sheet。Round 23 修过 pickFile 同款 disk I/O，但 share/openFile
        // 这条出站路径没顾上。挪到 userInitiated 后台跑，跑完回 main 再
        // present，跟 Round 23 一致。
        DispatchQueue.global(qos: .userInitiated).async {
            guard let fileData = Data(base64Encoded: base64Data, options: [.ignoreUnknownCharacters]) else {
                DispatchQueue.main.async {
                    call.reject("base64Data and fileName are required")
                }
                return
            }
            guard let fileUrl = self.writeSharedFile(data: fileData, fileName: fileName) else {
                DispatchQueue.main.async {
                    call.reject("failed to prepare shared file")
                }
                return
            }
            DispatchQueue.main.async {
                let controller = UIActivityViewController(activityItems: [fileUrl], applicationActivities: nil)
                if let title, !title.isEmpty {
                    controller.setValue(title, forKey: "subject")
                }
                self.configurePopoverPresentation(for: controller, presenter: presenter)
                // 同 share()：present completion 是入场动画完成，不是分享完成。
                // completionWithItemsHandler 才是用户挑完目标 / 取消时的回调。
                controller.completionWithItemsHandler = { _, _, _, _ in
                    call.resolve()
                }
                presenter.present(controller, animated: true)
            }
        }
    }

    @objc func openFile(_ call: CAPPluginCall) {
        guard let base64Data = normalize(call.getString("base64Data")),
              let fileName = normalize(call.getString("fileName")),
              let presenter = bridge?.viewController else {
            call.reject("base64Data and fileName are required")
            return
        }

        let title = normalize(call.getString("title"))

        // 真机走查 R1：同 shareFile，openFile 的 base64 解码 + atomic 落盘
        // 老在 main 跑。打开一份 30MB+ PDF 预览时，UIDocumentInteractionController
        // 弹出来之前的 200-500ms 整个 WebView 卡死。挪到后台跑，回 main
        // 再 present preview / options menu。
        DispatchQueue.global(qos: .userInitiated).async {
            guard let fileData = Data(base64Encoded: base64Data, options: [.ignoreUnknownCharacters]) else {
                DispatchQueue.main.async {
                    call.reject("base64Data and fileName are required")
                }
                return
            }
            guard let fileUrl = self.writeSharedFile(data: fileData, fileName: fileName) else {
                DispatchQueue.main.async {
                    call.reject("failed to prepare preview file")
                }
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
    }

    @objc func pickImages(_ call: CAPPluginCall) {
        guard let presenter = bridge?.viewController else {
            call.reject("missing presenter for image picker")
            return
        }

        if let stalePending = pendingImagePickerCall {
            stalePending.resolve(["assets": []])
        }
        pendingImagePickerCall = call

        // Round 46：不要 PHPickerConfiguration(photoLibrary: .shared()) ——
        // 我们 loadImageAsset 全程只用 result.itemProvider 拷 file representation，
        // 从来没碰过 PHAsset（result.assetIdentifier 也没读）。带 .shared() 等于
        // 声明「我要 PhotoKit 访问选中的资产」，会让 iOS 把这条 PHPicker 跟 app
        // 的 photo-library access 绑起来：
        //   1. iOS 14+ 「Selected Photos」/「Limited Library Access」机制下，
        //      App Privacy Report 里我们就被列为「访问过 Photos」，但实际只是
        //      pick 一张图，跟 user 的预期错位；
        //   2. App Store privacy 审查（Privacy Manifest）会要求我们声明 Photos
        //      数据收集，相比 pick-only 路径多写一条没必要的 nutrition label；
        //   3. 如果将来真正用 PHAsset，要再过一次 PHPhotoLibrary 授权弹窗，跟
        //      pick 的「点哪个用哪个」体感分裂。
        // PHPicker 不带 photoLibrary 时是纯 item-based：用户在 picker UI 里仍然
        // 能看到全部照片（picker 自己跑在独立 process 里、不走 app 的 PhotoKit
        // 通道），返回的 itemProvider 也照旧能 loadFileRepresentation。我们不需
        // 要 PHAsset，所以这条参数完全是负累。
        var configuration = PHPickerConfiguration()
        configuration.filter = .images
        // 选择数上限 plumbing：apps/app 在 chat-composer / mobile-feed-publish /
        // mobile-moments-publish 这三条多选入口里都有自己的 MAX_ALBUM_IMAGE_COUNT /
        // MAX_IMAGE_COUNT = 9 上限，拿到 PHPicker 结果之后 slice(0, 9) 把多余的全
        // 丢掉。旧实现 selectionLimit = 0（PHPicker 文档定义 = 不限）让用户在 UI
        // 里能勾 1000 张 → didFinishPicking 里 results.count = 1000 → 我们 Swift
        // 端 loadFileRepresentation 全跑一遍把每张都 HEIC→JPEG 转码 + 写
        // tmp/yinjie-picker/ 副本（一张 iPhone 15 Pro 24MP HEIC 转 JPEG ≈ 8-15MB
        // disk write，1000 张就是 8-15GB tmp 数据）→ 回到 JS 那边 slice(0, 9) 把
        // 991 张副本悄无声息地丢在 tmp 里等 purgeOwnedTemporarySubdirectories 下
        // 次冷启动才清。用户感受为「我没拍多少，怎么相机胶卷过完一会儿手机就提
        // 示存储空间不足」。
        //
        // 改成读 JS 显式传的 limit；没传时默认 9 跟 apps/app 端 MAX_*_COUNT
        // 对齐。PHPicker UI 接到上限后会在用户勾到第 N 张时禁用 Add 按钮 +
        // 显示「9 张已选」计数器，UX 也比「能选 1000 但只生效 9」好得多。
        let multiple = call.getBool("multiple", false)
        let requestedLimit = call.getInt("limit")
        configuration.selectionLimit = multiple
            ? max(requestedLimit ?? 9, 1)
            : 1
        // Round 7 想用 loadFileRepresentation(public.jpeg) 拉 PhotoKit 自动
        // 转 HEIC→JPEG，但下面 loadImageAsset 的判断逻辑用
        // provider.hasItemConformingToTypeIdentifier("public.jpeg") 先 gate：
        // HEIC item 的 registeredTypeIdentifiers 只挂 public.heic / public.heif /
        // public.image，没 public.jpeg —— 这个 check 直接返 false，落到
        // "public.image" 分支拿回 HEIC 原片。Round 7 自以为修了，实际只在原本
        // 就是 JPEG 的 item 上生效，HEIC 一张没修。
        //
        // 正解是把转码任务交给 PHPicker 自己，preferredAssetRepresentationMode
        // 设 .compatible：iOS 在用户点「使用」之前已经把 HEIC / ProRAW 等私有
        // 编码转成 JPEG（或对 PNG / GIF 这种本来就通用的格式保持原样），
        // 后面 loadFileRepresentation 拿到的 url 直接就是 .jpg / .png / .gif。
        // 实测 iPhone 15 Pro 用 HEIC 拍的相册照走这条会收到 JPEG，
        // 跨 Android / 安卓 Web / 旧 iOS / 多数浏览器全部能解开。
        configuration.preferredAssetRepresentationMode = .compatible

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

        // 真机走查时发现：用户上次在「设置 > 隐私 > 相机」里拒绝过相机权限的话，
        // 直接 present UIImagePickerController(sourceType:.camera) iOS 行为不一：
        //   - 部分 iOS 版本：黑屏 + 一个小 alert，按 cancel 走 didCancel
        //   - 部分版本：picker 直接闪一下又关掉，走 didCancel
        // 两种情况上层 JS 拿到的都是「asset: null」，跟用户主动点取消区分不开，
        // 没法判断「该弹『去设置』引导」还是「就是不想拍了」。
        //
        // 提前查 AVCaptureDevice.authorizationStatus(for: .video)：
        //   - .denied / .restricted → 直接 reject 带 PERMISSION_DENIED code，
        //     JS 拿到这条就可以调 openAppSettings() 引导用户去开
        //   - .notDetermined → 让 picker 自己弹系统授权 alert，跟 iOS 默认流程
        //     一致，保持「第一次点拍照才请权限」的体感
        //   - .authorized → 直接进入
        let cameraAuth = AVCaptureDevice.authorizationStatus(for: .video)
        if cameraAuth == .denied || cameraAuth == .restricted {
            call.reject(
                "camera permission denied — open Settings to grant access",
                "PERMISSION_DENIED"
            )
            return
        }

        if let stalePending = pendingCameraCaptureCall {
            stalePending.resolve(["asset": NSNull()])
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

        if let stalePending = pendingFilePickerCall {
            stalePending.resolve(["asset": NSNull()])
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

    @objc func writeClipboardText(_ call: CAPPluginCall) {
        guard let text = call.getString("text") else {
            call.reject("text is required")
            return
        }

        DispatchQueue.main.async {
            UIPasteboard.general.string = text
            call.resolve()
        }
    }

    @objc func readClipboardText(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let value = UIPasteboard.general.string
            call.resolve([
                "text": value ?? NSNull()
            ])
        }
    }

    @objc func writeClipboardImage(_ call: CAPPluginCall) {
        guard let base64Data = normalize(call.getString("base64Data")),
              let imageData = Data(base64Encoded: base64Data, options: [.ignoreUnknownCharacters]),
              let image = UIImage(data: imageData) else {
            call.reject("base64Data is required and must decode to a valid image")
            return
        }

        DispatchQueue.main.async {
            UIPasteboard.general.image = image
            call.resolve()
        }
    }

    private func normalize(_ value: String?) -> String? {
        guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else {
            return nil
        }

        return value
    }

    // 真机走查 R1：URL(string:) 走 RFC 3986 严格解析，对非 ASCII 字符（中文、
    // 日文、韩文、emoji 等）直接返 nil。而我们用户主要是中文场景：
    //   - openExternalUrl：聊天 / 文章正文里的 URL 链接里夹中文（公众号文章 path
    //     带「帖子」「文章」「专栏」等中文段、知乎 / B 站搜索结果 URL、
    //     用户分享微博 / 小红书短链跳转回的中文 URL 都常见）；
    //   - share()：用户分享文章时附带链接，链接里夹中文章节名。
    // 两条路径之前都是 URL(string:) 失败 → 静默 reject / 静默丢弃 url，用户看到
    // 「打开链接失败」/ 分享出去 sheet 里只有正文没有链接，根因不易察觉。
    //
    // 兜一层 percent-encoding 兜底：第一次 URL(string:) 失败，把原串按
    // .urlQueryAllowed 重 encode 一遍再 parse。.urlQueryAllowed 保留 `:` `/` `?`
    // `=` `&` `%` 等 URL 结构符 + 把非 ASCII 全 %XX 化，能覆盖：
    //   - 含中文 path：https://example.com/帖子/123 → /%E5%B8%96%E5%AD%90/123
    //   - 已 encoded URL：%E5... 保留（% 在允许集里、不会被双编）
    //   - 带空格的 query：?q=hello world → ?q=hello%20world
    // 真有奇形怪状 parse 不出来的串才走 reject，比 URL(string:) 全 or-nothing
    // 宽容得多。
    private func parseExternalUrl(_ raw: String) -> URL? {
        if let url = URL(string: raw) {
            return url
        }
        if let encoded = raw.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
           let url = URL(string: encoded) {
            return url
        }
        return nil
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

        // 旧实现用 `assets.append(asset)` 收集 loadImageAsset 完成回调里的资源 ——
        // 但 loadFileRepresentation 是异步的，多张图同时跑完成回调顺序不固定（PhotoKit
        // 转码大小 / HEIC vs JPG 解码耗时 / disk I/O 抢占都会影响）。用户在 PHPicker
        // UI 里按 album 顺序勾 5 张 [A, B, C, D, E]，append 出来可能是 [C, A, E, B, D]，
        // 上传到聊天界面 / 朋友圈 9 宫格直接错序，跟用户预期不一致。
        //
        // 改成按 results 顺序预分配槽位，每个完成回调按自己的 index 写入，最后
        // compactMap 跳过 nil（loadImageAsset 失败的：罕见的 HEIC 解码失败 / itemProvider
        // 不挂 public.image 等），既保顺序又干掉失败槽。
        let assetsCount = results.count
        var assetsOrdered: [[String: Any]?] = Array(repeating: nil, count: assetsCount)
        let group = DispatchGroup()
        let lock = NSLock()

        for (index, result) in results.enumerated() {
            group.enter()
            loadImageAsset(from: result) { asset in
                lock.lock()
                assetsOrdered[index] = asset
                lock.unlock()
                group.leave()
            }
        }

        // 真机走查 R1：用户选中的图里只要有一张是 iCloud-only 原片（PHPicker 给
        // 出 itemProvider 时 iOS 还没把原片下回本机；常见于 cellular + 低数据
        // 模式 / Wi-Fi 抖断 / 刚拍完还在传 iCloud），loadFileRepresentation 会
        // 卡在等 iCloud stream 数据 —— 网络一直不行就一直 hang，completion 长
        // 时间不返回，group.leave 不调用，group.notify 永远不 fire。JS 那边
        // await pickImages() 同样等不到 resolve：PHPicker 已经 dismiss 回到 app
        // 主界面，composer + 按钮看上去没反应，选中的图一张都没贴进草稿，没有
        // spinner / 没有错误提示，用户只能 force-quit。
        //
        // 兜个 30s timeout：到点把已经拿到的 asset 都 resolve 出去，没拿到的
        // 槽位 compactMap 掉。loadFileRepresentation 在后台继续跑也不碍事，
        // 落到 tmp/yinjie-picker/ 的副本会随下次冷启 purgeOwnedTemporarySubdirectories
        // 一并回收。finish 用 NSLock + Bool 互斥，保证 timeout 路径和 group.notify
        // 路径只 fire 一次 resolve。
        var finished = false
        let finishLock = NSLock()
        let finish: () -> Void = {
            finishLock.lock()
            if finished {
                finishLock.unlock()
                return
            }
            finished = true
            finishLock.unlock()

            lock.lock()
            let assets = assetsOrdered.compactMap { $0 }
            lock.unlock()

            call.resolve([
                "assets": assets
            ])
        }

        let timeoutItem = DispatchWorkItem(block: finish)
        DispatchQueue.main.asyncAfter(deadline: .now() + 30, execute: timeoutItem)

        group.notify(queue: .main) {
            timeoutItem.cancel()
            finish()
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
        let sourceUrl = urls.first

        DispatchQueue.main.async {
            controller.dismiss(animated: true) {
                guard let call else {
                    return
                }

                guard let sourceUrl else {
                    call.resolve([
                        "asset": NSNull()
                    ])
                    return
                }

                // 不要在 dismiss completion 里同步跑 copyItem：UIDocumentPicker 用
                // asCopy:true 时 iOS 先把 iCloud Drive / Files / 第三方 provider
                // 里选中的文件 copy 进我们的 sandbox tempDir，sourceUrl 就是那个
                // 副本。我们再 copyItem 到 yinjie-documents/ 是为了把命名 / 生命
                // 周期收回自己手里，但这是真盘 I/O —— 100MB 以上的 PDF / zip 在
                // 真机 NAND 上同步 copyItem 能阻塞主线程数秒，picker 关闭后整个
                // WebView 卡死，用户感受为「点完文件 app 假死」。挪到
                // userInitiated 后台线程跑，结果回主线程 resolve。
                DispatchQueue.global(qos: .userInitiated).async {
                    let asset = self.copyFileAsset(from: sourceUrl)
                    DispatchQueue.main.async {
                        if let asset {
                            call.resolve(["asset": asset])
                        } else {
                            call.resolve(["asset": NSNull()])
                        }
                    }
                }
            }
        }
    }

    private func loadImageAsset(from result: PHPickerResult, completion: @escaping ([String: Any]?) -> Void) {
        let provider = result.itemProvider
        guard provider.hasItemConformingToTypeIdentifier("public.image") else {
            completion(nil)
            return
        }

        // iPhone 拍的照片默认存 HEIC。直接 loadFileRepresentation(public.image)
        // 拿到的就是 HEIC 二进制，Android / 安卓 Web / 旧 iOS / 多数浏览器都
        // 解不出来。优先请求 public.jpeg —— 如果原片是 HEIC，PhotoKit 会
        // 自动转 JPEG；原片是 JPEG/PNG/GIF 时则 fallback 到 public.image。
        let preferredTypeIdentifier =
            provider.hasItemConformingToTypeIdentifier("public.jpeg")
                ? "public.jpeg"
                : "public.image"

        provider.loadFileRepresentation(forTypeIdentifier: preferredTypeIdentifier) { url, _ in
            guard let url else {
                completion(nil)
                return
            }

            let fileManager = FileManager.default
            let tempDir = fileManager.temporaryDirectory.appendingPathComponent("yinjie-picker", isDirectory: true)

            do {
                try fileManager.createDirectory(at: tempDir, withIntermediateDirectories: true)
                let resolvedExt: String = {
                    if preferredTypeIdentifier == "public.jpeg" {
                        return "jpg"
                    }
                    return url.pathExtension.isEmpty ? "jpg" : url.pathExtension
                }()
                let fileName = "\(UUID().uuidString).\(resolvedExt)"
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

                if let mimeType = mimeType(forExtension: resolvedExt) {
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

        // captureImage 入口已经在 .denied / .restricted 时提前 reject 出 PERMISSION_DENIED
        // 给 JS 端弹「去设置」引导。但 .notDetermined → present picker 的路径下，
        // iOS 会用「inline 系统弹窗」原位询问权限：用户点 Don't Allow 后 picker
        // 立刻被 iOS 自己 dismiss，回调直接走到这里。原实现拿不到任何错误信号，
        // resolve null 让 JS 误判成「用户主动 cancel」(asset:null + error:null →
        // 在 chat-composer 静默 return)，第一次拒绝的用户看到的是「按了相机按钮
        // 什么都没发生」，毫无线索。只有第二次再点相机才会被 .denied 分支拦下来
        // 弹出 notice。
        //
        // 这里在 didCancel 时再查一遍 AVCaptureDevice.authorizationStatus，区分:
        //   - .authorized → 真的 user 主动 cancel（拍照页里按取消 / 用户授权过
        //     之后这次只是不想拍），resolve null 保持原契约
        //   - .denied / .restricted → 用户刚才在 inline 提示里拒了，跟 captureImage
        //     入口的 .denied 分支同款 reject，JS 端 resolveNativeCameraCaptureNotice
        //     会按 message 含 "permission" 走 PERMISSION_DENIED 走法，引导去设置
        //   - .notDetermined（理论上 inline 之后不应该再是这个状态，但 iOS 偶发
        //     在动画期间状态没刷过来）→ 当 cancel 处理，跟原有行为对齐
        let cameraAuth = AVCaptureDevice.authorizationStatus(for: .video)
        DispatchQueue.main.async {
            picker.dismiss(animated: true) {
                guard let call else {
                    return
                }
                if cameraAuth == .denied || cameraAuth == .restricted {
                    call.reject(
                        "camera permission denied — open Settings to grant access",
                        "PERMISSION_DENIED"
                    )
                    return
                }
                call.resolve(["asset": NSNull()])
            }
        }
    }

    public func imagePickerController(
        _ picker: UIImagePickerController,
        didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
    ) {
        let call = pendingCameraCaptureCall
        pendingCameraCaptureCall = nil
        let image = info[.originalImage] as? UIImage

        DispatchQueue.main.async {
            picker.dismiss(animated: true) {
                guard let call else {
                    return
                }

                guard let image else {
                    call.resolve(["asset": NSNull()])
                    return
                }

                // 不要走 info[.imageURL] 直接 copy 原文件：iPhone 7+ 相机默认
                // HEIF/HEIC 编码，那条路径会把 HEIC 原片直接交给后端，下游
                // Android / Web / 旧 iOS 解不开（详见 Round 7 picker 同款问题）。
                // 统一走 originalImage → jpegData(0.92)，强制输出 JPEG。
                // 顺带去掉了 EXIF 里的 GPS / 设备信息，发出去之前先脱敏一遍。
                //
                // jpegData(compressionQuality:) + 后续写盘不能跑在主线程：
                // iPhone 15 Pro Max 24MP 原片 = 6048×8064×4 ≈ 195MB raw 像素，
                // 同步再编一遍 JPEG 把主线程卡 200-500ms，iPhone 8/SE-1 这种
                // 2GB RAM 老机型还会撞 iOS 单 app 内存上限直接被 jetsam 杀。
                // 跟 Round 23 pickFile 同款挪到 userInitiated 后台跑，结果回
                // 主线程 resolve。UIImage / jpegData 都是 thread-safe 的，
                // dispatch 出去合规。
                DispatchQueue.global(qos: .userInitiated).async {
                    guard let imageData = image.jpegData(compressionQuality: 0.92),
                          let asset = self.writeCapturedCameraImage(data: imageData) else {
                        DispatchQueue.main.async {
                            call.resolve(["asset": NSNull()])
                        }
                        return
                    }

                    DispatchQueue.main.async {
                        call.resolve(["asset": asset])
                    }
                }
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

            // Round 47: pickFile 用 UIDocumentPickerViewController(asCopy: true)，iOS
            // 早就把用户选中的文件 copy 进我们 app 的 sandbox tempDir 了（sourceUrl
            // 指向的就是这个 sandbox 内副本，我们拥有它）。再 copyItem 到
            // yinjie-documents/ 等于做第二次完整 disk write —— 对 100MB+ PDF / zip
            // 这种大文件，在真机 NAND 上是 ~500ms-1s 的实打实数据复制 +
            // 200MB+ 的瞬时存储占用（iOS 那条 sandbox 副本要等 iOS 自己 GC 才回
            // 收）。Round 23 把这条 disk I/O 挪到后台线程不再卡主线程，但 disk
            // throughput / wear / 临时存储这三笔账没动。
            //
            // 改 moveItem：同 sandbox 同 volume 下 iOS 走 inode rename，O(1)，不
            // 复制数据。yinjie-documents/ 拿到自己想要的 UUID 命名 + 生命周期管
            // 理，iOS 那条临时 dir 在 file 被搬走后自然变空 / 可被 iOS 后续清理。
            try fileManager.moveItem(at: sourceUrl, to: destination)

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
        // 走 UUID 子目录而不是 yinjie-shared/<fileName> 直接挤同一个目标路径。
        // 旧实现：两次连续 share/openFile 用同名文件（"report.pdf" / "image.png"
        // / saveLocalFile 的 download 默认名等）会撞同一个 destination —— 第二次
        // 调用先 removeItem 把第一次正在被 UIActivityViewController / UIDocumentInteraction
        // Controller 持有的 URL 内容删掉，然后 atomic write 新数据。AirDrop / Save
        // to Files 这种异步 receiver 在第一次 sheet 还没收完前去读 URL，要么读到
        // 不存在、要么读到第二次的数据 —— 用户看到的传输完成但内容跟自己分享的不
        // 一致，复现路径罕见但实在。
        //
        // 改成每次调用进自己的 UUID 子目录：destination 形如
        //   yinjie-shared/<UUID>/report.pdf
        // 各次调用互不相干，receiver 端 URL.lastPathComponent 仍是用户的原 fileName，
        // 邮件主题 / Save to Files 默认文件名都不变。UUID 子目录在 plugin load() 的
        // purgeOwnedTemporarySubdirectories 路径里跟着 yinjie-shared 整个被回收。
        let containerDir =
            fileManager.temporaryDirectory.appendingPathComponent("yinjie-shared", isDirectory: true)
        let sessionDir =
            containerDir.appendingPathComponent(UUID().uuidString, isDirectory: true)

        do {
            try fileManager.createDirectory(at: sessionDir, withIntermediateDirectories: true)
            let destination = sessionDir.appendingPathComponent(sanitizeFileName(fileName))

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

        // 真机走查 R1：UIActivityViewController 在 iPad（TARGETED_DEVICE_FAMILY
        // 里 "1,2" 都开了）上 iOS 强制走 popover —— UIKit 没有给 iPad 改成
        // sheet 的开关。老实现把 sourceRect 设成整个 presenter.view.bounds 让
        // iOS 自己挑位置：实测出来 popover 一定带一个箭头指向屏幕中央上 / 上
        // 边缘的某个不存在的「按钮」，看着像在锚定某个具体 UI 元素但实际什么
        // 都没指，跟 capacitor preferredContentMode=mobile 模式下的 iPhone-style
        // mobile UI 视觉冲突明显。
        //
        // Web 层不暴露 share 按钮在屏幕上的坐标，Swift 也拿不到 tap location
        // 没法精确锚到按钮位置。最稳的退路是「让 popover 居中浮窗、不要乱指
        // 一个箭头」：sourceRect 缩成 view 中心一个零大小点 + permittedArrowDirections
        // 设空（[]）。iOS 看到无可允许的箭头方向就把 popover 渲染成无箭头的
        // 居中浮层，跟 .pageSheet 视觉一致，没有误导性指向。
        //
        // iPhone（compact size class）上 popoverPresentationController 是 nil，
        // 函数早早 return；这条改动只影响 iPad / iPad Multitasking 大宽度的场景。
        popover.sourceView = presenter.view
        popover.sourceRect = CGRect(
            x: presenter.view.bounds.midX,
            y: presenter.view.bounds.midY,
            width: 0,
            height: 0
        )
        popover.permittedArrowDirections = []
    }
}
