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
    label: "plugin-bridge-metadata",
    ok:
      (!fs.existsSync(runtimePluginPath) ||
        fileIncludesAll(runtimePluginPath, [
          "CAPBridgedPlugin",
          "jsName = \"YinjieRuntime\"",
          "CAPPluginMethod(name: \"getConfig\"",
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
    label: "privacy-manifest",
    ok:
      (!fs.existsSync(privacyManifestPath) ||
        fileIncludesAll(privacyManifestPath, [
          "NSPrivacyTracking",
          "NSPrivacyCollectedDataTypes",
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
    label: "runtime-plugin-sync",
    ok:
      !fs.existsSync(runtimePluginPath) ||
      (fileIncludes(runtimePluginPath, "bundledConfig[\"apiBaseUrl\"]") &&
        fileIncludes(runtimePluginPath, "worldAccessMode") &&
        fileIncludes(runtimePluginPath, "configStatus") &&
        fileIncludes(runtimePluginPath, "preferredLocales") &&
        fileIncludes(runtimePluginPath, "Locale.preferredLanguages")),
    detail: fs.existsSync(runtimePluginPath)
      ? "YinjieRuntime prefers bundled runtime-config.json and exposes sync status plus preferred locale fields"
      : "runtime plugin not found yet; run `pnpm ios:sync` first",
  },
  {
    label: "core-api-env",
    ok: Boolean(process.env.YINJIE_IOS_CORE_API_BASE_URL),
    detail: process.env.YINJIE_IOS_CORE_API_BASE_URL
      ? `YINJIE_IOS_CORE_API_BASE_URL=${process.env.YINJIE_IOS_CORE_API_BASE_URL}`
      : "YINJIE_IOS_CORE_API_BASE_URL is not set, `pnpm ios:sync` will fail",
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
console.log("2. Set YINJIE_IOS_CORE_API_BASE_URL before `pnpm ios:sync`.");
console.log("3. After sync, run `pnpm ios:configure` to copy Xcode templates, seed any missing plugin files, and patch target membership.");
console.log(`4. Hostname: ${os.hostname()}`);
