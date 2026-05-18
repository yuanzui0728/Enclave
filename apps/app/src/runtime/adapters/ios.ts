import type { AppRuntimeCapabilities } from "../platform";

type CapacitorWindow = Window & {
  Capacitor?: {
    getPlatform?: () => string;
    isNativePlatform?: () => boolean;
  };
};

export function isIosPlatform() {
  const capacitorWindow = window as CapacitorWindow;
  const platform = capacitorWindow.Capacitor?.getPlatform?.();

  return platform === "ios" && Boolean(capacitorWindow.Capacitor?.isNativePlatform?.());
}

export function getIosRuntimeCapabilities(): AppRuntimeCapabilities {
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

/**
 * iOS 原生壳启动初始化：
 * - StatusBar：保持背景与 safe-area 联动，禁止 overlay；
 * - Keyboard：固定 native resize 模式，与 contentInset:"always" 配合；
 * - SplashScreen：兜底关闭，避免首屏数据 ready 后启动屏继续遮挡。
 *
 * 仅在 iOS 原生平台调用；Web/Android 路径不走这里。
 * 使用动态 import 让非 iOS 端构建时无副作用引入。
 */
export async function bootstrapIos() {
  if (!isIosPlatform()) {
    return;
  }

  try {
    const [{ StatusBar, Style }, { Keyboard, KeyboardResize }, { SplashScreen }] =
      await Promise.all([
        import("@capacitor/status-bar"),
        import("@capacitor/keyboard"),
        import("@capacitor/splash-screen"),
      ]);

    await Promise.allSettled([
      StatusBar.setStyle({ style: Style.Dark }),
      StatusBar.setOverlaysWebView({ overlay: false }),
      Keyboard.setResizeMode({ mode: KeyboardResize.Native }),
      Keyboard.setScroll({ isDisabled: false }),
      SplashScreen.hide({ fadeOutDuration: 200 }),
    ]);
  } catch {
    // 插件缺失或调用失败时静默 —— 不应阻塞 App 启动。
  }

  // APNs 推送 token 同步：监听 native 重发的新 token、监听 owner 变化（登录/换号）。
  // 注意：bootstrapIos 在 main.tsx 是 void fire-and-forget 起跑的，跑在 await
  // hydrateNativeRuntimeConfig() **之前**。这里只挂 listener（不依赖 runtime
  // config），**不**主动 sync —— 初次 sync 移到 bootstrapIosPushTokenAfterHydrate
  // 让 main.tsx 在 hydrate 之后再调。否则会跟 hydrate 抢跑：syncIosPushToken
  // 内部走 resolveAppCoreApiBaseUrl()，没 hydrate 完时 runtimeConfig.apiBaseUrl
  // 还是 undefined → throw → catch → reason "network-error" 静默丢，用户的
  // device token 这次没 POST 到 cloud-api，要等下次 owner 变化 / token 轮换
  // 才能补报。
  try {
    const {
      startIosPushTokenSyncListener,
      startIosOwnerChangeListener,
    } = await import("../push-token-sync");
    startIosPushTokenSyncListener();
    startIosOwnerChangeListener();
  } catch {
    // 同上：动态 import 失败也不阻塞启动
  }
}

/**
 * 冷启走完 hydrateNativeRuntimeConfig 后再跑的初次 APNs sync。
 * main.tsx 在 await hydrateNativeRuntimeConfig() 完成后调用，保证
 * syncIosPushToken 内部 resolveAppCoreApiBaseUrl() 拿得到 apiBaseUrl。
 * 未授权 / 未登录会安全短路，不会主动弹权限。
 */
export async function bootstrapIosPushTokenAfterHydrate() {
  if (!isIosPlatform()) {
    return;
  }

  try {
    const { syncIosPushToken } = await import("../push-token-sync");
    void syncIosPushToken();
  } catch {
    // 动态 import 失败不影响主路径
  }
}
