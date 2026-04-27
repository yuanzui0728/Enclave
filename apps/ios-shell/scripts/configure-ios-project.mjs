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
const infoPlistStringLocalizations = [
  {
    region: "zh-Hans",
    directory: "zh-Hans.lproj",
    fileRefId: "7A6C0F112B0E4C9200D10031",
    values: {
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
    values: {
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
    values: {
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
    values: {
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
    ["YinjieEnvironment", ""],
    ["YinjiePublicAppName", "隐界"],
    ["NSCameraUsageDescription", "用于拍摄头像或动态图片。"],
    ["NSPhotoLibraryUsageDescription", "用于从相册选择头像或动态图片。"],
    ["NSPhotoLibraryAddUsageDescription", "用于将导出图片保存到相册。"],
    ["NSMicrophoneUsageDescription", "用于语音输入或语音互动功能。"],
  ];

  for (const [key, value] of requiredStrings) {
    plist = ensurePlistStringKey(plist, key, value);
  }

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

  if (!source.includes("didRegisterForRemoteNotificationsWithDeviceToken")) {
    source = insertBeforeClassEnd(
      source,
      [
        "",
        "    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {",
        "        let token = deviceToken.map { String(format: \"%02.2hhx\", $0) }.joined()",
        "        UserDefaults.standard.set(token, forKey: \"YinjiePushToken\")",
        "    }",
        "",
        "    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {",
        "        UserDefaults.standard.removeObject(forKey: \"YinjiePushToken\")",
        "        print(\"Yinjie push registration failed: \\(error.localizedDescription)\")",
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
        "    }",
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
