import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { isCurrentOriginLocalLike, track } from "@yinjie/analytics";
import {
  AppLocaleProvider,
  readPersistedLocale,
  readQueryLocale,
  type SupportedLocale,
} from "@yinjie/i18n";
import { setWorldLanguage } from "@yinjie/contracts";
import { TelemetryErrorBoundary } from "@yinjie/ui";
import "@yinjie/ui/tokens.css";
import "./index.css";
import { BootstrapScreen } from "./components/bootstrap-screen";
import { bootstrapAnalytics } from "./lib/analytics-bootstrap";
import { queryClient } from "./lib/query-client";
import { configureContractsRuntime } from "./lib/runtime-config";
import {
  clearUserScopedClientState,
  readPersistedOwnerIdentity,
  writePersistedOwnerIdentity,
} from "./lib/user-scoped-state";
import {
  readDesktopLocalePreference,
  readNativeLocalePreference,
  syncNativeLocalePreference,
} from "./runtime/native-locale";
import { NativeLocaleSync } from "./runtime/native-locale-sync";
import { BackendLocaleSync } from "./runtime/backend-locale-sync";
import { registerAppServiceWorker } from "./runtime/register-service-worker";
import {
  bootstrapAndroid,
  bootstrapAndroidPushTokenAfterHydrate,
} from "./runtime/adapters/android";
import {
  bootstrapIos,
  bootstrapIosPushTokenAfterHydrate,
} from "./runtime/adapters/ios";
import { router } from "./router";
import { setLoginRedirectHandler } from "./lib/login-redirect";
import {
  hydrateCloudSessionStore,
  refreshCloudSessionIfNeeded,
} from "./store/cloud-session-store";
import { hydrateNativeRuntimeConfig } from "./runtime/runtime-config-store";
import { recoverFromStaleAssets } from "./lib/stale-asset-recovery";

function installStaleAssetRecovery() {
  if (typeof window === "undefined") {
    return;
  }

  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    recoverFromStaleAssets();
  });

  window.addEventListener("error", (event) => {
    const message = event.message?.trim() ?? "";
    if (
      !message.includes("Failed to fetch dynamically imported module") &&
      !message.includes("Importing a module script failed") &&
      // router.tsx 已用 lazyNamed 把"缺命名导出"的情况自己 reload；这条规则
      // 兜的是还没走 lazyNamed 的零星 dynamic import（含外部包），让旧 chunk
      // 一旦把 mod.XxxPage 解析成 undefined 也能自愈成 reload，不卡死在
      // ErrorBoundary fallback。窗口收紧到 ...Page 命名后缀，避免吞掉跟
      // stale-chunk 无关的常规 undefined 访问 bug。
      !/Cannot read properties of undefined \(reading '[A-Z][A-Za-z0-9_]*Page'\)/.test(
        message,
      )
    ) {
      return;
    }

    recoverFromStaleAssets();
  });
}

installStaleAssetRecovery();

async function bootstrap() {
  void bootstrapIos();
  void bootstrapAndroid();
  const runtimeConfig = await hydrateNativeRuntimeConfig();
  // 走查 R5：APNs / FCM push token 的初次 sync 必须在 hydrate 之后跑。bootstrap*
  // 是 void fire-and-forget 在 hydrate 之前起跑的，原来在 bootstrap* 内部直接
  // void syncIosPushToken() 会跟 hydrate 抢跑 —— sync 内部 resolveAppCoreApiBaseUrl
  // 拿不到 apiBaseUrl → throw → catch → reason "network-error" 静默丢，device
  // token 这次没 POST 到 cloud-api，要等下次 owner 变化 / token 轮换才能补报。
  // listener 是 config-free 的留在 bootstrap* 里挂上；初次 sync 拆到这里，确
  // 保 hydrate 跑完 runtimeConfig.apiBaseUrl 一定有值。
  void bootstrapIosPushTokenAfterHydrate();
  void bootstrapAndroidPushTokenAfterHydrate();
  const cloudSession = await hydrateCloudSessionStore();
  // 身份哨兵：electronic 客户端持久化的"已登录用户身份"跟 hydrate 出来的 cloud
  // session 不一致时（比如旧版本切号没清干净、用户跨版本登录、手动改过
  // localStorage），把所有 user-scoped 状态硬清一遍走 /welcome 重新登录。电话
  // 登录的 phone 字段保存在 cloud-session-store 里，邮箱 / Google 登录时 phone
  // 为空，那条路径靠 welcome-page 在 verify code 成功后做对账。
  if (cloudSession.phone) {
    const expectedIdentity = `phone:${cloudSession.phone}`;
    const persistedIdentity = readPersistedOwnerIdentity();
    if (!persistedIdentity) {
      writePersistedOwnerIdentity(expectedIdentity);
    } else if (persistedIdentity !== expectedIdentity) {
      await clearUserScopedClientState({ queryClient });
    }
  }
  const androidLocalePreference = await readNativeLocalePreference();
  const desktopLocalePreference = androidLocalePreference
    ? null
    : await readDesktopLocalePreference();
  const nativeLocalePreference =
    androidLocalePreference ?? desktopLocalePreference;
  configureContractsRuntime();
  // 云鉴权失效（401）/ 账号封禁注销（403）被全局错误处理器命中时走 SPA 软跳转
  // 回登录页（无刷新闪烁）。router 单例此时已就绪；放在 configureContractsRuntime
  // 之后即可，错误处理器要到首个请求出错才会调用它。
  setLoginRedirectHandler(() => {
    void router.navigate({ to: "/welcome", replace: true });
  });
  // Sliding TTL：boot 时检查一次，再每小时复查；token 临到期 (剩余 < 1d)
  // 自动调 cloud-api refresh-access 续命，过期则不动让登录流程兜底。
  void refreshCloudSessionIfNeeded();
  setInterval(() => {
    void refreshCloudSessionIfNeeded();
  }, 60 * 60 * 1000).unref?.();
  bootstrapAnalytics();
  const preferredLocales = [
    ...(nativeLocalePreference?.preferredLocales ?? []),
    ...(runtimeConfig.preferredLocales ?? []),
  ];
  const explicitWebLocalePreference =
    readQueryLocale() ?? readPersistedLocale("app");

  // 不再 await 后端 getWorldLanguage()——这是过隧道的纯净 RTT，会把首屏卡在
  // BootstrapScreen。改成挂载后由 <BackendLocaleSync> 异步拉取并校正：
  // - 没显式 web locale → 用后端语言软切换（不通知后端，避免循环）。
  // - 有显式 web locale 且与后端不一致 → 反向 push 后端。
  const initialLocale =
    explicitWebLocalePreference ?? nativeLocalePreference?.locale ?? null;

  const handleLocaleChange = (locale: SupportedLocale) => {
    void setWorldLanguage({ language: locale }).catch(() => {});
    return syncNativeLocalePreference(locale);
  };

  // 未登录入口页（splash / welcome / setup）默认不要在 idle 时预下载其它三种
  // locale 的 catalog——dev 下每个 .po ~2MB raw、prod 下三个加起来 ~330KB
  // gzipped。这些页面用户随时可能直接关掉，给他们灌 6MB 预下载没意义；登录
  // 后导航到 /tabs/* 时 catalog 真要切换会即时按需 import 一份（多 100-300ms），
  // 对极少切语言的用户来说更划算。
  const initialPathname =
    typeof window === "undefined" ? "" : window.location.pathname;
  const isUnauthenticatedEntryRoute =
    initialPathname === "/" ||
    initialPathname === "/welcome" ||
    initialPathname === "/setup" ||
    initialPathname.startsWith("/splash");

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <TelemetryErrorBoundary
        onError={(error, info) => {
          // 开发态过滤：dev 端口（5183/5186）下 HMR 重挂 AppLocaleProvider 时
          // children 短暂拿到 null context 会触发 useAppLocale throw；过去 3 天
          // 这一通道贡献了 95 条 react_render_error，全部来自 127.0.0.1 origin。
          // SDK 的 auto-capture 走 window error/rejection 通道有 origin 过滤，
          // ErrorBoundary 是独立通道必须自己挡一下。
          if (isCurrentOriginLocalLike()) return;
          const err = error instanceof Error ? error : null;
          track("react_render_error", {
            message: err?.message ?? String(error).slice(0, 1000),
            name: err?.name ?? null,
            stack: err?.stack?.slice(0, 2000) ?? null,
            componentStack: info.componentStack?.slice(0, 2000) ?? null,
          });
        }}
      >
        <AppLocaleProvider
          surface="app"
          fallback={<BootstrapScreen />}
          initialLocale={initialLocale ?? null}
          onLocaleChange={handleLocaleChange}
          preferredLocales={preferredLocales}
          prefetchOtherLocales={!isUnauthenticatedEntryRoute}
          // 公网隧道下 i18n 主 catalog ~106KB gzipped、过隧道 0.3-1s。原本 catalog
          // 没回来时整棵 React 树都被 fallback=<BootstrapScreen /> 卡住。renderBe
          // foreReady=true 让 children 立即渲染，catalog 到位再无缝替换：源 ID
          // 是中文，zh-CN 用户视觉无差别；en/ja/ko 用户首屏看到 ~0.3-1s 中文
          // flash 然后切回目标语言，是可接受的代价。
          renderBeforeReady
        >
          <NativeLocaleSync
            syncDesktopLocaleOnMount={Boolean(explicitWebLocalePreference)}
          />
          <BackendLocaleSync
            hasExplicitWebLocalePreference={Boolean(explicitWebLocalePreference)}
          />
          <QueryClientProvider client={queryClient}>
            {/* GoogleOAuthProvider 已下移到 routes/welcome-page.tsx 内仅包裹
                GoogleLogin 组件 — 唯一用 GoogleLogin 的地方。这样首屏不再
                拉 @react-oauth/google 包 (~25-35KB)，登录页第一次访问时才拉。 */}
            <Suspense fallback={<BootstrapScreen />}>
              <RouterProvider router={router} />
            </Suspense>
          </QueryClientProvider>
        </AppLocaleProvider>
      </TelemetryErrorBoundary>
    </React.StrictMode>,
  );

  // SW 注册放在 React 挂载之后再触发（内部 idleCallback），不抢首屏带宽。
  registerAppServiceWorker();
}

void bootstrap();
