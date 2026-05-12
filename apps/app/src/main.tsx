import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import {
  AppLocaleProvider,
  readPersistedLocale,
  readQueryLocale,
  type SupportedLocale,
} from "@yinjie/i18n";
import { setWorldLanguage } from "@yinjie/contracts";
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
import { bootstrapAndroid } from "./runtime/adapters/android";
import { bootstrapIos } from "./runtime/adapters/ios";
import { router } from "./router";
import {
  hydrateCloudSessionStore,
  refreshCloudSessionIfNeeded,
} from "./store/cloud-session-store";
import { hydrateNativeRuntimeConfig } from "./runtime/runtime-config-store";

const VITE_PRELOAD_RECOVERY_KEY = "yinjie-app-vite-preload-recovery";

function shouldRecoverFromStaleAssets() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    if (window.sessionStorage.getItem(VITE_PRELOAD_RECOVERY_KEY) === "1") {
      return false;
    }

    window.sessionStorage.setItem(VITE_PRELOAD_RECOVERY_KEY, "1");
    return true;
  } catch {
    return true;
  }
}

function installStaleAssetRecovery() {
  if (typeof window === "undefined") {
    return;
  }

  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    if (!shouldRecoverFromStaleAssets()) {
      return;
    }

    window.location.reload();
  });

  window.addEventListener("error", (event) => {
    const message = event.message?.trim() ?? "";
    if (
      !message.includes("Failed to fetch dynamically imported module") &&
      !message.includes("Importing a module script failed")
    ) {
      return;
    }

    if (!shouldRecoverFromStaleAssets()) {
      return;
    }

    window.location.reload();
  });
}

installStaleAssetRecovery();

async function bootstrap() {
  void bootstrapIos();
  void bootstrapAndroid();
  const runtimeConfig = await hydrateNativeRuntimeConfig();
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

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <AppLocaleProvider
        surface="app"
        fallback={<BootstrapScreen />}
        initialLocale={initialLocale ?? null}
        onLocaleChange={handleLocaleChange}
        preferredLocales={preferredLocales}
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
    </React.StrictMode>,
  );

  // SW 注册放在 React 挂载之后再触发（内部 idleCallback），不抢首屏带宽。
  registerAppServiceWorker();
}

void bootstrap();
