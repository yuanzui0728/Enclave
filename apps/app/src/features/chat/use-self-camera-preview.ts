import { useEffect, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { isNativeMobileRuntime } from "../../runtime/native-runtime";

const t = translateRuntimeMessage;

type CameraPreviewStatus =
  | "idle"
  | "requesting-permission"
  | "ready"
  | "unsupported";

type UseSelfCameraPreviewOptions = {
  enabled: boolean;
  restartKey?: number;
};

export function useSelfCameraPreview({
  enabled,
  restartKey = 0,
}: UseSelfCameraPreviewOptions) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraPreviewStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const supported =
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia);

  useEffect(() => {
    let shouldResumeAfterVisibilityHidden = false;
    let connectRequestId = 0;

    const stopCurrentStream = () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };

    if (!supported) {
      stopCurrentStream();
      setStatus("unsupported");
      setError(resolveCameraPreviewUnsupportedCopy());
      setPermissionDenied(false);
      return;
    }

    if (!enabled) {
      stopCurrentStream();
      setStatus("idle");
      setError(null);
      setPermissionDenied(false);
      return;
    }

    let disposed = false;

    const connect = async () => {
      const requestId = connectRequestId + 1;
      connectRequestId = requestId;
      setStatus("requesting-permission");
      setError(null);
      setPermissionDenied(false);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 720 },
            height: { ideal: 1280 },
          },
          audio: false,
        });

        if (
          disposed ||
          connectRequestId !== requestId ||
          (typeof document !== "undefined" &&
            document.visibilityState === "hidden")
        ) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        stopCurrentStream();
        streamRef.current = stream;

        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.muted = true;
          video.playsInline = true;
          await video.play().catch(() => {});
        }

        setStatus("ready");
      } catch (cameraError) {
        if (disposed || connectRequestId !== requestId) {
          return;
        }

        stopCurrentStream();
        setStatus("idle");
        const mapped = mapCameraPreviewError(cameraError);
        setError(mapped.message);
        setPermissionDenied(mapped.permissionDenied);
      }
    };

    void connect();

    const handleVisibilityChange = () => {
      if (typeof document === "undefined") {
        return;
      }

      if (document.visibilityState === "hidden") {
        shouldResumeAfterVisibilityHidden = Boolean(streamRef.current);
        connectRequestId += 1;
        stopCurrentStream();
        if (shouldResumeAfterVisibilityHidden) {
          setStatus("idle");
          setError(null);
        }
        return;
      }

      if (!enabled || !shouldResumeAfterVisibilityHidden) {
        return;
      }

      shouldResumeAfterVisibilityHidden = false;
      void connect();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      disposed = true;
      connectRequestId += 1;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      stopCurrentStream();
    };
  }, [enabled, restartKey, supported]);

  return {
    error,
    permissionDenied,
    status,
    supported,
    videoRef,
  };
}

function mapCameraPreviewError(error: unknown): {
  message: string;
  permissionDenied: boolean;
} {
  if (error instanceof DOMException) {
    switch (error.name) {
      case "AbortError":
        return {
          message: t(msg`摄像头启动被中断了，请再试一次。`),
          permissionDenied: false,
        };
      case "NotAllowedError":
      case "SecurityError":
        return {
          message: resolveCameraPermissionDeniedCopy(),
          permissionDenied: true,
        };
      case "NotFoundError":
        return {
          message: t(msg`当前设备没有可用的摄像头。`),
          permissionDenied: false,
        };
      case "NotReadableError":
      case "TrackStartError":
        return {
          message: t(msg`摄像头可能正被其他应用占用，请关闭后重试。`),
          permissionDenied: false,
        };
      case "OverconstrainedError":
        return {
          message: t(msg`当前摄像头参数不可用，请重试。`),
          permissionDenied: false,
        };
      default:
        break;
    }
  }

  if (error instanceof Error) {
    return {
      message: error.message || resolveCameraPermissionCheckCopy(),
      permissionDenied: false,
    };
  }

  return {
    message: resolveCameraPermissionCheckCopy(),
    permissionDenied: false,
  };
}

function resolveCameraPreviewUnsupportedCopy() {
  return isNativeMobileRuntime()
    ? t(msg`当前设备不支持摄像头预览。`)
    : t(msg`当前浏览器不支持摄像头预览。`);
}

function resolveCameraPermissionDeniedCopy() {
  const surfaceLabel = isNativeMobileRuntime() ? t(msg`应用`) : t(msg`浏览器`);
  return t(msg`摄像头权限被拒绝，请先允许${surfaceLabel}访问摄像头。`);
}

function resolveCameraPermissionCheckCopy() {
  const surfaceLabel = isNativeMobileRuntime() ? t(msg`应用`) : t(msg`浏览器`);
  return t(msg`无法打开摄像头，请检查${surfaceLabel}权限。`);
}
