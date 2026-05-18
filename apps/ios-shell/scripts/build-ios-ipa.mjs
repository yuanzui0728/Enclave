import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const currentDir = dirname(fileURLToPath(import.meta.url));
const shellDir = resolve(currentDir, "..");
const iosRoot = resolve(shellDir, "ios", "App");
const buildDir = resolve(shellDir, "build", "ios");
const archivePath = resolve(buildDir, "App.xcarchive");
const exportDir = resolve(buildDir, "Export");
const renderedExportOptionsPath = resolve(buildDir, "ExportOptions.plist");
const exportOptionsTemplatePath = resolve(
  shellDir,
  "xcode-template",
  "ExportOptions.plist.example",
);

const args = process.argv.slice(2);
const stopAt = (() => {
  for (const arg of args) {
    if (arg.startsWith("--stop-at=")) {
      return arg.slice("--stop-at=".length);
    }
  }
  return "ipa";
})();

const skipPrepareWeb = args.includes("--skip-prepare-web");
const skipSync = args.includes("--skip-sync");
const skipConfigure = args.includes("--skip-configure");
const skipPodInstall = args.includes("--skip-pod-install");

function fail(message) {
  console.error(`error  ${message}`);
  process.exit(1);
}

function requireEnv(name) {
  const value = (process.env[name] ?? "").trim();
  if (!value) {
    fail(`${name} is required for iOS release builds`);
  }
  return value;
}

function optionalEnv(name, fallback = "") {
  const value = (process.env[name] ?? "").trim();
  return value || fallback;
}

// 真机走查 Round 4 (2026-05-17)：iOS-shell.config.json / .local.json 都
// 声明 ios.exportMethod，local example 的 _comment 还明确写「所有字段可选，
// 缺失则继承 ios-shell.config.json；env 仍可在最后覆盖」—— 但 build-ios-ipa.mjs
// 老实现只读 YINJIE_IOS_EXPORT_METHOD env，缺失就直接 fallback 到字面量 "ad-hoc"，
// shell config 里的 exportMethod 是 dead code。用户编辑 config 把 exportMethod
// 改成 release-testing / app-store-connect 之后还得记得再 export env，
// 否则 IPA 静默走 ad-hoc，TestFlight / App Store Connect 路径全错。
//
// configure-ios-project.mjs 那边 pickConfigured 已经实现了「env > config」
// 的双层 fallback；build 这边没用上同款 helper。这里把 shellConfig +
// localShellConfig deep-merge 后的 ios.exportMethod 当作 env 之后的兜底。
function readJsonIfExists(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return null;
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

function loadMergedShellConfig() {
  const baseConfig = readJsonIfExists(resolve(shellDir, "ios-shell.config.json")) ?? {};
  const localConfig =
    readJsonIfExists(resolve(shellDir, "ios-shell.config.local.json")) ?? {};
  return deepMerge(baseConfig, localConfig);
}

const mergedShellConfig = loadMergedShellConfig();

function run(command, commandArgs, options = {}) {
  console.log(`$ ${command} ${commandArgs.join(" ")}`);
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd ?? shellDir,
    stdio: "inherit",
    env: process.env,
  });

  if (typeof result.status === "number" && result.status !== 0) {
    fail(`${command} exited with status ${result.status}`);
  }

  if (result.error) {
    fail(`${command} failed: ${result.error.message}`);
  }
}

function ensureBuildDir() {
  if (existsSync(buildDir)) {
    rmSync(buildDir, { recursive: true, force: true });
  }
  mkdirSync(buildDir, { recursive: true });
}

function ensureMacOs() {
  if (process.platform !== "darwin") {
    fail(
      `iOS IPA builds require macOS + Xcode; current platform is ${process.platform}`,
    );
  }
}

function ensureXcodebuild() {
  const result = spawnSync("xcodebuild", ["-version"], { stdio: "pipe" });
  if (typeof result.status !== "number" || result.status !== 0) {
    fail("xcodebuild is not available — install Xcode + command line tools");
  }
}

function ensurePod() {
  const result = spawnSync("pod", ["--version"], { stdio: "pipe" });
  if (typeof result.status !== "number" || result.status !== 0) {
    fail("CocoaPods (pod) is not installed — run `sudo gem install cocoapods`");
  }
}

// Xcode 15+ uses new method names; xcodebuild on Xcode <15 only accepts the
// legacy names. 老实现注释 / ios-release.env.example doc 一直在说「脚本会
// auto-translate 到 legacy names」，工作流 workflow_dispatch 的 choices 也
// 只列了新名字 —— 但实际函数从来没翻译过，直接 return method 原样塞给
// xcodebuild。CI 跑 macos-14（含 Xcode 15）撑住了，但本地 dev 还在 Xcode 14
// 的（或 self-hosted runner / 私有 CI 没升级）一旦 env 里写新名字，xcodebuild
// 直接报 "Unsupported method" 死在 export 阶段。
//
// Apple 在 Xcode 15+ 把 legacy 名字标 deprecated 但保留了向后兼容，所以
// 「永远 emit legacy」是跨版本通吃的最稳路径：用户 env 写新名字 →
// 翻译成 legacy → xcodebuild on Xcode 14 / 15+ 都接受。
function resolveExportMethod(method) {
  const NEW_TO_LEGACY = {
    "app-store-connect": "app-store",
    "release-testing": "ad-hoc",
    debugging: "development",
    enterprise: "enterprise",
  };
  const LEGACY_NAMES = new Set([
    "app-store",
    "ad-hoc",
    "development",
    "enterprise",
  ]);

  if (Object.hasOwn(NEW_TO_LEGACY, method)) {
    return NEW_TO_LEGACY[method];
  }
  if (LEGACY_NAMES.has(method)) {
    return method;
  }

  fail(
    `YINJIE_IOS_EXPORT_METHOD must be one of: app-store-connect, release-testing, debugging, enterprise (or legacy app-store / ad-hoc / development) — current value: "${method}"`,
  );
}

function renderExportOptions(envForRender) {
  const explicitPath = optionalEnv("YINJIE_IOS_EXPORT_OPTIONS_PLIST");
  if (explicitPath) {
    const resolved = resolve(shellDir, explicitPath);
    if (!existsSync(resolved)) {
      fail(`YINJIE_IOS_EXPORT_OPTIONS_PLIST points to a missing file: ${resolved}`);
    }
    return resolved;
  }

  if (!existsSync(exportOptionsTemplatePath)) {
    fail(`Missing ExportOptions template: ${exportOptionsTemplatePath}`);
  }

  let rendered = readFileSync(exportOptionsTemplatePath, "utf8");
  rendered = rendered.replace(
    /<key>method<\/key>\s*<string>[^<]*<\/string>/m,
    `<key>method</key>\n  <string>${envForRender.method}</string>`,
  );
  rendered = rendered.replace(
    /__YINJIE_IOS_DEVELOPMENT_TEAM__/g,
    envForRender.teamId,
  );
  rendered = rendered.replace(
    /__YINJIE_IOS_BUNDLE_IDENTIFIER__/g,
    envForRender.bundleId,
  );
  rendered = rendered.replace(
    /__YINJIE_IOS_PROVISIONING_PROFILE_SPECIFIER__/g,
    envForRender.provisioningProfile ?? "",
  );

  if (envForRender.signingStyle === "Manual") {
    rendered = rendered.replace(
      /<key>signingStyle<\/key>\s*<string>[^<]*<\/string>/m,
      `<key>signingStyle</key>\n  <string>manual</string>`,
    );

    // Uncomment the manual signing block when style=manual.
    //
    // 老实现拿 `<!--\s*[\s\S]*?<key>signingCertificate</key>...<\/dict>\s*-->`
    // 起头匹配「第一个 <!-- 一直延伸到 signingCertificate 那行所在的 -->」，
    // 但模板文件最顶上还有一段「method options」中文 doc 注释、其后又有一段
    // 「手动签名时取消下面 4 行注释」中文小注释 —— 正则的 `<!--` 命中的是
    // 最顶上的 method options 注释，`[\s\S]*?` 一路吃到 signingCertificate
    // 块。然后 replace 里 `^\s*<!--\s*` / `-->\s*$` 也只剥最外层的一对，
    // 导致：
    //   1. method options 中文 doc 注释失去外壳，变成裸露在 <dict> 下的
    //      raw XML 文本，xcodebuild 解析 plist 直接 syntax-error；
    //   2. signingCertificate 块本身的 <!-- ... --> 内层注释还在，依旧整段
    //      被注释掉，xcodebuild manual 导出缺 signingCertificate /
    //      provisioningProfiles 必死。
    //
    // CI workflow ios-release.yml job-level env 写死 CODE_SIGN_STYLE=Manual，
    // 这条路径就是 CI 跑 export 的唯一通路 —— 任何一次 manual 签名导出都
    // 会撞这个 bug，目前从没人在 CI 上把 IPA 真正出过。
    //
    // 改成精确匹配「signingCertificate 块自己的 <!-- ... -->」+ 捕获内层
    // 内容做 single-pass 替换，不会再误伤前面的中文 doc 注释。
    rendered = rendered.replace(
      /<!--\s*(<key>signingCertificate<\/key>[\s\S]*?<\/dict>)\s*-->/m,
      "$1",
    );
  }

  writeFileSync(renderedExportOptionsPath, rendered);
  console.log(`info  rendered ExportOptions.plist -> ${renderedExportOptionsPath}`);
  return renderedExportOptionsPath;
}

function findFirstIpaUnder(directory) {
  if (!existsSync(directory)) {
    return null;
  }

  const entries = readdirSync(directory);
  for (const entry of entries) {
    const entryPath = resolve(directory, entry);
    const stats = statSync(entryPath);
    if (stats.isFile() && entryPath.endsWith(".ipa")) {
      return entryPath;
    }

    if (stats.isDirectory()) {
      const nested = findFirstIpaUnder(entryPath);
      if (nested) {
        return nested;
      }
    }
  }
  return null;
}

function uploadToAppStoreConnectIfRequested(ipaPath) {
  const apiKeyId = optionalEnv("YINJIE_IOS_APPSTORE_API_KEY_ID");
  const issuerId = optionalEnv("YINJIE_IOS_APPSTORE_API_ISSUER_ID");
  const apiKeyPath = optionalEnv("YINJIE_IOS_APPSTORE_API_KEY_PATH");

  if (!apiKeyId && !issuerId && !apiKeyPath) {
    return;
  }

  if (!apiKeyId || !issuerId || !apiKeyPath) {
    console.log(
      "warn  App Store Connect upload requested but YINJIE_IOS_APPSTORE_API_KEY_ID / _ISSUER_ID / _KEY_PATH are not all set; skipping upload.",
    );
    return;
  }

  if (!existsSync(apiKeyPath)) {
    fail(`YINJIE_IOS_APPSTORE_API_KEY_PATH points to a missing file: ${apiKeyPath}`);
  }

  run("xcrun", [
    "altool",
    "--upload-app",
    "--type",
    "ios",
    "--file",
    ipaPath,
    "--apiKey",
    apiKeyId,
    "--apiIssuer",
    issuerId,
  ]);
}

ensureMacOs();
ensureXcodebuild();

// ---- 1. Web bundle + runtime config + native sync ----
if (!skipPrepareWeb) {
  run("pnpm", ["run", "prepare:web"]);
}

if (!skipSync) {
  run("pnpm", ["run", "sync"]);
}

if (!skipConfigure) {
  run("pnpm", ["run", "configure"]);
}

// ---- 2. CocoaPods ----
if (!skipPodInstall) {
  ensurePod();
  run("pod", ["install"], { cwd: iosRoot });
}

if (stopAt === "configure") {
  console.log("info  --stop-at=configure reached; skipping archive/export");
  process.exit(0);
}

// ---- 3. Archive ----
const scheme = optionalEnv("YINJIE_IOS_XCODE_SCHEME", "App");
const configuration = optionalEnv("YINJIE_IOS_XCODE_CONFIGURATION", "Release");
const teamId = requireEnv("YINJIE_IOS_DEVELOPMENT_TEAM");
const bundleId = requireEnv("YINJIE_IOS_BUNDLE_IDENTIFIER");
const marketingVersion = requireEnv("YINJIE_IOS_MARKETING_VERSION");
const buildNumber = requireEnv("YINJIE_IOS_BUILD_NUMBER");
const codeSignStyle = optionalEnv("YINJIE_IOS_CODE_SIGN_STYLE", "Automatic");
const provisioningProfile = optionalEnv(
  "YINJIE_IOS_PROVISIONING_PROFILE_SPECIFIER",
);
const codeSignIdentity = optionalEnv("YINJIE_IOS_CODE_SIGN_IDENTITY");
// 真机走查 R4：env > shellConfig.ios.exportMethod > "ad-hoc"。configure 那边
// 同款 pickConfigured 用法。ios-shell.config.json 默认 "app-store-connect"
// 一直没生效，曾用户编辑 config 想换 release-testing / app-store-connect
// 都得记得再 export env，否则静默走 ad-hoc，TestFlight / App Store 路径全错。
const configuredExportMethod =
  typeof mergedShellConfig?.ios?.exportMethod === "string"
    ? mergedShellConfig.ios.exportMethod.trim()
    : "";
const exportMethod = resolveExportMethod(
  optionalEnv("YINJIE_IOS_EXPORT_METHOD", configuredExportMethod || "ad-hoc"),
);

if (codeSignStyle === "Manual" && !provisioningProfile) {
  fail(
    "CODE_SIGN_STYLE=Manual but YINJIE_IOS_PROVISIONING_PROFILE_SPECIFIER is empty",
  );
}

ensureBuildDir();

const archiveArgs = [
  "-workspace",
  resolve(iosRoot, "App.xcworkspace"),
  "-scheme",
  scheme,
  "-configuration",
  configuration,
  "-destination",
  "generic/platform=iOS",
  "-archivePath",
  archivePath,
  `DEVELOPMENT_TEAM=${teamId}`,
  `PRODUCT_BUNDLE_IDENTIFIER=${bundleId}`,
  `MARKETING_VERSION=${marketingVersion}`,
  `CURRENT_PROJECT_VERSION=${buildNumber}`,
  `CODE_SIGN_STYLE=${codeSignStyle}`,
  "archive",
];

if (codeSignStyle === "Manual") {
  archiveArgs.push(`PROVISIONING_PROFILE_SPECIFIER=${provisioningProfile}`);
  if (codeSignIdentity) {
    archiveArgs.push(`CODE_SIGN_IDENTITY=${codeSignIdentity}`);
  }
}

run("xcodebuild", archiveArgs);
console.log(`info  archive ready at ${archivePath}`);

if (stopAt === "archive") {
  console.log("info  --stop-at=archive reached; skipping export");
  process.exit(0);
}

// ---- 4. Export ----
const exportOptionsPlist = renderExportOptions({
  method: exportMethod,
  teamId,
  bundleId,
  signingStyle: codeSignStyle,
  provisioningProfile,
});

run("xcodebuild", [
  "-exportArchive",
  "-archivePath",
  archivePath,
  "-exportPath",
  exportDir,
  "-exportOptionsPlist",
  exportOptionsPlist,
  "-allowProvisioningUpdates",
]);

const ipaPath = findFirstIpaUnder(exportDir);
if (!ipaPath) {
  fail(`expected an .ipa under ${exportDir} after export, but none was found`);
}

console.log("");
console.log(`info  iOS IPA exported to ${ipaPath}`);

if (stopAt === "export") {
  console.log("info  --stop-at=export reached; skipping App Store Connect upload");
  process.exit(0);
}

// ---- 5. Optional App Store Connect upload ----
uploadToAppStoreConnectIfRequested(ipaPath);

console.log("");
console.log("done.");
