import { Capacitor, registerPlugin } from "@capacitor/core";
import type { AppRuntimeConfig } from "./runtime-config";

type NativeRuntimePayload = Partial<AppRuntimeConfig> & {
  applicationId?: string;
  appVersionName?: string;
  appVersionCode?: number;
};

type YinjieRuntimePlugin = {
  getConfig(): Promise<NativeRuntimePayload>;
};

const yinjieRuntime = registerPlugin<YinjieRuntimePlugin>("YinjieRuntime");

function resolveBundledRuntimeConfigUrl() {
  if (import.meta.env.DEV) {
    return `${import.meta.env.BASE_URL}runtime-config.json`;
  }

  return new URL(/* @vite-ignore */ "../runtime-config.json", import.meta.url).toString();
}

export function isNativeAndroidRuntime() {
  return Capacitor.getPlatform() === "android" && Capacitor.isNativePlatform();
}

export function isNativeIosRuntime() {
  return Capacitor.getPlatform() === "ios" && Capacitor.isNativePlatform();
}

export function isNativeMobileRuntime() {
  return isNativeAndroidRuntime() || isNativeIosRuntime();
}

export async function readNativeRuntimeConfig() {
  if (!isNativeMobileRuntime()) {
    return null;
  }

  try {
    return await yinjieRuntime.getConfig();
  } catch {
    // Fall through to bundled runtime-config.json when the native plugin is not wired yet.
  }

  try {
    const response = await fetch(resolveBundledRuntimeConfigUrl(), { cache: "no-store" });
    if (!response.ok) {
      return null;
    }

    return (await response.json()) as NativeRuntimePayload;
  } catch {
    return null;
  }
}
