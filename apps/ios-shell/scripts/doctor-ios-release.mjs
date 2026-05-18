import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const shellRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(shellRoot, "..", "..");
const iosAppRoot = path.join(shellRoot, "ios", "App", "App");
const entitlementsPath = path.join(iosAppRoot, "App.entitlements");
const infoPlistPath = path.join(iosAppRoot, "Info.plist");
const exportOptionsTemplatePath = path.join(
  shellRoot,
  "xcode-template",
  "ExportOptions.plist.example",
);
const projectPath = path.join(
  shellRoot,
  "ios",
  "App",
  "App.xcodeproj",
  "project.pbxproj",
);
const releaseEnvLocalPath = path.join(shellRoot, "ios-release.env.local");
const bundledRuntimeConfigPath = path.join(
  repoRoot,
  "apps",
  "app",
  "dist-mobile",
  "runtime-config.json",
);
const lprojLocales = ["zh-Hans", "en", "ja", "ko"];
const usageDescriptionKeys = [
  "NSCameraUsageDescription",
  "NSPhotoLibraryUsageDescription",
  "NSPhotoLibraryAddUsageDescription",
  "NSMicrophoneUsageDescription",
];
const pluginFileNames = [
  "YinjieRuntimePlugin.swift",
  "YinjieMobileBridgePlugin.swift",
  "YinjieSecureStoragePlugin.swift",
];

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function fileIncludes(filePath, pattern) {
  if (!fs.existsSync(filePath)) {
    return false;
  }
  return fs.readFileSync(filePath, "utf8").includes(pattern);
}

function fileMatches(filePath, regex) {
  if (!fs.existsSync(filePath)) {
    return false;
  }
  return regex.test(fs.readFileSync(filePath, "utf8"));
}

function readFileOrEmpty(filePath) {
  if (!fs.existsSync(filePath)) {
    return "";
  }
  return fs.readFileSync(filePath, "utf8");
}

// 提取 Info.plist 中某 key 紧跟着的 <string>...</string> 文本（首个匹配）。
// 用于 NSCameraUsageDescription 这种 key-string 对的"是否填了文案"检查；
// 不做完整 plist parse，足够覆盖配置忘填的常见情况。
function extractInfoPlistString(content, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `<key>${escaped}</key>\\s*<string>([^<]*)</string>`,
    "m",
  );
  const match = content.match(regex);
  return match ? match[1] : null;
}

function lprojStringsPath(locale) {
  return path.join(iosAppRoot, `${locale}.lproj`, "InfoPlist.strings");
}

const apiBaseUrl = (process.env.YINJIE_IOS_CORE_API_BASE_URL ?? "").trim();
const cloudApiBaseUrl = (process.env.YINJIE_IOS_CLOUD_API_BASE_URL ?? "").trim();
const environment = (process.env.YINJIE_IOS_ENVIRONMENT ?? "").trim();
const bundleId = (process.env.YINJIE_IOS_BUNDLE_IDENTIFIER ?? "").trim();
const marketingVersion = (process.env.YINJIE_IOS_MARKETING_VERSION ?? "").trim();
const buildNumber = (process.env.YINJIE_IOS_BUILD_NUMBER ?? "").trim();
const teamId = (process.env.YINJIE_IOS_DEVELOPMENT_TEAM ?? "").trim();
const codeSignStyle = (process.env.YINJIE_IOS_CODE_SIGN_STYLE ?? "").trim();
const provisioningProfile = (
  process.env.YINJIE_IOS_PROVISIONING_PROFILE_SPECIFIER ?? ""
).trim();
const codeSignIdentity = (process.env.YINJIE_IOS_CODE_SIGN_IDENTITY ?? "").trim();
const apsEnvironment = (process.env.YINJIE_IOS_APS_ENVIRONMENT ?? "").trim();
const exportMethod = (process.env.YINJIE_IOS_EXPORT_METHOD ?? "").trim();
const explicitExportOptions = (
  process.env.YINJIE_IOS_EXPORT_OPTIONS_PLIST ?? ""
).trim();
const associatedDomain = (
  process.env.YINJIE_IOS_ASSOCIATED_DOMAIN ?? ""
).trim();
const apsExpectingProduction = [
  "app-store-connect",
  "app-store",
  "release-testing",
  "ad-hoc",
  "enterprise",
].includes(exportMethod);

// 预解析两个文件，给多个 check 复用
const infoPlistContent = readFileOrEmpty(infoPlistPath);
const entitlementsContent = readFileOrEmpty(entitlementsPath);

// severity 三档：
//   "warn"（默认）：!ok 时计入 fail，进程返回 1
//   "info"：!ok 也不计 fail（仅提示），常用于环境差异/可选项
// ok===true 永远输出 PASS。
const checks = [
  {
    label: "platform",
    ok: process.platform === "darwin",
    // Linux 上跑 doctor 也允许整体 PASS：配置/资产/pbxproj/entitlements 这些都跨平台可查；
    // 真正的 xcodebuild + pod 必须在 macOS 上做，但那是 archive/export 阶段的事。
    severity: process.platform === "darwin" ? "warn" : "info",
    detail:
      process.platform === "darwin"
        ? "running on macOS"
        : `current platform is ${process.platform}; configuration checks still run here, but archive/export must be done on macOS`,
  },
  {
    label: "release-env-file",
    ok: fs.existsSync(releaseEnvLocalPath) || !!process.env.YINJIE_IOS_RELEASE_ENV_FILE,
    detail: fs.existsSync(releaseEnvLocalPath)
      ? `loaded from ${releaseEnvLocalPath}`
      : "expected ios-release.env.local (or YINJIE_IOS_RELEASE_ENV_FILE) — copy ios-release.env.example",
  },
  {
    label: "core-api-base-url",
    ok: nonEmpty(apiBaseUrl) && /^https:\/\//.test(apiBaseUrl),
    detail: nonEmpty(apiBaseUrl)
      ? `YINJIE_IOS_CORE_API_BASE_URL=${apiBaseUrl}`
      : "YINJIE_IOS_CORE_API_BASE_URL must be set to an https:// URL",
  },
  {
    // 原生壳 origin 是 capacitor://，apps/app 里 resolveCloudApiBaseUrl
    // 在 isInsideCapacitorShell() 时显式不允许 origin 回落。release 包必须
    // 显式注入 cloudApiBaseUrl，否则 worlds 列表 / cloud session refresh /
    // push token 注册等所有 cloud-api 入口都会 fetch null 直接报错。
    label: "cloud-api-base-url",
    ok: nonEmpty(cloudApiBaseUrl) && /^https:\/\//.test(cloudApiBaseUrl),
    detail: nonEmpty(cloudApiBaseUrl)
      ? `YINJIE_IOS_CLOUD_API_BASE_URL=${cloudApiBaseUrl}`
      : "YINJIE_IOS_CLOUD_API_BASE_URL must be set to an https:// URL (Capacitor 原生壳没法 origin 回落)",
  },
  {
    label: "environment-production",
    ok: environment === "production",
    detail:
      environment === "production"
        ? "YINJIE_IOS_ENVIRONMENT=production"
        : `release builds should set YINJIE_IOS_ENVIRONMENT=production (current: "${environment}")`,
  },
  {
    label: "bundle-identifier",
    ok: /^[A-Za-z0-9.-]+$/.test(bundleId) && bundleId.includes("."),
    detail: nonEmpty(bundleId)
      ? `YINJIE_IOS_BUNDLE_IDENTIFIER=${bundleId}`
      : "YINJIE_IOS_BUNDLE_IDENTIFIER is required (reverse-DNS, e.g. com.your-org.yinjie)",
  },
  {
    label: "marketing-version",
    ok: /^\d+\.\d+(\.\d+)?$/.test(marketingVersion),
    detail: nonEmpty(marketingVersion)
      ? `YINJIE_IOS_MARKETING_VERSION=${marketingVersion}`
      : "YINJIE_IOS_MARKETING_VERSION is required (e.g. 1.0.0)",
  },
  {
    label: "build-number",
    ok: /^\d+$/.test(buildNumber),
    detail: nonEmpty(buildNumber)
      ? `YINJIE_IOS_BUILD_NUMBER=${buildNumber}`
      : "YINJIE_IOS_BUILD_NUMBER is required (positive integer; must increase per upload)",
  },
  {
    label: "development-team",
    ok: /^[A-Z0-9]{10}$/.test(teamId),
    detail: nonEmpty(teamId)
      ? `YINJIE_IOS_DEVELOPMENT_TEAM=${teamId}`
      : "YINJIE_IOS_DEVELOPMENT_TEAM is required (10-character Apple Developer Team ID)",
  },
  {
    label: "code-sign-style",
    ok: codeSignStyle === "Automatic" || codeSignStyle === "Manual",
    detail: nonEmpty(codeSignStyle)
      ? `YINJIE_IOS_CODE_SIGN_STYLE=${codeSignStyle}`
      : "YINJIE_IOS_CODE_SIGN_STYLE must be Automatic or Manual",
  },
  {
    label: "manual-signing-provisioning-profile",
    ok:
      codeSignStyle !== "Manual" ||
      (nonEmpty(provisioningProfile) && nonEmpty(codeSignIdentity)),
    detail:
      codeSignStyle === "Manual"
        ? nonEmpty(provisioningProfile) && nonEmpty(codeSignIdentity)
          ? `manual signing: profile=${provisioningProfile}, identity=${codeSignIdentity}`
          : "CODE_SIGN_STYLE=Manual requires YINJIE_IOS_PROVISIONING_PROFILE_SPECIFIER and YINJIE_IOS_CODE_SIGN_IDENTITY"
        : "auto-signing — manual profile/identity not required",
  },
  {
    label: "aps-environment",
    ok:
      !apsExpectingProduction ||
      apsEnvironment === "production",
    detail: apsExpectingProduction
      ? apsEnvironment === "production"
        ? "YINJIE_IOS_APS_ENVIRONMENT=production"
        : `export method "${exportMethod}" requires YINJIE_IOS_APS_ENVIRONMENT=production (current: "${apsEnvironment || "(unset)"}")`
      : `non-distribution export method "${exportMethod}"; aps-environment=${apsEnvironment || "development"} is fine`,
  },
  {
    label: "export-method",
    ok:
      exportMethod === "app-store-connect" ||
      exportMethod === "release-testing" ||
      exportMethod === "debugging" ||
      exportMethod === "enterprise" ||
      exportMethod === "app-store" ||
      exportMethod === "ad-hoc" ||
      exportMethod === "development",
    detail: nonEmpty(exportMethod)
      ? `YINJIE_IOS_EXPORT_METHOD=${exportMethod}`
      : "YINJIE_IOS_EXPORT_METHOD must be one of app-store-connect, release-testing, debugging, enterprise (or legacy app-store / ad-hoc / development)",
  },
  {
    label: "export-options-template",
    ok:
      nonEmpty(explicitExportOptions)
        ? fs.existsSync(path.resolve(shellRoot, explicitExportOptions))
        : fs.existsSync(exportOptionsTemplatePath),
    detail: nonEmpty(explicitExportOptions)
      ? `using custom ExportOptions.plist: ${explicitExportOptions}`
      : fs.existsSync(exportOptionsTemplatePath)
        ? `template: ${path.relative(shellRoot, exportOptionsTemplatePath)} (render target: build/ios/ExportOptions.plist)`
        : `missing template at ${exportOptionsTemplatePath}; run \`pnpm ios:configure\``,
  },
  {
    label: "entitlements-aps-environment",
    ok:
      !fs.existsSync(entitlementsPath) ||
      !apsExpectingProduction ||
      fileMatches(
        entitlementsPath,
        /<key>aps-environment<\/key>\s*<string>production<\/string>/m,
      ),
    detail: fs.existsSync(entitlementsPath)
      ? apsExpectingProduction
        ? fileMatches(
            entitlementsPath,
            /<key>aps-environment<\/key>\s*<string>production<\/string>/m,
          )
          ? "App.entitlements aps-environment=production"
          : "App.entitlements aps-environment is not production — re-run `pnpm ios:configure` after setting YINJIE_IOS_APS_ENVIRONMENT=production"
        : "App.entitlements has aps-environment key"
      : "App.entitlements not found — run `pnpm ios:configure` first",
  },
  {
    label: "project-bundle-identifier-match",
    ok:
      !fs.existsSync(projectPath) ||
      !nonEmpty(bundleId) ||
      fileIncludes(projectPath, `PRODUCT_BUNDLE_IDENTIFIER = ${bundleId};`) ||
      fileIncludes(projectPath, `PRODUCT_BUNDLE_IDENTIFIER = "${bundleId}";`),
    detail:
      fs.existsSync(projectPath) && nonEmpty(bundleId)
        ? fileIncludes(projectPath, `PRODUCT_BUNDLE_IDENTIFIER = ${bundleId};`) ||
          fileIncludes(projectPath, `PRODUCT_BUNDLE_IDENTIFIER = "${bundleId}";`)
          ? "Xcode build settings already match YINJIE_IOS_BUNDLE_IDENTIFIER"
          : `pbxproj still references a different bundle id; \`pnpm ios:configure\` will sync it to ${bundleId}`
        : "skipped (project.pbxproj or bundle id missing)",
  },
  // 以下 5 项为 R21 走查新增：在 Linux 上也能定位"忘跑 configure / 忘 build web /
  // 忘加 plugin / associatedDomain 没落 entitlements"这种典型遗漏。
  (() => {
    // Info.plist 模板版本的 NS*UsageDescription 都是 <string></string> 空串，
    // 真正的本地化文案由 InfoPlist.strings 注入。base 留空时 iOS 14+ 会回退到
    // bundle key 名，但 App Store Review 会扣分（"权限文案不清晰"）。
    // configure 把 ios-shell.config.json.localization.permissions 的英文版本作
    // 为 base fallback 写进 Info.plist，所以"全 4 个都还是空"就是配置没跑。
    const empties = !fs.existsSync(infoPlistPath)
      ? usageDescriptionKeys
      : usageDescriptionKeys.filter((key) => {
          const value = extractInfoPlistString(infoPlistContent, key);
          return value === null || value.trim().length === 0;
        });
    return {
      label: "info-plist-usage-descriptions",
      ok: empties.length === 0,
      detail:
        empties.length === 0
          ? "Info.plist NS*UsageDescription base values are populated"
          : `Info.plist NS*UsageDescription still empty: ${empties.join(", ")} — run \`pnpm ios:configure\` to inject base fallback`,
    };
  })(),
  (() => {
    // iOS 上"权限弹窗显示哪种语言"取决于 InfoPlist.strings；少一个 lproj 文件，
    // 那门语言的用户就只看到 base 英文。R20 把 4 语都通过 ios-shell.config.json
    // 注入了 configure，但如果用户从 git clone 后没跑 configure，那 lproj 目录
    // 是空的。这里检查文件存在 + 非空。
    const missing = lprojLocales.filter((locale) => {
      const filePath = lprojStringsPath(locale);
      if (!fs.existsSync(filePath)) return true;
      const stat = fs.statSync(filePath);
      return stat.size === 0;
    });
    return {
      label: "info-plist-strings-coverage",
      ok: missing.length === 0,
      detail:
        missing.length === 0
          ? `InfoPlist.strings present for all locales: ${lprojLocales.join(", ")}`
          : `InfoPlist.strings missing/empty for: ${missing.join(", ")} — run \`pnpm ios:configure\``,
    };
  })(),
  (() => {
    // dist-mobile/runtime-config.json 由 inject-runtime-config.mjs 生成（紧跟在
    // build-mobile-shell-web 之后）。cap sync ios 把它拷进 ios/App/App/public/。
    // 没这个文件，原生 plugin getConfig() 失败时也没 bundle fallback —— 冷启
    // 拿不到 cloudApiBaseUrl，启动到 splash 就卡。
    let ok = false;
    let detail;
    if (!fs.existsSync(bundledRuntimeConfigPath)) {
      detail = `runtime-config.json missing at ${path.relative(repoRoot, bundledRuntimeConfigPath)} — run \`pnpm ios:prepare:web\` first`;
    } else {
      try {
        const parsed = JSON.parse(
          fs.readFileSync(bundledRuntimeConfigPath, "utf8"),
        );
        if (parsed && typeof parsed.cloudApiBaseUrl === "string" && parsed.cloudApiBaseUrl.length > 0) {
          ok = true;
          detail = `runtime-config.json present (cloudApiBaseUrl=${parsed.cloudApiBaseUrl})`;
        } else {
          detail = "runtime-config.json present but missing cloudApiBaseUrl — re-run `pnpm ios:prepare:web` after setting YINJIE_IOS_CLOUD_API_BASE_URL";
        }
      } catch (error) {
        detail = `runtime-config.json invalid JSON: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
    return { label: "bundled-runtime-config", ok, detail };
  })(),
  (() => {
    // 三个 plugin .swift 必须同时出现在 pbxproj 的 PBXFileReference + PBXBuildFile
    // + Sources phase 三处。grep "<filename> in Sources" 命中即说明三层都全。
    // 简单检查文件被引用次数 ≥ 3：fileRef、buildFile、Sources phase entry。
    const projectContent = readFileOrEmpty(projectPath);
    const status = pluginFileNames.map((name) => {
      const matches = projectContent.split(name).length - 1;
      // 期待 4+ 次出现（buildFile 注释 + buildFile.fileRef + fileRef.path + Sources entry）
      return { name, ok: matches >= 4, count: matches };
    });
    const missing = status.filter((s) => !s.ok);
    return {
      label: "pbxproj-plugin-registration",
      ok: fs.existsSync(projectPath) && missing.length === 0,
      detail: !fs.existsSync(projectPath)
        ? "project.pbxproj not found"
        : missing.length === 0
          ? `pbxproj references all 3 plugin sources: ${pluginFileNames.join(", ")}`
          : `pbxproj missing/under-registered: ${missing.map((s) => `${s.name}(${s.count})`).join(", ")} — re-run \`pnpm ios:configure\``,
    };
  })(),
  (() => {
    // 配了 YINJIE_IOS_ASSOCIATED_DOMAIN（Universal Links）就要求 App.entitlements
    // 同步声明。configure 脚本会注入，但用户改了 env 后忘 re-run configure 是常态。
    if (!nonEmpty(associatedDomain)) {
      return {
        label: "entitlements-associated-domains-when-configured",
        ok: true,
        detail: "YINJIE_IOS_ASSOCIATED_DOMAIN not set — Universal Links disabled, skipped",
      };
    }
    if (!fs.existsSync(entitlementsPath)) {
      return {
        label: "entitlements-associated-domains-when-configured",
        ok: false,
        detail: `YINJIE_IOS_ASSOCIATED_DOMAIN=${associatedDomain} but App.entitlements missing — run \`pnpm ios:configure\``,
      };
    }
    const matched = entitlementsContent.includes(associatedDomain);
    return {
      label: "entitlements-associated-domains-when-configured",
      ok: matched,
      detail: matched
        ? `App.entitlements declares ${associatedDomain}`
        : `App.entitlements missing associated-domain "${associatedDomain}" — re-run \`pnpm ios:configure\``,
    };
  })(),
];

const infoChecks = checks.filter((item) => !item.ok && item.severity === "info");
const failures = checks.filter((item) => !item.ok && item.severity !== "info");
const passed = checks.length - infoChecks.length - failures.length;
const total = checks.length - infoChecks.length;
const infoSuffix = infoChecks.length > 0 ? ` (+${infoChecks.length} info)` : "";
console.log(`iOS release doctor: ${passed}/${total} checks passed${infoSuffix}`);
for (const item of checks) {
  let tag;
  if (item.ok) {
    tag = "PASS";
  } else if (item.severity === "info") {
    tag = "INFO";
  } else {
    tag = "WARN";
  }
  console.log(`${tag}  ${item.label}: ${item.detail}`);
}

// 用户必填清单：把所有「-required」类 WARN 抓出来，集中提示该写到 ios-release.env.local
// 还是 ios-shell.config.local.json，避免散落在各项 WARN 里翻不到。
const fillableEnvVars = [
  { name: "YINJIE_IOS_CORE_API_BASE_URL", label: "core-api-base-url" },
  { name: "YINJIE_IOS_CLOUD_API_BASE_URL", label: "cloud-api-base-url" },
  { name: "YINJIE_IOS_ENVIRONMENT", label: "environment-production" },
  { name: "YINJIE_IOS_BUNDLE_IDENTIFIER", label: "bundle-identifier" },
  { name: "YINJIE_IOS_MARKETING_VERSION", label: "marketing-version" },
  { name: "YINJIE_IOS_BUILD_NUMBER", label: "build-number" },
  { name: "YINJIE_IOS_DEVELOPMENT_TEAM", label: "development-team" },
  { name: "YINJIE_IOS_CODE_SIGN_STYLE", label: "code-sign-style" },
  { name: "YINJIE_IOS_APS_ENVIRONMENT", label: "aps-environment" },
  { name: "YINJIE_IOS_EXPORT_METHOD", label: "export-method" },
];
const stillMissing = fillableEnvVars.filter((entry) => {
  const check = checks.find((c) => c.label === entry.label);
  return check && !check.ok;
});
if (stillMissing.length > 0) {
  console.log("");
  console.log("Fill these in ios-release.env.local (or process.env for CI):");
  for (const entry of stillMissing) {
    console.log(`  - ${entry.name}`);
  }
}

console.log("");
console.log("Next steps:");
console.log("1. Fix any WARNs above (most are env var problems).");
console.log("2. Run `pnpm ios:doctor` for the macOS-agnostic shell sanity checks.");
console.log("3. Run `pnpm ios:ipa:release` on macOS to produce the IPA.");

if (failures.length > 0) {
  process.exit(1);
}
