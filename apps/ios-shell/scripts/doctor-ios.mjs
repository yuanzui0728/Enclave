import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const shellRoot = path.resolve(scriptDir, "..");
const iosAppRoot = path.join(shellRoot, "ios", "App", "App");
const infoPlistPath = path.join(iosAppRoot, "Info.plist");
const appDelegatePath = path.join(iosAppRoot, "AppDelegate.swift");
const runtimePluginPath = path.join(
  iosAppRoot,
  "Plugins",
  "YinjieRuntimePlugin.swift",
);
const secureStoragePluginPath = path.join(
  iosAppRoot,
  "Plugins",
  "YinjieSecureStoragePlugin.swift",
);
const mobileBridgePluginPath = path.join(
  iosAppRoot,
  "Plugins",
  "YinjieMobileBridgePlugin.swift",
);
const projectPath = path.join(shellRoot, "ios", "App", "App.xcodeproj", "project.pbxproj");
const entitlementsPath = path.join(iosAppRoot, "App.entitlements");
const privacyManifestPath = path.join(iosAppRoot, "PrivacyInfo.xcprivacy");
const capacitorConfigPath = path.join(shellRoot, "capacitor.config.ts");
const webDistIndexPath = path.resolve(shellRoot, "..", "app", "dist-mobile", "index.html");
const shellConfigPath = path.join(shellRoot, "ios-shell.config.json");
const shellLocalConfigPath = path.join(shellRoot, "ios-shell.config.local.json");

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function resolveConfiguredApiBaseUrl() {
  const envValue = (process.env.YINJIE_IOS_CORE_API_BASE_URL ?? "").trim();
  if (envValue) return { value: envValue, source: "env" };
  const local = readJsonIfExists(shellLocalConfigPath);
  const localValue = (local?.runtime?.apiBaseUrl ?? "").trim();
  if (localValue) return { value: localValue, source: "ios-shell.config.local.json" };
  const base = readJsonIfExists(shellConfigPath);
  const baseValue = (base?.runtime?.apiBaseUrl ?? "").trim();
  if (baseValue) return { value: baseValue, source: "ios-shell.config.json" };
  return { value: null, source: null };
}

function resolveConfiguredCloudApiBaseUrl() {
  const envValue = (process.env.YINJIE_IOS_CLOUD_API_BASE_URL ?? "").trim();
  if (envValue) return { value: envValue, source: "env" };
  const local = readJsonIfExists(shellLocalConfigPath);
  const localValue = (local?.runtime?.cloudApiBaseUrl ?? "").trim();
  if (localValue) return { value: localValue, source: "ios-shell.config.local.json" };
  const base = readJsonIfExists(shellConfigPath);
  const baseValue = (base?.runtime?.cloudApiBaseUrl ?? "").trim();
  if (baseValue) return { value: baseValue, source: "ios-shell.config.json" };
  return { value: null, source: null };
}
const infoPlistStringLocalizations = ["zh-Hans", "en", "ja", "ko"];
const requiredInfoPlistStringKeys = [
  "CFBundleDisplayName",
  "YinjiePublicAppName",
  "NSCameraUsageDescription",
  "NSPhotoLibraryUsageDescription",
  "NSPhotoLibraryAddUsageDescription",
  "NSMicrophoneUsageDescription",
];

function fileIncludes(filePath, pattern) {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  return fs.readFileSync(filePath, "utf8").includes(pattern);
}

function fileIncludesAll(filePath, patterns) {
  return patterns.every((pattern) => fileIncludes(filePath, pattern));
}

function fileMatches(filePath, regex) {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  return regex.test(fs.readFileSync(filePath, "utf8"));
}

function plistKeyHasEmptyString(filePath, key) {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  const source = fs.readFileSync(filePath, "utf8");
  const pattern = new RegExp(
    `<key>${key}</key>\\s*<string></string>`,
    "m",
  );
  return pattern.test(source);
}

const checks = [
  {
    label: "platform",
    ok: process.platform === "darwin",
    detail: process.platform === "darwin" ? "running on macOS" : `current platform is ${process.platform}, Xcode work must run on macOS`,
  },
  {
    label: "xcode-template",
    ok:
      fs.existsSync(path.join(shellRoot, "xcode-template", "Info.plist.example")) &&
      fs.existsSync(path.join(shellRoot, "xcode-template", "AppDelegatePush.example.swift")),
    detail: "xcode-template samples are present",
  },
  {
    label: "runtime-config-template",
    ok: fs.existsSync(path.join(shellRoot, "runtime-config.example.json")),
    detail: "runtime-config.example.json is present",
  },
  {
    label: "plugin-stubs",
    ok:
      fs.existsSync(path.join(shellRoot, "plugins", "swift-stub", "YinjieRuntimePlugin.swift")) &&
      fs.existsSync(path.join(shellRoot, "plugins", "swift-stub", "YinjieSecureStoragePlugin.swift")) &&
      fs.existsSync(path.join(shellRoot, "plugins", "swift-stub", "YinjieMobileBridgePlugin.swift")),
    detail: "native plugin stubs are present",
  },
  (() => {
    // configure-ios-project.mjs 用 overwrite:false 把 swift-stub/ 下的文件复制到
    // ios/App/App/Plugins/。fresh checkout 上线时 stub 就是真正装上设备的代码。
    // 如果 stub 跟 installed 漂移（比如 installed 加了剪贴板、推送 token listener
    // 后忘了同步 stub），任何全新打的包都会缺这些方法 → JS 调用直接抛 unimplemented。
    const stubMobileBridge = path.join(
      shellRoot,
      "plugins",
      "swift-stub",
      "YinjieMobileBridgePlugin.swift",
    );
    const stubRuntime = path.join(
      shellRoot,
      "plugins",
      "swift-stub",
      "YinjieRuntimePlugin.swift",
    );
    const stubSecure = path.join(
      shellRoot,
      "plugins",
      "swift-stub",
      "YinjieSecureStoragePlugin.swift",
    );
    const stubMobileBridgeOk = fileIncludesAll(stubMobileBridge, [
      "CAPPluginMethod(name: \"writeClipboardText\"",
      "CAPPluginMethod(name: \"readClipboardText\"",
      "CAPPluginMethod(name: \"writeClipboardImage\"",
      "CAPPluginMethod(name: \"showLocalNotification\"",
      "handlePushTokenChanged",
      "override public func load()",
    ]);
    const stubRuntimeOk = fileIncludesAll(stubRuntime, [
      "bundledConfig[\"cloudApiBaseUrl\"]",
      "CAPPluginMethod(name: \"setLocale\"",
    ]);
    const stubSecureOk = fileIncludes(stubSecure, "struct KeychainError");
    return {
      label: "plugin-stubs-in-sync",
      ok: stubMobileBridgeOk && stubRuntimeOk && stubSecureOk,
      detail:
        stubMobileBridgeOk && stubRuntimeOk && stubSecureOk
          ? "swift-stub plugins carry clipboard/push/locale/cloudApiBaseUrl/KeychainError parity with installed copies"
          : "swift-stub plugins are stale vs ios/App/App/Plugins/ — fresh checkouts will be missing native bridge methods (re-copy from installed)",
    };
  })(),
  {
    label: "ios-project",
    ok: fs.existsSync(path.join(shellRoot, "ios")),
    detail: fs.existsSync(path.join(shellRoot, "ios"))
      ? "Capacitor iOS project directory exists"
      : "no ios/ project yet, run `pnpm ios:sync` on macOS",
  },
  {
    label: "info-plist-privacy",
    ok:
      !fs.existsSync(infoPlistPath) ||
      (fileIncludes(infoPlistPath, "NSCameraUsageDescription") &&
        fileIncludes(infoPlistPath, "NSPhotoLibraryUsageDescription") &&
        fileIncludes(infoPlistPath, "NSPhotoLibraryAddUsageDescription") &&
        fileIncludes(infoPlistPath, "NSMicrophoneUsageDescription")),
    detail: fs.existsSync(infoPlistPath)
      ? "Info.plist includes camera, photo library, and microphone usage descriptions"
      : "Info.plist not found yet; run `pnpm ios:sync` first",
  },
  {
    label: "info-plist-runtime-keys",
    ok:
      !fs.existsSync(infoPlistPath) ||
      fileIncludesAll(infoPlistPath, [
        "YinjieApiBaseUrl",
        "YinjieSocketBaseUrl",
        // Round 44: YinjieRuntimePlugin 早就读 info["YinjieCloudApiBaseUrl"] 当 Info.plist 兜底，
        // 但模板 / configure / doctor 三处都漏写这个 key —— cloud-api 那条「bundled 失踪 → Info.plist
        // 兜底」事实上从没工作过。盯死 Info.plist 必须有 YinjieCloudApiBaseUrl，跟其它三条 URL 对齐。
        "YinjieCloudApiBaseUrl",
        "YinjieEnvironment",
        "YinjiePublicAppName",
      ]),
    detail: fs.existsSync(infoPlistPath)
      ? "Info.plist includes runtime fallback keys for native config injection"
      : "Info.plist not found yet; run `pnpm ios:sync` first",
  },
  {
    label: "info-plist-localizations",
    ok: infoPlistStringLocalizations.every((region) => {
      const stringsPath = path.join(
        iosAppRoot,
        `${region}.lproj`,
        "InfoPlist.strings",
      );
      return fs.existsSync(stringsPath) && fileIncludesAll(stringsPath, requiredInfoPlistStringKeys);
    }),
    detail:
      "InfoPlist.strings exists for zh-Hans, en, ja, and ko with app name and permission strings",
  },
  {
    label: "appdelegate-push-cache",
    ok:
      !fs.existsSync(appDelegatePath) ||
      (fileIncludes(appDelegatePath, "didRegisterForRemoteNotificationsWithDeviceToken") &&
        fileIncludes(appDelegatePath, "YinjiePushToken") &&
        fileIncludes(appDelegatePath, "YinjiePendingLaunchTarget")),
    detail: fs.existsSync(appDelegatePath)
      ? "AppDelegate caches push token and notification launch target"
      : "AppDelegate not found yet; run `pnpm ios:sync` first",
  },
  {
    // Round 6 修了「AppDelegate 没实现 willPresent 导致前台收到通知直接被
    // iOS 静默丢掉」。doctor 当时没加对应 check，万一谁手抖删掉 / Capacitor
    // 升级把 AppDelegate 重新生成、忘记跑 configure，问题会悄无声息地复发。
    // 这里盯死 willPresent 必须出现在 AppDelegate.swift 里。
    label: "appdelegate-will-present",
    ok:
      !fs.existsSync(appDelegatePath) ||
      fileIncludes(appDelegatePath, "willPresent notification: UNNotification"),
    detail: fs.existsSync(appDelegatePath)
      ? "AppDelegate implements userNotificationCenter(_:willPresent:withCompletionHandler:) — foreground 通知不会被 iOS 静默丢"
      : "AppDelegate not found yet; run `pnpm ios:sync` first",
  },
  {
    // Round 20 修了「didRegister / didFail 漏 NotificationCenter.post →
    // YinjieMobileBridge.handlePushTokenChanged listener 永远拿不到 push token，
    // JS 端不会上报 token 给 cloud-api」。Round 31 又踩过一次（AppDelegatePush
    // 模板缺 broadcast）。doctor 之前只盯了「方法名存在」（appdelegate-push-cache）
    // 没盯实现里有没有真的 post 出来，万一谁删了 NotificationCenter.post / 让
    // configure 走 vanilla 模板重新 patch，又能悄无声息复发。
    label: "appdelegate-push-token-broadcast",
    ok:
      !fs.existsSync(appDelegatePath) ||
      (fileIncludes(appDelegatePath, "YinjiePushTokenChanged") &&
        fileIncludes(appDelegatePath, "NotificationCenter.default.post")),
    detail: fs.existsSync(appDelegatePath)
      ? "AppDelegate broadcasts YinjiePushTokenChanged so YinjieMobileBridge JS listeners can pick up APNs tokens"
      : "AppDelegate not found yet; run `pnpm ios:sync` first",
  },
  {
    // Round 39 修了「冷启动时已授权情况下不再调一次 registerForRemoteNotifications
    // → iCloud restore / iOS 大版本升级 / SIM 换卡 / 删 reinstall 后旧 device
    // token 失效，APNs 不会主动推新 token，推送通道死掉」。盯死 cold-start
    // register 还在 didFinishLaunchingWithOptions 里。
    label: "appdelegate-cold-start-register",
    ok:
      !fs.existsSync(appDelegatePath) ||
      (fileIncludes(appDelegatePath, "getNotificationSettings") &&
        fileIncludes(appDelegatePath, "UIApplication.shared.registerForRemoteNotifications()")),
    detail: fs.existsSync(appDelegatePath)
      ? "AppDelegate re-registers for remote notifications on cold start when already authorized — APNs token rotations propagate"
      : "AppDelegate not found yet; run `pnpm ios:sync` first",
  },
  {
    // 走查 R4/R5/R6：applicationDidBecomeActive 必须带 lastNotificationAuthStatus
    // 状态机 + register-on-transition：用户「在 Settings 里手动开通知权限 → 回到
    // app」是 iOS 唯一稳定能捕获到的 hook，不在这里 re-register 的话 APNs 永远
    // 没新 device token，cloud-api push_tokens 表里这个用户没行，朋友回复永远收
    // 不到推送 —— 要 force-quit 重启走 didFinishLaunching 才能恢复，根因极难
    // trace。同时盯死「transition 才 register」而不是「每次切回前台都 register」
    // —— 后者每次切回都打一次 cloud-api POST 完全是浪费（R5 修过）。
    label: "appdelegate-settings-change-rebroadcast",
    ok:
      !fs.existsSync(appDelegatePath) ||
      (fileIncludes(appDelegatePath, "lastNotificationAuthStatus") &&
        fileIncludes(appDelegatePath, "wasGranted") &&
        fileIncludes(appDelegatePath, "isGranted")),
    detail: fs.existsSync(appDelegatePath)
      ? "applicationDidBecomeActive re-registers APNs only on not-granted → granted transition (handles user toggling permission in Settings without burning cloud-api POST on every foreground)"
      : "AppDelegate not found yet; run `pnpm ios:sync` first",
  },
  (() => {
    // 真机走查 Round 1（2026-05-17）：xcode-template/AppDelegatePush.example.swift
    // 是「configure-ios-project.mjs.ensureAppDelegatePushHooks() 加完之后 AppDelegate
    // 长啥样」的参考实现 —— 给 code review / 手动复现 / fork 用户做依据用。前几轮
    // 真机走查（R3 badge 清零、R4 前台横幅 broadcast、R4/R5 Settings-change
    // re-register + 状态机基线）一路给 configure patcher 加补丁，但模板这边没同步
    // 过 —— 现状是 patcher 跟 installed AppDelegate.swift 都已经带这 4 条修复，
    // 模板仍停留在「只有 didRegister / willPresent / cacheLaunchTarget」的 R20 时代。
    //
    // 后果：
    //   - 任何对着模板 review AppDelegate 行为的人会以为这 4 条死链「修过 = 不存在」，
    //     实际 patcher 还在防它们复发；
    //   - fork 用户拿模板做基础手写自己的 AppDelegate，4 个真机 bug 会一并复发；
    //   - configure patcher 一旦谁手抖回滚，installed 跟模板 drift 没人 catch。
    //
    // 跟 plugin-stubs-in-sync 同款逻辑：盯死模板里必须出现这 4 条修复对应的关键字。
    const templateAppDelegate = path.join(
      shellRoot,
      "xcode-template",
      "AppDelegatePush.example.swift",
    );
    const templateOk = fileIncludesAll(templateAppDelegate, [
      "lastNotificationAuthStatus",
      "setBadgeCount(0)",
      "applicationIconBadgeNumber = 0",
      "wasGranted",
      "isGranted",
      "YinjiePendingLaunchTargetChanged",
      "self.lastNotificationAuthStatus = settings.authorizationStatus",
    ]);
    return {
      label: "appdelegate-template-in-sync",
      ok: !fs.existsSync(templateAppDelegate) || templateOk,
      detail: !fs.existsSync(templateAppDelegate)
        ? "xcode-template/AppDelegatePush.example.swift not found"
        : templateOk
          ? "xcode-template/AppDelegatePush.example.swift reflects R3/R4/R5/R6 patcher output (badge clear, transition-only re-register, pending-target broadcast)"
          : "xcode-template/AppDelegatePush.example.swift is stale vs configure patcher — missing R3 (badge clear) / R4 (pending-target post) / R4-R5 (lastNotificationAuthStatus transition register); reviewers / forks will think those bugs never existed",
    };
  })(),
  {
    label: "plugin-bridge-metadata",
    ok:
      (!fs.existsSync(runtimePluginPath) ||
        fileIncludesAll(runtimePluginPath, [
          "CAPBridgedPlugin",
          "jsName = \"YinjieRuntime\"",
          "CAPPluginMethod(name: \"getConfig\"",
          "CAPPluginMethod(name: \"getLocale\"",
          "CAPPluginMethod(name: \"setLocale\"",
        ])) &&
      (!fs.existsSync(secureStoragePluginPath) ||
        fileIncludesAll(secureStoragePluginPath, [
          "CAPBridgedPlugin",
          "jsName = \"YinjieSecureStorage\"",
          "CAPPluginMethod(name: \"get\"",
          "CAPPluginMethod(name: \"set\"",
          "CAPPluginMethod(name: \"remove\"",
        ])) &&
      (!fs.existsSync(mobileBridgePluginPath) ||
        fileIncludesAll(mobileBridgePluginPath, [
          "CAPBridgedPlugin",
          "jsName = \"YinjieMobileBridge\"",
          "CAPPluginMethod(name: \"openAppSettings\"",
          "CAPPluginMethod(name: \"shareFile\"",
          "CAPPluginMethod(name: \"openFile\"",
          "CAPPluginMethod(name: \"pickFile\"",
          "CAPPluginMethod(name: \"captureImage\"",
          "CAPPluginMethod(name: \"showLocalNotification\"",
        ])),
    detail:
      fs.existsSync(runtimePluginPath) ||
      fs.existsSync(secureStoragePluginPath) ||
      fs.existsSync(mobileBridgePluginPath)
        ? "Swift plugins expose CAPBridgedPlugin metadata for Capacitor 7"
        : "plugin files not found yet; run `pnpm ios:configure` after sync",
  },
  {
    label: "plugin-target-membership",
    ok:
      !fs.existsSync(projectPath) ||
      fileIncludesAll(projectPath, [
        "YinjieRuntimePlugin.swift in Sources */,",
        "YinjieSecureStoragePlugin.swift in Sources */,",
        "YinjieMobileBridgePlugin.swift in Sources */,",
        "path = Plugins;",
      ]),
    detail: fs.existsSync(projectPath)
      ? "App.xcodeproj includes the Yinjie Swift plugins in the App target"
      : "Xcode project not found yet; run `pnpm ios:sync` first",
  },
  {
    label: "localization-target-membership",
    ok:
      !fs.existsSync(projectPath) ||
      fileIncludesAll(projectPath, [
        "InfoPlist.strings in Resources",
        "zh-Hans.lproj/InfoPlist.strings",
        "en.lproj/InfoPlist.strings",
        "ja.lproj/InfoPlist.strings",
        "ko.lproj/InfoPlist.strings",
      ]),
    detail: fs.existsSync(projectPath)
      ? "App.xcodeproj includes localized InfoPlist.strings resources"
      : "Xcode project not found yet; run `pnpm ios:sync` first",
  },
  {
    label: "entitlements-config",
    ok:
      (!fs.existsSync(entitlementsPath) ||
        fileIncludesAll(entitlementsPath, [
          "aps-environment",
          "keychain-access-groups",
        ])) &&
      (!fs.existsSync(projectPath) ||
        fileIncludes(projectPath, "CODE_SIGN_ENTITLEMENTS = App/App.entitlements;")),
    detail:
      fs.existsSync(entitlementsPath) && fs.existsSync(projectPath)
        ? "App.entitlements exists and Xcode build settings point CODE_SIGN_ENTITLEMENTS to it"
        : "App.entitlements not seeded yet; run `pnpm ios:configure` to prepare Push/Keychain defaults",
  },
  {
    // Round 45: keychain-access-groups 写死 com.yinjie.ios 是 fork 用户的暗坑
    // —— SecItemAdd 没指定组时 iOS 拿数组里第一条当默认，于是 fork 用户的
    // session token 全落到 "XXXTEAMID.com.yinjie.ios" 这种跟自己 bundle id
    // 不对应的组里。模板已经迁到 `$(AppIdentifierPrefix)$(PRODUCT_BUNDLE_
    // IDENTIFIER)`，doctor 盯死装好的 entitlements 不能再回退到硬编码 ——
    // 防止 Capacitor 升级 / 谁手抖把模板回滚。
    label: "entitlements-no-hardcoded-keychain-bundle",
    ok:
      !fs.existsSync(entitlementsPath) ||
      !fileIncludes(
        entitlementsPath,
        "<string>$(AppIdentifierPrefix)com.yinjie.ios</string>",
      ),
    detail: fs.existsSync(entitlementsPath)
      ? "App.entitlements keychain-access-groups uses $(PRODUCT_BUNDLE_IDENTIFIER) (no hardcoded com.yinjie.ios)"
      : "App.entitlements not found yet; run `pnpm ios:configure` first",
  },
  {
    // applinks:app.example.yinjie.app 是 xcode-template 里的占位符。Round 9
    // 顺手修了「不要 append」，但没把占位本身清掉；configure 只在显式给了
    // YINJIE_IOS_ASSOCIATED_DOMAIN 时才替换。一旦没配，占位直接跟着 release
    // 包上 App Store / TestFlight，iOS 装机每次都会去拉 https://app.example.
    // yinjie.app/.well-known/apple-app-site-association，必失败，console 全
    // 是 swcd 报错。Round 22 让 configure 在无 domain 时清掉占位 entitlement，
    // doctor 同步盯，防止下一次又有人把占位塞回来。
    label: "entitlements-no-example-applink",
    ok:
      !fs.existsSync(entitlementsPath) ||
      !fileIncludes(entitlementsPath, "applinks:app.example.yinjie.app"),
    detail: fs.existsSync(entitlementsPath)
      ? "App.entitlements does not ship the applinks:app.example.yinjie.app placeholder"
      : "App.entitlements not found yet; run `pnpm ios:configure` first",
  },
  {
    label: "privacy-manifest",
    ok:
      (!fs.existsSync(privacyManifestPath) ||
        fileIncludesAll(privacyManifestPath, [
          "NSPrivacyTracking",
          "NSPrivacyCollectedDataTypes",
          "NSPrivacyAccessedAPICategoryUserDefaults",
          "CA92.1",
        ])) &&
      (!fs.existsSync(projectPath) ||
        fileIncludesAll(projectPath, [
          "PrivacyInfo.xcprivacy in Resources",
          "path = PrivacyInfo.xcprivacy;",
        ])),
    detail:
      fs.existsSync(privacyManifestPath) && fs.existsSync(projectPath)
        ? "PrivacyInfo.xcprivacy exists and is added to app resources"
        : "PrivacyInfo.xcprivacy not seeded yet; run `pnpm ios:configure` to prepare App Store privacy defaults",
  },
  {
    // 走查 R2 用 contentModificationDateKey / URLResourceValues 算 tmp file mtime
    // 决定该不该 purge，触发 Apple 的 Required Reason API: FileTimestamp 申报要
    // 求；不在 PrivacyInfo.xcprivacy 声明这条会被 App Store 「Missing API
    // Declaration: File Timestamp」打回（自 2024-05 Apple 强制施行）。守门
    // NSPrivacyAccessedAPICategoryFileTimestamp + 一条合法 reason 同时出现。
    // C617.1 = "Access file timestamps to implement features that require
    // timestamp data" — 我们用 mtime 来 decide GC，符合这条理由。
    label: "privacy-manifest-file-timestamp",
    ok:
      !fs.existsSync(privacyManifestPath) ||
      fileIncludesAll(privacyManifestPath, [
        "NSPrivacyAccessedAPICategoryFileTimestamp",
        "C617.1",
      ]),
    detail: fs.existsSync(privacyManifestPath)
      ? "PrivacyInfo.xcprivacy declares FileTimestamp API + C617.1 reason (matches contentModificationDateKey usage in YinjieMobileBridge tmp purge)"
      : "PrivacyInfo.xcprivacy not found yet; run `pnpm ios:configure` first",
  },
  {
    // YinjieSecureStoragePlugin 之前直接拿 OSStatus 当 Result.Failure，也直接
    // 塞给 call.reject(_:_:_:Error?)。OSStatus 是 Int32 的 typealias，Swift
    // 标准库不 conform Error，Result.Failure 必须 : Error —— 这条会让整个 iOS
    // 壳过不了 swiftc。必须包一层 KeychainError 走 Error 通道。
    label: "secure-storage-error-bridge",
    ok:
      !fs.existsSync(secureStoragePluginPath) ||
      (fileMatches(
        secureStoragePluginPath,
        /Result<[^>]+,\s*KeychainError>/,
      ) &&
        fileIncludes(secureStoragePluginPath, "struct KeychainError")),
    detail: fs.existsSync(secureStoragePluginPath)
      ? "YinjieSecureStoragePlugin wraps OSStatus in KeychainError (Result.Failure must conform to Error)"
      : "secure storage plugin not found yet; run `pnpm ios:sync` first",
  },
  {
    // Round 46: PHPickerConfiguration(photoLibrary: .shared()) 把 PHPicker 跟
    // PhotoKit 访问绑起来，我们 loadImageAsset 全程只用 itemProvider 不读
    // PHAsset，带 .shared() 会让 app 在 iOS Privacy Report 里被标「访问过
    // Photos」、App Store privacy 审查也得多写一条 Photos 数据收集。盯死
    // PHPickerConfiguration 不能再带 photoLibrary 参数（含 .shared 在内）。
    // Round 48: 4 个 yinjie-* tmp 子目录从来没人清理，pickImages/captureImage/
    // pickFile/shareFile/openFile 每次都留一份 5-50MB 临时副本。改在 plugin
    // load 一次性清。盯死 purgeOwnedTemporarySubdirectories 必须存在 —— 防
    // Capacitor 升级 / 谁手抖把 load() 还原回 vanilla.
    label: "mobile-bridge-temp-cleanup",
    ok:
      !fs.existsSync(mobileBridgePluginPath) ||
      fileIncludesAll(mobileBridgePluginPath, [
        "purgeOwnedTemporarySubdirectories",
        "yinjie-picker",
        "yinjie-camera",
        "yinjie-documents",
        "yinjie-shared",
      ]),
    detail: fs.existsSync(mobileBridgePluginPath)
      ? "YinjieMobileBridge.load() purges owned tmp subdirs at cold start (yinjie-picker/camera/documents/shared)"
      : "mobile bridge plugin not found yet; run `pnpm ios:sync` first",
  },
  {
    label: "phpicker-no-photolibrary",
    ok:
      !fs.existsSync(mobileBridgePluginPath) ||
      // 用 "= PHPickerConfiguration(" 这种实际赋值形式做 anchor，避免误命中
      // 用作"不要这样写"反例的解释注释里残留的 PHPickerConfiguration(photoLibrary:。
      (fileMatches(
        mobileBridgePluginPath,
        /=\s*PHPickerConfiguration\(\s*\)/m,
      ) &&
        !fileMatches(
          mobileBridgePluginPath,
          /=\s*PHPickerConfiguration\(photoLibrary:/m,
        )),
    detail: fs.existsSync(mobileBridgePluginPath)
      ? "PHPickerConfiguration is built without photoLibrary — pick-only path, no PhotoKit access footprint"
      : "mobile bridge plugin not found yet; run `pnpm ios:sync` first",
  },
  {
    label: "runtime-plugin-sync",
    ok:
      !fs.existsSync(runtimePluginPath) ||
      (fileIncludes(runtimePluginPath, "bundledConfig[\"apiBaseUrl\"]") &&
        fileIncludes(runtimePluginPath, "bundledConfig[\"cloudApiBaseUrl\"]") &&
        fileIncludes(runtimePluginPath, "worldAccessMode") &&
        fileIncludes(runtimePluginPath, "configStatus") &&
        fileIncludes(runtimePluginPath, "object(forInfoDictionaryKey: \"YinjiePublicAppName\")") &&
        fileIncludes(runtimePluginPath, "preferredLocales") &&
        fileIncludes(runtimePluginPath, "Locale.preferredLanguages")),
    detail: fs.existsSync(runtimePluginPath)
      ? "YinjieRuntime prefers bundled runtime-config.json (includes cloudApiBaseUrl), exposes sync status, and reads localized app metadata plus preferred locale fields"
      : "runtime plugin not found yet; run `pnpm ios:sync` first",
  },
  (() => {
    const resolved = resolveConfiguredApiBaseUrl();
    return {
      label: "core-api-base-url",
      ok: Boolean(resolved.value),
      detail: resolved.value
        ? `apiBaseUrl=${resolved.value} (source: ${resolved.source})`
        : "apiBaseUrl not set anywhere — set runtime.apiBaseUrl in ios-shell.config.json (or ios-shell.config.local.json) or export YINJIE_IOS_CORE_API_BASE_URL; otherwise `pnpm ios:sync` will fail",
    };
  })(),
  (() => {
    // 不接 template fallback：runtime-config.example.json 写了示例域名
    // "https://cloud.example.yinjie.app"，不配置就会被静默注入打包产物，
    // 真机起来后 cloud-api 全 DNS-fail，日志里看不出原因（看着配置成功）。
    // inject-runtime-config.mjs 已经把这条 fallback 拆了，doctor 同步盯。
    const resolved = resolveConfiguredCloudApiBaseUrl();
    return {
      label: "cloud-api-base-url",
      ok: Boolean(resolved.value),
      detail: resolved.value
        ? `cloudApiBaseUrl=${resolved.value} (source: ${resolved.source})`
        : "cloudApiBaseUrl not set anywhere — set runtime.cloudApiBaseUrl in ios-shell.config.json (or ios-shell.config.local.json) or export YINJIE_IOS_CLOUD_API_BASE_URL; capacitor:// origin can't fall back to window.location",
    };
  })(),
  {
    label: "capacitor-config",
    ok:
      fs.existsSync(capacitorConfigPath) &&
      !fileIncludes(capacitorConfigPath, "bundledWebRuntime") &&
      fileIncludesAll(capacitorConfigPath, [
        "SplashScreen",
        "launchShowDuration",
        "StatusBar",
        "Keyboard",
      ]),
    detail: fs.existsSync(capacitorConfigPath)
      ? fileIncludes(capacitorConfigPath, "bundledWebRuntime")
        ? "capacitor.config.ts still defines `bundledWebRuntime` (deprecated since Capacitor 5)"
        : "capacitor.config.ts declares SplashScreen/StatusBar/Keyboard plugin options"
      : "capacitor.config.ts not found",
  },
  {
    label: "capacitor-config-ios-scheme",
    ok:
      !fs.existsSync(capacitorConfigPath) ||
      (!fileMatches(
        capacitorConfigPath,
        /server\s*:\s*\{[\s\S]*?androidScheme/m,
      ) &&
        !fileMatches(
          capacitorConfigPath,
          /server\s*:\s*\{[\s\S]*?hostname/m,
        ) &&
        fileMatches(
          capacitorConfigPath,
          /ios\s*:\s*\{[\s\S]*?scheme\s*:/m,
        )),
    detail: fs.existsSync(capacitorConfigPath)
      ? "capacitor.config.ts declares ios.scheme and does not override server.androidScheme/hostname"
      : "capacitor.config.ts not found",
  },
  (() => {
    // xcode-template/Info.plist.example 是 configure-ios-project.mjs 在 fresh
    // checkout 下没生成 Info.plist 时直接 copy 过去的源。如果模板写死了
    // com.yinjie.ios 或 example URL，fork 出去的项目 / 第二个 bundle id 的
    // 多分发就会以错的 identifier 上 App Store。盯紧关键字段必须是变量替换
    // 形式而不是字面量。
    const templateInfoPlist = path.join(
      shellRoot,
      "xcode-template",
      "Info.plist.example",
    );
    const usesBundleVar = fileIncludes(
      templateInfoPlist,
      "<string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>",
    );
    const usesNameVar = fileIncludes(
      templateInfoPlist,
      "<string>$(PRODUCT_NAME)</string>",
    );
    const hasExampleUrl = fileIncludes(
      templateInfoPlist,
      "<string>https://api.example.yinjie.app</string>",
    );
    return {
      label: "info-plist-template-no-hardcoded-identity",
      ok:
        !fs.existsSync(templateInfoPlist) ||
        (usesBundleVar && usesNameVar && !hasExampleUrl),
      detail: fs.existsSync(templateInfoPlist)
        ? usesBundleVar && usesNameVar && !hasExampleUrl
          ? "xcode-template/Info.plist.example uses Xcode build-setting substitution (no hardcoded bundle id / example URLs)"
          : "xcode-template/Info.plist.example must use $(PRODUCT_BUNDLE_IDENTIFIER) / $(PRODUCT_NAME) and not ship example URLs"
        : "xcode-template/Info.plist.example not found",
    };
  })(),
  (() => {
    // installed Podfile 跟 xcode-template/Podfile.example 必须对齐 iOS 最低
    // 部署版本，不然 fresh checkout 走 template 的副本会偷偷把 minimum bump
    // 起来，把 Capacitor 实际支持的 iPhone 6s/7/SE-1 等 14.x 设备全断掉。
    // 当前 Capacitor 7.6.1 的 s.ios.deployment_target = '14.0'。
    const installedPodfile = path.join(shellRoot, "ios", "App", "Podfile");
    const templatePodfile = path.join(
      shellRoot,
      "xcode-template",
      "Podfile.example",
    );
    const installedMatch = fileMatches(
      installedPodfile,
      /platform\s*:ios,\s*['"]14\.0['"]/m,
    );
    const templateMatch = fileMatches(
      templatePodfile,
      /platform\s*:ios,\s*['"]14\.0['"]/m,
    );
    return {
      label: "podfile-deployment-target",
      ok:
        (!fs.existsSync(installedPodfile) || installedMatch) &&
        (!fs.existsSync(templatePodfile) || templateMatch),
      detail:
        fs.existsSync(installedPodfile) || fs.existsSync(templatePodfile)
          ? installedMatch && templateMatch
            ? "Podfile + xcode-template/Podfile.example both target ios 14.0 (matches Capacitor 7 minimum)"
            : "Podfile drift: installed and xcode-template Podfile.example must both pin platform :ios, '14.0'"
          : "Podfile not generated yet; run `pnpm ios:sync` first",
    };
  })(),
  {
    label: "info-plist-arm64",
    ok:
      !fs.existsSync(infoPlistPath) ||
      (fileIncludes(infoPlistPath, "<string>arm64</string>") &&
        !fileIncludes(infoPlistPath, "<string>armv7</string>")),
    detail: fs.existsSync(infoPlistPath)
      ? "Info.plist UIRequiredDeviceCapabilities targets arm64 (no armv7)"
      : "Info.plist not found yet; run `pnpm ios:sync` first",
  },
  {
    label: "info-plist-app-transport-security",
    ok:
      !fs.existsSync(infoPlistPath) ||
      fileIncludes(infoPlistPath, "<key>NSAppTransportSecurity</key>"),
    detail: fs.existsSync(infoPlistPath)
      ? "Info.plist declares NSAppTransportSecurity (HTTPS-only baseline)"
      : "Info.plist not found yet; run `pnpm ios:sync` first",
  },
  {
    label: "info-plist-empty-display-name",
    ok:
      !fs.existsSync(infoPlistPath) ||
      (plistKeyHasEmptyString(infoPlistPath, "CFBundleDisplayName") &&
        plistKeyHasEmptyString(infoPlistPath, "YinjiePublicAppName")),
    detail: fs.existsSync(infoPlistPath)
      ? "Info.plist CFBundleDisplayName/YinjiePublicAppName are empty (driven by InfoPlist.strings)"
      : "Info.plist not found yet; run `pnpm ios:sync` first",
  },
  {
    label: "info-plist-export-compliance",
    ok:
      !fs.existsSync(infoPlistPath) ||
      fileMatches(
        infoPlistPath,
        /<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/m,
      ),
    detail: fs.existsSync(infoPlistPath)
      ? "Info.plist declares ITSAppUsesNonExemptEncryption=false (skips App Store export compliance prompt)"
      : "Info.plist not found yet; run `pnpm ios:sync` first",
  },
  {
    label: "info-plist-declared-localizations",
    ok:
      !fs.existsSync(infoPlistPath) ||
      fileIncludesAll(infoPlistPath, [
        "<key>CFBundleLocalizations</key>",
        "<string>zh-Hans</string>",
        "<string>en</string>",
        "<string>ja</string>",
        "<string>ko</string>",
        "<key>CFBundleAllowMixedLocalizations</key>",
      ]),
    detail: fs.existsSync(infoPlistPath)
      ? "Info.plist declares CFBundleLocalizations for zh-Hans/en/ja/ko and CFBundleAllowMixedLocalizations"
      : "Info.plist not found yet; run `pnpm ios:sync` first",
  },
  {
    label: "info-plist-queries-schemes",
    ok:
      !fs.existsSync(infoPlistPath) ||
      fileIncludesAll(infoPlistPath, [
        "<key>LSApplicationQueriesSchemes</key>",
        "<string>mailto</string>",
        "<string>tel</string>",
        "<string>sms</string>",
        "<string>itms-apps</string>",
      ]),
    detail: fs.existsSync(infoPlistPath)
      ? "Info.plist declares LSApplicationQueriesSchemes (mailto/tel/sms/itms-apps)"
      : "Info.plist not found yet; run `pnpm ios:sync` first",
  },
  {
    // Round 14 让 LaunchScreen.storyboard 走 #070c14 深蓝；Round 27 把
    // WKWebView 自身的 background 也对齐。少了这条，splash 隐藏到 React
    // 首屏渲染之间会闪一帧白底。
    label: "capacitor-config-ios-background",
    ok:
      !fs.existsSync(capacitorConfigPath) ||
      fileMatches(
        capacitorConfigPath,
        /ios\s*:\s*\{[\s\S]*?backgroundColor\s*:\s*["']#070c14["']/m,
      ),
    detail: fs.existsSync(capacitorConfigPath)
      ? "capacitor.config.ts sets ios.backgroundColor=#070c14 (aligns WKWebView底色 with LaunchScreen + splash)"
      : "capacitor.config.ts not found",
  },
  {
    label: "capacitor-config-ipad-mobile",
    ok:
      !fs.existsSync(capacitorConfigPath) ||
      fileMatches(
        capacitorConfigPath,
        /preferredContentMode\s*:\s*["']mobile["']/m,
      ),
    detail: fs.existsSync(capacitorConfigPath)
      ? "capacitor.config.ts forces preferredContentMode=mobile (phone layout on iPad)"
      : "capacitor.config.ts not found",
  },
  {
    label: "asset-app-icon",
    ok:
      !fs.existsSync(iosAppRoot) ||
      fs.existsSync(
        path.join(
          iosAppRoot,
          "Assets.xcassets",
          "AppIcon.appiconset",
          "Contents.json",
        ),
      ),
    detail: fs.existsSync(iosAppRoot)
      ? "Assets.xcassets/AppIcon.appiconset is present"
      : "ios/App/App not found yet; run `pnpm ios:sync` first",
  },
  {
    label: "asset-splash-imageset",
    ok:
      !fs.existsSync(iosAppRoot) ||
      fs.existsSync(
        path.join(
          iosAppRoot,
          "Assets.xcassets",
          "Splash.imageset",
          "Contents.json",
        ),
      ),
    detail: fs.existsSync(iosAppRoot)
      ? "Assets.xcassets/Splash.imageset is present"
      : "ios/App/App not found yet; run `pnpm ios:sync` first",
  },
  {
    label: "launch-storyboard",
    ok:
      !fs.existsSync(iosAppRoot) ||
      fs.existsSync(path.join(iosAppRoot, "Base.lproj", "LaunchScreen.storyboard")),
    detail: fs.existsSync(iosAppRoot)
      ? "Base.lproj/LaunchScreen.storyboard is present"
      : "ios/App/App not found yet; run `pnpm ios:sync` first",
  },
  {
    label: "info-plist-empty-permission-strings",
    ok:
      !fs.existsSync(infoPlistPath) ||
      [
        "NSCameraUsageDescription",
        "NSPhotoLibraryUsageDescription",
        "NSPhotoLibraryAddUsageDescription",
        "NSMicrophoneUsageDescription",
      ].every((key) => plistKeyHasEmptyString(infoPlistPath, key)),
    detail: fs.existsSync(infoPlistPath)
      ? "Info.plist permission usage descriptions are empty (localized via InfoPlist.strings)"
      : "Info.plist not found yet; run `pnpm ios:sync` first",
  },
  {
    label: "web-dist-relative-base",
    ok: (() => {
      if (!fs.existsSync(webDistIndexPath)) {
        // 构建产物缺失只是提示，不算失败 —— 用户可能尚未跑 pnpm ios:sync
        return true;
      }
      const html = fs.readFileSync(webDistIndexPath, "utf8");
      // 在 WKWebView 下加载 file:// 时，资源引用必须是相对路径（./assets/...），不能是绝对路径（/assets/...）
      const hasAbsoluteAsset =
        / src=\"\/(?!\/)/.test(html) || / href=\"\/(?!\/)/.test(html);
      return !hasAbsoluteAsset;
    })(),
    detail: fs.existsSync(webDistIndexPath)
      ? "apps/app/dist-mobile/index.html uses relative asset paths (WKWebView file:// safe)"
      : "apps/app/dist-mobile not built yet; run `pnpm --filter @yinjie/ios-shell prepare:web`",
  },
];

const passed = checks.filter((item) => item.ok).length;

console.log(`iOS doctor: ${passed}/${checks.length} checks passed`);
for (const item of checks) {
  console.log(`${item.ok ? "PASS" : "WARN"}  ${item.label}: ${item.detail}`);
}

console.log("");
console.log("Next steps:");
console.log("1. Run this command on macOS.");
console.log("2. Confirm runtime.apiBaseUrl is set in ios-shell.config.json (or override via local.json / env) before `pnpm ios:sync`.");
console.log("3. After sync, run `pnpm ios:configure` to copy Xcode templates, seed any missing plugin files, and patch target membership.");
console.log(`4. Hostname: ${os.hostname()}`);
