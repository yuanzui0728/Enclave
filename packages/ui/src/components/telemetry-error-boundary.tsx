import { Component, type ErrorInfo, type ReactNode } from "react";

type TelemetryErrorBoundaryProps = {
  children: ReactNode;
  // 上报 hook —— apps 在这里调 @yinjie/analytics.track("react_render_error", ...)。
  // UI 包不直接依赖 analytics 包，调用方负责接线。
  onError?: (error: unknown, info: ErrorInfo) => void;
  // 不传时给一个最小 fallback；apps 可以覆盖给定制 UI（带导航 / 重试）。
  fallback?: ReactNode | ((error: unknown, reset: () => void) => ReactNode);
};

type State = {
  error: unknown;
};

// React render-time 抛错时默认整棵树会被 unmount → 白屏。挂一个顶层 boundary：
// 1) 把错误带 componentStack 一并送遥测（白屏遥测拿不到这个上下文）；
// 2) 显示一个最小 fallback 让用户至少能看到"出错了 + 刷新"，而不是白屏。
export class TelemetryErrorBoundary extends Component<
  TelemetryErrorBoundaryProps,
  State
> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    try {
      this.props.onError?.(error, info);
    } catch {
      // 上报失败不能再抛回 React，否则会进入 unrecoverable
    }
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;
    const { fallback } = this.props;
    if (typeof fallback === "function") return fallback(error, this.reset);
    if (fallback !== undefined) return fallback;
    return <DefaultFallback error={error} onReset={this.reset} />;
  }
}

function DefaultFallback({
  error,
  onReset,
}: {
  error: unknown;
  onReset: () => void;
}) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unexpected error";
  return (
    <div
      role="alert"
      style={{
        minHeight: "100vh",
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
        {message}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={onReset}
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
    </div>
  );
}
