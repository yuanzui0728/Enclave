import UIKit
import Capacitor
import UserNotifications

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    var window: UIWindow?

    // 真机走查 R5：用来识别「用户在 Settings 里切换了通知权限」这条 transition。
    // didFinishLaunchingWithOptions 在冷启时种第一份值；applicationDidBecomeActive
    // 每次切回前台拿到最新值跟它比，只在 not-granted → granted 这个边沿才 re-register
    // 一次。避免 R4 修法每次切回前台都无脑 register → didRegister fire → JS listener
    // syncIosPushToken({force:true}) → 每次切回都打一次 cloud-api POST 的浪费。
    private var lastNotificationAuthStatus: UNAuthorizationStatus?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        cacheLaunchTarget(from: launchOptions?[.remoteNotification] as? [AnyHashable: Any], defaultSource: "push")

        // 每次冷启用户先前已授权过的话，必须再调一次 registerForRemoteNotifications，
        // 不然 APNs 不会主动把新 device token 推给我们 ——
        //   - iCloud backup-restore 到新设备：新设备生成新 device token，APNs
        //     旧 token 直接报 BadDeviceToken；
        //   - iOS 大版本升级 / 用户更换 SIM / 删 reinstall 等场景同样会让旧
        //     token 失效。
        // Apple 文档明确建议 "calling registerForRemoteNotifications() at every
        // launch is sufficient to ensure that you receive an up-to-date device
        // token"。注意只在已授权情况下调（.authorized / .provisional），
        // .notDetermined 时我们留给业务侧 requestNotificationPermission 那条
        // 路径自然触发系统授权弹窗 + register，避免冷启就弹权限把用户吓走。
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            // 走查 R5：抓住冷启时观察到的 status 作为 transition 的基线，下次
            // applicationDidBecomeActive 拿当前 status 跟它比，只在边沿才 register
            // 一次而不是每次都 register。
            self.lastNotificationAuthStatus = settings.authorizationStatus

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

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // 真机走查 R3：APNs 后端推消息时通常带 badge 计数（"5 条未读"），iOS 在
        // app 图标上画 "5"。我们打开 app 读了所有消息后，badge 不会自动清 ——
        // 老代码这里啥都没干，iOS 唯一回收 badge 的途径是「用户在 Settings 里
        // 关掉 badge 权限」，正常使用场景下 "5" 一直挂在桌面上。
        //
        // 用户体感：「我读完了但角标还显示 5」 →「我再点进去看」→「没有新消息」
        // →「角标坏了」。真机连续两轮 (2026-05-16 / 2026-05-17) 都没人 catch
        // 到，因为模拟器测试时 badge 一般是 0 看不出来；真机收 push 后才暴雷。
        //
        // applicationDidBecomeActive 在每次 app 切回前台都会调用（冷启 +
        // background→foreground 都覆盖）。这里把 badge 一次性清零是最稳的位置：
        // 用户看到的 Notification Center 历史条目保留（很多人靠它回顾错过的群
        // 通知），但桌面角标重置归零。
        //
        // setBadgeCount 是 iOS 16.0+ 的新 API（async + 上 UN 通知中心一并刷新）；
        // iOS 14 / 15 还得走 deprecated 的 applicationIconBadgeNumber，跟我们
        // IPHONEOS_DEPLOYMENT_TARGET = 14.0 对齐。
        if #available(iOS 16.0, *) {
            UNUserNotificationCenter.current().setBadgeCount(0) { _ in }
        } else {
            application.applicationIconBadgeNumber = 0
        }

        // 真机走查 R4：用户「在 Settings.app 里手动开关通知权限」是 iOS 上一条
        // 完全不会通知 app 的死链：
        //   - 用户首次打开 app → 系统弹「是否允许通知」→ 选「不允许」→ JS 那条
        //     requestNotificationPermission 拿到 .denied 静默回写 UI；
        //   - 之后用户改主意，去 Settings → 隐界 → 通知 → 把开关拨到「允许」→
        //     回到 app；
        //   - iOS **不会** 触发 didFinishLaunchingWithOptions（app 一直没被 kill），
        //     也 **不会** 重发授权 callback 或主动 register APNs 拿新 token。
        // 这条 applicationDidBecomeActive 在「从 Settings 切回 app」时会触发
        // （Settings 是独立 process，切走 → 切回 → resign → become active），
        // 是 iOS 上唯一稳定能捕获到这条路径的 hook。
        //
        // 走查 R5：但不能每次切回前台都 register —— Apple 保证 didRegister 一定
        // fire（即使 token 没变），NotificationCenter.post 也跟着 fire，JS listener
        // 一收到 push token changed 事件就走 syncIosPushToken({force: true})，每次
        // 切回前台都触发一次 cloud-api POST /api/push/tokens 完全是浪费。重度用户
        // 一天切 app 几十次就是几十次冗余网络请求。
        //
        // 引入 lastNotificationAuthStatus 状态机：didFinishLaunchingWithOptions
        // 种基线，这里拿到当前 status 跟基线比，只在「not-granted → granted」
        // edge 触发 re-register（覆盖 R4 修的核心场景：用户在 Settings 改后回到
        // app）。其它情况（已授权 → 已授权 / 始终未授权 / 用户在 Settings 关掉
        // 权限）都不 register，避免冗余 APNs 轮询 + cloud-api POST。
        //
        // .notDetermined（用户从没回应过）→ JS 主动 requestNotificationPermission
        // 走系统授权弹窗的路径，不在这里弹系统对话框吓走用户。
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            let previous = self.lastNotificationAuthStatus
            let current = settings.authorizationStatus
            self.lastNotificationAuthStatus = current

            let wasGranted =
                previous == .authorized || previous == .provisional
            let isGranted =
                current == .authorized || current == .provisional

            // 只在「之前不是 granted，现在变成 granted」的 transition 触发；
            // 冷启 didFinishLaunchingWithOptions 已经处理了「冷启时就 granted」
            // 那条路径并把 lastNotificationAuthStatus 种成 granted，这里看到
            // 「previous=granted, current=granted」就直接跳过，不重复 register。
            guard isGranted, !wasGranted else {
                return
            }
            DispatchQueue.main.async {
                UIApplication.shared.registerForRemoteNotifications()
            }
        }
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        defer { completionHandler() }
        cacheLaunchTarget(from: response.notification.request.content.userInfo, defaultSource: "local_reminder")
    }

    // App 处于前台时，iOS 默认会把通知静默丢掉。我们走 showLocalNotification
    // 的入口（强提醒 / 会话提醒）前已经在 JS 侧排除了「用户正在看这条会话」
    // 的情况，所以走到这里的都应当弹 banner + 出声。远端推送同理：后端会
    // 在「用户在该会话且 visible」时跳过推送，所以前台拿到推送也都是要让
    // 用户看见的。
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

        // 真机走查 R4：用户「正在前台」时收到 push（用户在 chat A，push 来自
        // chat B），willPresent 选项里有 .banner 会让 iOS 在顶部弹横幅。用户点
        // 横幅 → didReceive 触发 → 我们把 target 写进 UserDefaults，但 JS 那条
        // MobileNotificationLaunchBridge 只挂在 window.focus / pageshow /
        // visibilitychange 三个事件上，**前台点横幅一个都不触发**——app 始终
        // 是 focused & visible 的，横幅只是 UI overlay 不切焦点。结果：
        // UserDefaults 写完了，JS 完全不知道有新的 pending target，横幅消失，
        // 用户还停留在 chat A，看上去「点了横幅没反应」。
        //
        // 借 NotificationCenter 把「pending target 变了」这条信号推到
        // YinjieMobileBridgePlugin，让它 notifyListeners 出去通知 JS 重读
        // UserDefaults 跑一次 syncPendingLaunchTarget。冷启场景：plugin load
        // 在 didFinishLaunching 之后，AppDelegate post 时 plugin 还没观察这条
        // notification，这条 post 自然丢；冷启依赖的是 JS mount 之后主动调用
        // getPendingLaunchTarget 读 UserDefaults 的兜底路径，不受影响。
        NotificationCenter.default.post(
            name: Notification.Name("YinjiePendingLaunchTargetChanged"),
            object: nil
        )
    }

    private func normalize(_ value: Any?) -> String? {
        guard let stringValue = value as? String else {
            return nil
        }

        let normalized = stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        return normalized.isEmpty ? nil : normalized
    }
}
