import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { delimiter, dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const currentDir = dirname(fileURLToPath(import.meta.url));
const shellDir = resolve(currentDir, "..");
const workspaceDir = resolve(shellDir, "../..");
const appDir = resolve(shellDir, "../app");
const androidProjectDir = resolve(shellDir, "android");
const androidAssetsPublicDir = resolve(
  androidProjectDir,
  "app/src/main/assets/public",
);
const shellConfigPath = resolve(shellDir, "android-shell.config.json");
const shellConfigLocalPath = resolve(
  shellDir,
  "android-shell.config.local.json",
);
const capacitorConfigPath = resolve(shellDir, "capacitor.config.json");
const appBundledRuntimeConfigPath = resolve(appDir, "dist-mobile/runtime-config.json");
const localToolsDir = resolve(workspaceDir, ".cache/tools");
const localJdkDir = resolve(localToolsDir, "jdk-21");
const localJdkDownloadDir = resolve(localToolsDir, "downloads");
const signingPropertiesPath = resolve(
  shellDir,
  "android-signing.local.properties",
);
const androidBuildGradlePath = resolve(androidProjectDir, "app/build.gradle");
const androidManifestPath = resolve(
  androidProjectDir,
  "app/src/main/AndroidManifest.xml",
);
const androidStringsPath = resolve(
  androidProjectDir,
  "app/src/main/res/values/strings.xml",
);
const androidLocalizedStringsPaths = [
  androidStringsPath,
  resolve(androidProjectDir, "app/src/main/res/values-en-rUS/strings.xml"),
  resolve(androidProjectDir, "app/src/main/res/values-ja-rJP/strings.xml"),
  resolve(androidProjectDir, "app/src/main/res/values-ko-rKR/strings.xml"),
];
const androidLocaleResourceChecks = [
  {
    label: "res/xml/locales_config.xml",
    path: resolve(androidProjectDir, "app/src/main/res/xml/locales_config.xml"),
  },
  {
    label: "res/values-en-rUS/strings.xml",
    path: resolve(
      androidProjectDir,
      "app/src/main/res/values-en-rUS/strings.xml",
    ),
  },
  {
    label: "res/values-ja-rJP/strings.xml",
    path: resolve(
      androidProjectDir,
      "app/src/main/res/values-ja-rJP/strings.xml",
    ),
  },
  {
    label: "res/values-ko-rKR/strings.xml",
    path: resolve(
      androidProjectDir,
      "app/src/main/res/values-ko-rKR/strings.xml",
    ),
  },
];
const androidRuntimePluginPath = resolve(
  androidProjectDir,
  "app/src/main/java/com/yinjie/mobile/YinjieRuntimePlugin.java",
);
const androidGradleWrapperPath = resolve(androidProjectDir, "gradlew");
const androidDebugApkOutputPath = resolve(
  androidProjectDir,
  "app/build/outputs/apk/debug/app-debug.apk",
);
const androidReleaseBundleOutputPath = resolve(
  androidProjectDir,
  "app/build/outputs/bundle/release/app-release.aab",
);
const requiredAndroidManifestPermissions = [
  "android.permission.CAMERA",
  "android.permission.RECORD_AUDIO",
  "android.permission.MODIFY_AUDIO_SETTINGS",
];
const androidSdkCandidatePaths = [
  resolve(homedir(), "Android/Sdk"),
  "/usr/lib/android-sdk",
  "/opt/android-sdk",
  "/opt/android-sdk-linux",
  "/usr/local/android-sdk",
];

const [command = "doctor", ...restArgs] = process.argv.slice(2);

function run(commandName, args, options = {}) {
  const result = spawnSync(commandName, args, {
    cwd: shellDir,
    stdio: "inherit",
    ...options,
  });

  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }

  if (result.error) {
    throw result.error;
  }
}

function hasCommand(commandName, args = ["--version"], env = process.env) {
  const result = spawnSync(commandName, args, {
    cwd: shellDir,
    stdio: "ignore",
    env,
  });

  return result.status === 0;
}

function readJavaMajorVersion(env = process.env) {
  const result = spawnSync("java", ["-version"], {
    cwd: shellDir,
    encoding: "utf8",
    env,
  });

  if (result.status !== 0) {
    return null;
  }

  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const match = output.match(/version "(?<version>\d+(?:\.\d+)?)/);
  const rawVersion = match?.groups?.version;
  if (!rawVersion) {
    return null;
  }

  if (rawVersion.startsWith("1.")) {
    const legacyVersion = Number(rawVersion.split(".")[1]);
    return Number.isFinite(legacyVersion) ? legacyVersion : null;
  }

  const majorVersion = Number(rawVersion.split(".")[0]);
  return Number.isFinite(majorVersion) ? majorVersion : null;
}

function prependToPath(pathEntry, env = process.env) {
  const currentPath = env.PATH ?? process.env.PATH ?? "";
  if (!currentPath) {
    return pathEntry;
  }

  return `${pathEntry}${delimiter}${currentPath}`;
}

function resolveAndroidSdkRoot(env = process.env) {
  const candidates = [
    env.ANDROID_SDK_ROOT,
    env.ANDROID_HOME,
    ...androidSdkCandidatePaths,
  ];
  const seenPaths = new Set();

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeOptionalString(candidate);
    if (!normalizedCandidate || seenPaths.has(normalizedCandidate)) {
      continue;
    }
    seenPaths.add(normalizedCandidate);

    if (!existsSync(normalizedCandidate)) {
      continue;
    }

    if (
      existsSync(resolve(normalizedCandidate, "platform-tools")) ||
      existsSync(resolve(normalizedCandidate, "platforms")) ||
      existsSync(resolve(normalizedCandidate, "build-tools"))
    ) {
      return normalizedCandidate;
    }
  }

  return null;
}

function ensureLocalJdk21() {
  const localJavaPath = resolve(localJdkDir, "bin/java");
  if (existsSync(localJavaPath)) {
    return localJdkDir;
  }

  mkdirSync(localJdkDownloadDir, { recursive: true });

  const archivePath = resolve(localJdkDownloadDir, "temurin-21.tar.gz");
  const tempExtractDir = resolve(localToolsDir, "jdk-extract");

  rmSync(tempExtractDir, { recursive: true, force: true });
  mkdirSync(tempExtractDir, { recursive: true });

  console.log(`info  downloading local JDK 21 to ${localJdkDir}`);
  run("curl", [
    "-fsSL",
    "https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jdk/hotspot/normal/eclipse?project=jdk",
    "-o",
    archivePath,
  ]);
  run("tar", ["-xzf", archivePath, "-C", tempExtractDir]);

  const extractedDirEntry = readdirSync(tempExtractDir, {
    withFileTypes: true,
  }).find((entry) => entry.isDirectory());
  if (!extractedDirEntry) {
    throw new Error("failed to extract JDK 21 archive");
  }

  rmSync(localJdkDir, { recursive: true, force: true });
  renameSync(resolve(tempExtractDir, extractedDirEntry.name), localJdkDir);
  rmSync(tempExtractDir, { recursive: true, force: true });

  return localJdkDir;
}

function buildExecutionEnvironment(options = {}) {
  const { ensureAndroidSdk = false, ensureJava21 = false } = options;
  const env = {
    ...process.env,
  };

  const resolvedAndroidSdkRoot = resolveAndroidSdkRoot(env);
  if (resolvedAndroidSdkRoot) {
    env.ANDROID_SDK_ROOT = resolvedAndroidSdkRoot;
    env.ANDROID_HOME = env.ANDROID_HOME || resolvedAndroidSdkRoot;
    env.PATH = prependToPath(
      resolve(resolvedAndroidSdkRoot, "platform-tools"),
      env,
    );
    env.PATH = prependToPath(resolve(resolvedAndroidSdkRoot, "emulator"), env);
  } else if (ensureAndroidSdk) {
    throw new Error(
      "Android SDK not found. Set ANDROID_SDK_ROOT or install the SDK under ~/Android/Sdk.",
    );
  }

  let javaMajorVersion = readJavaMajorVersion(env);
  let usingLocalJdk = false;

  if (ensureJava21 && (javaMajorVersion === null || javaMajorVersion < 21)) {
    const resolvedLocalJdkDir = ensureLocalJdk21();
    env.JAVA_HOME = resolvedLocalJdkDir;
    env.PATH = prependToPath(resolve(resolvedLocalJdkDir, "bin"), env);
    javaMajorVersion = readJavaMajorVersion(env);
    usingLocalJdk = true;

    if (javaMajorVersion === null || javaMajorVersion < 21) {
      throw new Error("Java 21+ is required, but no usable JDK was found.");
    }
  }

  return {
    env,
    resolvedAndroidSdkRoot,
    javaMajorVersion,
    usingLocalJdk,
    resolvedLocalJdkDir: usingLocalJdk ? (env.JAVA_HOME ?? null) : null,
  };
}

function ensureAndroidProject(action) {
  if (action === "add" || action === "configure" || action === "doctor") {
    return;
  }

  if (existsSync(androidProjectDir)) {
    return;
  }

  console.error(
    "Android native project is missing. Run `pnpm android:init` first.",
  );
  process.exit(1);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function readPropertiesFile(filePath) {
  const entries = {};
  const content = readFileSync(filePath, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    entries[key] = value;
  }

  return entries;
}

function writeTextFile(filePath, nextContent) {
  mkdirSync(dirname(filePath), { recursive: true });
  const previousContent = existsSync(filePath)
    ? readFileSync(filePath, "utf8")
    : null;

  if (previousContent === nextContent) {
    return false;
  }

  writeFileSync(filePath, nextContent);
  return true;
}

function readTextFileIfExists(filePath) {
  if (!existsSync(filePath)) {
    return null;
  }

  return readFileSync(filePath, "utf8");
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function replaceRequired(pattern, replacement, source, label) {
  if (!pattern.test(source)) {
    throw new Error(`failed to update ${label}`);
  }

  return source.replace(pattern, replacement);
}

function normalizeOptionalString(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function normalizeOptionalInteger(value) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return null;
  }

  return parsed;
}

function normalizeOptionalBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (["1", "true", "yes", "y", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return false;
  }

  return null;
}

function buildReleaseEnvShellConfigOverride(env = process.env) {
  const runtimeEnvironment = normalizeOptionalString(
    env.YINJIE_ANDROID_ENVIRONMENT,
  );
  const apiBaseUrl = normalizeOptionalString(
    env.YINJIE_ANDROID_CORE_API_BASE_URL,
  );
  const socketBaseUrl = normalizeOptionalString(
    env.YINJIE_ANDROID_SOCKET_BASE_URL,
  );
  const cloudApiBaseUrl = normalizeOptionalString(
    env.YINJIE_ANDROID_CLOUD_API_BASE_URL,
  );
  const appId = normalizeOptionalString(env.YINJIE_ANDROID_APP_ID);
  const appName = normalizeOptionalString(env.YINJIE_ANDROID_APP_NAME);
  const versionName = normalizeOptionalString(env.YINJIE_ANDROID_VERSION_NAME);
  const versionCode = normalizeOptionalInteger(env.YINJIE_ANDROID_VERSION_CODE);
  const allowCleartextTraffic = normalizeOptionalBoolean(
    env.YINJIE_ANDROID_ALLOW_CLEARTEXT_TRAFFIC,
  );

  const override = {};

  if (appId) {
    override.appId = appId;
  }

  if (appName) {
    override.appName = appName;
  }

  if (versionName) {
    override.versionName = versionName;
  }

  if (versionCode !== null) {
    override.versionCode = versionCode;
  }

  if (allowCleartextTraffic !== null) {
    override.allowCleartextTraffic = allowCleartextTraffic;
  }

  if (runtimeEnvironment || apiBaseUrl || socketBaseUrl || cloudApiBaseUrl) {
    override.runtime = {};
  }

  if (runtimeEnvironment) {
    override.runtime.environment = runtimeEnvironment;
  }

  if (apiBaseUrl) {
    override.runtime.apiBaseUrl = apiBaseUrl;
  }

  if (socketBaseUrl) {
    override.runtime.socketBaseUrl = socketBaseUrl;
  }

  if (cloudApiBaseUrl) {
    override.runtime.cloudApiBaseUrl = cloudApiBaseUrl;
  }

  return override;
}

// Round 28：跟 iOS Round 36 对齐。release env example 的 URL 占位是
// https://*.example.yinjie.app，本地 example 占位是 192.168.1.10 / your-domain
// 这种。这条 helper 用来拦掉用户照 example 复制不改 URL 就 build 的情形。
// 未配置 (undefined / null / 空串) 不算 placeholder —— 缺失由 Boolean(url)
// 那条 check 单独拦。
function isPlaceholderUrl(value) {
  if (!value || typeof value !== "string") {
    return false;
  }
  const lower = value.toLowerCase().trim();
  if (!lower) {
    return false;
  }
  // *.example.* / .example.com / api.example.foo —— 单独 "example" 一段是
  // iOS Round 36 那种 placeholder 模板的指纹。
  if (/\.example\./.test(lower) || /\bexample\.(com|org|net|io|app|dev|yinjie\.app)\b/.test(lower)) {
    return true;
  }
  // your-domain.xxx / replace-me / placeholder / changeme：常见占位 token。
  if (/\b(your[-_]?domain|replace[-_]?me|placeholder|changeme|todo[-_]?fill)\b/.test(lower)) {
    return true;
  }
  return false;
}

function hasShellConfigOverride(override) {
  if (!override || typeof override !== "object") {
    return false;
  }

  return Object.keys(override).some((key) => {
    if (key !== "runtime") {
      return true;
    }

    const runtimeOverride = override.runtime;
    return Boolean(
      runtimeOverride &&
      typeof runtimeOverride === "object" &&
      Object.keys(runtimeOverride).length > 0,
    );
  });
}

function buildReleaseSigningEnv(env = process.env) {
  return {
    storeFile: normalizeOptionalString(env.YINJIE_UPLOAD_STORE_FILE),
    storePassword: normalizeOptionalString(env.YINJIE_UPLOAD_STORE_PASSWORD),
    keyAlias: normalizeOptionalString(env.YINJIE_UPLOAD_KEY_ALIAS),
    keyPassword: normalizeOptionalString(env.YINJIE_UPLOAD_KEY_PASSWORD),
  };
}

function hasReleaseSigningEnv(signingEnv) {
  return Boolean(
    signingEnv.storeFile ||
    signingEnv.storePassword ||
    signingEnv.keyAlias ||
    signingEnv.keyPassword,
  );
}

function normalizeShellConfig(rawConfig) {
  const appId = normalizeOptionalString(rawConfig.appId);
  const appName = normalizeOptionalString(rawConfig.appName);
  const versionName = normalizeOptionalString(rawConfig.versionName);
  const versionCode = Number(rawConfig.versionCode);
  const allowCleartextTraffic = Boolean(rawConfig.allowCleartextTraffic);
  const environment =
    normalizeOptionalString(rawConfig.runtime?.environment) || "production";
  const apiBaseUrl = normalizeOptionalString(rawConfig.runtime?.apiBaseUrl);
  const socketBaseUrl = normalizeOptionalString(
    rawConfig.runtime?.socketBaseUrl,
  );
  const cloudApiBaseUrl = normalizeOptionalString(
    rawConfig.runtime?.cloudApiBaseUrl,
  );

  if (!appId) {
    throw new Error("android-shell config requires a non-empty appId");
  }

  if (!appName) {
    throw new Error("android-shell config requires a non-empty appName");
  }

  if (!versionName) {
    throw new Error("android-shell config requires a non-empty versionName");
  }

  if (!Number.isInteger(versionCode) || versionCode < 1) {
    throw new Error("android-shell config requires versionCode >= 1");
  }

  if (!["development", "staging", "production"].includes(environment)) {
    throw new Error(
      "android-shell config runtime.environment must be development, staging, or production",
    );
  }

  return {
    appId,
    appName,
    versionCode,
    versionName,
    allowCleartextTraffic,
    runtime: {
      environment,
      apiBaseUrl,
      socketBaseUrl,
      cloudApiBaseUrl,
    },
  };
}

function loadShellConfig(options = {}) {
  const { includeLocalOverride = true, envOverride = null } = options;

  if (!existsSync(shellConfigPath)) {
    throw new Error("missing apps/android-shell/android-shell.config.json");
  }

  const baseConfig = readJson(shellConfigPath);
  const localConfig =
    includeLocalOverride && existsSync(shellConfigLocalPath)
      ? readJson(shellConfigLocalPath)
      : null;
  const mergedConfig = {
    ...baseConfig,
    ...localConfig,
    ...envOverride,
    runtime: {
      ...(baseConfig.runtime ?? {}),
      ...(localConfig?.runtime ?? {}),
      ...(envOverride?.runtime ?? {}),
    },
  };

  return normalizeShellConfig(mergedConfig);
}

function validateReleaseShellConfig(config) {
  if (config.runtime.environment !== "production") {
    throw new Error(
      "release android bundle requires runtime.environment=production in tracked config or YINJIE_ANDROID_ENVIRONMENT",
    );
  }

  if (!config.runtime.apiBaseUrl) {
    throw new Error(
      "release android bundle requires runtime.apiBaseUrl from tracked config or YINJIE_ANDROID_CORE_API_BASE_URL",
    );
  }

  // Round 9 之后 YinjieRuntimePlugin.getConfig 会读 cloudApiBaseUrl 透给 JS。
  // 原生壳 origin 是 https://localhost，没有同源 cloud-api 后端；setCloudApiBaseUrlProvider
  // 在 Capacitor 壳里只认这一条，缺了就 worlds 列表 / cloud session refresh / 公共账号
  // 刷新整条链路返 null 不发请求，安装包看着能跑实际跑不通。release 必须强制带上。
  if (!config.runtime.cloudApiBaseUrl) {
    throw new Error(
      "release android bundle requires runtime.cloudApiBaseUrl from tracked config or YINJIE_ANDROID_CLOUD_API_BASE_URL (native shell origin is https://localhost, no same-origin cloud-api)",
    );
  }

  if (config.allowCleartextTraffic) {
    throw new Error(
      "release android bundle requires allowCleartextTraffic=false in tracked config or YINJIE_ANDROID_ALLOW_CLEARTEXT_TRAFFIC=false",
    );
  }
}

function updateCapacitorConfig(config) {
  const previousConfig = readJson(capacitorConfigPath);
  const nextConfig = {
    ...previousConfig,
    appId: config.appId,
    appName: config.appName,
  };

  // androidScheme stays at the tracked value ("https"). Cleartext traffic for
  // local dev is handled by the debug buildType via manifestPlaceholders, not
  // by mutating tracked capacitor.config.json — see build.gradle.

  return writeTextFile(
    capacitorConfigPath,
    `${JSON.stringify(nextConfig, null, 2)}\n`,
  );
}

function buildBundledAppRuntimeConfig(config) {
  const nextRuntimeConfig = {
    publicAppName: config.appName,
    environment: config.runtime.environment,
    applicationId: config.appId,
    appVersionName: config.versionName,
    appVersionCode: config.versionCode,
  };

  if (config.runtime.apiBaseUrl) {
    nextRuntimeConfig.apiBaseUrl = config.runtime.apiBaseUrl;
    nextRuntimeConfig.worldAccessMode = "local";
    nextRuntimeConfig.configStatus = "configured";
  }

  const socketBaseUrl =
    config.runtime.socketBaseUrl || config.runtime.apiBaseUrl;
  if (socketBaseUrl) {
    nextRuntimeConfig.socketBaseUrl = socketBaseUrl;
  }

  if (config.runtime.cloudApiBaseUrl) {
    nextRuntimeConfig.cloudApiBaseUrl = config.runtime.cloudApiBaseUrl;
  }

  return nextRuntimeConfig;
}

function writeBundledAppRuntimeConfig(config) {
  const nextRuntimeConfig = buildBundledAppRuntimeConfig(config);
  return writeTextFile(
    appBundledRuntimeConfigPath,
    `${JSON.stringify(nextRuntimeConfig, null, 2)}\n`,
  );
}

function updateAndroidProjectConfig(config) {
  if (!existsSync(androidProjectDir)) {
    return false;
  }

  const namespace = config.appId;
  const xmlAppName = escapeXml(config.appName);
  const xmlAppId = escapeXml(config.appId);

  let buildGradle = readFileSync(androidBuildGradlePath, "utf8");
  buildGradle = replaceRequired(
    /namespace ".*?"/,
    `namespace "${namespace}"`,
    buildGradle,
    "android namespace",
  );
  buildGradle = replaceRequired(
    /applicationId ".*?"/,
    `applicationId "${config.appId}"`,
    buildGradle,
    "android applicationId",
  );
  buildGradle = replaceRequired(
    /versionCode \d+/,
    `versionCode ${config.versionCode}`,
    buildGradle,
    "android versionCode",
  );
  buildGradle = replaceRequired(
    /versionName ".*?"/,
    `versionName "${config.versionName}"`,
    buildGradle,
    "android versionName",
  );

  // Manifest cleartext is now controlled by manifestPlaceholders per buildType
  // in build.gradle (debug=true, release=false). Tracked AndroidManifest.xml
  // uses ${yinjieUsesCleartextTraffic}; configure no longer rewrites it.

  let changed = writeTextFile(androidBuildGradlePath, buildGradle);

  for (const stringsPath of androidLocalizedStringsPaths) {
    if (!existsSync(stringsPath)) {
      continue;
    }

    let strings = readFileSync(stringsPath, "utf8");
    strings = replaceRequired(
      /(<string name="app_name">)(.*?)(<\/string>)/,
      `$1${xmlAppName}$3`,
      strings,
      "android app_name",
    );
    strings = replaceRequired(
      /(<string name="title_activity_main">)(.*?)(<\/string>)/,
      `$1${xmlAppName}$3`,
      strings,
      "android title_activity_main",
    );
    strings = replaceRequired(
      /(<string name="package_name">)(.*?)(<\/string>)/,
      `$1${xmlAppId}$3`,
      strings,
      "android package_name",
    );
    strings = replaceRequired(
      /(<string name="custom_url_scheme">)(.*?)(<\/string>)/,
      `$1${xmlAppId}$3`,
      strings,
      "android custom_url_scheme",
    );
    changed = writeTextFile(stringsPath, strings) || changed;
  }

  return changed;
}

function configureAndroidShell(options = {}) {
  const config = loadShellConfig(options);
  const changedPaths = [];

  if (updateCapacitorConfig(config)) {
    changedPaths.push(capacitorConfigPath);
  }

  if (updateAndroidProjectConfig(config)) {
    changedPaths.push(androidBuildGradlePath, ...androidLocalizedStringsPaths);
  }

  return { config, changedPaths };
}

function ensureWebBuild(options = {}) {
  run("node", [resolve(workspaceDir, "scripts/build-mobile-shell-web.mjs")], {
    cwd: workspaceDir,
  });

  const config = loadShellConfig(options);
  if (writeBundledAppRuntimeConfig(config)) {
    console.log(`updated  ${appBundledRuntimeConfigPath}`);
  }

  return config;
}

function runGradle(taskName, env = process.env) {
  run(androidGradleWrapperPath, [taskName], {
    cwd: androidProjectDir,
    env,
  });
}

// vite-plugin-compression 给 dist/ 生成了 *.gz / *.br 兄弟文件用于 nginx 静态服务，
// 但 Android Gradle 资源合并器把同名 foo.js 与 foo.js.gz 当成 duplicate resource 拒绝。
// cap sync 完成后顺手把这些预压缩产物从 android assets 里剔掉，让 APK 构建通过。
function stripPrecompressedAssets() {
  if (!existsSync(androidAssetsPublicDir)) {
    return;
  }
  let removed = 0;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (entry.name.endsWith(".gz") || entry.name.endsWith(".br")) {
        rmSync(fullPath, { force: true });
        removed += 1;
      }
    }
  };
  walk(androidAssetsPublicDir);
  if (removed > 0) {
    console.log(`stripped ${removed} precompressed assets (.gz/.br)`);
  }
}

function reportBuildArtifact(label, artifactPath) {
  if (!existsSync(artifactPath)) {
    console.log(`note  expected ${label} output not found at ${artifactPath}`);
    return;
  }

  console.log(`built  ${label}: ${artifactPath}`);
}

if (command === "doctor") {
  let activeShellConfig = null;
  let activeShellConfigError = null;
  let trackedShellConfig = null;
  let trackedShellConfigError = null;
  let releaseEnvShellConfig = null;
  let releaseEnvShellConfigError = null;
  let signingProperties = null;
  const releaseEnvOverride = buildReleaseEnvShellConfigOverride();
  const hasReleaseEnvOverride = hasShellConfigOverride(releaseEnvOverride);
  const signingEnv = buildReleaseSigningEnv();
  const hasSigningEnv = hasReleaseSigningEnv(signingEnv);
  const javaMajorVersion = readJavaMajorVersion();
  const resolvedAndroidSdkRoot = resolveAndroidSdkRoot();
  const cachedLocalJdkPath = existsSync(resolve(localJdkDir, "bin/java"))
    ? localJdkDir
    : null;
  const cachedLocalJdkEnv = cachedLocalJdkPath
    ? {
        ...process.env,
        JAVA_HOME: cachedLocalJdkPath,
        PATH: prependToPath(resolve(cachedLocalJdkPath, "bin")),
      }
    : null;
  const cachedLocalJdkJavaMajorVersion = cachedLocalJdkEnv
    ? readJavaMajorVersion(cachedLocalJdkEnv)
    : null;
  const androidManifest = readTextFileIfExists(androidManifestPath);
  const androidBuildGradle = readTextFileIfExists(androidBuildGradlePath);
  const androidRuntimePlugin = readTextFileIfExists(androidRuntimePluginPath);
  const capacitorConfig = existsSync(capacitorConfigPath)
    ? readJson(capacitorConfigPath)
    : null;
  const hasLocalShellConfig = existsSync(shellConfigLocalPath);

  try {
    activeShellConfig = loadShellConfig();
  } catch (error) {
    activeShellConfigError =
      error instanceof Error ? error.message : String(error);
  }

  try {
    trackedShellConfig = loadShellConfig({ includeLocalOverride: false });
  } catch (error) {
    trackedShellConfigError =
      error instanceof Error ? error.message : String(error);
  }

  if (hasReleaseEnvOverride) {
    try {
      releaseEnvShellConfig = loadShellConfig({
        includeLocalOverride: false,
        envOverride: releaseEnvOverride,
      });
    } catch (error) {
      releaseEnvShellConfigError =
        error instanceof Error ? error.message : String(error);
    }
  }

  if (existsSync(signingPropertiesPath)) {
    try {
      signingProperties = readPropertiesFile(signingPropertiesPath);
    } catch {
      signingProperties = null;
    }
  }

  const checks = [
    [
      "android-shell.config.json",
      existsSync(shellConfigPath) && !trackedShellConfigError,
    ],
    ...(hasLocalShellConfig
      ? [["android-shell active config", !activeShellConfigError]]
      : []),
    ...(hasReleaseEnvOverride
      ? [["android-shell release env override", !releaseEnvShellConfigError]]
      : []),
    [
      "capacitor.config.json",
      existsSync(resolve(shellDir, "capacitor.config.json")),
    ],
    ["apps/app/dist-mobile", existsSync(resolve(appDir, "dist-mobile"))],
    [
      "apps/app/dist-mobile/runtime-config.json",
      existsSync(appBundledRuntimeConfigPath),
    ],
    ["android project", existsSync(androidProjectDir)],
    [
      "runtime plugin sync",
      Boolean(
        androidRuntimePlugin?.includes("public/runtime-config.json") &&
        androidRuntimePlugin.includes("readRuntimeValue"),
      ),
    ],
    [
      "runtime plugin locale bridge",
      Boolean(
        androidRuntimePlugin?.includes("getLocale") &&
        androidRuntimePlugin.includes("setLocale") &&
        androidRuntimePlugin.includes(
          "AppCompatDelegate.setApplicationLocales",
        ),
      ),
    ],
    [
      "keyboard resizeOnFullScreen",
      capacitorConfig?.plugins?.Keyboard?.resizeOnFullScreen === true,
    ],
    ["java runtime", hasCommand("java", ["-version"])],
    [
      "java runtime >= 21",
      (javaMajorVersion !== null && javaMajorVersion >= 21) ||
        (cachedLocalJdkJavaMajorVersion !== null &&
          cachedLocalJdkJavaMajorVersion >= 21),
    ],
    ["android sdk", Boolean(resolvedAndroidSdkRoot)],
  ];

  if (activeShellConfig?.runtime.environment === "production") {
    checks.push([
      "active production apiBaseUrl",
      Boolean(activeShellConfig.runtime.apiBaseUrl),
    ]);
    // Round 17：跟 validateReleaseShellConfig 对齐，提早曝光 cloudApiBaseUrl 缺失。
    checks.push([
      "active production cloudApiBaseUrl",
      Boolean(activeShellConfig.runtime.cloudApiBaseUrl),
    ]);
    checks.push([
      "active production cleartext traffic disabled",
      !activeShellConfig.allowCleartextTraffic,
    ]);
    // Round 28：active production URL 也要拦 placeholder。
    checks.push([
      "active production apiBaseUrl is not placeholder",
      !isPlaceholderUrl(activeShellConfig.runtime.apiBaseUrl),
    ]);
    checks.push([
      "active production cloudApiBaseUrl is not placeholder",
      !isPlaceholderUrl(activeShellConfig.runtime.cloudApiBaseUrl),
    ]);
  }

  if (
    hasLocalShellConfig &&
    trackedShellConfig?.runtime.environment === "production"
  ) {
    checks.push([
      "tracked production apiBaseUrl",
      Boolean(trackedShellConfig.runtime.apiBaseUrl),
    ]);
    checks.push([
      "tracked production cloudApiBaseUrl",
      Boolean(trackedShellConfig.runtime.cloudApiBaseUrl),
    ]);
    checks.push([
      "tracked production cleartext traffic disabled",
      !trackedShellConfig.allowCleartextTraffic,
    ]);
    // Round 28：tracked production URL 也要拦 placeholder。
    checks.push([
      "tracked production apiBaseUrl is not placeholder",
      !isPlaceholderUrl(trackedShellConfig.runtime.apiBaseUrl),
    ]);
    checks.push([
      "tracked production cloudApiBaseUrl is not placeholder",
      !isPlaceholderUrl(trackedShellConfig.runtime.cloudApiBaseUrl),
    ]);
  }

  if (
    hasReleaseEnvOverride &&
    releaseEnvShellConfig?.runtime.environment === "production"
  ) {
    checks.push([
      "release env production apiBaseUrl",
      Boolean(releaseEnvShellConfig.runtime.apiBaseUrl),
    ]);
    checks.push([
      "release env production cloudApiBaseUrl",
      Boolean(releaseEnvShellConfig.runtime.cloudApiBaseUrl),
    ]);
    checks.push([
      "release env production cleartext traffic disabled",
      !releaseEnvShellConfig.allowCleartextTraffic,
    ]);

    // Round 28：跟 iOS Round 36 对齐。android-release.env.example 里所有 URL
    // 占位都是 https://*.example.yinjie.app —— 用户照样 cp env.example
    // env.local 然后忘了改 URL，validate "Boolean(url)" 这条 check 不看内容，
    // 静默放行后 release APK 装到真机所有请求 DNS NXDOMAIN，前端只能看到
    // fetch reject「network-error」，根本不知道是 URL 占位没替换。这里拦
    // *.example.* / placeholder.* / your-domain.* / replace-me 这几种典型
    // 占位模式，强制 release build 之前必须用真实 URL。
    checks.push([
      "release env apiBaseUrl is not placeholder",
      !isPlaceholderUrl(releaseEnvShellConfig.runtime.apiBaseUrl),
    ]);
    checks.push([
      "release env socketBaseUrl is not placeholder",
      !isPlaceholderUrl(releaseEnvShellConfig.runtime.socketBaseUrl),
    ]);
    checks.push([
      "release env cloudApiBaseUrl is not placeholder",
      !isPlaceholderUrl(releaseEnvShellConfig.runtime.cloudApiBaseUrl),
    ]);
  }

  if (androidManifest) {
    checks.push([
      "manifest localeConfig",
      androidManifest.includes('android:localeConfig="@xml/locales_config"'),
    ]);
    for (const permission of requiredAndroidManifestPermissions) {
      checks.push([
        `manifest ${permission}`,
        androidManifest.includes(`android:name="${permission}"`),
      ]);
    }

    // Round 19：缺这条 meta-data，background 系统通知会回落到 SDK 的
    // fcm_fallback_notification_channel（IMPORTANCE_DEFAULT + 英文 Miscellaneous），
    // 跟我们前台 / 本地推送的 yinjie_messages 高优先级 channel 脱节。
    checks.push([
      "manifest fcm default channel = yinjie_messages",
      /com\.google\.firebase\.messaging\.default_notification_channel_id[\s\S]*?android:value="yinjie_messages"/.test(
        androidManifest,
      ),
    ]);

    // Round 24：缺 default_notification_icon meta-data，FCM SDK 在 app 处于
    // background 直接走系统通知栏时，smallIcon 默认取 launcher。彩色 launcher
    // PNG 在 Android 5+ 会被 mask 成纯白方块，没有任何品牌识别度。这两条
    // meta-data 必须指到 alpha-only 的 ic_stat_notification + 品牌 accent color。
    checks.push([
      "manifest fcm default icon = ic_stat_notification",
      /com\.google\.firebase\.messaging\.default_notification_icon[\s\S]*?android:resource="@drawable\/ic_stat_notification"/.test(
        androidManifest,
      ),
    ]);
    checks.push([
      "manifest fcm default color = notification_accent",
      /com\.google\.firebase\.messaging\.default_notification_color[\s\S]*?android:resource="@color\/notification_accent"/.test(
        androidManifest,
      ),
    ]);

    // Round 27：Android 11+ package visibility 强制要求 manifest 声明
    // <queries>，否则 resolveActivity 一律返回 null（捏死 captureImage 这条
    // 路径），startActivity 对部分 scheme / mimeType 也会 ActivityNotFoundException。
    // 这些条目跟 plugin 真实用到的 intent 一一对应。
    checks.push([
      "manifest queries declared",
      /<queries>[\s\S]*?<\/queries>/.test(androidManifest),
    ]);
    checks.push([
      "manifest queries IMAGE_CAPTURE",
      /<queries>[\s\S]*?android\.media\.action\.IMAGE_CAPTURE[\s\S]*?<\/queries>/.test(
        androidManifest,
      ),
    ]);
    checks.push([
      "manifest queries tel scheme",
      /<queries>[\s\S]*?android:scheme="tel"[\s\S]*?<\/queries>/.test(
        androidManifest,
      ),
    ]);
    checks.push([
      "manifest queries mailto scheme",
      /<queries>[\s\S]*?android:scheme="mailto"[\s\S]*?<\/queries>/.test(
        androidManifest,
      ),
    ]);

    // Round 31：<uses-permission CAMERA> 必须配 <uses-feature CAMERA required=false>，
    // 否则 Play Store 把无摄像头设备过滤出可安装名单，listing 看不到。
    // record_audio 同款逻辑。
    checks.push([
      "manifest uses-feature camera optional",
      /<uses-feature[^>]*android:name="android\.hardware\.camera"[^>]*android:required="false"/.test(
        androidManifest,
      ),
    ]);
    checks.push([
      "manifest uses-feature microphone optional",
      /<uses-feature[^>]*android:name="android\.hardware\.microphone"[^>]*android:required="false"/.test(
        androidManifest,
      ),
    ]);

    // Round 36：MainActivity 必须 windowSoftInputMode=adjustResize，
    // Capacitor Keyboard plugin 的 resize:"native" 依赖 manifest 上写明这条，
    // 否则部分 OEM (Samsung/Huawei/Xiaomi 早期 MIUI) 默认 adjustPan，
    // 键盘弹起盖住输入框用户看不到打字。
    checks.push([
      "manifest MainActivity windowSoftInputMode adjustResize",
      /<activity[^>]*android:name=".MainActivity"[^>]*android:windowSoftInputMode="adjustResize"/.test(
        androidManifest,
      ) ||
        /<activity[^>]*android:windowSoftInputMode="adjustResize"[^>]*android:name=".MainActivity"/.test(
          androidManifest,
        ),
    ]);

    // Hardening: manifest cleartext must be a build-variant placeholder, not
    // a hardcoded literal that can drift in tracked git history.
    checks.push([
      "manifest cleartext placeholder",
      androidManifest.includes(
        'android:usesCleartextTraffic="${yinjieUsesCleartextTraffic}"',
      ),
    ]);
    checks.push([
      "manifest no literal cleartext=true",
      !/android:usesCleartextTraffic="true"/.test(androidManifest),
    ]);

    // Hardening: tracked manifest must not embed dev/loopback API endpoints.
    // Runtime config is sourced from assets/public/runtime-config.json.
    const devEndpointPattern =
      /http:\/\/(?:10\.0\.2\.2|127\.0\.0\.1|localhost|192\.168\.|10\.|172\.(?:1[6-9]|2\d|3[01])\.)/i;
    checks.push([
      "manifest no dev endpoints",
      !devEndpointPattern.test(androidManifest),
    ]);
  }

  if (capacitorConfig) {
    // Hardening: tracked capacitor.config.json must default to https. Local
    // dev should use capacitor.config.local.json or build-variant overrides.
    checks.push([
      "capacitor androidScheme https",
      capacitorConfig.server?.androidScheme === "https",
    ]);
  }

  if (androidBuildGradle) {
    // Hardening: manifestPlaceholders must define the cleartext flag for both
    // buildTypes so the manifest placeholder always resolves at build time.
    const debugPlaceholders =
      /buildTypes\s*\{[\s\S]*?debug\s*\{[\s\S]*?manifestPlaceholders\s*=\s*\[[^\]]*yinjieUsesCleartextTraffic\s*:\s*"true"/m;
    const releasePlaceholders =
      /buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?manifestPlaceholders\s*=\s*\[[^\]]*yinjieUsesCleartextTraffic\s*:\s*"false"/m;
    checks.push([
      "build.gradle debug cleartext=true placeholder",
      debugPlaceholders.test(androidBuildGradle),
    ]);
    checks.push([
      "build.gradle release cleartext=false placeholder",
      releasePlaceholders.test(androidBuildGradle),
    ]);
  }

  for (const localeResource of androidLocaleResourceChecks) {
    checks.push([
      `android locale ${localeResource.label}`,
      existsSync(localeResource.path),
    ]);
  }

  if (signingProperties) {
    const requiredSigningKeys = [
      "YINJIE_UPLOAD_STORE_FILE",
      "YINJIE_UPLOAD_STORE_PASSWORD",
      "YINJIE_UPLOAD_KEY_ALIAS",
      "YINJIE_UPLOAD_KEY_PASSWORD",
    ];
    const hasSigningKeys = requiredSigningKeys.every((key) =>
      Boolean(signingProperties[key]),
    );
    checks.push(["release signing properties complete", hasSigningKeys]);

    const resolvedStoreFile = signingProperties.YINJIE_UPLOAD_STORE_FILE
      ? resolve(shellDir, signingProperties.YINJIE_UPLOAD_STORE_FILE)
      : null;
    checks.push([
      "release keystore file",
      Boolean(resolvedStoreFile && existsSync(resolvedStoreFile)),
    ]);
  }

  if (hasSigningEnv) {
    const hasSigningKeys = Boolean(
      signingEnv.storeFile &&
      signingEnv.storePassword &&
      signingEnv.keyAlias &&
      signingEnv.keyPassword,
    );
    const resolvedStoreFile = signingEnv.storeFile
      ? resolve(shellDir, signingEnv.storeFile)
      : null;
    checks.push(["release signing env complete", hasSigningKeys]);
    checks.push([
      "release signing env keystore file",
      Boolean(resolvedStoreFile && existsSync(resolvedStoreFile)),
    ]);
  }

  for (const [label, ok] of checks) {
    console.log(`${ok ? "ok" : "missing"}  ${label}`);
  }

  if (trackedShellConfigError) {
    console.log(`error  ${trackedShellConfigError}`);
  }

  if (
    activeShellConfigError &&
    activeShellConfigError !== trackedShellConfigError
  ) {
    console.log(
      `error  android-shell active config: ${activeShellConfigError}`,
    );
  }

  if (
    releaseEnvShellConfigError &&
    releaseEnvShellConfigError !== trackedShellConfigError &&
    releaseEnvShellConfigError !== activeShellConfigError
  ) {
    console.log(
      `error  android-shell release env override: ${releaseEnvShellConfigError}`,
    );
  }

  if (javaMajorVersion !== null) {
    console.log(`info  detected java major version: ${javaMajorVersion}`);
  }

  if (resolvedAndroidSdkRoot) {
    console.log(`info  resolved android sdk: ${resolvedAndroidSdkRoot}`);
  }

  if (cachedLocalJdkPath && cachedLocalJdkJavaMajorVersion !== null) {
    console.log(
      `info  resolved local jdk cache: ${cachedLocalJdkPath} (java ${cachedLocalJdkJavaMajorVersion})`,
    );
  } else if (javaMajorVersion === null || javaMajorVersion < 21) {
    console.log(
      `note  local JDK 21 cache not found; android:apk/android:bundle will download one into ${localJdkDir}`,
    );
  }

  if (!existsSync(androidProjectDir)) {
    console.log(
      "next  run `pnpm android:init` to generate the native Android project",
    );
  }

  if (hasLocalShellConfig) {
    console.log("ok  android-shell.config.local.json");
  } else {
    console.log(
      "note  android-shell.config.local.json not found; using repository defaults",
    );
  }

  if (
    hasLocalShellConfig &&
    activeShellConfig &&
    trackedShellConfig &&
    (activeShellConfig.allowCleartextTraffic !==
      trackedShellConfig.allowCleartextTraffic ||
      activeShellConfig.runtime.environment !==
        trackedShellConfig.runtime.environment ||
      activeShellConfig.runtime.apiBaseUrl !==
        trackedShellConfig.runtime.apiBaseUrl ||
      activeShellConfig.runtime.socketBaseUrl !==
        trackedShellConfig.runtime.socketBaseUrl)
  ) {
    console.log(
      "note  android-shell.config.local.json overrides tracked runtime defaults during doctor",
    );
  }

  if (hasReleaseEnvOverride) {
    console.log(
      "note  YINJIE_ANDROID_* environment variables are overriding tracked release runtime config",
    );
  } else {
    console.log(
      "note  set YINJIE_ANDROID_CORE_API_BASE_URL to override tracked release runtime config for bundle builds",
    );
  }

  if (existsSync(signingPropertiesPath)) {
    console.log("ok  android-signing.local.properties");
  } else {
    console.log(
      "note  android-signing.local.properties not found; release signing can also come from YINJIE_UPLOAD_* env vars",
    );
  }

  if (hasSigningEnv) {
    console.log(
      "note  YINJIE_UPLOAD_* environment variables are overriding local signing file requirements",
    );
  }

  if (activeShellConfig?.allowCleartextTraffic) {
    console.log(
      "note  allowCleartextTraffic is enabled; use only for local or explicitly trusted environments",
    );
  }

  process.exit(0);
}

if (command === "configure") {
  const { changedPaths } = configureAndroidShell();

  if (changedPaths.length === 0) {
    console.log("android shell config already up to date");
  } else {
    for (const changedPath of changedPaths) {
      console.log(`updated  ${changedPath}`);
    }
  }

  process.exit(0);
}

const shouldUseTrackedConfigOnly = command === "bundle";
const releaseEnvOverride = buildReleaseEnvShellConfigOverride();
const hasReleaseEnvOverride = hasShellConfigOverride(releaseEnvOverride);
configureAndroidShell({
  includeLocalOverride: !shouldUseTrackedConfigOnly,
  envOverride:
    shouldUseTrackedConfigOnly && hasReleaseEnvOverride
      ? releaseEnvOverride
      : null,
});
ensureAndroidProject(command);

const executionEnvironment = buildExecutionEnvironment({
  ensureAndroidSdk: ["add", "sync", "open", "apk", "bundle"].includes(command),
  ensureJava21: ["apk", "bundle"].includes(command),
});

if (command === "sync") {
  ensureWebBuild();
}

if (command === "apk") {
  ensureWebBuild();
  run("pnpm", ["exec", "cap", "sync", "android"], {
    cwd: shellDir,
    env: executionEnvironment.env,
  });
  stripPrecompressedAssets();
  if (
    executionEnvironment.usingLocalJdk &&
    executionEnvironment.resolvedLocalJdkDir
  ) {
    console.log(
      `info  using local JDK for apk build: ${executionEnvironment.resolvedLocalJdkDir}`,
    );
  }
  runGradle("assembleDebug", executionEnvironment.env);
  reportBuildArtifact("android debug apk", androidDebugApkOutputPath);
  process.exit(0);
}

if (command === "bundle") {
  const releaseConfig = loadShellConfig({
    includeLocalOverride: false,
    envOverride: hasReleaseEnvOverride ? releaseEnvOverride : null,
  });
  validateReleaseShellConfig(releaseConfig);
  ensureWebBuild({
    includeLocalOverride: false,
    envOverride: hasReleaseEnvOverride ? releaseEnvOverride : null,
  });
  run("pnpm", ["exec", "cap", "sync", "android"], {
    cwd: shellDir,
    env: executionEnvironment.env,
  });
  stripPrecompressedAssets();
  if (
    executionEnvironment.usingLocalJdk &&
    executionEnvironment.resolvedLocalJdkDir
  ) {
    console.log(
      `info  using local JDK for bundle build: ${executionEnvironment.resolvedLocalJdkDir}`,
    );
  }
  runGradle("bundleRelease", executionEnvironment.env);
  reportBuildArtifact("android release bundle", androidReleaseBundleOutputPath);
  process.exit(0);
}

run("pnpm", ["exec", "cap", command, ...restArgs], {
  cwd: shellDir,
  env: executionEnvironment.env,
});

if (command === "sync") {
  stripPrecompressedAssets();
}

if (command === "add" && restArgs[0] === "android") {
  const { changedPaths } = configureAndroidShell();

  for (const changedPath of changedPaths) {
    console.log(`updated  ${changedPath}`);
  }
}
