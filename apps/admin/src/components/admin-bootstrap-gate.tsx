// i18n-ignore-start: data / seed / preset content — not user-facing UI.
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  getMyCloudWorldAccessSession,
  resolveMyCloudWorldAccess,
  sendCloudEmailCode,
  verifyCloudEmailCode,
  type WorldAccessSessionSummary,
} from "@yinjie/contracts";
import { Button, InlineNotice, LoadingBlock, TextField } from "@yinjie/ui";
import {
  clearAdminRuntimeSession,
  setAdminRuntime,
  useAdminRuntime,
} from "../runtime/admin-runtime-store";
import { resolveAdminCloudApiBaseUrl } from "../lib/core-api-base";

const READY_POLL_INTERVAL_MS = 1500;
const WAITING_STATUSES = new Set<WorldAccessSessionSummary["status"]>([
  "pending",
  "resolving",
  "waiting",
]);
const FAILURE_STATUSES = new Set<WorldAccessSessionSummary["status"]>([
  "failed",
  "disabled",
  "expired",
]);

type GateState =
  | { kind: "idle" }
  | { kind: "code-sent"; email: string }
  | { kind: "verifying" }
  | { kind: "waiting"; email: string; accessToken: string; sessionId: string }
  | { kind: "error"; message: string };

function describeRequestError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

export function AdminBootstrapGate({ children }: { children: ReactNode }) {
  const runtime = useAdminRuntime();
  const cloudApiBaseUrl = useMemo(() => resolveAdminCloudApiBaseUrl(), []);

  if (runtime.apiBaseUrl) {
    return (
      <>
        {children}
        <FloatingAccountBadge />
      </>
    );
  }

  return <BootstrapForm cloudApiBaseUrl={cloudApiBaseUrl} />;
}

function BootstrapForm({ cloudApiBaseUrl }: { cloudApiBaseUrl: string }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [state, setState] = useState<GateState>({ kind: "idle" });
  const [notice, setNotice] = useState("");
  const pollAbort = useRef<AbortController | null>(null);
  const cloudConsoleHint = useMemo(() => {
    if (typeof window === "undefined") return null;
    try {
      const consoleUrl = new URL(cloudApiBaseUrl);
      // 同 host 不同 port：cloud-api 3001 → cloud-console 5182（dev-services.mjs 约定）
      consoleUrl.port = "5182";
      consoleUrl.protocol = window.location.protocol;
      return consoleUrl.toString();
    } catch {
      return null;
    }
  }, [cloudApiBaseUrl]);

  useEffect(() => () => pollAbort.current?.abort(), []);

  const sendCode = useCallback(async () => {
    if (!email.trim()) {
      setState({ kind: "error", message: "请输入邮箱。" });
      return;
    }

    setNotice("");
    setState({ kind: "verifying" });

    try {
      const result = await sendCloudEmailCode(
        { email: email.trim().toLowerCase() },
        cloudApiBaseUrl,
      );
      setEmail(result.email);
      setNotice(
        result.debugCode
          ? `验证码已发送（开发环境调试码：${result.debugCode}）。`
          : "验证码已发送，请查收邮箱（含垃圾邮件箱）。",
      );
      setState({ kind: "code-sent", email: result.email });
    } catch (error) {
      setState({
        kind: "error",
        message: describeRequestError(error, "发送验证码失败。"),
      });
    }
  }, [cloudApiBaseUrl, email]);

  const pollSession = useCallback(
    async (accessToken: string, sessionId: string, verifiedEmail: string) => {
      pollAbort.current?.abort();
      const controller = new AbortController();
      pollAbort.current = controller;

      while (!controller.signal.aborted) {
        try {
          const session = await getMyCloudWorldAccessSession(
            sessionId,
            accessToken,
            cloudApiBaseUrl,
          );

          if (FAILURE_STATUSES.has(session.status)) {
            setState({
              kind: "error",
              message:
                session.failureReason ?? "云世界解析失败，请稍后重试。",
            });
            return;
          }

          if (session.status === "ready" && session.resolvedApiBaseUrl) {
            setAdminRuntime({
              apiBaseUrl: session.resolvedApiBaseUrl,
              accessToken,
              cloudApiBaseUrl,
              cloudEmail: verifiedEmail,
              cloudWorldId: session.worldId ?? undefined,
              cloudAccessSessionId: session.id,
            });
            setNotice("已连接到当前账号的世界。");
            return;
          }

          if (!WAITING_STATUSES.has(session.status)) {
            setState({
              kind: "error",
              message: `未知会话状态: ${session.status}`,
            });
            return;
          }

          setNotice(session.displayStatus || "正在解析云世界…");
        } catch (error) {
          setState({
            kind: "error",
            message: describeRequestError(error, "查询世界访问会话失败。"),
          });
          return;
        }

        await new Promise((resolve) =>
          setTimeout(resolve, READY_POLL_INTERVAL_MS),
        );
      }
    },
    [cloudApiBaseUrl],
  );

  const verifyAndConnect = useCallback(async () => {
    if (!email.trim() || !code.trim()) {
      setState({ kind: "error", message: "请输入邮箱和验证码。" });
      return;
    }

    setNotice("");
    setState({ kind: "verifying" });

    try {
      const verifyResult = await verifyCloudEmailCode(
        {
          email: email.trim().toLowerCase(),
          code: code.trim(),
        },
        cloudApiBaseUrl,
      );

      const session = await resolveMyCloudWorldAccess(
        {
          clientPlatform: "web",
          clientVersion: "admin-dev",
        },
        verifyResult.accessToken,
        cloudApiBaseUrl,
      );

      if (FAILURE_STATUSES.has(session.status)) {
        setState({
          kind: "error",
          message: session.failureReason ?? "云世界访问失败。",
        });
        return;
      }

      if (session.status === "ready" && session.resolvedApiBaseUrl) {
        setAdminRuntime({
          apiBaseUrl: session.resolvedApiBaseUrl,
          accessToken: verifyResult.accessToken,
          cloudApiBaseUrl,
          cloudEmail: verifyResult.email,
          cloudWorldId: session.worldId ?? undefined,
          cloudAccessSessionId: session.id,
        });
        return;
      }

      setState({
        kind: "waiting",
        email: verifyResult.email,
        accessToken: verifyResult.accessToken,
        sessionId: session.id,
      });
      setNotice(session.displayStatus || "正在解析云世界…");
      void pollSession(verifyResult.accessToken, session.id, verifyResult.email);
    } catch (error) {
      setState({
        kind: "error",
        message: describeRequestError(error, "登录失败。"),
      });
    }
  }, [cloudApiBaseUrl, code, email, pollSession]);

  const isBusy = state.kind === "verifying" || state.kind === "waiting";

  return (
    <div className="min-h-screen flex items-center justify-center bg-[color:var(--bg-base)] p-6">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] p-6 shadow-sm">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">隐界管理后台</h1>
          <p className="text-sm text-[color:var(--text-dim)]">
            输入邮箱登录，会自动连接到<b>该邮箱绑定的那个 world</b>（不是浏览任意世界）。
          </p>
          <p className="text-xs text-[color:var(--text-dim)]">
            cloud-api: {cloudApiBaseUrl}
          </p>
        </div>

        <InlineNotice tone="warning">
          ⚠ 想查看具体某个世界的后台数据，请回云控制台
          {cloudConsoleHint ? (
            <>
              （
              <a
                className="underline"
                href={cloudConsoleHint}
                target="_blank"
                rel="noreferrer noopener"
              >
                {cloudConsoleHint}
              </a>
              ）
            </>
          ) : null}
          的"世界列表"，点对应世界的"进入后台"，那里走 hash bootstrap
          会把当前 admin tab 精确连到那个 world child，不会串台。
        </InlineNotice>

        <div className="space-y-3">
          <label className="block text-sm space-y-1">
            <span>邮箱</span>
            <TextField
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              disabled={isBusy}
            />
          </label>

          <label className="block text-sm space-y-1">
            <span>验证码</span>
            <TextField
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="请输入邮箱收到的 6 位验证码"
              autoComplete="one-time-code"
              disabled={isBusy}
            />
          </label>
        </div>

        {notice ? <InlineNotice tone="info">{notice}</InlineNotice> : null}
        {state.kind === "error" ? (
          <InlineNotice tone="warning">{state.message}</InlineNotice>
        ) : null}

        {state.kind === "waiting" ? <LoadingBlock /> : null}

        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={sendCode}
            disabled={isBusy}
          >
            发送验证码
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={verifyAndConnect}
            disabled={isBusy}
          >
            登录并连接
          </Button>
        </div>
      </div>
    </div>
  );
}

// 一眼看出当前 admin tab 是哪个 world：apiBaseUrl 是 multi-world child 真正区分
// 数据源的字段，必须显著可见而非藏在 hover title 里，否则"撞错 world child / 撞
// dev fallback :3000"这种串台症状没法直接发现。
function FloatingAccountBadge() {
  const runtime = useAdminRuntime();

  function logout() {
    clearAdminRuntimeSession();
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  }

  const apiBaseUrl = runtime.apiBaseUrl?.trim() ?? "";
  const worldIdShort = runtime.cloudWorldId
    ? runtime.cloudWorldId.slice(0, 8)
    : null;
  // dev fallback 命中 = .env 里 VITE_CORE_API_BASE_URL 兜底进来；multi-world 部署里
  // 见到这个就说明 hash bootstrap 失败了，所有世界都会撞同一份数据。染红提醒。
  const isDevFallback =
    /127\.0\.0\.1:3000\b/.test(apiBaseUrl) ||
    /localhost:3000\b/.test(apiBaseUrl);
  const baseClasses =
    "fixed bottom-3 right-3 z-50 flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs shadow";
  const toneClasses = isDevFallback
    ? "border-red-500/70 bg-red-500/10 text-red-700"
    : "border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] text-[color:var(--text-dim)]";

  return (
    <div className={`${baseClasses} ${toneClasses}`} title={apiBaseUrl}>
      {isDevFallback ? <span>⚠ dev fallback</span> : null}
      {worldIdShort ? (
        <span className="font-mono">world {worldIdShort}</span>
      ) : null}
      <span className="font-mono">{apiBaseUrl || "(no apiBaseUrl)"}</span>
      <span>
        {runtime.cloudEmail ?? runtime.cloudPhone ?? "未知账号"}
      </span>
      <button
        type="button"
        onClick={logout}
        className={
          isDevFallback
            ? "text-red-700 hover:underline"
            : "text-[color:var(--accent)] hover:underline"
        }
      >
        切换账号
      </button>
    </div>
  );
}
// i18n-ignore-end
