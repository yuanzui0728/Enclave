import { registerPlugin } from "@capacitor/core";
import { resolveSupportedLocale, type SupportedLocale } from "@yinjie/i18n";
import { isNativeAndroidRuntime } from "./native-runtime";

export type NativeLocaleSource = "app" | "system" | "default";

export type NativeLocalePreference = {
  locale: SupportedLocale;
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
  return source === "app" || source === "system" || source === "default"
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

export async function syncNativeLocalePreference(locale: SupportedLocale) {
  if (!isNativeAndroidRuntime()) {
    return false;
  }

  try {
    await yinjieRuntime.setLocale({ locale });
    return true;
  } catch {
    return false;
  }
}
