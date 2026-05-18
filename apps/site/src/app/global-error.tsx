"use client";

import { isCurrentOriginLocalLike, track } from "@yinjie/analytics";
import { useEffect } from "react";

// Next.js 把 root layout 的渲染错误转交给这个组件（取代整棵 html）。
// 这里需要返回完整的 <html><body>。把错误带 digest 一并送遥测。
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // dev origin（next dev / localhost）下 HMR 抖动出的渲染错误不入 telemetry，
    // 与 app/wiki 的 ErrorBoundary 同策略。
    if (isCurrentOriginLocalLike()) return;
    track("react_render_error", {
      message: error.message ?? null,
      name: error.name ?? null,
      stack: error.stack?.slice(0, 2000) ?? null,
      digest: error.digest ?? null,
      surface: "site",
    });
  }, [error]);

  return (
    <html lang="zh-CN">
      <body
        style={{
          minHeight: "100vh",
          margin: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          gap: "12px",
          fontFamily:
            "system-ui, -apple-system, 'PingFang SC', 'Hiragino Sans', sans-serif",
          background: "#fafafa",
          color: "#27272a",
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 600 }}>页面发生错误</div>
        <div
          style={{
            maxWidth: 360,
            fontSize: 13,
            color: "#71717a",
            textAlign: "center",
            wordBreak: "break-word",
          }}
        >
          {error.message || "Unexpected error"}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: "8px 16px",
              border: "1px solid #d4d4d8",
              borderRadius: 8,
              background: "#fff",
              color: "#27272a",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            重试
          </button>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined") window.location.reload();
            }}
            style={{
              padding: "8px 16px",
              border: "none",
              borderRadius: 8,
              background: "#18181b",
              color: "#fff",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            刷新页面
          </button>
        </div>
      </body>
    </html>
  );
}
