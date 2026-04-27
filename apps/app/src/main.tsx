import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import {
  AppLocaleProvider,
  readPersistedLocale,
  readQueryLocale,
} from "@yinjie/i18n";
import "@yinjie/ui/tokens.css";
import "./index.css";
import { BootstrapScreen } from "./components/bootstrap-screen";
import { queryClient } from "./lib/query-client";
import { configureContractsRuntime } from "./lib/runtime-config";
import {
  readDesktopLocalePreference,
  readNativeLocalePreference,
  syncNativeLocalePreference,
} from "./runtime/native-locale";
import { NativeLocaleSync } from "./runtime/native-locale-sync";
import { router } from "./router";
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
  const runtimeConfig = await hydrateNativeRuntimeConfig();
  const androidLocalePreference = await readNativeLocalePreference();
  const desktopLocalePreference = androidLocalePreference
    ? null
    : await readDesktopLocalePreference();
  const nativeLocalePreference =
    androidLocalePreference ?? desktopLocalePreference;
  configureContractsRuntime();
  const preferredLocales = [
    ...(nativeLocalePreference?.preferredLocales ?? []),
    ...(runtimeConfig.preferredLocales ?? []),
  ];
  const explicitWebLocalePreference =
    readQueryLocale() ?? readPersistedLocale("app");
  const initialLocale =
    desktopLocalePreference && explicitWebLocalePreference
      ? explicitWebLocalePreference
      : nativeLocalePreference?.locale;

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <AppLocaleProvider
        surface="app"
        fallback={<BootstrapScreen />}
        initialLocale={initialLocale ?? null}
        onLocaleChange={syncNativeLocalePreference}
        preferredLocales={preferredLocales}
      >
        <NativeLocaleSync
          syncDesktopLocaleOnMount={Boolean(explicitWebLocalePreference)}
        />
        <QueryClientProvider client={queryClient}>
          <Suspense fallback={<BootstrapScreen />}>
            <RouterProvider router={router} />
          </Suspense>
        </QueryClientProvider>
      </AppLocaleProvider>
    </React.StrictMode>,
  );
}

void bootstrap();
