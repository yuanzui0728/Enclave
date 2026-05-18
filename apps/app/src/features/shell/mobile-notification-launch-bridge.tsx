import { useEffect, useRef } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  clearPendingNativeLaunchTarget,
  getPendingNativeLaunchTarget,
  onNativePendingLaunchTargetChanged,
} from "../../runtime/mobile-bridge";
import { isNativeMobileShareSurface } from "../../runtime/mobile-share-surface";
import { useWorldOwnerStore } from "../../store/world-owner-store";

type ResolvedNavigationTarget =
  | {
      locationKey: string;
      navigate: () => Promise<void>;
    }
  | null;

function resolveNavigationTarget(
  target: Awaited<ReturnType<typeof getPendingNativeLaunchTarget>>,
  navigate: ReturnType<typeof useNavigate>,
): ResolvedNavigationTarget {
  if (!target) {
    return null;
  }

  if (target.kind === "conversation" && target.conversationId) {
    const conversationId = target.conversationId;
    return {
      locationKey: `/chat/${conversationId}`,
      navigate: () =>
        navigate({
          to: "/chat/$conversationId",
          params: { conversationId },
        }),
    };
  }

  if (target.kind === "group" && target.groupId) {
    const groupId = target.groupId;
    return {
      locationKey: `/group/${groupId}`,
      navigate: () =>
        navigate({
          to: "/group/$groupId",
          params: { groupId },
        }),
    };
  }

  if (target.kind === "route" && target.route?.startsWith("/")) {
    return {
      locationKey: target.route,
      navigate: () =>
        navigate({
          to: target.route,
        }),
    };
  }

  return null;
}

export function MobileNotificationLaunchBridge() {
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const search = useRouterState({
    select: (state) => state.location.searchStr,
  });
  const hash = useRouterState({
    select: (state) => state.location.hash,
  });
  const onboardingCompleted = useWorldOwnerStore((state) => state.onboardingCompleted);
  const pollingRef = useRef(false);
  const nativeMobileShellSupported = isNativeMobileShareSurface();

  useEffect(() => {
    if (!onboardingCompleted || !nativeMobileShellSupported) {
      return;
    }

    let active = true;

    async function syncPendingLaunchTarget() {
      if (!active || pollingRef.current) {
        return;
      }

      pollingRef.current = true;

      try {
        const target = await getPendingNativeLaunchTarget();
        const resolved = resolveNavigationTarget(target, navigate);
        if (!active) {
          return;
        }
        if (!resolved) {
          // target 存在但解不到具体路由（旧版本格式、kind 不识别、字段缺失被
          // normalize 干成 null 之类）时也必须把 UserDefaults 里的 pending
          // 清掉，否则它会在每次 focus / visibilitychange 上反复触发本函数，
          // 重启 app 也不会自然过期，相当于一条死信永远塞着。
          await clearPendingNativeLaunchTarget();
          return;
        }

        const currentLocationKey = `${pathname}${search}${hash}`;
        if (
          currentLocationKey === resolved.locationKey ||
          pathname === resolved.locationKey
        ) {
          await clearPendingNativeLaunchTarget();
          return;
        }

        await resolved.navigate();
        await clearPendingNativeLaunchTarget();
      } finally {
        pollingRef.current = false;
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        void syncPendingLaunchTarget();
      }
    }

    function onPageShow() {
      void syncPendingLaunchTarget();
    }

    window.addEventListener("focus", syncPendingLaunchTarget);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibilityChange);

    // 真机走查 R4：前台横幅点击的死链。用户在 chat A 时收到 chat B 的 push，
    // willPresent 选项含 .banner → iOS 顶部弹横幅 → 用户点横幅 → AppDelegate
    // didReceive 写 UserDefaults，但 app 全程一直 focused & visible，
    // focus / pageshow / visibilitychange 三条监听都不触发，syncPendingLaunchTarget
    // 不会跑。订阅 native 侧 "pendingLaunchTargetChanged" 事件作为前台路径
    // 兜底：AppDelegate 写完 target 之后 post NotificationCenter 信号，
    // YinjieMobileBridgePlugin 转给 JS 触发这条 callback，等于 native 主动
    // 叫 JS 重读 UserDefaults 跑 sync。
    let nativeListenerHandle: { remove: () => void } | null = null;
    void onNativePendingLaunchTargetChanged(() => {
      void syncPendingLaunchTarget();
    }).then((handle) => {
      if (!handle) {
        return;
      }
      if (!active) {
        void handle.remove();
        return;
      }
      nativeListenerHandle = handle;
    });

    void syncPendingLaunchTarget();

    return () => {
      active = false;
      window.removeEventListener("focus", syncPendingLaunchTarget);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (nativeListenerHandle) {
        void nativeListenerHandle.remove();
        nativeListenerHandle = null;
      }
    };
  }, [
    hash,
    navigate,
    nativeMobileShellSupported,
    onboardingCompleted,
    pathname,
    search,
  ]);

  return null;
}
