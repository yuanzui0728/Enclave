import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const shellConfigPath = path.resolve(cwd, "ios-shell.config.json");
const shellLocalConfigPath = path.resolve(cwd, "ios-shell.config.local.json");
const templatePath = path.resolve(cwd, "runtime-config.example.json");
const outputPath = path.resolve(cwd, "../app/dist-mobile/runtime-config.json");

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

function normalizeOptionalString(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function pickEnv(name) {
  return normalizeOptionalString(process.env[name]) || null;
}

const shellConfig = readJsonIfExists(shellConfigPath);
if (!shellConfig) {
  console.error(`Missing ios-shell.config.json at ${shellConfigPath}`);
  process.exit(1);
}

const localConfig = readJsonIfExists(shellLocalConfigPath) ?? {};
const template = readJsonIfExists(templatePath) ?? {};

const baseRuntime = shellConfig.runtime ?? {};
const localRuntime = localConfig.runtime ?? {};

// 拦掉「用户照着 ios-shell.config.local.example.json / runtime-config.example.json
// 复制了一份，没改 URL 就直接 build」的死法。Round 21/28/33 已经拦了「URL
// 字段缺失」，但留了第二条暗坑：local 模板把 apiBaseUrl 写成 "https://your-
// dev-host.example.com"、cloudApiBaseUrl 写成 "https://cloud.example.yinjie.app"
// 之类占位，非空通过 guard，被一路 bake 进 IPA。装到真机后 DNS NXDOMAIN，
// app 启动后所有请求 fail；日志只看到 NSURLErrorDomain，没人会想到是
// runtime-config 里写错域名，调试要花几个小时。RFC 2606 保留了 .example.*
// 顶级，加上仓库里所有 .example.* 占位 host pattern 一并 reject。
const PLACEHOLDER_HOST_RE =
  /(?:\.example\.com|\.example\.yinjie\.app|your-dev-host\.example\.com)(?:[\/:]|$)/i;

function rejectPlaceholderUrl(label, value) {
  if (!value) return;
  if (PLACEHOLDER_HOST_RE.test(value)) {
    console.error(
      `${label}=${value} 看着像 ios-shell.config.local.example.json / runtime-config.example.json 里的占位（*.example.* / your-dev-host.example.com）。复制示例文件后必须把占位换成实际域名，否则 IPA 装到真机上所有请求 DNS NXDOMAIN 静默失败。`,
    );
    process.exit(1);
  }
}

// 优先级：env > local > shell config（不再 fallback 到 template）。
// runtime-config.example.json 里 apiBaseUrl 是 "https://api.example.yinjie.app"
// 占位，跟 Round 21 的 cloudApiBaseUrl 同款陷阱：一旦 env / local / base 都没
// 写，template 会把这条假 URL 静默塞进打包产物。`if (!apiBaseUrl)` 那条 guard
// 是按「空字符串」判，template 给的是非空假值，永远 trip 不到。改成不接
// template，未配显式 process.exit(1) 报错。
const apiBaseUrl =
  pickEnv("YINJIE_IOS_CORE_API_BASE_URL") ||
  normalizeOptionalString(localRuntime.apiBaseUrl) ||
  normalizeOptionalString(baseRuntime.apiBaseUrl);

if (!apiBaseUrl) {
  console.error(
    "Missing apiBaseUrl. Set runtime.apiBaseUrl in ios-shell.config.json (or ios-shell.config.local.json) or export YINJIE_IOS_CORE_API_BASE_URL.",
  );
  process.exit(1);
}

// socketBaseUrl 不接 template：同样会 silent 注入 example 域名。回落到
// apiBaseUrl 是预期行为（多数部署 ws 跟 http 同源），不需要 template 这条。
const socketBaseUrl =
  pickEnv("YINJIE_IOS_SOCKET_BASE_URL") ||
  normalizeOptionalString(localRuntime.socketBaseUrl) ||
  normalizeOptionalString(baseRuntime.socketBaseUrl) ||
  apiBaseUrl;

// cloud-api（多租户反代入口）。原生壳的 origin 是 capacitor://localhost，
// 没真实 HTTP 服务，apps/app/src/lib/runtime-config.ts 在 isInsideCapacitorShell()
// 时显式不允许 origin 回落，所以这里必须显式注入。
//
// 注意：不要 fallback 到 template.cloudApiBaseUrl —— runtime-config.example.json
// 里写的是 "https://cloud.example.yinjie.app" 示例域名。一旦没在 env/local/base
// 任一处显式配置，template 会把这条示例 URL 静默注入打包产物，装到真机后
// worlds 列表 / cloud session refresh / push token 注册 / 反馈上传等所有
// cloud-api 入口都会 DNS-fail，且日志看不出原因（看似配置成功了）。
const cloudApiBaseUrl =
  pickEnv("YINJIE_IOS_CLOUD_API_BASE_URL") ||
  normalizeOptionalString(localRuntime.cloudApiBaseUrl) ||
  normalizeOptionalString(baseRuntime.cloudApiBaseUrl);

if (!cloudApiBaseUrl) {
  console.error(
    "Missing cloudApiBaseUrl. Set runtime.cloudApiBaseUrl in ios-shell.config.json (or ios-shell.config.local.json) or export YINJIE_IOS_CLOUD_API_BASE_URL. Native shell cannot fall back to window.location.origin (capacitor://localhost).",
  );
  process.exit(1);
}

rejectPlaceholderUrl("apiBaseUrl", apiBaseUrl);
rejectPlaceholderUrl("socketBaseUrl", socketBaseUrl);
rejectPlaceholderUrl("cloudApiBaseUrl", cloudApiBaseUrl);

const environment =
  pickEnv("YINJIE_IOS_ENVIRONMENT") ||
  normalizeOptionalString(localRuntime.environment) ||
  normalizeOptionalString(baseRuntime.environment) ||
  normalizeOptionalString(template.environment) ||
  "production";

const publicAppName =
  pickEnv("YINJIE_IOS_PUBLIC_APP_NAME") ||
  normalizeOptionalString(localRuntime.publicAppName) ||
  normalizeOptionalString(baseRuntime.publicAppName) ||
  normalizeOptionalString(template.publicAppName) ||
  "Yinjie";

const applicationId =
  pickEnv("YINJIE_IOS_BUNDLE_IDENTIFIER") ||
  normalizeOptionalString(localConfig.appId) ||
  normalizeOptionalString(shellConfig.appId);

const appVersionName =
  pickEnv("YINJIE_IOS_MARKETING_VERSION") ||
  normalizeOptionalString(localConfig.marketingVersion) ||
  normalizeOptionalString(shellConfig.marketingVersion);

const buildNumberRaw =
  pickEnv("YINJIE_IOS_BUILD_NUMBER") ||
  (localConfig.buildNumber !== undefined ? String(localConfig.buildNumber) : null) ||
  (shellConfig.buildNumber !== undefined ? String(shellConfig.buildNumber) : null);
const appVersionCode = buildNumberRaw ? Number(buildNumberRaw) : null;

// 不要 spread template：上面 5 个 URL/字符串字段已经显式覆盖，spread 是冗
// 余的；同时 template 以后多塞字段（比如 experimentFlagsUrl）会被静默带进
// 打包产物，跟「不要 fallback example」是一回事。显式列字段。
const runtimeConfig = {
  apiBaseUrl,
  socketBaseUrl,
  cloudApiBaseUrl: cloudApiBaseUrl || null,
  environment,
  publicAppName,
  applicationId: applicationId || null,
  appVersionName: appVersionName || null,
  appVersionCode: Number.isFinite(appVersionCode) ? appVersionCode : null,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(runtimeConfig, null, 2)}\n`);
console.log(`Injected iOS runtime config into ${outputPath}`);
console.log(
  `  applicationId=${runtimeConfig.applicationId ?? "(unset)"} appVersionName=${runtimeConfig.appVersionName ?? "(unset)"} appVersionCode=${runtimeConfig.appVersionCode ?? "(unset)"} env=${runtimeConfig.environment} cloudApiBaseUrl=${runtimeConfig.cloudApiBaseUrl ?? "(unset)"}`,
);
