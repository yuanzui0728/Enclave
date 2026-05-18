import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const iosRoot = path.join(cwd, "ios", "App");
const appRoot = path.join(iosRoot, "App");
const pluginsRoot = path.join(appRoot, "Plugins");
const xcodeProjectPath = path.join(iosRoot, "App.xcodeproj", "project.pbxproj");
const appDelegatePath = path.join(appRoot, "AppDelegate.swift");
const infoPlistPath = path.join(appRoot, "Info.plist");
const privacyManifestPath = path.join(appRoot, "PrivacyInfo.xcprivacy");
const entitlementsPath = path.join(appRoot, "App.entitlements");
const shellConfigPath = path.join(cwd, "ios-shell.config.json");
const shellLocalConfigPath = path.join(cwd, "ios-shell.config.local.json");

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    console.error(`Failed to parse ${path.relative(cwd, filePath)}: ${error.message}`);
    process.exit(1);
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(target, source) {
  if (!isPlainObject(target)) {
    return isPlainObject(source) ? deepMerge({}, source) : source;
  }
  if (!isPlainObject(source)) {
    return target;
  }
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    const tgtVal = result[key];
    if (isPlainObject(tgtVal) && isPlainObject(srcVal)) {
      result[key] = deepMerge(tgtVal, srcVal);
    } else {
      result[key] = srcVal;
    }
  }
  return result;
}

const baseShellConfig = readJsonIfExists(shellConfigPath) ?? {};
const localShellConfig = readJsonIfExists(shellLocalConfigPath) ?? {};
const shellConfig = deepMerge(baseShellConfig, localShellConfig);
const permissionsByRegion = shellConfig?.localization?.permissions ?? {};
const iosOptions = shellConfig?.ios ?? {};

if (!fs.existsSync(iosRoot)) {
  console.error("Missing ios/App directory. Run `pnpm ios:sync` first.");
  process.exit(1);
}

fs.mkdirSync(appRoot, { recursive: true });
fs.mkdirSync(pluginsRoot, { recursive: true });

const pluginProjectEntries = [
  {
    fileName: "YinjieRuntimePlugin.swift",
    buildFileId: "7A6C0F112B0E4C9200D10001",
    fileRefId: "7A6C0F112B0E4C9200D10011",
  },
  {
    fileName: "YinjieSecureStoragePlugin.swift",
    buildFileId: "7A6C0F112B0E4C9200D10002",
    fileRefId: "7A6C0F112B0E4C9200D10012",
  },
  {
    fileName: "YinjieMobileBridgePlugin.swift",
    buildFileId: "7A6C0F112B0E4C9200D10003",
    fileRefId: "7A6C0F112B0E4C9200D10013",
  },
];
const pluginsGroupId = "7A6C0F112B0E4C9200D10021";
const privacyManifestBuildFileId = "7A6C0F112B0E4C9200D10004";
const privacyManifestFileRefId = "7A6C0F112B0E4C9200D10014";
const entitlementsFileRefId = "7A6C0F112B0E4C9200D10015";
const infoPlistStringsBuildFileId = "7A6C0F112B0E4C9200D10005";
const infoPlistStringsVariantGroupId = "7A6C0F112B0E4C9200D10030";
const PERMISSION_KEY_MAPPING = {
  appDisplayName: "CFBundleDisplayName",
  publicAppName: "YinjiePublicAppName",
  camera: "NSCameraUsageDescription",
  photoLibrary: "NSPhotoLibraryUsageDescription",
  photoLibraryAdd: "NSPhotoLibraryAddUsageDescription",
  microphone: "NSMicrophoneUsageDescription",
};

const INFO_PLIST_LOCALIZATION_DEFAULTS = [
  {
    region: "zh-Hans",
    directory: "zh-Hans.lproj",
    fileRefId: "7A6C0F112B0E4C9200D10031",
    defaults: {
      CFBundleDisplayName: "隐界",
      YinjiePublicAppName: "隐界",
      NSCameraUsageDescription: "用于拍摄头像或动态图片。",
      NSPhotoLibraryUsageDescription: "用于从相册选择头像或动态图片。",
      NSPhotoLibraryAddUsageDescription: "用于将导出图片保存到相册。",
      NSMicrophoneUsageDescription: "用于语音输入或语音互动功能。",
    },
  },
  {
    region: "en",
    directory: "en.lproj",
    fileRefId: "7A6C0F112B0E4C9200D10032",
    defaults: {
      CFBundleDisplayName: "Yinjie",
      YinjiePublicAppName: "Yinjie",
      NSCameraUsageDescription: "Used to take profile photos or moment images.",
      NSPhotoLibraryUsageDescription:
        "Used to choose profile photos or moment images from your photo library.",
      NSPhotoLibraryAddUsageDescription:
        "Used to save exported images to your photo library.",
      NSMicrophoneUsageDescription:
        "Used for voice input and voice interactions.",
    },
  },
  {
    region: "ja",
    directory: "ja.lproj",
    fileRefId: "7A6C0F112B0E4C9200D10033",
    defaults: {
      CFBundleDisplayName: "Yinjie",
      YinjiePublicAppName: "Yinjie",
      NSCameraUsageDescription:
        "プロフィール写真や投稿画像を撮影するために使用します。",
      NSPhotoLibraryUsageDescription:
        "写真ライブラリからプロフィール写真や投稿画像を選択するために使用します。",
      NSPhotoLibraryAddUsageDescription:
        "書き出した画像を写真ライブラリに保存するために使用します。",
      NSMicrophoneUsageDescription:
        "音声入力や音声インタラクションに使用します。",
    },
  },
  {
    region: "ko",
    directory: "ko.lproj",
    fileRefId: "7A6C0F112B0E4C9200D10034",
    defaults: {
      CFBundleDisplayName: "Yinjie",
      YinjiePublicAppName: "Yinjie",
      NSCameraUsageDescription:
        "프로필 사진이나 게시 이미지 촬영에 사용됩니다.",
      NSPhotoLibraryUsageDescription:
        "사진 보관함에서 프로필 사진이나 게시 이미지를 선택하는 데 사용됩니다.",
      NSPhotoLibraryAddUsageDescription:
        "내보낸 이미지를 사진 보관함에 저장하는 데 사용됩니다.",
      NSMicrophoneUsageDescription:
        "음성 입력 및 음성 상호작용에 사용됩니다.",
    },
  },
];

function resolveLocalizedValues(region, defaults) {
  const overrides = permissionsByRegion[region] ?? {};
  const merged = { ...defaults };
  for (const [shortKey, plistKey] of Object.entries(PERMISSION_KEY_MAPPING)) {
    const candidate = overrides[shortKey];
    if (typeof candidate === "string" && candidate.trim()) {
      merged[plistKey] = candidate;
    }
  }
  return merged;
}

const infoPlistStringLocalizations = INFO_PLIST_LOCALIZATION_DEFAULTS.map(
  ({ region, directory, fileRefId, defaults }) => ({
    region,
    directory,
    fileRefId,
    values: resolveLocalizedValues(region, defaults),
  }),
);

const copies = [
  {
    from: path.join(cwd, "xcode-template", "Info.plist.example"),
    to: path.join(appRoot, "Info.plist.example"),
    overwrite: true,
  },
  {
    from: path.join(cwd, "xcode-template", "PrivacyInfo.xcprivacy.example"),
    to: path.join(appRoot, "PrivacyInfo.xcprivacy.example"),
    overwrite: true,
  },
  {
    from: path.join(cwd, "xcode-template", "PrivacyInfo.xcprivacy.example"),
    to: privacyManifestPath,
    overwrite: false,
  },
  {
    from: path.join(cwd, "xcode-template", "App.entitlements.example"),
    to: path.join(appRoot, "App.entitlements.example"),
    overwrite: true,
  },
  {
    from: path.join(cwd, "xcode-template", "App.entitlements.example"),
    to: entitlementsPath,
    overwrite: false,
  },
  {
    from: path.join(cwd, "xcode-template", "AppDelegatePush.example.swift"),
    to: path.join(appRoot, "AppDelegatePush.example.swift"),
    overwrite: true,
  },
  {
    from: path.join(cwd, "xcode-template", "Podfile.example"),
    to: path.join(iosRoot, "Podfile.example"),
    overwrite: true,
  },
  {
    from: path.join(cwd, "plugins", "swift-stub", pluginProjectEntries[0].fileName),
    to: path.join(pluginsRoot, pluginProjectEntries[0].fileName),
    overwrite: false,
  },
  {
    from: path.join(cwd, "plugins", "swift-stub", pluginProjectEntries[1].fileName),
    to: path.join(pluginsRoot, pluginProjectEntries[1].fileName),
    overwrite: false,
  },
  {
    from: path.join(cwd, "plugins", "swift-stub", pluginProjectEntries[2].fileName),
    to: path.join(pluginsRoot, pluginProjectEntries[2].fileName),
    overwrite: false,
  },
];

function copyFile({ from, to, overwrite }) {
  fs.mkdirSync(path.dirname(to), { recursive: true });

  if (!overwrite && fs.existsSync(to)) {
    console.log(`kept ${path.relative(cwd, to)}`);
    return;
  }

  fs.copyFileSync(from, to);
  console.log(`copied ${path.relative(cwd, from)} -> ${path.relative(cwd, to)}`);
}

for (const file of copies) {
  copyFile(file);
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeInfoPlistString(value) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\n", "\\n");
}

function buildInfoPlistStrings(values) {
  return `${Object.entries(values)
    .map(
      ([key, value]) =>
        `"${escapeInfoPlistString(key)}" = "${escapeInfoPlistString(value)}";`,
    )
    .join("\n")}\n`;
}

function ensureInfoPlistStrings() {
  for (const localization of infoPlistStringLocalizations) {
    const filePath = path.join(
      appRoot,
      localization.directory,
      "InfoPlist.strings",
    );
    const contents = buildInfoPlistStrings(localization.values);

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (fs.existsSync(filePath) && fs.readFileSync(filePath, "utf8") === contents) {
      console.log(`kept ${path.relative(cwd, filePath)}`);
      continue;
    }

    fs.writeFileSync(filePath, contents);
    console.log(`wrote ${path.relative(cwd, filePath)}`);
  }
}

function insertBeforeDictEnd(source, snippet) {
  const marker = "</dict>";
  const index = source.indexOf(marker);
  if (index === -1) {
    throw new Error("Failed to patch Info.plist, missing </dict>.");
  }

  return `${source.slice(0, index)}${snippet}${source.slice(index)}`;
}

function ensurePlistStringKey(source, key, value) {
  if (source.includes(`<key>${key}</key>`)) {
    return source;
  }

  const snippet = `\t<key>${key}</key>\n\t<string>${escapeXml(value)}</string>\n`;
  return insertBeforeDictEnd(source, snippet);
}

function ensurePlistArrayContainsString(source, key, value) {
  const keyMarker = `<key>${key}</key>`;
  if (!source.includes(keyMarker)) {
    const snippet = `\t<key>${key}</key>\n\t<array>\n\t\t<string>${escapeXml(value)}</string>\n\t</array>\n`;
    return insertBeforeDictEnd(source, snippet);
  }

  if (source.includes(`<string>${value}</string>`)) {
    return source;
  }

  const arrayStart = source.indexOf("<array>", source.indexOf(keyMarker));
  const arrayEnd = source.indexOf("</array>", arrayStart);
  if (arrayStart === -1 || arrayEnd === -1) {
    throw new Error(`Failed to patch Info.plist array for ${key}.`);
  }

  const insertion = `\t\t<string>${escapeXml(value)}</string>\n`;
  return `${source.slice(0, arrayEnd)}${insertion}${source.slice(arrayEnd)}`;
}

function ensurePlistStringValueIfHardcoded(source, key, knownHardcoded, replacement) {
  const keyMarker = `<key>${key}</key>`;
  const keyIndex = source.indexOf(keyMarker);
  if (keyIndex === -1) {
    return source;
  }

  const stringOpen = source.indexOf("<string>", keyIndex);
  const stringClose = source.indexOf("</string>", stringOpen);
  if (stringOpen === -1 || stringClose === -1) {
    return source;
  }

  const currentValue = source.slice(stringOpen + "<string>".length, stringClose);
  if (!knownHardcoded.includes(currentValue)) {
    return source;
  }

  return `${source.slice(0, stringOpen)}<string>${escapeXml(replacement)}</string>${source.slice(stringClose + "</string>".length)}`;
}

function ensurePlistArmArchitecture(source) {
  const keyMarker = "<key>UIRequiredDeviceCapabilities</key>";
  const keyIndex = source.indexOf(keyMarker);
  if (keyIndex === -1) {
    return source;
  }

  const arrayStart = source.indexOf("<array>", keyIndex);
  const arrayEnd = source.indexOf("</array>", arrayStart);
  if (arrayStart === -1 || arrayEnd === -1) {
    return source;
  }

  const before = source.slice(0, arrayStart);
  const arrayBody = source.slice(arrayStart, arrayEnd);
  const after = source.slice(arrayEnd);

  if (!arrayBody.includes("<string>armv7</string>")) {
    return source;
  }

  const patchedArrayBody = arrayBody.replace(
    /<string>armv7<\/string>/g,
    "<string>arm64</string>",
  );
  return `${before}${patchedArrayBody}${after}`;
}

function ensureAppTransportSecurity(source) {
  if (source.includes("<key>NSAppTransportSecurity</key>")) {
    return source;
  }

  const snippet = [
    "\t<key>NSAppTransportSecurity</key>\n",
    "\t<dict>\n",
    "\t\t<key>NSAllowsArbitraryLoads</key>\n",
    "\t\t<false/>\n",
    "\t</dict>\n",
  ].join("");

  return insertBeforeDictEnd(source, snippet);
}

function ensureExportComplianceFalse(source) {
  if (source.includes("<key>ITSAppUsesNonExemptEncryption</key>")) {
    return source;
  }

  return insertBeforeDictEnd(
    source,
    "\t<key>ITSAppUsesNonExemptEncryption</key>\n\t<false/>\n",
  );
}

function ensureBundleLocalizations(source) {
  if (source.includes("<key>CFBundleLocalizations</key>")) {
    return source;
  }

  const snippet = [
    "\t<key>CFBundleLocalizations</key>\n",
    "\t<array>\n",
    "\t\t<string>zh-Hans</string>\n",
    "\t\t<string>en</string>\n",
    "\t\t<string>ja</string>\n",
    "\t\t<string>ko</string>\n",
    "\t</array>\n",
  ].join("");

  return insertBeforeDictEnd(source, snippet);
}

function ensureBundleAllowMixedLocalizations(source) {
  if (source.includes("<key>CFBundleAllowMixedLocalizations</key>")) {
    return source;
  }

  return insertBeforeDictEnd(
    source,
    "\t<key>CFBundleAllowMixedLocalizations</key>\n\t<true/>\n",
  );
}

const DEFAULT_QUERIES_SCHEMES = ["mailto", "tel", "sms", "itms-apps", "https", "http"];

function ensureApplicationQueriesSchemes(source) {
  let patched = source;
  for (const scheme of DEFAULT_QUERIES_SCHEMES) {
    patched = ensurePlistArrayContainsString(
      patched,
      "LSApplicationQueriesSchemes",
      scheme,
    );
  }
  return patched;
}

function ensureCapacitorConfigIosScheme() {
  const configPath = path.join(cwd, "capacitor.config.ts");
  if (!fs.existsSync(configPath)) {
    return;
  }

  const source = fs.readFileSync(configPath, "utf8");
  const issues = [];

  if (/server\s*:\s*\{[\s\S]*?androidScheme/m.test(source)) {
    issues.push("server.androidScheme is meaningless on iOS-only shell");
  }
  if (/server\s*:\s*\{[\s\S]*?hostname/m.test(source)) {
    issues.push(
      "server.hostname locks the WKWebView origin — once a build ships with it, changing or removing the value invalidates persistent Web storage on already-installed devices",
    );
  }
  if (!/ios\s*:\s*\{[\s\S]*?scheme\s*:/m.test(source)) {
    issues.push("ios.scheme is not declared (recommend explicit \"capacitor\")");
  }

  if (issues.length > 0) {
    console.log("warn  capacitor.config.ts drift detected:");
    for (const issue of issues) {
      console.log(`        - ${issue}`);
    }
    console.log(
      "        configure does not auto-rewrite TS to keep comments intact; doctor will fail until fixed manually.",
    );
  }
}

function ensureInfoPlistDefaults() {
  const templatePath = path.join(cwd, "xcode-template", "Info.plist.example");
  if (!fs.existsSync(infoPlistPath)) {
    fs.copyFileSync(templatePath, infoPlistPath);
    console.log("copied xcode-template/Info.plist.example -> ios/App/App/Info.plist");
    return;
  }

  let plist = fs.readFileSync(infoPlistPath, "utf8");
  const original = plist;

  const requiredStrings = [
    ["YinjieApiBaseUrl", ""],
    ["YinjieSocketBaseUrl", ""],
    // YinjieRuntimePlugin.getConfig 的 Info.plist 兜底分支会读 info["YinjieCloudApiBaseUrl"]，
    // 但 Round 21/28/33 一路给 bundled runtime-config.json 加 cloudApiBaseUrl 的时候漏了
    // Info.plist 这条镜像 —— 模板 Info.plist.example 没声明这个 key，ensureInfoPlistDefaults
    // 也没把它塞进 requiredStrings。结果 cloud-api 那条「bundled 失踪 → Info.plist 兜底」
    // 跟其它三个 URL 的对齐路径，从来就不存在；如果哪天 cap sync 没把 public/runtime-config.json
    // 拷过来（手动 archive、CI 漏跑 sync 等），cloud-api 入口直接全死，Swift 端死代码不报错。
    // 跟 YinjieApiBaseUrl / YinjieSocketBaseUrl 拉齐。
    ["YinjieCloudApiBaseUrl", ""],
    ["YinjieEnvironment", ""],
    ["CFBundleDisplayName", ""],
    ["YinjiePublicAppName", ""],
    ["NSCameraUsageDescription", ""],
    ["NSPhotoLibraryUsageDescription", ""],
    ["NSPhotoLibraryAddUsageDescription", ""],
    ["NSMicrophoneUsageDescription", ""],
  ];

  for (const [key, value] of requiredStrings) {
    plist = ensurePlistStringKey(plist, key, value);
  }

  const localizedKeys = [
    {
      key: "CFBundleDisplayName",
      hardcoded: ["隐界", "Yinjie"],
    },
    {
      key: "YinjiePublicAppName",
      hardcoded: ["隐界", "Yinjie"],
    },
    {
      key: "NSCameraUsageDescription",
      hardcoded: [
        "用于拍摄头像或动态图片。",
        "Used to take profile photos or moment images.",
      ],
    },
    {
      key: "NSPhotoLibraryUsageDescription",
      hardcoded: [
        "用于从相册选择头像或动态图片。",
        "Used to choose profile photos or moment images from your photo library.",
      ],
    },
    {
      key: "NSPhotoLibraryAddUsageDescription",
      hardcoded: [
        "用于将导出图片保存到相册。",
        "Used to save exported images to your photo library.",
      ],
    },
    {
      key: "NSMicrophoneUsageDescription",
      hardcoded: [
        "用于语音输入或语音互动功能。",
        "Used for voice input and voice interactions.",
      ],
    },
  ];

  for (const { key, hardcoded } of localizedKeys) {
    plist = ensurePlistStringValueIfHardcoded(plist, key, hardcoded, "");
  }

  plist = ensurePlistArmArchitecture(plist);
  plist = ensureAppTransportSecurity(plist);
  plist = ensureExportComplianceFalse(plist);
  plist = ensureBundleLocalizations(plist);
  plist = ensureBundleAllowMixedLocalizations(plist);
  plist = ensureApplicationQueriesSchemes(plist);

  plist = ensurePlistArrayContainsString(
    plist,
    "UIBackgroundModes",
    "remote-notification",
  );

  if (plist !== original) {
    fs.writeFileSync(infoPlistPath, plist);
    console.log("patched ios/App/App/Info.plist");
  } else {
    console.log("kept ios/App/App/Info.plist");
  }
}

ensureCapacitorConfigIosScheme();
ensureInfoPlistDefaults();
ensureInfoPlistStrings();

function insertAfterMatch(source, pattern, snippet, errorMessage) {
  const match = source.match(pattern);
  if (!match || typeof match.index !== "number") {
    throw new Error(errorMessage);
  }

  const index = match.index + match[0].length;
  return `${source.slice(0, index)}${snippet}${source.slice(index)}`;
}

function insertBeforeClassEnd(source, snippet) {
  const index = source.lastIndexOf("\n}");
  if (index === -1) {
    throw new Error("Failed to patch AppDelegate.swift, missing class closing brace.");
  }

  return `${source.slice(0, index)}${snippet}${source.slice(index)}`;
}

function ensureAppDelegatePushHooks() {
  if (!fs.existsSync(appDelegatePath)) {
    console.log("warn  ios/App/App/AppDelegate.swift not found, skipped push hook patch");
    return;
  }

  let source = fs.readFileSync(appDelegatePath, "utf8");
  const original = source;

  if (!source.includes("import UserNotifications")) {
    source = insertAfterMatch(
      source,
      /^(?:import .+\n)+/,
      "import UserNotifications\n",
      "Failed to patch AppDelegate.swift imports.",
    );
  }

  if (
    !source.includes("UNUserNotificationCenterDelegate") &&
    source.includes("class AppDelegate: UIResponder, UIApplicationDelegate")
  ) {
    source = source.replace(
      "class AppDelegate: UIResponder, UIApplicationDelegate {",
      "class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {",
    );
  }

  if (!source.includes("UNUserNotificationCenter.current().delegate = self")) {
    source = insertAfterMatch(
      source,
      /func application\([\s\S]*?didFinishLaunchingWithOptions[\s\S]*?\)\s*->\s*Bool\s*\{\n/,
      "        UNUserNotificationCenter.current().delegate = self\n",
      "Failed to patch AppDelegate.swift didFinishLaunchingWithOptions.",
    );
  }

  if (!source.includes("cacheLaunchTarget(from: launchOptions?[.remoteNotification]")) {
    source = insertAfterMatch(
      source,
      /func application\([\s\S]*?didFinishLaunchingWithOptions[\s\S]*?\)\s*->\s*Bool\s*\{\n(?:\s*UNUserNotificationCenter\.current\(\)\.delegate = self\n)?/,
      "        cacheLaunchTarget(from: launchOptions?[.remoteNotification] as? [AnyHashable: Any], defaultSource: \"push\")\n",
      "Failed to patch AppDelegate.swift launch target bootstrap.",
    );
  }

  // Round 39 真机修复同款：已授权时每次冷启再调一次 registerForRemoteNotifications，
  // 让 APNs 把可能轮换过的新 device token 推给我们（iCloud restore / iOS 大版本
  // 升级 / SIM 换卡 / 删 reinstall 等场景会让旧 token 失效）。这条 patcher 与
  // 真实 AppDelegate.swift / AppDelegatePush.example.swift 漂移过 —— 一旦谁手抖
  // 删掉 ios/App/App/AppDelegate.swift 让 configure 走 vanilla Capacitor 模板
  // 重新 patch，Round 39 修过的 token 轮换路径会悄无声息地复发。
  if (!source.includes("UIApplication.shared.registerForRemoteNotifications()")) {
    source = insertAfterMatch(
      source,
      /func application\([\s\S]*?didFinishLaunchingWithOptions[\s\S]*?\)\s*->\s*Bool\s*\{\n(?:\s*UNUserNotificationCenter\.current\(\)\.delegate = self\n)?(?:\s*cacheLaunchTarget\(from: launchOptions\?\[\.remoteNotification\][\s\S]*?\n)?/,
      [
        "        UNUserNotificationCenter.current().getNotificationSettings { settings in",
        "            guard settings.authorizationStatus == .authorized ||",
        "                    settings.authorizationStatus == .provisional else {",
        "                return",
        "            }",
        "            DispatchQueue.main.async {",
        "                UIApplication.shared.registerForRemoteNotifications()",
        "            }",
        "        }\n",
      ].join("\n"),
      "Failed to patch AppDelegate.swift cold-start register hook.",
    );
  }

  if (!source.includes("didRegisterForRemoteNotificationsWithDeviceToken")) {
    // Round 20 修了「YinjieMobileBridgePlugin.load 注册的 YinjiePushTokenChanged
    // listener 没人 post → JS 端永远拿不到 push token」。patcher 跟实际
    // AppDelegate.swift 漂移过：少了 NotificationCenter.post 的两条 broadcast，
    // YinjieMobileBridge.handlePushTokenChanged 听不到 token，最终 push token
    // 永远走不通到 cloud-api 注册接口。这里跟 AppDelegatePush.example.swift 对齐。
    source = insertBeforeClassEnd(
      source,
      [
        "",
        "    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {",
        "        let token = deviceToken.map { String(format: \"%02.2hhx\", $0) }.joined()",
        "        UserDefaults.standard.set(token, forKey: \"YinjiePushToken\")",
        "        NotificationCenter.default.post(",
        "            name: Notification.Name(\"YinjiePushTokenChanged\"),",
        "            object: nil,",
        "            userInfo: [\"token\": token]",
        "        )",
        "    }",
        "",
        "    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {",
        "        UserDefaults.standard.removeObject(forKey: \"YinjiePushToken\")",
        "        print(\"Yinjie push registration failed: \\(error.localizedDescription)\")",
        "        NotificationCenter.default.post(",
        "            name: Notification.Name(\"YinjiePushTokenChanged\"),",
        "            object: nil,",
        "            userInfo: [\"error\": error.localizedDescription]",
        "        )",
        "    }",
      ].join("\n"),
    );
  }

  if (!source.includes("func userNotificationCenter(")) {
    source = insertBeforeClassEnd(
      source,
      [
        "",
        "    func userNotificationCenter(",
        "        _ center: UNUserNotificationCenter,",
        "        didReceive response: UNNotificationResponse,",
        "        withCompletionHandler completionHandler: @escaping () -> Void",
        "    ) {",
        "        defer { completionHandler() }",
        "        cacheLaunchTarget(from: response.notification.request.content.userInfo, defaultSource: \"local_reminder\")",
        "    }",
      ].join("\n"),
    );
  }

  if (!source.includes("willPresent notification: UNNotification")) {
    source = insertBeforeClassEnd(
      source,
      [
        "",
        "    func userNotificationCenter(",
        "        _ center: UNUserNotificationCenter,",
        "        willPresent notification: UNNotification,",
        "        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void",
        "    ) {",
        "        if #available(iOS 14.0, *) {",
        "            completionHandler([.banner, .list, .sound, .badge])",
        "        } else {",
        "            completionHandler([.alert, .sound, .badge])",
        "        }",
        "    }",
      ].join("\n"),
    );
  }

  if (!source.includes("private func cacheLaunchTarget(")) {
    source = insertBeforeClassEnd(
      source,
      [
        "",
        "    private func cacheLaunchTarget(from userInfo: [AnyHashable: Any]?, defaultSource: String) {",
        "        guard let userInfo else {",
        "            return",
        "        }",
        "",
        "        let kind = normalize(userInfo[\"kind\"])",
        "        let route = normalize(userInfo[\"route\"])",
        "        let conversationId = normalize(userInfo[\"conversationId\"])",
        "        let groupId = normalize(userInfo[\"groupId\"])",
        "        let source = normalize(userInfo[\"source\"])",
        "",
        "        let resolvedKind: String?",
        "        if let kind {",
        "            resolvedKind = kind",
        "        } else if conversationId != nil {",
        "            resolvedKind = \"conversation\"",
        "        } else if groupId != nil {",
        "            resolvedKind = \"group\"",
        "        } else if route != nil {",
        "            resolvedKind = \"route\"",
        "        } else {",
        "            resolvedKind = nil",
        "        }",
        "",
        "        guard let resolvedKind else {",
        "            return",
        "        }",
        "",
        "        var payload: [String: String] = [",
        "            \"kind\": resolvedKind,",
        "            \"source\": source ?? defaultSource",
        "        ]",
        "",
        "        if let route {",
        "            payload[\"route\"] = route",
        "        } else if resolvedKind == \"route\" {",
        "            payload[\"route\"] = \"/tabs/chat\"",
        "        }",
        "",
        "        if let conversationId {",
        "            payload[\"conversationId\"] = conversationId",
        "        }",
        "",
        "        if let groupId {",
        "            payload[\"groupId\"] = groupId",
        "        }",
        "",
        "        UserDefaults.standard.set(payload, forKey: \"YinjiePendingLaunchTarget\")",
        "",
        "        NotificationCenter.default.post(",
        "            name: Notification.Name(\"YinjiePendingLaunchTargetChanged\"),",
        "            object: nil",
        "        )",
        "    }",
      ].join("\n"),
    );
  }

  // Round R4 真机走查：如果 AppDelegate 已经被前面分支写入过老版本的 cacheLaunchTarget
  // （没带 NotificationCenter.post），那段路径不会被 insertBeforeClassEnd 再次插入。
  // 这里兜底：检测到老 cacheLaunchTarget 末尾只有 UserDefaults.set 但没有
  // YinjiePendingLaunchTargetChanged 的 post，就给它补上前台横幅点击 → JS sync 的
  // 信号通道，确保 mobile-notification-launch-bridge 能收到 native 主动信号。
  if (
    source.includes("UserDefaults.standard.set(payload, forKey: \"YinjiePendingLaunchTarget\")") &&
    !source.includes("YinjiePendingLaunchTargetChanged")
  ) {
    source = source.replace(
      "UserDefaults.standard.set(payload, forKey: \"YinjiePendingLaunchTarget\")",
      [
        "UserDefaults.standard.set(payload, forKey: \"YinjiePendingLaunchTarget\")",
        "",
        "        NotificationCenter.default.post(",
        "            name: Notification.Name(\"YinjiePendingLaunchTargetChanged\"),",
        "            object: nil",
        "        )",
      ].join("\n"),
    );
  }

  if (!source.includes("private func normalize(_ value: Any?)")) {
    source = insertBeforeClassEnd(
      source,
      [
        "",
        "    private func normalize(_ value: Any?) -> String? {",
        "        guard let stringValue = value as? String else {",
        "            return nil",
        "        }",
        "",
        "        let normalized = stringValue.trimmingCharacters(in: .whitespacesAndNewlines)",
        "        return normalized.isEmpty ? nil : normalized",
        "    }",
      ].join("\n"),
    );
  }

  // Round R3 真机走查：applicationDidBecomeActive 默认是空的，APNs 后端推消息
  // 时设的 badge 永远不会自然清，app 图标上 "5" 之类的角标会一直挂在桌面上
  // 即使用户已经读完所有消息。这里把 vanilla Capacitor 模板里那个只有「Restart
  // any tasks...」英文注释的空 applicationDidBecomeActive 替换成清零 badge 的
  // 实现；已经写过 setBadgeCount(0) / applicationIconBadgeNumber = 0 的 case
  // 跳过，保留开发者手写的其它定制。
  //
  // 走查 R4/R5：同时塞 lastNotificationAuthStatus 状态机 + register-on-transition。
  // 否则 fresh checkout 装好后，「用户在 Settings 里手动开通知权限 → 回到 app
  // → 永远拿不到 APNs token」这条死链就会复发（R4 修过的，patcher 不带这段
  // 就等于 patcher 把 installed 倒退回 R3 之前的状态）。同时引入 instance var
  // lastNotificationAuthStatus 让 didFinishLaunching 跟 didBecomeActive 共享，
  // 避免每次切回前台都 register 一次（R5 修的浪费）。
  if (
    !source.includes("setBadgeCount(0)") &&
    !source.includes("applicationIconBadgeNumber = 0")
  ) {
    const vanillaPattern = /func applicationDidBecomeActive\(_ application: UIApplication\) \{\n\s*\/\/ Restart any tasks[^\n]*\n\s*\}/;
    if (vanillaPattern.test(source)) {
      const replacement = [
        "func applicationDidBecomeActive(_ application: UIApplication) {",
        "        if #available(iOS 16.0, *) {",
        "            UNUserNotificationCenter.current().setBadgeCount(0) { _ in }",
        "        } else {",
        "            application.applicationIconBadgeNumber = 0",
        "        }",
        "",
        "        UNUserNotificationCenter.current().getNotificationSettings { settings in",
        "            let previous = self.lastNotificationAuthStatus",
        "            let current = settings.authorizationStatus",
        "            self.lastNotificationAuthStatus = current",
        "",
        "            let wasGranted =",
        "                previous == .authorized || previous == .provisional",
        "            let isGranted =",
        "                current == .authorized || current == .provisional",
        "",
        "            guard isGranted, !wasGranted else {",
        "                return",
        "            }",
        "            DispatchQueue.main.async {",
        "                UIApplication.shared.registerForRemoteNotifications()",
        "            }",
        "        }",
        "    }",
      ].join("\n");
      source = source.replace(vanillaPattern, replacement);
    }
  }

  // 走查 R5/R6：lastNotificationAuthStatus instance var 是 didFinishLaunching
  // 跟 didBecomeActive 之间的状态桥。class body 没有就 patch 一条进去 ——
  // 紧贴 `var window: UIWindow?` 后面（vanilla Capacitor 模板里这一行肯定有）。
  if (
    fs.existsSync(appDelegatePath) &&
    !source.includes("lastNotificationAuthStatus")
  ) {
    const windowPropertyPattern = /(\n\s*var window: UIWindow\?\n)/;
    if (windowPropertyPattern.test(source)) {
      source = source.replace(
        windowPropertyPattern,
        `$1\n    private var lastNotificationAuthStatus: UNAuthorizationStatus?\n`,
      );
    }
  }

  // 同步给 didFinishLaunching 的 register 块前面塞一条 self.lastNotificationAuthStatus
  // = settings.authorizationStatus，让冷启时种基线；不然 didBecomeActive 第一次
  // 跑时 previous=nil → wasGranted=false → 重复 register 一次。已经写过的 case 跳过。
  if (
    source.includes("UIApplication.shared.registerForRemoteNotifications()") &&
    !source.includes("self.lastNotificationAuthStatus = settings.authorizationStatus")
  ) {
    source = source.replace(
      /(UNUserNotificationCenter\.current\(\)\.getNotificationSettings \{ settings in\n\s*)(guard settings\.authorizationStatus == \.authorized)/,
      "$1self.lastNotificationAuthStatus = settings.authorizationStatus\n            $2",
    );
  }

  if (source !== original) {
    fs.writeFileSync(appDelegatePath, source);
    console.log("patched ios/App/App/AppDelegate.swift");
  } else {
    console.log("kept ios/App/App/AppDelegate.swift");
  }
}

ensureAppDelegatePushHooks();

function insertBefore(source, marker, snippet) {
  if (source.includes(snippet.trim())) {
    return source;
  }

  const index = source.indexOf(marker);
  if (index === -1) {
    throw new Error(`Failed to patch Xcode project, missing marker: ${marker}`);
  }

  return `${source.slice(0, index)}${snippet}${source.slice(index)}`;
}

function insertAfter(source, marker, snippet) {
  if (source.includes(snippet.trim())) {
    return source;
  }

  const index = source.indexOf(marker);
  if (index === -1) {
    throw new Error(`Failed to patch Xcode project, missing marker: ${marker}`);
  }

  const endIndex = index + marker.length;
  return `${source.slice(0, endIndex)}${snippet}${source.slice(endIndex)}`;
}

function formatKnownRegion(region) {
  return region.includes("-") ? `"${region}"` : region;
}

function ensureKnownRegion(project, region) {
  const formattedRegion = formatKnownRegion(region);
  if (
    project.includes(`\t\t\t\t${formattedRegion},\n`) ||
    project.includes(`\t\t\t\t${region},\n`)
  ) {
    return project;
  }

  const marker = "\t\t\tknownRegions = (\n";
  const startIndex = project.indexOf(marker);
  if (startIndex === -1) {
    throw new Error("Failed to patch Xcode project, missing knownRegions.");
  }

  const endIndex = project.indexOf("\t\t\t);", startIndex);
  if (endIndex === -1) {
    throw new Error("Failed to patch Xcode project, malformed knownRegions.");
  }

  return `${project.slice(0, endIndex)}\t\t\t\t${formattedRegion},\n${project.slice(endIndex)}`;
}

function ensurePluginTargetMembership() {
  if (!fs.existsSync(xcodeProjectPath)) {
    console.log("warn  App.xcodeproj/project.pbxproj not found, skipped target membership patch");
    return;
  }

  let project = fs.readFileSync(xcodeProjectPath, "utf8");

  for (const localization of infoPlistStringLocalizations) {
    project = ensureKnownRegion(project, localization.region);
  }

  if (!project.includes("/* YinjieRuntimePlugin.swift in Sources */")) {
    const buildFileEntries = pluginProjectEntries
      .map(
        ({ buildFileId, fileRefId, fileName }) =>
          `\t\t${buildFileId} /* ${fileName} in Sources */ = {isa = PBXBuildFile; fileRef = ${fileRefId} /* ${fileName} */; };\n`,
      )
      .join("");
    project = insertBefore(project, "/* End PBXBuildFile section */", buildFileEntries);
  }

  if (!project.includes("path = YinjieRuntimePlugin.swift;")) {
    const fileReferences = pluginProjectEntries
      .map(
        ({ fileRefId, fileName }) =>
          `\t\t${fileRefId} /* ${fileName} */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = ${fileName}; sourceTree = "<group>"; };\n`,
      )
      .join("");
    project = insertBefore(project, "/* End PBXFileReference section */", fileReferences);
  }

  if (!project.includes("path = PrivacyInfo.xcprivacy;")) {
    const fileReferences = [
      `\t\t${privacyManifestFileRefId} /* PrivacyInfo.xcprivacy */ = {isa = PBXFileReference; lastKnownFileType = text.xml; path = PrivacyInfo.xcprivacy; sourceTree = "<group>"; };\n`,
      `\t\t${entitlementsFileRefId} /* App.entitlements */ = {isa = PBXFileReference; lastKnownFileType = text.plist.entitlements; path = App.entitlements; sourceTree = "<group>"; };\n`,
    ].join("");
    project = insertBefore(project, "/* End PBXFileReference section */", fileReferences);
  }

  if (!project.includes('path = "zh-Hans.lproj/InfoPlist.strings";')) {
    const fileReferences = infoPlistStringLocalizations
      .map(
        ({ fileRefId, region, directory }) =>
          `\t\t${fileRefId} /* ${region} */ = {isa = PBXFileReference; lastKnownFileType = text.plist.strings; name = "${region}"; path = "${directory}/InfoPlist.strings"; sourceTree = "<group>"; };\n`,
      )
      .join("");
    project = insertBefore(project, "/* End PBXFileReference section */", fileReferences);
  }

  if (!project.includes(`${pluginsGroupId} /* Plugins */ = {`)) {
    const pluginChildren = pluginProjectEntries
      .map(({ fileRefId, fileName }) => `\t\t\t\t${fileRefId} /* ${fileName} */,\n`)
      .join("");
    const pluginsGroup = [
      `\t\t${pluginsGroupId} /* Plugins */ = {\n`,
      "\t\t\tisa = PBXGroup;\n",
      "\t\t\tchildren = (\n",
      pluginChildren,
      "\t\t\t);\n",
      "\t\t\tpath = Plugins;\n",
      "\t\t\tsourceTree = \"<group>\";\n",
      "\t\t};\n",
    ].join("");
    project = insertBefore(project, "/* End PBXGroup section */", pluginsGroup);
  }

  if (!project.includes(`${infoPlistStringsVariantGroupId} /* InfoPlist.strings */ = {`)) {
    const localizationChildren = infoPlistStringLocalizations
      .map(({ fileRefId, region }) => `\t\t\t\t${fileRefId} /* ${region} */,\n`)
      .join("");
    const variantGroup = [
      `\t\t${infoPlistStringsVariantGroupId} /* InfoPlist.strings */ = {\n`,
      "\t\t\tisa = PBXVariantGroup;\n",
      "\t\t\tchildren = (\n",
      localizationChildren,
      "\t\t\t);\n",
      "\t\t\tname = InfoPlist.strings;\n",
      "\t\t\tsourceTree = \"<group>\";\n",
      "\t\t};\n",
    ].join("");
    project = insertBefore(project, "/* End PBXVariantGroup section */", variantGroup);
  }

  if (!project.includes(`\t\t\t\t${pluginsGroupId} /* Plugins */,`)) {
    project = insertAfter(
      project,
      "\t\t\t\t504EC3071FED79650016851F /* AppDelegate.swift */,\n",
      `\t\t\t\t${pluginsGroupId} /* Plugins */,\n`,
    );
  }

  if (!project.includes(`\t\t\t\t${privacyManifestFileRefId} /* PrivacyInfo.xcprivacy */,`)) {
    project = insertAfter(
      project,
      "\t\t\t\t504EC3131FED79650016851F /* Info.plist */,\n",
      `\t\t\t\t${privacyManifestFileRefId} /* PrivacyInfo.xcprivacy */,\n\t\t\t\t${entitlementsFileRefId} /* App.entitlements */,\n`,
    );
  }

  if (!project.includes(`\t\t\t\t${infoPlistStringsVariantGroupId} /* InfoPlist.strings */,`)) {
    project = insertAfter(
      project,
      "\t\t\t\t504EC3131FED79650016851F /* Info.plist */,\n",
      `\t\t\t\t${infoPlistStringsVariantGroupId} /* InfoPlist.strings */,\n`,
    );
  }

  if (
    !project.includes(
      `\t\t\t\t${pluginProjectEntries[0].buildFileId} /* ${pluginProjectEntries[0].fileName} in Sources */,\n`,
    )
  ) {
    const sourceEntries = pluginProjectEntries
      .map(
        ({ buildFileId, fileName }) =>
          `\t\t\t\t${buildFileId} /* ${fileName} in Sources */,\n`,
      )
      .join("");
    project = insertAfter(
      project,
      "\t\t\t\t504EC3081FED79650016851F /* AppDelegate.swift in Sources */,\n",
      sourceEntries,
    );
  }

  if (!project.includes(`\t\t${privacyManifestBuildFileId} /* PrivacyInfo.xcprivacy in Resources */ =`)) {
    const buildFileEntry =
      `\t\t${privacyManifestBuildFileId} /* PrivacyInfo.xcprivacy in Resources */ = {isa = PBXBuildFile; fileRef = ${privacyManifestFileRefId} /* PrivacyInfo.xcprivacy */; };\n`;
    project = insertBefore(project, "/* End PBXBuildFile section */", buildFileEntry);
  }

  if (!project.includes(`\t\t${infoPlistStringsBuildFileId} /* InfoPlist.strings in Resources */ =`)) {
    const buildFileEntry =
      `\t\t${infoPlistStringsBuildFileId} /* InfoPlist.strings in Resources */ = {isa = PBXBuildFile; fileRef = ${infoPlistStringsVariantGroupId} /* InfoPlist.strings */; };\n`;
    project = insertBefore(project, "/* End PBXBuildFile section */", buildFileEntry);
  }

  if (!project.includes(`\t\t\t\t${privacyManifestBuildFileId} /* PrivacyInfo.xcprivacy in Resources */,\n`)) {
    project = insertAfter(
      project,
      "\t\t\t\t50379B232058CBB4000EE86E /* capacitor.config.json in Resources */,\n",
      `\t\t\t\t${privacyManifestBuildFileId} /* PrivacyInfo.xcprivacy in Resources */,\n`,
    );
  }

  if (!project.includes(`\t\t\t\t${infoPlistStringsBuildFileId} /* InfoPlist.strings in Resources */,\n`)) {
    project = insertAfter(
      project,
      "\t\t\t\t50379B232058CBB4000EE86E /* capacitor.config.json in Resources */,\n",
      `\t\t\t\t${infoPlistStringsBuildFileId} /* InfoPlist.strings in Resources */,\n`,
    );
  }

  if (!project.includes("CODE_SIGN_ENTITLEMENTS = App/App.entitlements;")) {
    project = project.replace(
      /(CURRENT_PROJECT_VERSION = [^;]+;\n)/g,
      `$1\t\t\t\tCODE_SIGN_ENTITLEMENTS = App/App.entitlements;\n`,
    );
  }

  fs.writeFileSync(xcodeProjectPath, project);
  console.log("patched ios/App/App.xcodeproj/project.pbxproj");
}

ensurePluginTargetMembership();

function optionalEnv(name) {
  const value = (process.env[name] ?? "").trim();
  return value || null;
}

function optionalShellString(...candidates) {
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) {
      continue;
    }
    const value = String(candidate).trim();
    if (value) {
      return value;
    }
  }
  return null;
}

function pickConfigured(envName, ...configCandidates) {
  // env 优先级最高（CI 用），否则按 deep-merged shellConfig 取
  return optionalEnv(envName) ?? optionalShellString(...configCandidates);
}

// 真机走查 Round 2 (2026-05-17)：老版本 escape 写的是
//   key.replace(/[.*+?^${}()|[\\\\]]/g, "\\$&")
// 看似 escape 全部 regex metacharacters，实际上 character class 里第二个 `]`
// 提前关掉了 class —— regex 真实语义变成「matacharacter + `]` 两个字符」，
// 单独的 `.` 跟 `(` 都不会被 match → 不会被 escape。当前 callers 用的 keys
// 全是 ALL_CAPS_WITH_UNDERSCORES（PRODUCT_BUNDLE_IDENTIFIER /
// MARKETING_VERSION / DEVELOPMENT_TEAM / CODE_SIGN_STYLE ...），刚好没踩
// 这个雷；但下一个想加点号或括号的 build-setting key（譬如 Xcode 工具链常见
// 的 "com.apple.product-type.application"）会被静默搞挂 —— replaceBuildSetting
// 拿到字面值 `.` 在 pattern 里被当通配符，覆盖到 pbxproj 里别的位置。
//
// 改成显式列举 regex 元字符的安全 escape 模式（`-` 用 hyphen 收尾避免被
// 当成 range；`]` / `\` 在 class 里显式 backslash escape）。
function escapeForRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
}

function replaceBuildSetting(source, key, value) {
  const pattern = new RegExp(
    `(${escapeForRegex(key)}\\s*=\\s*)(\"[^\"\\n]*\"|[^;\\n]+)(;)`,
    "g",
  );
  if (!pattern.test(source)) {
    return source;
  }

  const formatted = /[^A-Za-z0-9_./-]/.test(value) ? `"${value}"` : value;
  return source.replace(pattern, `$1${formatted}$3`);
}

function ensureBuildSettingPresent(source, key, value) {
  // Round 2 同款：key 进 regex 必须 escape，否则点号 / 括号会被当通配符 → 误匹配。
  const pattern = new RegExp(`${escapeForRegex(key)}\\s*=`);
  if (pattern.test(source)) {
    return replaceBuildSetting(source, key, value);
  }

  // Insert key inside every "buildSettings = { ... };" block for the App target.
  const formatted = /[^A-Za-z0-9_./-]/.test(value) ? `"${value}"` : value;
  return source.replace(
    /(buildSettings = \{\n)/g,
    `$1\t\t\t\t${key} = ${formatted};\n`,
  );
}

function applyReleaseBuildSettings() {
  if (!fs.existsSync(xcodeProjectPath)) {
    return;
  }

  const settings = {
    PRODUCT_BUNDLE_IDENTIFIER: pickConfigured(
      "YINJIE_IOS_BUNDLE_IDENTIFIER",
      shellConfig.appId,
    ),
    MARKETING_VERSION: pickConfigured(
      "YINJIE_IOS_MARKETING_VERSION",
      shellConfig.marketingVersion,
    ),
    CURRENT_PROJECT_VERSION: pickConfigured(
      "YINJIE_IOS_BUILD_NUMBER",
      shellConfig.buildNumber,
    ),
    DEVELOPMENT_TEAM: pickConfigured(
      "YINJIE_IOS_DEVELOPMENT_TEAM",
      iosOptions.developmentTeam,
    ),
    CODE_SIGN_STYLE: pickConfigured(
      "YINJIE_IOS_CODE_SIGN_STYLE",
      iosOptions.codeSignStyle,
    ),
    PROVISIONING_PROFILE_SPECIFIER: pickConfigured(
      "YINJIE_IOS_PROVISIONING_PROFILE_SPECIFIER",
      iosOptions.provisioningProfileSpecifier,
    ),
    CODE_SIGN_IDENTITY: pickConfigured(
      "YINJIE_IOS_CODE_SIGN_IDENTITY",
      iosOptions.codeSignIdentity,
    ),
  };

  const provided = Object.entries(settings).filter(([, value]) => value);
  if (provided.length === 0) {
    return;
  }

  let project = fs.readFileSync(xcodeProjectPath, "utf8");
  const original = project;

  for (const [key, value] of provided) {
    if (key === "DEVELOPMENT_TEAM" ||
        key === "PROVISIONING_PROFILE_SPECIFIER" ||
        key === "CODE_SIGN_IDENTITY") {
      project = ensureBuildSettingPresent(project, key, value);
    } else {
      project = replaceBuildSetting(project, key, value);
    }
  }

  if (project !== original) {
    fs.writeFileSync(xcodeProjectPath, project);
    console.log("patched ios/App/App.xcodeproj/project.pbxproj build settings from release env");
  }
}

function applyEntitlementsFromEnv() {
  if (!fs.existsSync(entitlementsPath)) {
    return;
  }

  const apsEnv = pickConfigured(
    "YINJIE_IOS_APS_ENVIRONMENT",
    iosOptions.apsEnvironment,
  );
  const associatedDomain = pickConfigured(
    "YINJIE_IOS_ASSOCIATED_DOMAIN",
    iosOptions.associatedDomain,
  );
  const bundleId = pickConfigured(
    "YINJIE_IOS_BUNDLE_IDENTIFIER",
    shellConfig.appId,
  );

  let source = fs.readFileSync(entitlementsPath, "utf8");
  const original = source;

  if (apsEnv) {
    source = source.replace(
      /(<key>aps-environment<\/key>\s*<string>)[^<]*(<\/string>)/m,
      `$1${apsEnv}$2`,
    );
  }

  if (associatedDomain) {
    // 直接整体替换 associated-domains 数组内容，不再 append。原实现碰到种子
    // 里的 applinks:app.example.yinjie.app 占位符不会清掉，导致用户每次跑
    // configure 都往里堆一条新 domain（占位符 + 真实域名 + 历史值）。iOS
    // 装机时会对每个 applinks: 拉一次 https://${domain}/.well-known/apple-
    // app-site-association，占位域名根本不解析 / 不返 AASA，平白浪费首装
    // 网络请求，安全审查也会问为什么列那么多没指向的域。
    if (/<key>com\.apple\.developer\.associated-domains<\/key>/m.test(source)) {
      source = source.replace(
        /(<key>com\.apple\.developer\.associated-domains<\/key>\s*<array>)[\s\S]*?(<\/array>)/m,
        `$1\n    <string>${associatedDomain}</string>\n  $2`,
      );
    } else {
      // Round 22 把没用上的 applinks:app.example.yinjie.app 占位整条 entitlement
      // 清掉了，导致 entitlements 里压根没 com.apple.developer.associated-
      // domains 这个 key。这里如果光靠 replace，正则匹配不到任何东西 ——
      // 用户之后再设 YINJIE_IOS_ASSOCIATED_DOMAIN 也加不回来，universal link
      // 永远跑不通。key 不在时手动 insert 一条到 </dict> 前。
      source = source.replace(
        /(\s*)<\/dict>\s*<\/plist>/m,
        `$1  <key>com.apple.developer.associated-domains</key>$1  <array>$1    <string>${associatedDomain}</string>$1  </array>$1</dict>\n</plist>`,
      );
    }
  } else {
    // associatedDomain 没配，但模板里那条 applinks:app.example.yinjie.app 占位
    // 不该跟着 release 包一起上 App Store / TestFlight。Round 9 修了「不要
    // append」，但留了占位 string；占位域名永远不返 AASA，iOS 装机后每次也会
    // 对它发起一次 https://.well-known/apple-app-site-association 请求 —— 真
    // 机日志里能看到「Connection ... failed: nodename nor servname provided」
    // 一类报错。仅在数组里只剩这条 example 占位时整条 entitlement 删掉；如果
    // 已经被人手填过 / 之前 configure 写进真实域名了，就保持不动，避免把用户
    // 已配的 universal link 误清。
    source = source.replace(
      /\n?\s*<key>com\.apple\.developer\.associated-domains<\/key>\s*<array>\s*<string>applinks:app\.example\.yinjie\.app<\/string>\s*<\/array>/m,
      "",
    );
  }

  // Round 45：把老种子里 `<string>$(AppIdentifierPrefix)com.yinjie.ios</string>`
  // 这种写死的 keychain-access-groups 迁移成 `$(AppIdentifierPrefix)$(PRODUCT_
  // BUNDLE_IDENTIFIER)` —— 跟 Round 30 修 Info.plist 同款思路。模板已经用
  // Xcode 变量替换，这里把已有 installed 副本里的硬编码 com.yinjie.ios 一并
  // 迁过去，防止 fork 用户改了 bundle id 之后 keychain-access-groups 还顶着
  // 老名字，SecItemAdd 默认落到 "XXXTEAMID.com.yinjie.ios" 这种跟实际 bundle
  // 不对应的组里（同 Apple Developer 团队下任何一个声明了这条 group 的兄弟
  // app 都能读，App Store 隐私审查会注意到访问组名跟 bundle id 不一致）。
  source = source.replace(
    /<string>\$\(AppIdentifierPrefix\)com\.yinjie\.ios<\/string>/g,
    "<string>$(AppIdentifierPrefix)$(PRODUCT_BUNDLE_IDENTIFIER)</string>",
  );

  // bundleId env 来时再补一道：仍然把残留的 `$(AppIdentifierPrefix)<literal>`
  // （非 $() 形式）改成显式 bundleId —— 罕见，多半是用户手填过一个真实
  // bundle id。但不能误伤刚迁好的 `$(AppIdentifierPrefix)$(PRODUCT_BUNDLE_
  // IDENTIFIER)`，加 negative lookahead 把 Xcode 变量形式跳掉。
  if (bundleId) {
    source = source.replace(
      /<string>\$\(AppIdentifierPrefix\)(?!\$\()[^<]*<\/string>/m,
      `<string>$(AppIdentifierPrefix)${bundleId}</string>`,
    );
  }

  if (source !== original) {
    fs.writeFileSync(entitlementsPath, source);
    console.log("patched ios/App/App/App.entitlements from release env");
  }
}

applyReleaseBuildSettings();
applyEntitlementsFromEnv();

// 标记一次 shell config 实际生效的来源，便于 doctor 排查
console.log(
  `shell config: appId=${shellConfig.appId ?? "(unset)"} marketingVersion=${shellConfig.marketingVersion ?? "(unset)"} buildNumber=${shellConfig.buildNumber ?? "(unset)"} apsEnvironment=${iosOptions.apsEnvironment ?? "(unset)"}`,
);

const readmePath = path.join(pluginsRoot, "README.generated.txt");
fs.writeFileSync(
  readmePath,
  [
    "These files were copied from apps/ios-shell templates.",
    "Plugin files are only seeded when missing so existing implementations are not overwritten.",
    "PrivacyInfo.xcprivacy and App.entitlements are also seeded when missing so the Xcode project has usable defaults.",
    "configure-ios-project.mjs also ensures the Swift plugin files are referenced by App.xcodeproj and included in target membership.",
    "Use docs/ios-plugin-implementation-guide.md and docs/ios-xcode-integration-checklist.md as the source of truth.",
    "",
  ].join("\n"),
);

console.log("");
console.log("iOS project templates copied.");
console.log("Next:");
console.log("1. Open Xcode.");
console.log("2. Confirm the three Yinjie Swift plugins appear under App/Plugins and belong to the App target.");
console.log("3. Replace any seeded plugin stubs with real implementations when needed.");
