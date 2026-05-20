import { isLocalLikeHostname } from "@yinjie/analytics";
import {
  DEFAULT_CLOUD_API_BASE_URL,
  resolveCloudApiBaseUrl,
  resolveCoreApiBaseUrl,
  setApiRequestErrorHandler,
  setCloudApiBaseUrlProvider,
  setCloudApiLocaleProvider,
  setCloudWorldApiTokenProvider,
  setCoreApiBaseUrlProvider,
} from "@yinjie/contracts";
import { getActiveLocale } from "@yinjie/i18n";
import { handleApiSubscriptionExpiredError } from "./subscription-expired";
import { handleApiWorldUnavailableError } from "./world-unavailable";
import { resolveAppRuntimeContext } from "../runtime/platform";
import { getAppRuntimeConfig } from "../runtime/runtime-config-store";
import { isCloudSessionExpired, useCloudSessionStore } from "../store/cloud-session-store";

function fallbackBrowserBaseUrl() {
  if (typeof window === "undefined") {
    return null;
  }

  if (window.location.protocol === "http:" || window.location.protocol === "https:") {
    return window.location.origin;
  }

  return null;
}

// Capacitor (Android/iOS) 把 webview 的 origin 设为 https://localhost（或
// capacitor://localhost），这个 origin 上没有任何 HTTP 服务，把它当 baseUrl
// 会让 fetch 命中本地 SPA 资源服务器返回 index.html，调用方再 JSON.parse
// 就会摔出 'Unexpected token <' 抛给用户。原生壳必须显式配置后端地址，
// 这里检测到 Capacitor 时不允许 origin 回落。
function isInsideCapacitorShell() {
  if (typeof window === "undefined") {
    return false;
  }
  const capacitor = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(capacitor?.isNativePlatform?.());
}

// 浏览器同源回落分两类：
// - 本地直连（localhost / 127.x / 私网 IP / 内网域名 / 桌面壳的 file://）：
//   允许 baseUrl = ${origin}，请求直接打到本机 api(3000)，无鉴权 = 单租户本地开发场景。
// - 远程公网域名（vicp.fun / 公网 IP / 隧道）：必须走 cloud-api 的多租户反代入口
//   ${origin}/cloud/world-api，由 cloud-api 凭 cloud access token 路由到对应账号 child；
//   否则匿名访问会直通本机的共享 owner db，等同于把本地数据公开。
// 判断逻辑共享自 @yinjie/analytics/runtime-environment，telemetry SDK 也用它
// 把 dev/LAN 噪声从生产事件里剥掉，单源避免漂移。

function isRemoteWebOrigin() {
  if (typeof window === "undefined") return false;
  const protocol = window.location.protocol;
  if (protocol !== "http:" && protocol !== "https:") return false;
  return !isLocalLikeHostname(window.location.hostname);
}

function fallbackCoreApiBaseUrl() {
  const origin = fallbackBrowserBaseUrl();
  if (!origin) return null;
  if (isRemoteWebOrigin()) {
    return `${origin}/cloud/world-api`;
  }
  return origin;
}

export function resolveAppCoreApiBaseUrl() {
  const runtimeConfig = getAppRuntimeConfig();
  if (runtimeConfig.apiBaseUrl) {
    return runtimeConfig.apiBaseUrl;
  }

  const browserBaseUrl = fallbackCoreApiBaseUrl();
  if (browserBaseUrl) {
    return browserBaseUrl;
  }

  throw new Error("Remote Core API base URL is not configured for this runtime."); // i18n-ignore-line
}

export function resolveAppSocketBaseUrl() {
  const runtimeConfig = getAppRuntimeConfig();
  if (runtimeConfig.socketBaseUrl) {
    return runtimeConfig.socketBaseUrl;
  }

  if (runtimeConfig.apiBaseUrl) {
    return runtimeConfig.apiBaseUrl;
  }

  return resolveAppCoreApiBaseUrl();
}

export function isRemoteWebDeployment() {
  return isRemoteWebOrigin();
}

export function configureContractsRuntime() {
  setCoreApiBaseUrlProvider(() => resolveAppCoreApiBaseUrl());
  setCloudApiBaseUrlProvider(() => {
    const runtimeConfig = getAppRuntimeConfig();
    if (runtimeConfig.cloudApiBaseUrl) {
      return runtimeConfig.cloudApiBaseUrl;
    }
    // 原生壳（Capacitor）的 origin 是 https://localhost，没有真实后端，必须靠
    // 打包注入的 cloudApiBaseUrl。回落只用于浏览器 / desktop。
    if (isInsideCapacitorShell()) {
      return null;
    }
    // 浏览器同源回落：用户从 vicp.fun 等远程域名访问时，localhost:3001 会打到用户设备本机；
    // 此时 vite dev / 反代会把 /cloud/* 转发到真实的 cloud-api。
    const browserBaseUrl = fallbackBrowserBaseUrl();
    if (browserBaseUrl) {
      return browserBaseUrl;
    }
    return DEFAULT_CLOUD_API_BASE_URL;
  });
  // 多租户公网部署：world API 的 base URL 走 cloud-api 的反代入口
  // (路径 /cloud/world-api)。客户端必须把当前 cloud access token 透给反代层，
  // 反代层凭 token 里的 phone 字段把请求路由到该账号自己的 child process。
  // 本地直连（localhost / 私网 IP / 桌面壳）不走反代，不附 token，行为不变。
  setCloudWorldApiTokenProvider((baseUrl) => {
    if (!baseUrl || !baseUrl.includes("/cloud/world-api")) {
      return null;
    }
    const session = useCloudSessionStore.getState();
    if (!session.accessToken || isCloudSessionExpired(session.expiresAt)) {
      return null;
    }
    return session.accessToken;
  });
  setApiRequestErrorHandler((error) => {
    handleApiSubscriptionExpiredError(error);
    // world child 死了 / 被 idle-suspend 之后所有 world API 请求会一直 502/503，
    // 没有这一行前端会陷入无限 toast；命中后弹「世界已休眠」对话框，让用户走重登 → resume 闭环。
    handleApiWorldUnavailableError(error);
  });
  // R3 走查（2026-05-17 我-设置）：cloud-api error filter 优先按 X-Yinjie-Locale
  // 头确定响应语言，没有才回落到 Accept-Language（即浏览器 / 系统语言）。
  // 用户在「我-设置-多语言」改成 en-US 但系统是 zh-CN 时，过去 cloud-api 仍按
  // zh-CN 返回报错。这里挂上 getActiveLocale（i18n 实例当前激活的 locale），
  // 让每次 cloud-api 请求带上用户当前实际选择。
  setCloudApiLocaleProvider(() => getActiveLocale());
}

export function resolveConfiguredCoreApiBaseUrl() {
  return resolveCoreApiBaseUrl(undefined, { allowDefault: false });
}

export function hasRemoteServiceConfiguration() {
  const runtimeConfig = getAppRuntimeConfig();
  return Boolean(runtimeConfig.apiBaseUrl || fallbackBrowserBaseUrl());
}

export function resolveAppCloudApiBaseUrl() {
  const runtimeConfig = getAppRuntimeConfig();
  if (runtimeConfig.cloudApiBaseUrl) {
    return runtimeConfig.cloudApiBaseUrl;
  }

  return resolveCloudApiBaseUrl();
}

export function requiresRemoteServiceConfiguration() {
  const runtimeConfig = getAppRuntimeConfig();
  const runtimeContext = resolveAppRuntimeContext(runtimeConfig.appPlatform);
  return (
    runtimeContext.deploymentMode === "remote-connected" &&
    (!runtimeConfig.worldAccessMode || !hasRemoteServiceConfiguration())
  );
}
