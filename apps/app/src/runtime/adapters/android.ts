import {
  registerAndroidAppStateChange,
  registerAndroidBackButton,
} from "../android-back-button";
import type { AppRuntimeCapabilities } from "../platform";

type CapacitorWindow = Window & {
  Capacitor?: {
    getPlatform?: () => string;
    isNativePlatform?: () => boolean;
  };
};

export function isAndroidPlatform() {
  const capacitorWindow = window as CapacitorWindow;
  const platform = capacitorWindow.Capacitor?.getPlatform?.();

  return platform === "android" && Boolean(capacitorWindow.Capacitor?.isNativePlatform?.());
}

export function getAndroidRuntimeCapabilities(): AppRuntimeCapabilities {
  return {
    canManageLocalCoreApi: false,
    canResolveLocalRuntimeData: false,
    canConfigureProviderLocally: false,
    canUseSecureStorage: true,
    canReceivePush: true,
    canPickImages: true,
    canConfigureRemoteService: true,
    canExportDiagnostics: false,
    canManageProvider: false,
    canScanBootstrapCode: false,
    canOpenExternalLinks: true,
  };
}

export async function bootstrapAndroid() {
  if (!isAndroidPlatform()) {
    return;
  }

  try {
    const [{ StatusBar, Style }, { SplashScreen }] = await Promise.all([
      import("@capacitor/status-bar"),
      import("@capacitor/splash-screen"),
    ]);

    await Promise.allSettled([
      StatusBar.setStyle({ style: Style.Light }),
      StatusBar.setOverlaysWebView({ overlay: false }),
      StatusBar.setBackgroundColor({ color: "#ffffff" }),
      SplashScreen.hide({ fadeOutDuration: 200 }),
    ]);
  } catch {
    // 插件缺失或调用失败时静默 —— 不阻塞 App 启动。
  }

  void registerAndroidBackButton();
  void registerAndroidAppStateChange();

  // FCM token 上报：跟 iOS bootstrap 对齐。Android 这条链路前几轮（19-22 / 24）
  // 已经把前台 / 后台 / channel / 小图标 / BigText 修齐了，但服务端这边一直
  // 没有 Android 设备 token —— apps/app 从来没把 SharedPreferences 里 FCM
  // SDK 写入的 token POST 给 /api/push/tokens。结果：服务端发推送时 push-token
  // 表里只有 iOS 行，Android 用户在「真机走查」前几轮修过的所有 notification
  // builder / channel 都白做了，因为根本没人朝 Android 端发推送。这里补齐
  // bootstrap 兜底同步 + owner 变化重报，对应 iOS adapter 同款 try/await。
  //
  // 走查 R5：listener 是 config-free 的留在这里挂上；初次 sync 拆到
  // bootstrapAndroidPushTokenAfterHydrate，让 main.tsx 在 await
  // hydrateNativeRuntimeConfig() 完成后再调，避免 sync 跟 hydrate 抢跑导致
  // resolveAppCoreApiBaseUrl 抛 "Remote Core API base URL is not configured"
  // 静默吞回 "network-error"，FCM token 永远 POST 不出去要等下次 owner 变化
  // 才能补报。
  try {
    const { startAndroidOwnerChangeListener } =
      await import("../push-token-sync");
    startAndroidOwnerChangeListener();
  } catch {
    // 动态 import 失败不阻塞启动；下次 owner 变化 / 冷启再试。
  }
}

/**
 * 冷启走完 hydrateNativeRuntimeConfig 后再跑的初次 FCM sync。
 * 对应 bootstrapIosPushTokenAfterHydrate，main.tsx 在 hydrate 之后
 * 按平台分发调用。
 */
export async function bootstrapAndroidPushTokenAfterHydrate() {
  if (!isAndroidPlatform()) {
    return;
  }

  try {
    const { syncAndroidPushToken } = await import("../push-token-sync");
    void syncAndroidPushToken();
  } catch {
    // 动态 import 失败不阻塞启动
  }
}
