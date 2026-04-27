import { registerPlugin } from "@capacitor/core";
import { resolveSupportedLocale, type SupportedLocale } from "@yinjie/i18n";
import {
  getDesktopLocale,
  isDesktopRuntimeAvailable,
  setDesktopLocale,
} from "@yinjie/ui";
import { isNativeAndroidRuntime } from "./native-runtime";

export type NativeLocaleSource = "app" | "storage" | "system" | "default";

export type NativeLocalePreference = {
  locale: SupportedLocale;
  preferredLocales?: string[];
  source: NativeLocaleSource;
};

type NativeLocalePayload = {
  locale?: string | null;
  source?: string | null;
};

type YinjieRuntimeLocalePlugin = {
  getLocale(): Promise<NativeLocalePayload>;
  setLocale(options: { locale: SupportedLocale }): Promise<NativeLocalePayload>;
};

const yinjieRuntime =
  registerPlugin<YinjieRuntimeLocalePlugin>("YinjieRuntime");

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
  if (!isNativeAndroidRuntime()) {
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

  if (!isNativeAndroidRuntime()) {
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
