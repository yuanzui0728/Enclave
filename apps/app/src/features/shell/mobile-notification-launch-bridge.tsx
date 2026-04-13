import { useEffect, useRef } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  clearPendingNativeLaunchTarget,
  getPendingNativeLaunchTarget,
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
        if (!active || !resolved) {
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
    void syncPendingLaunchTarget();

    return () => {
      active = false;
      window.removeEventListener("focus", syncPendingLaunchTarget);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
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
