import { resolveSupportedLocale, type SupportedLocale } from "@yinjie/i18n";
import {
  getDesktopLocale,
  isDesktopRuntimeAvailable,
  setDesktopLocale,
} from "@yinjie/ui";
import {
  isNativeMobileRuntime,
  yinjieRuntimePlugin,
  type NativeLocalePayload,
} from "./native-runtime";

export type NativeLocaleSource = "app" | "storage" | "system" | "default";

export type NativeLocalePreference = {
  locale: SupportedLocale;
  preferredLocales?: string[];
  source: NativeLocaleSource;
};

// 走查新一轮：单点注册的 YinjieRuntime plugin（见 native-runtime.ts）现在统一暴露
// getConfig + getLocale + setLocale 三个方法；本文件不再独自调 registerPlugin —
// 避免 dev console 一直打 "Cannot register plugins twice." 警告。
const yinjieRuntime = yinjieRuntimePlugin;

function normalizeNativeLocaleSource(
  source?: string | null,
): NativeLocaleSource {
  return source === "app" ||
    source === "storage" ||
    source === "system" ||
    source === "default"
    ? source
    : "default";
}

export async function readNativeLocalePreference(): Promise<NativeLocalePreference | null> {
  if (!isNativeMobileRuntime()) {
    return null;
  }

  try {
    const payload = await yinjieRuntime.getLocale();
    const locale = resolveSupportedLocale(payload.locale);
    if (!locale) {
      return null;
    }

    return {
      locale,
      source: normalizeNativeLocaleSource(payload.source),
    };
  } catch {
    return null;
  }
}

export async function readDesktopLocalePreference(): Promise<NativeLocalePreference | null> {
  if (!isDesktopRuntimeAvailable()) {
    return null;
  }

  try {
    const payload = await getDesktopLocale();
    const locale = resolveSupportedLocale(payload.locale);
    if (!locale) {
      return null;
    }

    return {
      locale,
      preferredLocales: payload.systemLocale ? [payload.systemLocale] : [],
      source: normalizeNativeLocaleSource(payload.source),
    };
  } catch {
    return null;
  }
}

export async function syncNativeLocalePreference(locale: SupportedLocale) {
  let synced = false;

  if (!isNativeMobileRuntime()) {
    return syncDesktopLocalePreference(locale);
  }

  try {
    await yinjieRuntime.setLocale({ locale });
    synced = true;
  } catch {
    // Keep desktop sync best-effort when running inside the Tauri shell.
  }

  return (await syncDesktopLocalePreference(locale)) || synced;
}

export async function syncDesktopLocalePreference(locale: SupportedLocale) {
  if (!isDesktopRuntimeAvailable()) {
    return false;
  }

  try {
    await setDesktopLocale(locale);
    return true;
  } catch {
    return false;
  }
}
