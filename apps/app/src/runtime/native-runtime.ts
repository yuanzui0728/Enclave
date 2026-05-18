import { Capacitor, registerPlugin } from "@capacitor/core";
import type { SupportedLocale } from "@yinjie/i18n";
import type { AppRuntimeConfig } from "./runtime-config";

type NativeRuntimePayload = Partial<AppRuntimeConfig> & {
  applicationId?: string;
  appVersionName?: string;
  appVersionCode?: number;
};

export type NativeLocalePayload = {
  locale?: string | null;
  source?: string | null;
};

// 走查新一轮：之前 native-runtime.ts + native-locale.ts 各自 registerPlugin("YinjieRuntime")，
// Capacitor 在 dev console 一直在打 "Cannot register plugins twice." 警告——
// 同名 plugin 重复注册第二次会被忽略，两边拿到的 proxy 看似各自一份其实由 Capacitor
// 内部缓存收敛成同一个，但日志噪音 + 后续如果方法签名分叉会埋雷。
// 改成单点注册 + 双方共享同一个 proxy；plugin 类型合并 getConfig+getLocale+setLocale 三 method
// 对齐原生 (Android/iOS) 端 YinjieRuntime 类实际暴露的三个接口。
type YinjieRuntimePlugin = {
  getConfig(): Promise<NativeRuntimePayload>;
  getLocale(): Promise<NativeLocalePayload>;
  setLocale(options: { locale: SupportedLocale }): Promise<NativeLocalePayload>;
};

export const yinjieRuntimePlugin =
  registerPlugin<YinjieRuntimePlugin>("YinjieRuntime");

const yinjieRuntime = yinjieRuntimePlugin;

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
