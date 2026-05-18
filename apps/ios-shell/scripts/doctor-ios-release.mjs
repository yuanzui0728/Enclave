import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const shellRoot = path.resolve(scriptDir, "..");
const iosAppRoot = path.join(shellRoot, "ios", "App", "App");
const entitlementsPath = path.join(iosAppRoot, "App.entitlements");
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
const apsExpectingProduction = [
  "app-store-connect",
  "app-store",
  "release-testing",
  "ad-hoc",
  "enterprise",
].includes(exportMethod);

const checks = [
  {
    label: "platform",
    ok: process.platform === "darwin",
    detail:
      process.platform === "darwin"
        ? "running on macOS"
        : `current platform is ${process.platform}; xcodebuild only runs on macOS`,
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
];

const passed = checks.filter((item) => item.ok).length;
console.log(`iOS release doctor: ${passed}/${checks.length} checks passed`);
for (const item of checks) {
  console.log(`${item.ok ? "PASS" : "WARN"}  ${item.label}: ${item.detail}`);
}

console.log("");
console.log("Next steps:");
console.log("1. Fix any WARNs above (most are env var problems).");
console.log("2. Run `pnpm ios:doctor` for the macOS-agnostic shell sanity checks.");
console.log("3. Run `pnpm ios:ipa:release` on macOS to produce the IPA.");

if (passed !== checks.length) {
  process.exit(1);
}
