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

// 顶层崩溃兜底文案：boundary 挂在 AppLocaleProvider 之上，崩溃时拿不到运行时
// i18n context（用 msg``/<Trans> 会在它本要兜的崩溃上二次抛错）。这里用一份不依赖
// 任何 React context 的静态四语字典 + 纯函数语言探测（先读已存的 locale 偏好，
// 回落 navigator.language），保证 i18n 整个挂掉时仍能按用户语言展示且绝不再抛。
// 故意不进 catalog（catalog 取值需要运行时上下文），用 i18n-ignore 标注为有意为之。
// i18n-ignore-start: 顶层崩溃兜底文案不能依赖运行时 i18n，必须是 context-free 常量
const CRASH_FALLBACK_TEXT = {
  "zh-CN": { title: "页面发生错误", retry: "重试", reload: "刷新页面" },
  "en-US": { title: "Something went wrong", retry: "Retry", reload: "Reload page" },
  "ja-JP": { title: "ページでエラーが発生しました", retry: "再試行", reload: "再読み込み" },
  "ko-KR": { title: "페이지에 오류가 발생했어요", retry: "다시 시도", reload: "새로고침" },
} as const;
// i18n-ignore-end

type CrashLocale = keyof typeof CRASH_FALLBACK_TEXT;

// 纯探测，绝不抛错；与 @yinjie/i18n 的 surface 存储键约定一致，但不引入运行时依赖。
function detectCrashLocale(): CrashLocale {
  try {
    let raw: string | null = null;
    if (typeof window !== "undefined" && window.localStorage) {
      for (const surface of ["app", "cloud-console", "wiki", "site", "admin"]) {
        const v = window.localStorage.getItem(`yinjie-i18n-locale:${surface}`);
        if (v) {
          raw = v;
          break;
        }
      }
    }
    if (!raw && typeof navigator !== "undefined") {
      raw = navigator.language || navigator.languages?.[0] || null;
    }
    const n = (raw || "").toLowerCase();
    if (n.startsWith("en")) return "en-US";
    if (n.startsWith("ja")) return "ja-JP";
    if (n.startsWith("ko")) return "ko-KR";
    return "zh-CN";
  } catch {
    return "zh-CN";
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
  const text = CRASH_FALLBACK_TEXT[detectCrashLocale()];
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
      <div style={{ fontSize: 16, fontWeight: 600 }}>{text.title}</div>
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
          {text.retry}
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
          {text.reload}
        </button>
      </div>
    </div>
  );
}
