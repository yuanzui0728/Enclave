import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { clearPendingNativeLaunchTarget, getPendingNativeLaunchTarget, isNativeMobileBridgeAvailable } from "../../runtime/mobile-bridge";
import { useSessionStore } from "../../store/session-store";

type ResolvedNavigationTarget =
  | {
      pathname: string;
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
      pathname: `/chat/${conversationId}`,
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
      pathname: `/group/${groupId}`,
      navigate: () =>
        navigate({
          to: "/group/$groupId",
          params: { groupId },
        }),
    };
  }

  if (target.kind === "route" && target.route?.startsWith("/")) {
    return {
      pathname: target.route,
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
  const location = useLocation();
  const token = useSessionStore((state) => state.token);
  const pollingRef = useRef(false);

  useEffect(() => {
    if (!token || !isNativeMobileBridgeAvailable()) {
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

        if (location.pathname === resolved.pathname) {
          await clearPendingNativeLaunchTarget();
          return;
        }

        await clearPendingNativeLaunchTarget();
        await resolved.navigate();
      } finally {
        pollingRef.current = false;
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        void syncPendingLaunchTarget();
      }
    }

    window.addEventListener("focus", syncPendingLaunchTarget);
    document.addEventListener("visibilitychange", onVisibilityChange);
    void syncPendingLaunchTarget();

    return () => {
      active = false;
      window.removeEventListener("focus", syncPendingLaunchTarget);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [location.pathname, navigate, token]);

  return null;
}
