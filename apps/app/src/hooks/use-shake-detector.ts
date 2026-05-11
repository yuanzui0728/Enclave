import { useEffect, useEffectEvent, useState } from "react";

export type ShakePermissionState =
  | "unsupported"
  | "needs-permission"
  | "granted"
  | "denied";

type IosDeviceMotionEventCtor = {
  requestPermission?: () => Promise<"granted" | "denied" | "prompt">;
};

type UseShakeDetectorOptions = {
  enabled: boolean;
  onShake: () => void;
  threshold?: number;
  windowMs?: number;
  minEvents?: number;
  cooldownMs?: number;
  probeMs?: number;
};

export function useShakeDetector(options: UseShakeDetectorOptions) {
  const {
    enabled,
    threshold = DEFAULT_THRESHOLD,
    windowMs = DEFAULT_WINDOW_MS,
    minEvents = DEFAULT_MIN_EVENTS,
    cooldownMs = DEFAULT_COOLDOWN_MS,
    probeMs = DEFAULT_PROBE_MS,
  } = options;

  const [permissionState, setPermissionState] =
    useState<ShakePermissionState>(detectInitialPermissionState);

  const fireShake = useEffectEvent(() => {
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.vibrate === "function"
    ) {
      try {
        navigator.vibrate(50);
      } catch {
        // some browsers throw on insecure contexts; safe to ignore
      }
    }
    options.onShake();
  });

  async function requestPermission(): Promise<ShakePermissionState> {
    if (typeof window === "undefined" || typeof DeviceMotionEvent === "undefined") {
      setPermissionState("unsupported");
      return "unsupported";
    }

    const ctor = DeviceMotionEvent as unknown as IosDeviceMotionEventCtor;
    if (typeof ctor.requestPermission !== "function") {
      setPermissionState("granted");
      return "granted";
    }

    try {
      const result = await ctor.requestPermission();
      const next: ShakePermissionState =
        result === "granted" ? "granted" : "denied";
      setPermissionState(next);
      return next;
    } catch {
      setPermissionState("denied");
      return "denied";
    }
  }

  useEffect(() => {
    if (!enabled || permissionState !== "granted") {
      return;
    }
    if (typeof window === "undefined") {
      return;
    }

    let lastX = 0;
    let lastY = 0;
    let lastZ = 0;
    let lastTime = 0;
    let cooldownUntil = 0;
    let lastShakeAt = 0;
    let consecutiveCount = 0;
    let sawAnyAccel = false;

    function handleMotion(event: DeviceMotionEvent) {
      const g = event.accelerationIncludingGravity;
      if (!g || g.x == null || g.y == null || g.z == null) {
        return;
      }
      sawAnyAccel = true;

      const now = event.timeStamp || Date.now();
      const dt = now - lastTime;
      if (lastTime !== 0 && dt >= 10) {
        const speed =
          ((Math.abs(g.x - lastX) +
            Math.abs(g.y - lastY) +
            Math.abs(g.z - lastZ)) /
            dt) *
          10000;
        if (speed > threshold) {
          if (now - lastShakeAt > windowMs) {
            consecutiveCount = 0;
          }
          consecutiveCount += 1;
          lastShakeAt = now;
          if (consecutiveCount >= minEvents && now > cooldownUntil) {
            cooldownUntil = now + cooldownMs;
            consecutiveCount = 0;
            fireShake();
          }
        }
      }
      lastX = g.x;
      lastY = g.y;
      lastZ = g.z;
      lastTime = now;
    }

    window.addEventListener("devicemotion", handleMotion);

    // 兜底：probeMs 内一次 accel sample 都没回，判定为传感器不可用
    const probeTimer = window.setTimeout(() => {
      if (!sawAnyAccel) {
        setPermissionState("unsupported");
      }
    }, probeMs);

    return () => {
      window.removeEventListener("devicemotion", handleMotion);
      window.clearTimeout(probeTimer);
    };
  }, [enabled, permissionState, threshold, windowMs, minEvents, cooldownMs, probeMs]);

  return { permissionState, requestPermission };
}

function detectInitialPermissionState(): ShakePermissionState {
  if (typeof window === "undefined" || typeof DeviceMotionEvent === "undefined") {
    return "unsupported";
  }
  const ctor = DeviceMotionEvent as unknown as IosDeviceMotionEventCtor;
  if (typeof ctor.requestPermission === "function") {
    return "needs-permission";
  }
  return "granted";
}

const DEFAULT_THRESHOLD = 800;
const DEFAULT_WINDOW_MS = 1000;
const DEFAULT_MIN_EVENTS = 2;
const DEFAULT_COOLDOWN_MS = 1500;
const DEFAULT_PROBE_MS = 1500;
