import { useEffect, useRef, useState } from "react";
import { isNativeMobileRuntime } from "../../runtime/native-runtime";

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
  const supported =
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia);

  useEffect(() => {
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
      return;
    }

    if (!enabled) {
      stopCurrentStream();
      setStatus("idle");
      setError(null);
      return;
    }

    let disposed = false;

    const connect = async () => {
      setStatus("requesting-permission");
      setError(null);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 720 },
            height: { ideal: 1280 },
          },
          audio: false,
        });

        if (disposed) {
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
        if (disposed) {
          return;
        }

        stopCurrentStream();
        setStatus("idle");
        setError(
          mapCameraPreviewError(cameraError),
        );
      }
    };

    void connect();

    return () => {
      disposed = true;
      stopCurrentStream();
    };
  }, [enabled, restartKey, supported]);

  return {
    error,
    permissionDenied: Boolean(error?.includes("权限被拒绝")),
    status,
    supported,
    videoRef,
  };
}

function mapCameraPreviewError(error: unknown) {
  if (error instanceof DOMException) {
    switch (error.name) {
      case "AbortError":
        return "摄像头启动被中断了，请再试一次。";
      case "NotAllowedError":
      case "SecurityError":
        return resolveCameraPermissionDeniedCopy();
      case "NotFoundError":
        return "当前设备没有可用的摄像头。";
      case "NotReadableError":
      case "TrackStartError":
        return "摄像头可能正被其他应用占用，请关闭后重试。";
      case "OverconstrainedError":
        return "当前摄像头参数不可用，请重试。";
      default:
        break;
    }
  }

  if (error instanceof Error) {
    return error.message || resolveCameraPermissionCheckCopy();
  }

  return resolveCameraPermissionCheckCopy();
}

function resolveCameraPreviewUnsupportedCopy() {
  return isNativeMobileRuntime()
    ? "当前设备不支持摄像头预览。"
    : "当前浏览器不支持摄像头预览。";
}

function resolveCameraPermissionDeniedCopy() {
  const surfaceLabel = isNativeMobileRuntime() ? "应用" : "浏览器";
  return `摄像头权限被拒绝，请先允许${surfaceLabel}访问摄像头。`;
}

function resolveCameraPermissionCheckCopy() {
  const surfaceLabel = isNativeMobileRuntime() ? "应用" : "浏览器";
  return `无法打开摄像头，请检查${surfaceLabel}权限。`;
}
