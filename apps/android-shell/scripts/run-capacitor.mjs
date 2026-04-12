import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const currentDir = dirname(fileURLToPath(import.meta.url));
const shellDir = resolve(currentDir, "..");
const workspaceDir = resolve(shellDir, "../..");
const appDir = resolve(shellDir, "../app");
const androidProjectDir = resolve(shellDir, "android");
const shellConfigPath = resolve(shellDir, "android-shell.config.json");
const shellConfigLocalPath = resolve(shellDir, "android-shell.config.local.json");
const capacitorConfigPath = resolve(shellDir, "capacitor.config.json");
const appBundledRuntimeConfigPath = resolve(appDir, "dist/runtime-config.json");
const signingPropertiesPath = resolve(shellDir, "android-signing.local.properties");
const androidBuildGradlePath = resolve(androidProjectDir, "app/build.gradle");
const androidManifestPath = resolve(androidProjectDir, "app/src/main/AndroidManifest.xml");
const androidStringsPath = resolve(androidProjectDir, "app/src/main/res/values/strings.xml");
const androidGradleWrapperPath = resolve(androidProjectDir, "gradlew");
const requiredAndroidManifestPermissions = [
  "android.permission.CAMERA",
  "android.permission.RECORD_AUDIO",
  "android.permission.MODIFY_AUDIO_SETTINGS",
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

function hasCommand(commandName, args = ["--version"]) {
  const result = spawnSync(commandName, args, {
    cwd: shellDir,
    stdio: "ignore",
  });

  return result.status === 0;
}

function readJavaMajorVersion() {
  const result = spawnSync("java", ["-version"], {
    cwd: shellDir,
    encoding: "utf8",
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

function ensureAndroidProject(action) {
  if (action === "add" || action === "configure" || action === "doctor") {
    return;
  }

  if (existsSync(androidProjectDir)) {
    return;
  }

  console.error("Android native project is missing. Run `pnpm android:init` first.");
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
  const previousContent = existsSync(filePath) ? readFileSync(filePath, "utf8") : null;

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
    .replaceAll("\"", "&quot;")
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

function loadShellConfig() {
  if (!existsSync(shellConfigPath)) {
    throw new Error("missing apps/android-shell/android-shell.config.json");
  }

  const baseConfig = readJson(shellConfigPath);
  const localConfig = existsSync(shellConfigLocalPath) ? readJson(shellConfigLocalPath) : null;
  const mergedConfig = {
    ...baseConfig,
    ...localConfig,
    runtime: {
      ...(baseConfig.runtime ?? {}),
      ...(localConfig?.runtime ?? {}),
    },
  };

  const appId = normalizeOptionalString(mergedConfig.appId);
  const appName = normalizeOptionalString(mergedConfig.appName);
  const versionName = normalizeOptionalString(mergedConfig.versionName);
  const versionCode = Number(mergedConfig.versionCode);
  const allowCleartextTraffic = Boolean(mergedConfig.allowCleartextTraffic);
  const environment = normalizeOptionalString(mergedConfig.runtime?.environment) || "production";
  const apiBaseUrl = normalizeOptionalString(mergedConfig.runtime?.apiBaseUrl);
  const socketBaseUrl = normalizeOptionalString(mergedConfig.runtime?.socketBaseUrl);

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
    throw new Error("android-shell config runtime.environment must be development, staging, or production");
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
    },
  };
}

function updateCapacitorConfig(config) {
  const nextConfig = {
    ...readJson(capacitorConfigPath),
    appId: config.appId,
    appName: config.appName,
    server: {
      ...readJson(capacitorConfigPath).server,
      androidScheme: config.allowCleartextTraffic ? "http" : "https",
    },
  };

  return writeTextFile(capacitorConfigPath, `${JSON.stringify(nextConfig, null, 2)}\n`);
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

  const socketBaseUrl = config.runtime.socketBaseUrl || config.runtime.apiBaseUrl;
  if (socketBaseUrl) {
    nextRuntimeConfig.socketBaseUrl = socketBaseUrl;
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
  const socketBaseUrl = config.runtime.socketBaseUrl || config.runtime.apiBaseUrl;
  const xmlAppName = escapeXml(config.appName);
  const xmlAppId = escapeXml(config.appId);
  const xmlApiBaseUrl = escapeXml(config.runtime.apiBaseUrl);
  const xmlSocketBaseUrl = escapeXml(socketBaseUrl);
  const xmlEnvironment = escapeXml(config.runtime.environment);
  const xmlAllowCleartextTraffic = config.allowCleartextTraffic ? "true" : "false";

  let buildGradle = readFileSync(androidBuildGradlePath, "utf8");
  buildGradle = replaceRequired(/namespace ".*?"/, `namespace "${namespace}"`, buildGradle, "android namespace");
  buildGradle = replaceRequired(/applicationId ".*?"/, `applicationId "${config.appId}"`, buildGradle, "android applicationId");
  buildGradle = replaceRequired(/versionCode \d+/, `versionCode ${config.versionCode}`, buildGradle, "android versionCode");
  buildGradle = replaceRequired(/versionName ".*?"/, `versionName "${config.versionName}"`, buildGradle, "android versionName");

  let manifest = readFileSync(androidManifestPath, "utf8");
  if (/android:usesCleartextTraffic=".*?"/.test(manifest)) {
    manifest = replaceRequired(
      /android:usesCleartextTraffic=".*?"/,
      `android:usesCleartextTraffic="${xmlAllowCleartextTraffic}"`,
      manifest,
      "android manifest usesCleartextTraffic",
    );
  } else {
    manifest = replaceRequired(
      /(<application[\s\S]*?android:allowBackup=".*?"\n)/,
      `$1        android:usesCleartextTraffic="${xmlAllowCleartextTraffic}"\n`,
      manifest,
      "android manifest insert usesCleartextTraffic",
    );
  }
  manifest = replaceRequired(
    /(<meta-data\s+android:name="yinjie\.api_base_url"\s+android:value=")(.*?)("\s*\/>)/,
    `$1${xmlApiBaseUrl}$3`,
    manifest,
    "android manifest api_base_url",
  );
  manifest = replaceRequired(
    /(<meta-data\s+android:name="yinjie\.socket_base_url"\s+android:value=")(.*?)("\s*\/>)/,
    `$1${xmlSocketBaseUrl}$3`,
    manifest,
    "android manifest socket_base_url",
  );
  manifest = replaceRequired(
    /(<meta-data\s+android:name="yinjie\.environment"\s+android:value=")(.*?)("\s*\/>)/,
    `$1${xmlEnvironment}$3`,
    manifest,
    "android manifest environment",
  );

  let strings = readFileSync(androidStringsPath, "utf8");
  strings = replaceRequired(/(<string name="app_name">)(.*?)(<\/string>)/, `$1${xmlAppName}$3`, strings, "android app_name");
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

  const changed =
    writeTextFile(androidBuildGradlePath, buildGradle) |
    writeTextFile(androidManifestPath, manifest) |
    writeTextFile(androidStringsPath, strings);

  return Boolean(changed);
}

function configureAndroidShell() {
  const config = loadShellConfig();
  const changedPaths = [];

  if (updateCapacitorConfig(config)) {
    changedPaths.push(capacitorConfigPath);
  }

  if (updateAndroidProjectConfig(config)) {
    changedPaths.push(androidBuildGradlePath, androidManifestPath, androidStringsPath);
  }

  return { config, changedPaths };
}

function ensureWebBuild() {
  run("node", [resolve(workspaceDir, "scripts/build-mobile-shell-web.mjs")], {
    cwd: workspaceDir,
  });

  const config = loadShellConfig();
  if (writeBundledAppRuntimeConfig(config)) {
    console.log(`updated  ${appBundledRuntimeConfigPath}`);
  }
}

function runGradle(taskName) {
  run(androidGradleWrapperPath, [taskName], {
    cwd: androidProjectDir,
  });
}

if (command === "doctor") {
  let shellConfig = null;
  let shellConfigError = null;
  let signingProperties = null;
  const javaMajorVersion = readJavaMajorVersion();
  const androidManifest = readTextFileIfExists(androidManifestPath);

  try {
    shellConfig = loadShellConfig();
  } catch (error) {
    shellConfigError = error instanceof Error ? error.message : String(error);
  }

  if (existsSync(signingPropertiesPath)) {
    try {
      signingProperties = readPropertiesFile(signingPropertiesPath);
    } catch {
      signingProperties = null;
    }
  }

  const checks = [
    ["android-shell.config.json", existsSync(shellConfigPath) && !shellConfigError],
    ["capacitor.config.json", existsSync(resolve(shellDir, "capacitor.config.json"))],
    ["apps/app/dist", existsSync(resolve(appDir, "dist"))],
    ["apps/app/dist/runtime-config.json", existsSync(appBundledRuntimeConfigPath)],
    ["android project", existsSync(androidProjectDir)],
    ["java runtime", hasCommand("java", ["-version"])],
    ["java runtime >= 21", javaMajorVersion !== null && javaMajorVersion >= 21],
    ["ANDROID_HOME or ANDROID_SDK_ROOT", Boolean(process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT)],
  ];

  if (shellConfig?.runtime.environment === "production") {
    checks.push(["production apiBaseUrl", Boolean(shellConfig.runtime.apiBaseUrl)]);
    checks.push(["production cleartext traffic disabled", !shellConfig.allowCleartextTraffic]);
  }

  if (androidManifest) {
    for (const permission of requiredAndroidManifestPermissions) {
      checks.push([
        `manifest ${permission}`,
        androidManifest.includes(`android:name="${permission}"`),
      ]);
    }
  }

  if (signingProperties) {
    const requiredSigningKeys = [
      "YINJIE_UPLOAD_STORE_FILE",
      "YINJIE_UPLOAD_STORE_PASSWORD",
      "YINJIE_UPLOAD_KEY_ALIAS",
      "YINJIE_UPLOAD_KEY_PASSWORD",
    ];
    const hasSigningKeys = requiredSigningKeys.every((key) => Boolean(signingProperties[key]));
    checks.push(["release signing properties complete", hasSigningKeys]);

    const resolvedStoreFile = signingProperties.YINJIE_UPLOAD_STORE_FILE
      ? resolve(shellDir, signingProperties.YINJIE_UPLOAD_STORE_FILE)
      : null;
    checks.push(["release keystore file", Boolean(resolvedStoreFile && existsSync(resolvedStoreFile))]);
  }

  for (const [label, ok] of checks) {
    console.log(`${ok ? "ok" : "missing"}  ${label}`);
  }

  if (shellConfigError) {
    console.log(`error  ${shellConfigError}`);
  }

  if (javaMajorVersion !== null) {
    console.log(`info  detected java major version: ${javaMajorVersion}`);
  }

  if (!existsSync(androidProjectDir)) {
    console.log("next  run `pnpm android:init` to generate the native Android project");
  }

  if (existsSync(shellConfigLocalPath)) {
    console.log("ok  android-shell.config.local.json");
  } else {
    console.log("note  android-shell.config.local.json not found; using repository defaults");
  }

  if (existsSync(signingPropertiesPath)) {
    console.log("ok  android-signing.local.properties");
  } else {
    console.log("note  android-signing.local.properties not found; release build will use unsigned/default signing");
  }

  if (shellConfig?.allowCleartextTraffic) {
    console.log("note  allowCleartextTraffic is enabled; use only for local or explicitly trusted environments");
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

configureAndroidShell();
ensureAndroidProject(command);

if (command === "sync") {
  ensureWebBuild();
}

if (command === "apk") {
  ensureWebBuild();
  run("pnpm", ["exec", "cap", "sync", "android"], {
    cwd: shellDir,
  });
  runGradle("assembleDebug");
  process.exit(0);
}

if (command === "bundle") {
  ensureWebBuild();
  run("pnpm", ["exec", "cap", "sync", "android"], {
    cwd: shellDir,
  });
  runGradle("bundleRelease");
  process.exit(0);
}

run("pnpm", ["exec", "cap", command, ...restArgs], {
  cwd: shellDir,
});

if (command === "add" && restArgs[0] === "android") {
  const { changedPaths } = configureAndroidShell();

  for (const changedPath of changedPaths) {
    console.log(`updated  ${changedPath}`);
  }
}
