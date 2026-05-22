import {
  type InputHTMLAttributes,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { msg } from "@lingui/macro";
import { useLingui } from "@lingui/react";
import { GoogleLogin, GoogleOAuthProvider } from "@react-oauth/google";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DEFAULT_CORE_API_BASE_URL,
  getMyCloudWorldAccessSession,
  getWorldOwner,
  isApiRequestError,
  loginCloudWithPassword,
  resolveMyCloudWorldAccess,
  sendCloudEmailCode,
  sendCloudPhoneCode,
  updateWorldOwner,
  verifyCloudEmailCode,
  verifyCloudGoogleIdToken,
  verifyCloudPhoneCode,
  type WorldAccessSessionSummary,
} from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { track } from "@yinjie/analytics";
import { AppPage, AppSection, Button, ErrorBlock, InlineNotice, LoadingBlock, TextField } from "@yinjie/ui";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { detectClientPublicIp } from "../lib/client-public-ip";
import { getDeviceFingerprint } from "../lib/device-fingerprint";
import { persistInviteCode, readStoredInviteCode } from "../lib/invite-code-storage";
import { describeRequestError } from "../lib/request-error";
import { isLocalWorldEntryEnabled } from "../lib/world-access-mode";
import { assertWorldReachable } from "../lib/world-entry";
import { setAppRuntimeConfig, useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { isCloudSessionExpired, useCloudSessionStore } from "../store/cloud-session-store";
import { useWorldOwnerStore } from "../store/world-owner-store";
import { assertOwnerIdentity } from "../lib/user-scoped-state";

type WorldAccessMode = "cloud" | "local";
type LocalWorldApiAdjustment = "api-path" | "app-dev-port";
type WelcomeMessage = ReturnType<typeof msg>;
type WelcomeTranslator = (message: WelcomeMessage) => string;

const LOCAL_APP_DEV_PORT = "5180";
const LOCAL_CORE_API_PORT = "3000";
// 前端先做一次粗校验把 "a@b" / "not-an-email" 这类明显非邮箱挡掉，避免发 send-code
// 浪费 cloud-api 那一格 per-email rate-limit slot；同时把"无效邮箱"的错误反馈
// 缩短到本地（之前要等 400 → describeRequestError 拆响应）。规则故意宽松：
// `local@host`（无 TLD）也允许，让 LAN intranet 邮箱（如 user@corp.lan）能通过；
// 真严格的 RFC 5321 校验交给服务端。
const EMAIL_BASIC_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isProbableEmail(value: string) {
  return EMAIL_BASIC_REGEX.test(value.trim().toLowerCase());
}
// 历史上只校验 trim() 非空，结果一大批新用户图省事敲个 "w" 就过 onboarding，
// 世界主人昵称全是 "w"。这里要求 ≥ 2 个字符，逼用户真的写一个名字。
const MIN_OWNER_NAME_LENGTH = 2;
const WAITING_CLOUD_SESSION_STATUSES = new Set<WorldAccessSessionSummary["status"]>(["pending", "resolving", "waiting"]);
const FAILURE_CLOUD_SESSION_STATUSES = new Set<WorldAccessSessionSummary["status"]>(["failed", "disabled", "expired"]);
const WORLD_ACCESS_MESSAGE_MAP: Record<string, WelcomeMessage> = {
  "World is missing an API endpoint.": msg`世界缺少可用的 API 地址。`,
  "The world finished starting but no apiBaseUrl is available yet.":
    msg`世界已经启动完成，但暂时还没有可用的 API 地址。`,
  "World is ready.": msg`世界已就绪。`,
  "Waking the existing world.": msg`正在唤醒已有世界。`,
  "World startup failed.": msg`世界启动失败。`,
  "The world could not be started.": msg`世界暂时无法启动。`,
  "World is disabled.": msg`世界已被停用。`,
  "This world is currently disabled by ops.": msg`该世界当前已被运维停用。`,
  "World is being deleted.": msg`世界正在删除中。`,
  "The world is being deleted and cannot be resumed.":
    msg`世界正在删除，无法恢复。`,
  "Creating a brand new world.": msg`正在创建全新的世界。`,
  "Cloud access session is missing.": msg`云世界访问会话缺失。`,
};

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

// detectClientPublicIp 顺序探 3 个端点、每个 2.5s 超时；全失败要 7.5s。mount 时
// 预热一遍就把它喂热了——但 Google 登录路径用户点完 Google 按钮往往在 mount
// 后 2-5s 触发 continueWithGoogleSignIn，预热还没跑完。clientReportedIp 只用
// 来给 cloud-api 在 L4 隧道下当兜底显示/统计源（不当风控基准），晚一点拿到 /
// 干脆拿不到都不影响登录正确性，给它配一个紧 timeout 把"全 GFW 拒"那种 7.5s
// 卡顿削平，避免 Google/Email 登录在弱网用户那里看上去像挂了。
async function detectClientPublicIpWithTimeout(maxWaitMs: number): Promise<string | undefined> {
  const ip = await Promise.race([
    detectClientPublicIp(),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), maxWaitMs)),
  ]);
  return ip ?? undefined;
}

function resolveBrowserBaseUrl() {
  if (typeof window !== "undefined" && (window.location.protocol === "http:" || window.location.protocol === "https:")) {
    return window.location.origin;
  }

  return undefined;
}

function isLoopbackBaseUrl(value: string) {
  try {
    const url = new URL(value);
    return ["localhost", "127.0.0.1", "0.0.0.0", "10.0.2.2"].includes(url.hostname);
  } catch {
    return false;
  }
}

type LocalWorldApiResolution = {
  adjustment?: LocalWorldApiAdjustment;
  value: string;
};

function resolveLocalWorldApiBaseUrl(value?: string) {
  if (!value) {
    return undefined;
  }

  try {
    const url = new URL(value);
    let adjustment: LocalWorldApiAdjustment | undefined;

    if (/\/api\/?$/.test(url.pathname)) {
      url.pathname = url.pathname.replace(/\/api\/?$/, "") || "/";
      adjustment = "api-path";
    }

    if (url.port === LOCAL_APP_DEV_PORT) {
      url.port = LOCAL_CORE_API_PORT;
      adjustment = "app-dev-port";
    }

    return {
      adjustment,
      value: url.toString().replace(/\/+$/, ""),
    } satisfies LocalWorldApiResolution;
  } catch {
    return {
      value,
    } satisfies LocalWorldApiResolution;
  }
}

function resolveDefaultLocalApiBaseUrl(configuredApiBaseUrl?: string) {
  const browserBaseUrl = resolveBrowserBaseUrl();
  if (configuredApiBaseUrl) {
    if (browserBaseUrl && isLoopbackBaseUrl(configuredApiBaseUrl) && !isLoopbackBaseUrl(browserBaseUrl)) {
      return browserBaseUrl;
    }

    return resolveLocalWorldApiBaseUrl(configuredApiBaseUrl)?.value ?? configuredApiBaseUrl;
  }

  if (browserBaseUrl) {
    return resolveLocalWorldApiBaseUrl(browserBaseUrl)?.value ?? browserBaseUrl;
  }

  return DEFAULT_CORE_API_BASE_URL;
}

function buildCloudAccessSessionQueryKey(baseUrl: string, sessionId: string, accessToken: string) {
  return ["welcome-cloud-access-session", baseUrl || "default", sessionId, accessToken] as const;
}

function translateWorldAccessText(
  t: WelcomeTranslator,
  message?: string | null,
) {
  if (!message) {
    return undefined;
  }

  const knownMessage = WORLD_ACCESS_MESSAGE_MAP[message];
  return knownMessage ? t(knownMessage) : message;
}

function describeCloudSessionFailure(
  t: WelcomeTranslator,
  session: WorldAccessSessionSummary,
) {
  return (
    translateWorldAccessText(t, session.failureReason) ??
    translateWorldAccessText(t, session.displayStatus) ??
    t(msg`世界当前不可用。`)
  );
}

function describeCloudSession(
  t: WelcomeTranslator,
  session?: WorldAccessSessionSummary | null,
) {
  if (!session) {
    return t(msg`请先验证邮箱，以解析你的云世界。`);
  }

  if (session.status === "ready") {
    return t(msg`世界已就绪，正在连接...`);
  }

  if (FAILURE_CLOUD_SESSION_STATUSES.has(session.status)) {
    return describeCloudSessionFailure(t, session);
  }

  const translatedDisplayStatus =
    translateWorldAccessText(t, session.displayStatus) ?? session.displayStatus;
  if (session.estimatedWaitSeconds && session.estimatedWaitSeconds > 0) {
    return t(
      msg`${translatedDisplayStatus} 预计等待：${session.estimatedWaitSeconds} 秒。`,
    );
  }

  return translatedDisplayStatus;
}

function describeCloudButtonLabel(
  t: WelcomeTranslator,
  session: WorldAccessSessionSummary | null,
  isContinuing: boolean,
  ownerSyncing: boolean,
  authMode: "login" | "register" = "login",
) {
  if (ownerSyncing) {
    return t(msg`连接中...`);
  }

  if (isContinuing) {
    return t(msg`解析中...`);
  }

  const idleLabel =
    authMode === "register" ? t(msg`注册并进入`) : t(msg`登录并进入`);

  if (!session) {
    return idleLabel;
  }

  if (session.status === "ready") {
    return t(msg`连接中...`);
  }

  if (WAITING_CLOUD_SESSION_STATUSES.has(session.status)) {
    return session.phase === "starting"
      ? t(msg`正在唤醒世界...`)
      : t(msg`正在创建世界...`);
  }

  return idleLabel;
}

function mobileNoticeTone(
  session?: WorldAccessSessionSummary | null,
): "danger" | "info" | "muted" | "success" {
  if (!session) {
    return "info";
  }

  if (session.status === "ready") {
    return "success";
  }

  if (FAILURE_CLOUD_SESSION_STATUSES.has(session.status)) {
    return "danger";
  }

  return "info";
}

type PasswordFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
> & {
  showLabel: string;
  hideLabel: string;
};

function PasswordField({
  showLabel,
  hideLabel,
  className,
  ...rest
}: PasswordFieldProps) {
  const [revealed, setRevealed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // React 在 commit 把 input.type 切到新值后浏览器内部会把 selectionStart/End
  // 重置为 0（chromium 实测：直接 el.type = "..." 不会丢，但 React reconciler
  // 通过 setAttribute 的路径会丢）；用户在长密码中间核对时点眼睛，caret 被
  // 打回开头。在 onClick 捕一次旧 selection，commit 后通过 rAF 还原——
  // useEffect 同步还原不够及时（浏览器的 reset 在 commit 之后才发生）。
  const pendingSelectionRef = useRef<[number, number] | null>(null);
  useEffect(() => {
    const pending = pendingSelectionRef.current;
    if (!pending || !inputRef.current) return;
    const input = inputRef.current;
    pendingSelectionRef.current = null;
    const [start, end] = pending;
    // 双层 rAF：commit 后再过一帧浏览器才把 selection reset 完；同步或单层
    // rAF 内调 setSelectionRange 会被随后的内部 reset 盖掉。
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        try {
          input.setSelectionRange(start, end);
        } catch {
          // 部分浏览器 type=password 上 setSelectionRange 会抛
        }
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [revealed]);
  return (
    <div className="relative">
      <TextField
        {...rest}
        ref={inputRef}
        type={revealed ? "text" : "password"}
        className={`${className ?? ""} pr-12`.trim()}
      />
      <button
        type="button"
        // onMouseDown.preventDefault 阻止 button 抢焦点：原本切换显示密码后
        // document.activeElement 会跳到 button，移动端键盘随之被收起，用户得
        // 再点输入框才能继续敲。preventDefault 让 click 仍然触发但焦点留在
        // input 上（也保住 IME / caret position）。
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          const input = inputRef.current;
          if (input) {
            const start = input.selectionStart;
            const end = input.selectionEnd;
            if (start !== null && end !== null) {
              pendingSelectionRef.current = [start, end];
            }
          }
          setRevealed((value) => !value);
        }}
        aria-label={revealed ? hideLabel : showLabel}
        aria-pressed={revealed}
        className="absolute right-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-[color:var(--text-muted)] transition-colors hover:bg-[color:var(--surface-input-hover,rgba(0,0,0,0.04))] hover:text-[color:var(--text-primary)]"
      >
        {revealed ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a20.07 20.07 0 0 1 5.06-5.94" />
            <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a20.16 20.16 0 0 1-3.16 4.19" />
            <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}

export function WelcomePage() {
  const t = useRuntimeTranslator();
  const { i18n } = useLingui();
  const googleClientId = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID ?? "";
  // 国内访问 accounts.google.com 被墙——zh-CN locale 默认隐藏 Google 按钮，
  // 其他语言（en/ja/ko）显示。海外华人若坚持用中文界面会损失这个入口，可接受。
  const showGoogleButton = Boolean(googleClientId) && i18n.locale !== "zh-CN";
  const navigate = useNavigate();
  const searchStr = useRouterState({
    select: (state) => state.location.searchStr,
  });
  const queryClient = useQueryClient();
  const isDesktopLayout = useDesktopLayout();
  const runtimeConfig = useAppRuntimeConfig();
  const hydrateOwner = useWorldOwnerStore((state) => state.hydrateOwner);
  const storedName = useWorldOwnerStore((state) => state.username);
  const onboardingCompleted = useWorldOwnerStore((state) => state.onboardingCompleted);
  const savedCloudAccessToken = useCloudSessionStore((state) => state.accessToken);
  const savedCloudExpiresAt = useCloudSessionStore((state) => state.expiresAt);
  const savedCloudPhone = useCloudSessionStore((state) => state.phone);
  const savedCloudEmail = useCloudSessionStore((state) => state.email);
  const saveCloudSession = useCloudSessionStore((state) => state.setSession);
  const localWorldEntryEnabled = isLocalWorldEntryEnabled();

  const [mode, setMode] = useState<WorldAccessMode>(
    !localWorldEntryEnabled
      ? "cloud"
      : runtimeConfig.worldAccessMode ?? (runtimeConfig.apiBaseUrl ? "local" : "cloud"),
  );
  const [localApiBaseUrl, setLocalApiBaseUrl] = useState(resolveDefaultLocalApiBaseUrl(runtimeConfig.apiBaseUrl) ?? "");
  const [phone, setPhone] = useState(savedCloudPhone ?? runtimeConfig.cloudPhone ?? "");
  const [code, setCode] = useState("");
  const [accountType, setAccountType] = useState<"phone" | "email">("email");
  // savedCloudEmail 是 zustand-persist 拿回来的，main.tsx 在 React mount 前已
  // `await hydrateCloudSessionStore()`，所以这里读出来一定是最终值。phone 字段
  // 早就读 savedCloudPhone 做预填，email 字段以前写死 ""，导致邮箱/Google 用户
  // 重载后要重新敲一遍邮箱。补对称。
  const [email, setEmail] = useState(savedCloudEmail ?? "");
  const [authMethod, setAuthMethod] = useState<"code" | "password">("code");
  const [password, setPassword] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [cloudAccessToken, setCloudAccessToken] = useState(
    !isCloudSessionExpired(savedCloudExpiresAt) ? savedCloudAccessToken ?? "" : "",
  );
  const [cloudAccessSessionId, setCloudAccessSessionId] = useState<string | null>(null);
  const [connectedAccessSessionId, setConnectedAccessSessionId] = useState<string | null>(null);
  const [ownerName, setOwnerName] = useState(storedName ?? "");
  const [readyBaseUrl, setReadyBaseUrl] = useState<string | null>(null);
  const [ownerSyncing, setOwnerSyncing] = useState(false);
  const [notice, setNotice] = useState("");
  const [entryError, setEntryError] = useState("");
  const [ownerError, setOwnerError] = useState("");
  const [isContinuing, setIsContinuing] = useState(false);
  // 之前三个 useState 各跑一次 readStoredInviteCode()，mount 时 localStorage 读
  // 3 次（同步 IO，受 localStorage quota 检查与 cookie/IDB 锁竞争影响）；同一份
  // 值用同一个 useState 初始化器分发。useRef 只在首次 render 时拿初始值，subsequent
  // renders 不会再读 localStorage。
  const initialInviteCodeRef = useRef<string | null>(null);
  if (initialInviteCodeRef.current === null) {
    initialInviteCodeRef.current = readStoredInviteCode() ?? "";
  }
  const [inviteCode, setInviteCode] = useState(() => initialInviteCodeRef.current ?? "");
  const [authMode, setAuthMode] = useState<"login" | "register">(() => {
    // 老用户（savedCloudEmail / savedCloudPhone 有值，无论 token 是否过期都算）
    // 哪怕本地存了 invite 也优先默认登录 tab——以前只看 invite 在不在，结果
    // "老用户 + 历史 invite 残留" 每次重载都被甩到注册 tab，要手动点登录。
    // URL 携带 ?invite= 的入场仍然由下方 searchStr effect 强制 setAuthMode("register")，
    // 不受这一格影响。
    if (savedCloudEmail || savedCloudPhone) return "login";
    return initialInviteCodeRef.current ? "register" : "login";
  });
  const [inviteCodeAutoFilled, setInviteCodeAutoFilled] = useState(() =>
    Boolean(initialInviteCodeRef.current),
  );
  const cloudConnectKeyRef = useRef<string | null>(null);
  // tanstack-query 的 isPending 在 mutate() 调用后要走完 React 调度才反映到
  // disabled prop；用户 30ms 内双击会绕过这一格，cloud-api 命中 per-email
  // rate-limit 直接 429。走查 r2 复现：3 次连点真发了 2 次请求。用 ref 同步
  // 守一下，"上一发未结束就丢掉新发"。
  const sendCodeInFlightRef = useRef(false);
  const sendEmailCodeInFlightRef = useRef(false);
  // cooldown 跟哪个 identity 绑：原来在 phone/email onChange 里直接
  // setCodeCooldownSeconds(0) 把倒计时清掉——确实解决了"换号还在等"，但
  // 顺手把"误删一字再敲回原值"也清没了：原值仍在服务端 rate-limit 窗口里，
  // 用户视角是按钮该 enabled、按下去却 429。改成把上次发送命中的 identity
  // 记下来，effective 倒计时只在 identity 与当前输入一致时才显示，输入瞬
  // 变成另一个值时自动隐藏、改回去再自动复现。
  const codeCooldownIdentityRef = useRef<string>("");
  // 同样的 React 调度延迟也存在于"登录并进入 / 注册并进入 / 连接本地世界 /
  // Google 登录"按钮上：setIsContinuing(true) 要等 React 渲染才反映到 disabled。
  // 30ms 双击就能发两次 verify-code（或两次 Google idToken 校验），命中 cloud-api
  // 的 per-identity rate-limit 也会拒第二次。统一加 ref 守。
  const continueInFlightRef = useRef(false);

  // 服务端 CLOUD_EMAIL_CODE_RESEND_COOLDOWN_SECONDS 默认 60s，电话同义。客户端原
  // 来没节流——发完一次后按钮立刻又是 enabled，用户 second click 拿到 429（错误
  // 文案就是 "验证码发送过于频繁，请在 NN 秒后重试"），还无谓占掉 5/h 的窗口预算
  // (CLOUD_EMAIL_CODE_MAX_PER_WINDOW 默认 5)。
  // 用 timestamp（cooldownEndAt）而不是裸 seconds counter：移动端浏览器
  // setTimeout/setInterval 在 App 切后台时会被节流到 ≥1s 甚至 5s+，用 counter 倒
  // 推真实时间会滞后——切回前台时 display 还显示 30s 但服务端 cooldown 早就到
  // 期了，用户继续干等。用 endAt 时间戳 + 定时器纯触发 re-render、display 永远
  // 算自 Date.now()，前后台都吻合；再挂 visibilitychange 让 refocus 时立刻补一帧。
  const [codeCooldownEndAt, setCodeCooldownEndAt] = useState(0);
  const [codeCooldownNow, setCodeCooldownNow] = useState(() => Date.now());
  useEffect(() => {
    if (codeCooldownEndAt <= Date.now()) return;
    let intervalId = 0;
    // tick 里自己判 t >= endAt 就把 setInterval 清掉：endAt 只在 effect 依赖
    // 里，cooldown 自然走完时 endAt 并不变、不会触发 cleanup，没有这一步
    // setInterval 会一直每秒 setState 直到 welcome page 卸载，纯浪费 re-render。
    const tick = () => {
      const t = Date.now();
      setCodeCooldownNow(t);
      if (t >= codeCooldownEndAt) {
        if (intervalId) window.clearInterval(intervalId);
        document.removeEventListener("visibilitychange", tick);
      }
    };
    tick();
    intervalId = window.setInterval(tick, 1000); // i18n-ignore-line
    document.addEventListener("visibilitychange", tick);
    return () => {
      if (intervalId) window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [codeCooldownEndAt]);
  const codeCooldownSeconds = Math.max(
    0,
    Math.ceil((codeCooldownEndAt - codeCooldownNow) / 1000),
  );
  // 把 429 时服务端报的 retryAfter 也喂到本地 cooldown，否则用户首次点 send 命中
  // 服务端 per-identity 窗口（比如 30s 前从别的设备/上次会话发过码）直接 429，
  // 错误条上的"重试发送"按钮没禁用、cooldown 也是 0，连点 → 连 429。服务端
  // exception message 形如"验证码发送过于频繁，请在 NN 秒后重试。"，正则把 NN 抠
  // 出来；解析失败则 fallback 60s（跟成功路径保持一致）。
  // identity 已在 handleSendXxxCode 里于 mutate 前写入 ref，这里不用再 set；
  // 走查避免：若读 currentCodeIdentity，期间用户改了字段会把 ref 钉到新值上，
  // 反而让原 identity 的 cooldown 显示在不该显示的输入上。
  function startCooldownFromError(error: unknown) {
    if (!isApiRequestError(error) || error.statusCode !== 429) return;
    const match = error.message.match(/(\d+)\s*秒/);
    const seconds = match ? Number(match[1]) : 60;
    const clamped = Math.min(seconds, 60) || 60;
    setCodeCooldownEndAt(Date.now() + clamped * 1000);
  }

  const currentCodeIdentity =
    accountType === "email" ? email.trim().toLowerCase() : phone.trim();
  // effective：cooldown 真正显示给用户用的值。codeCooldownSeconds > 0 但
  // 当前输入跟 ref 不一致时显示 0（用户已经把字段改成别的 identity，新 identity
  // 没被限速）。改回原值时 effective 立刻回到非零，无需手动恢复。
  const effectiveCooldownSeconds =
    codeCooldownSeconds > 0 &&
    currentCodeIdentity &&
    currentCodeIdentity === codeCooldownIdentityRef.current
      ? codeCooldownSeconds
      : 0;

  const normalizedTypedLocalApiBaseUrl = normalizeBaseUrl(localApiBaseUrl);
  const resolvedLocalApiBaseUrl = resolveLocalWorldApiBaseUrl(normalizedTypedLocalApiBaseUrl);
  const normalizedLocalApiBaseUrl =
    resolvedLocalApiBaseUrl?.value ?? normalizedTypedLocalApiBaseUrl;
  const localApiBaseUrlAdjusted =
    Boolean(normalizedTypedLocalApiBaseUrl) &&
    normalizedLocalApiBaseUrl !== normalizedTypedLocalApiBaseUrl;
  const localApiBaseUrlAdjustment = resolvedLocalApiBaseUrl?.adjustment;
  const normalizedCloudApiBaseUrl = normalizeBaseUrl(runtimeConfig.cloudApiBaseUrl ?? "");
  const showOwnerStep = Boolean(readyBaseUrl) && !onboardingCompleted;

  const cloudAccessSessionQueryKey = useMemo(
    () =>
      cloudAccessSessionId && cloudAccessToken
        ? buildCloudAccessSessionQueryKey(normalizedCloudApiBaseUrl, cloudAccessSessionId, cloudAccessToken)
        : null,
    [cloudAccessSessionId, cloudAccessToken, normalizedCloudApiBaseUrl],
  );

  useEffect(() => {
    setLocalApiBaseUrl(resolveDefaultLocalApiBaseUrl(runtimeConfig.apiBaseUrl) ?? "");
    setPhone(savedCloudPhone ?? runtimeConfig.cloudPhone ?? "");
    if (!localWorldEntryEnabled) {
      setMode("cloud");
    } else if (runtimeConfig.worldAccessMode) {
      setMode(runtimeConfig.worldAccessMode);
    }
  }, [
    localWorldEntryEnabled,
    runtimeConfig.apiBaseUrl,
    runtimeConfig.cloudPhone,
    runtimeConfig.worldAccessMode,
    savedCloudPhone,
  ]);

  useEffect(() => {
    setCloudAccessToken(
      !isCloudSessionExpired(savedCloudExpiresAt) ? savedCloudAccessToken ?? "" : "",
    );
  }, [savedCloudAccessToken, savedCloudExpiresAt]);

  useEffect(() => {
    setOwnerName(storedName ?? "");
  }, [storedName]);

  useEffect(() => {
    const searchParams = new URLSearchParams(searchStr);
    const queryInviteCode = searchParams.get("invite");
    if (queryInviteCode) {
      const normalized = persistInviteCode(queryInviteCode);
      setInviteCode(normalized);
      setInviteCodeAutoFilled(true);
      // 通过邀请链接进入的用户默认走注册流程
      setAuthMode("register");
      return;
    }

    const stored = readStoredInviteCode();
    setInviteCode(stored);
    setInviteCodeAutoFilled(Boolean(stored));
  }, [searchStr]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => setNotice(""), 3200); // i18n-ignore-line
    return () => window.clearTimeout(timer);
  }, [notice]);

  // 预热公网 IP 探测：detectClientPublicIp 每个端点 2.5s 超时、最多顺序探 3 个，
  // 真要全部 fail 能阻塞登录 7.5s；提前在 mount 时 fire-and-forget 把 5min 缓存
  // 喂热，用户点"登录并进入"时直接命中缓存。失败也无所谓——verify 那一格 await
  // 会再补一次（依然走同一个 inflight），只不过那时也已经过了大头延时。
  useEffect(() => {
    void detectClientPublicIp();
  }, []);

  useEffect(() => {
    if (!runtimeConfig.apiBaseUrl || !runtimeConfig.worldAccessMode) {
      setReadyBaseUrl(null);
      setOwnerSyncing(false);
      return;
    }

    // cloud 模式下 getWorldOwner 走 /cloud/world-api 代理，缺 cloud access token
    // 时 cloud-api 会 401 "Missing cloud access token."；这条 rejection 经过 await
    // → promise chain 后偶发会逃出 .catch() 落到 unhandledrejection。直接在调用前
    // 短路，不发请求。
    if (
      runtimeConfig.worldAccessMode === "cloud" &&
      !cloudAccessToken
    ) {
      setReadyBaseUrl(null);
      setOwnerSyncing(false);
      return;
    }

    // connectToResolvedCloudWorld 流程里会 setAppRuntimeConfig({apiBaseUrl:...}) →
    // 触发本 effect，再加上它紧跟着的内联 await getWorldOwner，两边并发各发一次
    // getWorldOwner（同 URL 同 cookie），白送一次网络请求。上一轮 R1 修了
    // continueWithCloudWorld 内联 vs effect@666 那一对，但本 effect 这边没套 ref。
    // 三个 connect 入口（continueWithCloudWorld / continueWithGoogleSignIn / 监听
    // currentCloudSession=ready 的 effect）都在调用 connectToResolvedCloudWorld 前
    // 先把 cloudConnectKeyRef 置上，落幕在 finally 里清——这里直接复用即可。
    if (cloudConnectKeyRef.current) {
      return;
    }

    let active = true;
    setOwnerSyncing(true);

    void getWorldOwner(runtimeConfig.apiBaseUrl)
      .then((owner) => {
        if (!active) {
          return;
        }

        hydrateOwner(owner);
        setReadyBaseUrl(runtimeConfig.apiBaseUrl ?? null);
        setOwnerError("");
        setEntryError("");
        if (owner.onboardingCompleted) {
          void navigate({ to: "/tabs/chat", replace: true });
        }
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setReadyBaseUrl(null);
        if (!onboardingCompleted) {
          setAppRuntimeConfig({
            apiBaseUrl: undefined,
            socketBaseUrl: undefined,
            cloudWorldId: undefined,
            configStatus: undefined,
          });
        }
      })
      .finally(() => {
        if (active) {
          setOwnerSyncing(false);
        }
      });

    return () => {
      active = false;
    };
  }, [
    cloudAccessToken,
    hydrateOwner,
    navigate,
    onboardingCompleted,
    runtimeConfig.apiBaseUrl,
    runtimeConfig.worldAccessMode,
    t,
  ]);

  const cloudAccessSessionQuery = useQuery({
    queryKey: cloudAccessSessionQueryKey ?? ["welcome-cloud-access-session", "idle"],
    queryFn: () => {
      if (!cloudAccessSessionId || !cloudAccessToken) {
        throw new Error(t(msg`云世界访问会话缺失。`));
      }

      return getMyCloudWorldAccessSession(cloudAccessSessionId, cloudAccessToken, normalizedCloudApiBaseUrl || undefined);
    },
    enabled: Boolean(cloudAccessSessionQueryKey),
    retry: false,
    refetchInterval: (query) => {
      const session = query.state.data;
      if (!session || !WAITING_CLOUD_SESSION_STATUSES.has(session.status)) {
        return false;
      }

      return Math.max((session.retryAfterSeconds || 2) * 1000, 1000);
    },
  });

  const currentCloudSession = cloudAccessSessionQuery.data ?? null;
  const cloudWorldPending = Boolean(currentCloudSession && WAITING_CLOUD_SESSION_STATUSES.has(currentCloudSession.status));

  const connectToResolvedCloudWorld = useCallback(async (
    accessToken: string,
    verifiedPhone: string,
    session: WorldAccessSessionSummary,
  ) => {
    if (!session.resolvedApiBaseUrl) {
      setEntryError(
        translateWorldAccessText(t, session.failureReason) ??
          t(msg`世界已解析完成，但没有可用的 API 地址。`),
      );
      return;
    }

    setOwnerSyncing(true);
    setEntryError("");

    try {
      await assertWorldReachable(session.resolvedApiBaseUrl);
      setAppRuntimeConfig({
        apiBaseUrl: session.resolvedApiBaseUrl,
        socketBaseUrl: session.resolvedApiBaseUrl,
        worldAccessMode: "cloud",
        cloudApiBaseUrl: normalizedCloudApiBaseUrl || undefined,
        cloudPhone: verifiedPhone,
        cloudWorldId: session.worldId ?? undefined,
        bootstrapSource: "user",
        configStatus: "configured",
      });

      const owner = await getWorldOwner(session.resolvedApiBaseUrl);
      hydrateOwner(owner);
      setReadyBaseUrl(session.resolvedApiBaseUrl);
      setOwnerName(owner.username ?? "");
      setConnectedAccessSessionId(session.id);
      setNotice(t(msg`已连接到云世界。`));

      if (owner.onboardingCompleted) {
        void navigate({ to: "/tabs/chat", replace: true });
      }
    } catch (error) {
      setReadyBaseUrl(null);
      setEntryError(
        describeRequestError(error, t(msg`世界已就绪，但暂时还无法访问。`)),
      );
    } finally {
      setOwnerSyncing(false);
    }
  }, [hydrateOwner, navigate, normalizedCloudApiBaseUrl, t]);

  useEffect(() => {
    if (!currentCloudSession || !cloudAccessToken || currentCloudSession.status !== "ready" || !currentCloudSession.resolvedApiBaseUrl) {
      return;
    }

    if (connectedAccessSessionId === currentCloudSession.id) {
      return;
    }

    const connectKey = `${currentCloudSession.id}:${currentCloudSession.resolvedApiBaseUrl}`;
    if (cloudConnectKeyRef.current === connectKey) {
      return;
    }

    cloudConnectKeyRef.current = connectKey;
    void connectToResolvedCloudWorld(cloudAccessToken, phone.trim() || runtimeConfig.cloudPhone || "", currentCloudSession).finally(() => {
      if (cloudConnectKeyRef.current === connectKey) {
        cloudConnectKeyRef.current = null;
      }
    });
  }, [
    cloudAccessToken,
    connectToResolvedCloudWorld,
    connectedAccessSessionId,
    currentCloudSession,
    phone,
    runtimeConfig.cloudPhone,
  ]);

  const sendCodeMutation = useMutation({
    mutationFn: () =>
      sendCloudPhoneCode(
        {
          phone: phone.trim(),
        },
        normalizedCloudApiBaseUrl || undefined,
      ),
    onSuccess: (result) => {
      setPhone(result.phone);
      // 只在 dev/mock SMS provider 回吐 debugCode 时帮用户预填，避免把 DEV_BYPASS_CODE
      // ("123456") 硬塞进 UI——以前那行 setCode("123456") 等于把后门码写在前端，
      // 任何人 inspect 都能看到固定值；要么真在 dev，那就用 provider 给的 debugCode；
      // 要么是 prod，就把输入框清空让用户从短信里取真码。与 email 路径保持一致。
      setCode(result.debugCode ?? "");
      setCloudAccessToken("");
      setCloudAccessSessionId(null);
      setConnectedAccessSessionId(null);
      setNotice(
        result.debugCode
          ? t(msg`开发模式：验证码已打印到服务端日志。`)
          : t(msg`验证码已发送。`),
      );
      setEntryError("");
      // ref 更到 server-normalized 值，确保 setPhone(result.phone) 之后 effective
      // 立即匹配（server 给的可能是 "+86xxxx"，跟用户敲的 "xxxx" 不一致）。
      codeCooldownIdentityRef.current = result.phone;
      setCodeCooldownEndAt(Date.now() + 60 * 1000);
      setAppRuntimeConfig({
        apiBaseUrl: undefined,
        socketBaseUrl: undefined,
        worldAccessMode: "cloud",
        cloudApiBaseUrl: normalizedCloudApiBaseUrl || undefined,
        cloudPhone: result.phone,
        cloudWorldId: undefined,
        bootstrapSource: "user",
      });
    },
    onError: (error) => {
      startCooldownFromError(error);
    },
    onSettled: () => {
      sendCodeInFlightRef.current = false;
    },
  });

  const sendEmailCodeMutation = useMutation({
    mutationFn: () =>
      sendCloudEmailCode(
        { email: email.trim().toLowerCase() },
        normalizedCloudApiBaseUrl || undefined,
      ),
    onSuccess: (result) => {
      setEmail(result.email);
      setCode(result.debugCode ?? "");
      setCloudAccessToken("");
      setCloudAccessSessionId(null);
      setConnectedAccessSessionId(null);
      setNotice(
        result.debugCode
          ? t(msg`开发模式：验证码已打印到服务端日志。`)
          : t(msg`验证码已发送，请查收邮箱（含垃圾邮件箱）。`),
      );
      setEntryError("");
      // 同 phone 路径：用 server-normalized 邮箱（一般是小写化版本），跟
      // setEmail(result.email) 之后的 currentCodeIdentity 一致。
      codeCooldownIdentityRef.current = result.email;
      setCodeCooldownEndAt(Date.now() + 60 * 1000);
    },
    onError: (error) => {
      startCooldownFromError(error);
    },
    onSettled: () => {
      sendEmailCodeInFlightRef.current = false;
    },
  });

  function handleSendPhoneCode() {
    if (sendCodeInFlightRef.current || sendCodeMutation.isPending) return;
    // 防御：错误条上的"重试发送"按钮如果哪天忘记跟主发送按钮一样 disable，
    // 函数内也再卡一格 cooldown，避免绕过 UI 直接打 server 429。
    if (effectiveCooldownSeconds > 0) return;
    sendCodeInFlightRef.current = true;
    // 先把当前 identity 钉进 ref：mutate 成功路径 onSuccess 会改写成 server
    // normalized 值，但失败路径（429）走 startCooldownFromError 时拿到的就是
    // 这里写的本地 normalized，确保 effective 倒计时绑在用户当前看到的输入上。
    codeCooldownIdentityRef.current = phone.trim();
    sendCodeMutation.mutate();
  }

  function handleSendEmailCode() {
    if (sendEmailCodeInFlightRef.current || sendEmailCodeMutation.isPending) return;
    if (effectiveCooldownSeconds > 0) return;
    sendEmailCodeInFlightRef.current = true;
    codeCooldownIdentityRef.current = email.trim().toLowerCase();
    sendEmailCodeMutation.mutate();
  }

  function chooseMode(nextMode: WorldAccessMode) {
    if (nextMode === "local" && !localWorldEntryEnabled) {
      return;
    }
    setMode(nextMode);
    setEntryError("");
    setOwnerError("");
    setNotice(""); // i18n-ignore-line
  }

  async function continueWithLocalWorld() {
    if (continueInFlightRef.current) return;
    if (!normalizedLocalApiBaseUrl) {
      setEntryError(t(msg`请输入本地世界 API 地址。`));
      return;
    }

    continueInFlightRef.current = true;
    setIsContinuing(true);
    setEntryError("");
    setOwnerError("");

    if (localApiBaseUrlAdjusted) {
      setLocalApiBaseUrl(normalizedLocalApiBaseUrl);
    }

    // R3：本地路径里 setAppRuntimeConfig({apiBaseUrl:...}) 之后立刻内联 await
    // getWorldOwner —— effect@530 watch apiBaseUrl，worldAccessMode==="local" 时
    // 不走 cloudAccessToken 短路那一格，cloudConnectKeyRef 在云路径才被云三入口
    // set，本地路径里默认 null，所以 R1 的短路对本地无效，effect 还是会再发一次
    // getWorldOwner。复用同一个 ref 把本地连接也圈进去：local:URL 作为 connectKey，
    // effect 见 ref 非空就 return，inline 把结果跑完再清 ref。
    const connectKey = `local:${normalizedLocalApiBaseUrl}`;
    cloudConnectKeyRef.current = connectKey;

    setAppRuntimeConfig({
      apiBaseUrl: normalizedLocalApiBaseUrl,
      socketBaseUrl: normalizedLocalApiBaseUrl,
      worldAccessMode: "local",
      cloudApiBaseUrl: undefined,
      cloudPhone: undefined,
      cloudWorldId: undefined,
      bootstrapSource: "user",
      configStatus: "configured",
    });

    try {
      await assertWorldReachable(normalizedLocalApiBaseUrl);
      const owner = await getWorldOwner(normalizedLocalApiBaseUrl);
      hydrateOwner(owner);
      setReadyBaseUrl(normalizedLocalApiBaseUrl);
      setOwnerName(owner.username ?? "");

      if (owner.onboardingCompleted) {
        void navigate({ to: "/tabs/chat", replace: true });
        return;
      }

      setNotice(t(msg`已连接到本地世界。`));
    } catch (error) {
      setReadyBaseUrl(null);
      setEntryError(describeRequestError(error, t(msg`无法连接到本地世界。`)));
    } finally {
      if (cloudConnectKeyRef.current === connectKey) {
        cloudConnectKeyRef.current = null;
      }
      setIsContinuing(false);
      continueInFlightRef.current = false;
    }
  }

  async function continueWithGoogleSignIn(idToken: string) {
    if (continueInFlightRef.current) return;
    continueInFlightRef.current = true;
    setIsContinuing(true);
    setEntryError("");
    setOwnerError("");

    let verifySucceeded = false;
    try {
      const inviteCodePayload =
        authMode === "register" && inviteCode ? inviteCode : undefined;
      const clientReportedIp = await detectClientPublicIpWithTimeout(1500);
      const verifyResult = await verifyCloudGoogleIdToken(
        {
          idToken,
          inviteCode: inviteCodePayload,
          deviceFingerprint: getDeviceFingerprint(),
          clientReportedIp,
          clientPlatform: runtimeConfig.appPlatform,
        },
        normalizedCloudApiBaseUrl || undefined,
      );

      const accessToken = verifyResult.accessToken;
      // 切号哨兵：Google 登录用邮箱当 identity（Google 账号绑定的邮箱与 cloud-api
      // 的合成 phone 一一对应）。换号时把上一个用户的所有 zustand / localStorage
      // / React Query 缓存先清干净，再写入新身份和 token。一致或首次登录则只
      // 补写 identity，不影响已有状态。
      await assertOwnerIdentity(`google:${verifyResult.email}`, { queryClient });
      setEmail(verifyResult.email);
      setCloudAccessToken(accessToken);
      saveCloudSession({
        accessToken,
        expiresAt: verifyResult.expiresAt,
        phone: null,
        email: verifyResult.email,
        profile: null,
      });
      verifySucceeded = true;
      track(
        authMode === "register" ? "register_success" : "login_success",
        { method: "google" },
      );
      consumeInviteCodeAfterRegister();

      const session = await resolveMyCloudWorldAccess(
        {
          clientPlatform: runtimeConfig.appPlatform,
          clientVersion: runtimeConfig.appVersionName,
        },
        accessToken,
        normalizedCloudApiBaseUrl || undefined,
      );

      setCloudAccessSessionId(session.id);
      setConnectedAccessSessionId(null);
      queryClient.setQueryData(
        buildCloudAccessSessionQueryKey(normalizedCloudApiBaseUrl, session.id, accessToken),
        session,
      );

      setAppRuntimeConfig({
        apiBaseUrl: undefined,
        socketBaseUrl: undefined,
        worldAccessMode: "cloud",
        cloudApiBaseUrl: normalizedCloudApiBaseUrl || undefined,
        cloudPhone: "",
        cloudWorldId: session.worldId ?? undefined,
        bootstrapSource: "user",
      });

      if (FAILURE_CLOUD_SESSION_STATUSES.has(session.status)) {
        setEntryError(describeCloudSessionFailure(t, session));
        return;
      }

      // 不再 setNotice(describeCloudSession)：currentCloudSession 渲染（renderEntryStep
      // 1720 行那一格）已经用 mobileNoticeTone 按 session.status 出正确色调的 notice，
      // 这里再写一份 success 绿色的 notice 跟它并存，session.status=waiting 时尤其奇怪
      // ——绿色"正在创建世界..."贴在 info 色"正在创建世界..."上面，3.2s 后才消失。
      // ready 状态下也多余：connectToResolvedCloudWorld 自己会 setNotice("已连接到云
      // 世界。")，立刻覆盖。

      if (session.status === "ready") {
        // 见 continueWithCloudWorld 的同名修复：内联 await 与 useEffect 监听
        // currentCloudSession 重复触发会让 getWorldOwner 跑两次。
        const connectKey = `${session.id}:${session.resolvedApiBaseUrl ?? ""}`;
        if (cloudConnectKeyRef.current !== connectKey) {
          cloudConnectKeyRef.current = connectKey;
          try {
            await connectToResolvedCloudWorld(accessToken, "", session);
          } finally {
            if (cloudConnectKeyRef.current === connectKey) {
              cloudConnectKeyRef.current = null;
            }
          }
        }
      }
    } catch (error) {
      setReadyBaseUrl(null);
      setEntryError(describeRequestError(error, t(msg`Google 登录失败，请稍后重试。`)));
      const message = error instanceof Error ? error.message.slice(0, 200) : null;
      if (!verifySucceeded) {
        track("login_fail", { method: "google", authMode, message });
      } else {
        track("cloud_world_entry_fail", {
          method: "google",
          authMode,
          message,
        });
      }
    } finally {
      setIsContinuing(false);
      continueInFlightRef.current = false;
    }
  }

  async function continueWithCloudWorld() {
    if (continueInFlightRef.current) return;
    if (accountType === "phone" && !phone.trim()) {
      setEntryError(t(msg`请输入手机号。`));
      return;
    }
    if (accountType === "email" && !email.trim()) {
      setEntryError(t(msg`请输入邮箱。`));
      return;
    }
    if (accountType === "email" && !isProbableEmail(email)) {
      setEntryError(t(msg`邮箱格式不正确，请检查后重试。`));
      return;
    }

    if (!cloudAccessToken) {
      if (authMethod === "code" && !code.trim()) {
        setEntryError(t(msg`请输入验证码。`));
        return;
      }
      if (authMethod === "password" && !password) {
        setEntryError(t(msg`请输入密码。`));
        return;
      }
      // 注册路径上的选填密码：placeholder 写明 "8-32 位，任意字符（不含空格）"，
      // 但之前没有客户端校验，用户填 "abc" 或粘到带空格的密码点"注册并进入"会
      // 直接进 verify-code 一来回；服务端拒后再回到本页，且 472cb4436 改成验证
      // 码失败不消耗后还能再点一次——但 verify 请求本身、网络耗时、给用户的中
      // 文翻译损失依然多余。早断早返回更直接。
      if (
        authMethod === "code" &&
        authMode === "register" &&
        registerPassword.trim()
      ) {
        if (registerPassword.length < 8 || registerPassword.length > 32) {
          setEntryError(t(msg`密码长度需在 8-32 位之间。`));
          return;
        }
        if (/\s/.test(registerPassword)) {
          setEntryError(t(msg`密码不能包含空格。`));
          return;
        }
      }
    }

    continueInFlightRef.current = true;
    setIsContinuing(true);
    setEntryError("");
    setOwnerError("");

    let verifyAttempted = false;
    let verifySucceeded = false;
    try {
      let accessToken = cloudAccessToken;
      let verifiedPhone = phone.trim();

      if (!accessToken) {
        verifyAttempted = true;
        const inviteCodePayload =
          authMode === "register" && inviteCode ? inviteCode : undefined;
        const clientReportedIp = await detectClientPublicIpWithTimeout(1500);
        // 注册时一并设置密码，仅在 code 通道 + register + 用户主动填写时启用。
        const setPasswordOnRegister =
          authMethod === "code" &&
          authMode === "register" &&
          registerPassword.trim()
            ? registerPassword
            : undefined;

        if (authMethod === "password") {
          const verifyResult = await loginCloudWithPassword(
            {
              identifierKind: accountType,
              identifier:
                accountType === "email"
                  ? email.trim().toLowerCase()
                  : phone.trim(),
              password,
              deviceFingerprint: getDeviceFingerprint(),
              clientReportedIp,
              clientPlatform: runtimeConfig.appPlatform,
            },
            normalizedCloudApiBaseUrl || undefined,
          );
          accessToken = verifyResult.accessToken;
          const identityKey =
            accountType === "email"
              ? `email:${verifyResult.email ?? email.trim().toLowerCase()}`
              : `phone:${verifyResult.phone}`;
          await assertOwnerIdentity(identityKey, { queryClient });
          if (accountType === "email") {
            verifiedPhone = "";
            const verifiedEmail =
              verifyResult.email ?? email.trim().toLowerCase();
            setEmail(verifiedEmail);
            saveCloudSession({
              accessToken: verifyResult.accessToken,
              expiresAt: verifyResult.expiresAt,
              phone: null,
              email: verifiedEmail,
              profile: null,
            });
          } else {
            verifiedPhone = verifyResult.phone;
            setPhone(verifyResult.phone);
            saveCloudSession({
              accessToken: verifyResult.accessToken,
              expiresAt: verifyResult.expiresAt,
              phone: verifyResult.phone,
              email: null,
              profile: null,
            });
          }
          setCloudAccessToken(verifyResult.accessToken);
          verifySucceeded = true;
          track("login_success", { method: `${accountType}-password` });
        } else if (accountType === "email") {
          const verifyResult = await verifyCloudEmailCode(
            {
              email: email.trim().toLowerCase(),
              code: code.trim(),
              inviteCode: inviteCodePayload,
              deviceFingerprint: getDeviceFingerprint(),
              clientReportedIp,
              clientPlatform: runtimeConfig.appPlatform,
              setPasswordOnRegister,
            },
            normalizedCloudApiBaseUrl || undefined,
          );

          accessToken = verifyResult.accessToken;
          verifiedPhone = "";
          // 切号哨兵：邮箱用户的身份键用邮箱本身，跟 Google 登录路径区分开。
          await assertOwnerIdentity(`email:${verifyResult.email}`, { queryClient });
          setEmail(verifyResult.email);
          setCloudAccessToken(verifyResult.accessToken);
          saveCloudSession({
            accessToken: verifyResult.accessToken,
            expiresAt: verifyResult.expiresAt,
            phone: null,
            email: verifyResult.email,
            profile: null,
          });
          verifySucceeded = true;
          track(
            authMode === "register" ? "register_success" : "login_success",
            { method: "email" },
          );
          consumeInviteCodeAfterRegister();
        } else {
          const verifyResult = await verifyCloudPhoneCode(
            {
              phone: phone.trim(),
              code: code.trim(),
              inviteCode: inviteCodePayload,
              deviceFingerprint: getDeviceFingerprint(),
              clientReportedIp,
              clientPlatform: runtimeConfig.appPlatform,
              setPasswordOnRegister,
            },
            normalizedCloudApiBaseUrl || undefined,
          );

          accessToken = verifyResult.accessToken;
          verifiedPhone = verifyResult.phone;
          // 切号哨兵：电话登录用 normalized phone 当 identity，跟 bootstrap 时
          // 从 cloud-session-store.phone 推导出的格式保持一致。
          await assertOwnerIdentity(`phone:${verifyResult.phone}`, { queryClient });
          setPhone(verifyResult.phone);
          setCloudAccessToken(verifyResult.accessToken);
          saveCloudSession({
            accessToken: verifyResult.accessToken,
            expiresAt: verifyResult.expiresAt,
            phone: verifyResult.phone,
            email: null,
            profile: null,
          });
          verifySucceeded = true;
          track(
            authMode === "register" ? "register_success" : "login_success",
            { method: "phone" },
          );
          consumeInviteCodeAfterRegister();
        }
      }

      const session = await resolveMyCloudWorldAccess(
        {
          clientPlatform: runtimeConfig.appPlatform,
          clientVersion: runtimeConfig.appVersionName,
        },
        accessToken,
        normalizedCloudApiBaseUrl || undefined,
      );

      setCloudAccessToken(accessToken);
      setCloudAccessSessionId(session.id);
      setConnectedAccessSessionId(null);
      queryClient.setQueryData(
        buildCloudAccessSessionQueryKey(normalizedCloudApiBaseUrl, session.id, accessToken),
        session,
      );

      setAppRuntimeConfig({
        apiBaseUrl: undefined,
        socketBaseUrl: undefined,
        worldAccessMode: "cloud",
        cloudApiBaseUrl: normalizedCloudApiBaseUrl || undefined,
        cloudPhone: verifiedPhone,
        cloudWorldId: session.worldId ?? undefined,
        bootstrapSource: "user",
      });

      if (FAILURE_CLOUD_SESSION_STATUSES.has(session.status)) {
        setEntryError(describeCloudSessionFailure(t, session));
        return;
      }

      // 同 continueWithGoogleSignIn：不再 setNotice(describeCloudSession)，避免跟
      // currentCloudSession 渲染的 notice 视觉重复且色调对不上（waiting 状态本该是
      // info，setNotice 写的 notice 是硬编码 success 绿色）。

      if (session.status === "ready") {
        // 老用户回归 / 世界已经在跑：resolveMyCloudWorldAccess 直接回 status=ready，
        // 这一行内联 await 跟 [currentCloudSession.status==="ready"] 那个 useEffect
        // 会同时跑 connectToResolvedCloudWorld（setQueryData 把 currentCloudSession
        // 即时填好，effect 一 commit 就触发），两边各发一次 getWorldOwner——白送
        // 一次网络请求。借用同一个 cloudConnectKeyRef 让 effect 那边短路，只跑这一次。
        const connectKey = `${session.id}:${session.resolvedApiBaseUrl ?? ""}`;
        if (cloudConnectKeyRef.current !== connectKey) {
          cloudConnectKeyRef.current = connectKey;
          try {
            await connectToResolvedCloudWorld(accessToken, verifiedPhone, session);
          } finally {
            if (cloudConnectKeyRef.current === connectKey) {
              cloudConnectKeyRef.current = null;
            }
          }
        }
      }
    } catch (error) {
      setReadyBaseUrl(null);
      setEntryError(describeRequestError(error, t(msg`解析云世界访问失败。`)));
      // 401 = 服务端拒绝当前 cloud token：最常见的命中点是 zustand-persist 拿
      // 回来的旧 token 还在 isCloudSessionExpired 客户端时钟看是"未过期"，但
      // 服务端基准已过期/已撤销。本地 token 不清干净的话 retry/重新解析全都
      // 带着这个失效 token 撞同样的 401 → entryError 一直挂、用户绕不出去。
      // 强制清掉，逼用户重新走 verify。
      // cloudAccessToken 这里是闭包值，verify path 里 setCloudAccessToken 的新
      // token 不会反映到闭包里；用 verifySucceeded 兜底，覆盖"verify 刚拿到
      // token、resolveMyCloudWorldAccess 就 401 把它拒了"的服务端竞态。
      if (
        isApiRequestError(error) &&
        error.statusCode === 401 &&
        (cloudAccessToken || verifySucceeded)
      ) {
        setCloudAccessToken("");
        setCloudAccessSessionId(null);
        setConnectedAccessSessionId(null);
        // 保留 phone/email：用户下一轮 verify 不用再敲一遍身份；只清 token
        // 跟 profile（profile 是 cloud-api 给的资料快照，token 失效后再用就
        // 没意义）。
        saveCloudSession({
          accessToken: null,
          expiresAt: null,
          phone: savedCloudPhone,
          email: savedCloudEmail,
          profile: null,
        });
      }
      const message = error instanceof Error ? error.message.slice(0, 200) : null;
      // Only emit login_fail when the verify step itself failed (we never got
      // an access token). Failures after verify succeeded are a different
      // class — they belong to the cloud-world entry flow, not auth.
      if (verifyAttempted && !verifySucceeded) {
        // method 维度跟 login_success 对齐：code 路径只发 "email"/"phone"，
        // password 路径发 "email-password"/"phone-password"，不让分析看板把
        // 同一个 password-flow 失败/成功的转化率拆成两个互不相交的桶。
        const failMethod =
          authMethod === "password" ? `${accountType}-password` : accountType;
        track("login_fail", { method: failMethod, authMode, message });
      } else if (verifySucceeded) {
        track("cloud_world_entry_fail", {
          method: accountType,
          authMode,
          message,
        });
      }
    } finally {
      setIsContinuing(false);
      continueInFlightRef.current = false;
    }
  }

  async function submitOwnerName() {
    if (continueInFlightRef.current) return;
    const username = ownerName.trim();
    if (!username) {
      setOwnerError(t(msg`请输入世界主人的名字。`));
      return;
    }
    if (username.length < MIN_OWNER_NAME_LENGTH) {
      setOwnerError(
        t(msg`名字至少 ${MIN_OWNER_NAME_LENGTH} 个字，请取一个真正的昵称。`),
      );
      return;
    }

    if (!readyBaseUrl) {
      setOwnerError(t(msg`请先连接世界，再设置世界主人名称。`));
      return;
    }

    continueInFlightRef.current = true;
    setIsContinuing(true);
    setOwnerError("");

    try {
      const owner = await updateWorldOwner(
        {
          username,
          onboardingCompleted: true,
        },
        readyBaseUrl,
      );
      hydrateOwner(owner);
      void navigate({ to: "/tabs/chat", replace: true });
    } catch (error) {
      setOwnerError(describeRequestError(error, t(msg`保存世界主人资料失败。`)));
    } finally {
      setIsContinuing(false);
      continueInFlightRef.current = false;
    }
  }

  function handleBackToEntryStep() {
    setReadyBaseUrl(null);
    setOwnerError("");
    setEntryError("");
    setNotice(""); // i18n-ignore-line
  }

  function handleRetryEntryStep() {
    if (mode === "local") {
      void continueWithLocalWorld();
      return;
    }

    void continueWithCloudWorld();
  }

  function handleRetrySendCode() {
    setEntryError("");
    handleSendPhoneCode();
  }

  // 跟 phone 路径的 handleRetrySendCode 对齐：原来 email 的"重试发送"按钮是
  // 直接 onClick={() => handleSendEmailCode()} 走的，没有 setEntryError("")。
  // 复现：用户先填错验证码 → verify 失败 → entryError = "验证码错误"；再点
  // "发送验证码" 撞 429 → sendEmailCodeMutation.isError = true；同时挂两条
  // danger。这时点 email 错误条上的"重试发送"，mutation 跑完成功了，但
  // entryError 那条还在显示，看上去像"send 已经又 OK 了，verify 还是错的"。
  function handleRetrySendEmailCode() {
    setEntryError("");
    handleSendEmailCode();
  }

  function handleRetryCloudSession() {
    setEntryError("");
    void cloudAccessSessionQuery.refetch();
  }

  // 注册成功后清掉本地存的邀请码。server 端 invite-code 在 verify 通过那一刻
  // 已被消费（一码一人，仓库表写 redeemedAt），客户端再留着没意义；如果不清
  // 干净，用户后续登出再回到 /welcome 时 useState 初始化器还能从 localStorage
  // 把这个失效码读出来填到注册 tab，下一轮注册按 "登录并进入" 会被服务端打
  // INVITE_CODE_USED。三个 verify 成功路径（email-code / phone-code / google）
  // 都要触发——password 路径用不到 invite 跳过。
  function consumeInviteCodeAfterRegister() {
    if (authMode !== "register" || !inviteCode) return;
    persistInviteCode("");
    setInviteCode("");
    setInviteCodeAutoFilled(false);
  }

  function renderModeFields() {
    if (mode === "cloud") {
      return (
        <div className="space-y-4">
          <div
            role="tablist"
            aria-label={t(msg`登录或注册`)}
            className="flex rounded-2xl bg-[#f5f5f5] p-1"
          >
            <Button
              type="button"
              role="tab"
              aria-selected={authMode === "login"}
              variant={authMode === "login" ? "primary" : "ghost"}
              onClick={() => {
                setAuthMode("login");
                setEntryError("");
              }}
              size="md"
              className={`flex-1 rounded-xl shadow-none ${
                authMode === "login"
                  ? "bg-white text-[color:var(--text-primary)] hover:bg-white"
                  : "bg-transparent hover:bg-transparent"
              }`}
            >
              {t(msg`登录`)}
            </Button>
            <Button
              type="button"
              role="tab"
              aria-selected={authMode === "register"}
              variant={authMode === "register" ? "primary" : "ghost"}
              onClick={() => {
                setAuthMode("register");
                setEntryError("");
              }}
              size="md"
              className={`flex-1 rounded-xl shadow-none ${
                authMode === "register"
                  ? "bg-white text-[color:var(--text-primary)] hover:bg-white"
                  : "bg-transparent hover:bg-transparent"
              }`}
            >
              {t(msg`注册`)}
            </Button>
          </div>

          {accountType === "phone" ? (
            <label className="block space-y-2">
              <span className="text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
                {t(msg`手机号`)}
              </span>
              <TextField
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(event) => {
                  setPhone(event.target.value);
                  setCode("");
                  setCloudAccessToken("");
                  setCloudAccessSessionId(null);
                  setConnectedAccessSessionId(null);
                  setEntryError("");
                  // cooldown 现在按 identity 自适应隐藏/显示（见
                  // effectiveCooldownSeconds 推导）；这里不再手动清零，避免
                  // 「敲错一个字再删回原值」时把还有效的倒计时丢掉。
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  // 验证码登录且还没拿到码：Enter 等价于"发送验证码"，省一次
                  // 转手；否则按"提交"走主流程，让 validation 自己出错给用户看。
                  if (
                    authMethod === "code" &&
                    !code.trim() &&
                    phone.trim() &&
                    !sendCodeMutation.isPending &&
                    effectiveCooldownSeconds <= 0
                  ) {
                    handleSendPhoneCode();
                  } else {
                    void continueWithCloudWorld();
                  }
                }}
                placeholder={t(msg`请输入手机号`)}
              />
            </label>
          ) : (
            <label className="block space-y-2">
              <span className="text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
                {t(msg`邮箱`)}
              </span>
              <TextField
                type="email"
                inputMode="email"
                // username 给 Safari 密码管家凑齐 username+password 才会触发"保存密码"
                // 提示；只设 password autocomplete 会被忽略。
                autoComplete="username"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setCode("");
                  setCloudAccessToken("");
                  setCloudAccessSessionId(null);
                  setConnectedAccessSessionId(null);
                  setEntryError("");
                  // 不再手动清 cooldown：当前输入跟 codeCooldownIdentityRef 不
                  // 一致时 effective 自动归零，相等时自动复现——比硬清更稳。
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  // 与 phone 路径同：还没码就先发码，已有码（或密码模式）走提交。
                  if (
                    authMethod === "code" &&
                    !code.trim() &&
                    isProbableEmail(email) &&
                    !sendEmailCodeMutation.isPending &&
                    effectiveCooldownSeconds <= 0
                  ) {
                    handleSendEmailCode();
                  } else {
                    void continueWithCloudWorld();
                  }
                }}
                placeholder={t(msg`you@example.com`)}
              />
            </label>
          )}

          <div
            role="tablist"
            aria-label={t(msg`登录方式`)}
            className="flex items-center gap-2 rounded-2xl bg-[#f5f5f5] p-1"
          >
            <Button
              role="tab"
              aria-selected={authMethod === "code"}
              onClick={() => {
                setAuthMethod("code");
                setEntryError("");
              }}
              variant={authMethod === "code" ? "primary" : "ghost"}
              size="md"
              className={`flex-1 rounded-xl shadow-none ${
                authMethod === "code"
                  ? "bg-white text-[color:var(--text-primary)] hover:bg-white"
                  : "bg-transparent hover:bg-transparent"
              }`}
            >
              {t(msg`使用验证码登录`)}
            </Button>
            <Button
              role="tab"
              aria-selected={authMethod === "password"}
              onClick={() => {
                setAuthMethod("password");
                // 密码登录与注册无关，强制切回 login 模式避免误传 inviteCode。
                if (authMode !== "login") setAuthMode("login");
                setEntryError("");
              }}
              variant={authMethod === "password" ? "primary" : "ghost"}
              size="md"
              className={`flex-1 rounded-xl shadow-none ${
                authMethod === "password"
                  ? "bg-white text-[color:var(--text-primary)] hover:bg-white"
                  : "bg-transparent hover:bg-transparent"
              }`}
            >
              {t(msg`使用密码登录`)}
            </Button>
          </div>

          {authMethod === "code" ? (
            <div className="space-y-2">
              <span className="block text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
                {t(msg`验证码`)}
              </span>
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <TextField
                    // 验证码输入框跟"邮箱"那一行不一样，是 div+span 排版而不是
                    // <label> 包，少了原生 label-for-input 关联，必须显式 aria-label
                    // 才让 VoiceOver / TalkBack 在 focus 时读出"验证码"。
                    aria-label={t(msg`验证码`)}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    // 没有 maxLength（以前是 6）——HTML 属性 maxLength 在 onChange
                    // 看到事件之前就把粘贴内容截掉，"1 2 3 4 5 6"（11 字符）会先被
                    // 截成"1 2 3 4"再到我们手里，strip 空格之后只剩 4 位。把上限
                    // 移到下面的 .slice(0, 6) 里，确保 strip 完成后再切。iOS 自动
                    // 填充进来本身就是 6 位纯数字，没影响。
                    value={code}
                    onChange={(event) => {
                      // 实测从邮件里复制 "1 2 3 4 5 6" / "123-456" / "  123456  "
                      // 这种格式过来 maxLength=6 只截前 6 字符，混着空格/连字符的
                      // 半截码直接进了 request body（server 端 code.trim() 不剥内
                      // 部空白），结果是用户视角"我码贴对了"但被打 401。这里把
                      // 非数字硬剥掉，paste 进来的杂字符不再卡住流程；中文/字母
                      // 等也一律丢，inputMode=numeric 在 iOS 弹数字键盘已经堵了
                      // 大半，但 paste 路径绕过了。
                      const digitsOnly = event.target.value.replace(/\D+/g, "").slice(0, 6);
                      setCode(digitsOnly);
                      setEntryError("");
                    }}
                    onKeyDown={(event) => {
                      // 手机软键盘的"前往/Go"键就是 Enter；用户敲完 6 位码自然想
                      // 按一下就进，没 form 包裹默认啥也不会发生。显式接管：触发
                      // 跟点"登录并进入"按钮一致的提交逻辑（带 inFlightRef 守恒）
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void continueWithCloudWorld();
                      }
                    }}
                    placeholder={
                      accountType === "phone"
                        ? t(msg`6 位短信验证码`)
                        : t(msg`6 位邮箱验证码`)
                    }
                  />
                </div>
                <Button
                  onClick={() =>
                    accountType === "phone"
                      ? handleSendPhoneCode()
                      : handleSendEmailCode()
                  }
                  disabled={
                    effectiveCooldownSeconds > 0 ||
                    (accountType === "phone"
                      ? !phone.trim() || sendCodeMutation.isPending
                      : !isProbableEmail(email) || sendEmailCodeMutation.isPending)
                  }
                  variant="secondary"
                  size="lg"
                  className="shrink-0 rounded-2xl border-black/5 bg-[#f5f5f5] px-5 shadow-none hover:border-[rgba(7,193,96,0.16)] hover:bg-white"
                >
                  {(
                    accountType === "phone"
                      ? sendCodeMutation.isPending
                      : sendEmailCodeMutation.isPending
                  )
                    ? t(msg`发送中...`)
                    : effectiveCooldownSeconds > 0
                      ? t(msg`${effectiveCooldownSeconds}s 后重发`)
                      : t(msg`发送验证码`)}
                </Button>
              </div>
              {authMode === "register" ? (
                <label className="block space-y-2 pt-2">
                  <span className="text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
                    {t(msg`设置登录密码（选填）`)}
                  </span>
                  <PasswordField
                    autoComplete="new-password"
                    value={registerPassword}
                    onChange={(event) => {
                      setRegisterPassword(event.target.value);
                      setEntryError("");
                    }}
                    onKeyDown={(event) => {
                      // 跟 code / password 字段对齐：注册路径用户填完邮箱+码+
                      // 密码按 Enter 自然要提交，但本字段以前没接 Enter，必须
                      // 用鼠标点"注册并进入"按钮，跟其他字段不一致——R5 走查
                      // 的 a658fee3e 已经把 code/password 字段补齐，这里漏了。
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void continueWithCloudWorld();
                      }
                    }}
                    placeholder={t(msg`8-32 位，任意字符（不含空格）`)}
                    showLabel={t(msg`显示密码`)}
                    hideLabel={t(msg`隐藏密码`)}
                  />
                </label>
              ) : null}
            </div>
          ) : (
            <div className="space-y-2">
              <span className="block text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
                {t(msg`密码`)}
              </span>
              <PasswordField
                // 跟"密码"那一行同样是 div+span 排版，没原生 label-for-input
                // 关联，靠 aria-label 让屏幕阅读器知道这是密码字段。
                aria-label={t(msg`密码`)}
                autoComplete="current-password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setEntryError("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void continueWithCloudWorld();
                  }
                }}
                placeholder={t(msg`请输入密码`)}
                showLabel={t(msg`显示密码`)}
                hideLabel={t(msg`隐藏密码`)}
              />
              <span className="block pt-1 text-xs text-[color:var(--text-muted)]">
                {t(msg`忘记密码？请用验证码登录后到设置页修改`)}
              </span>
            </div>
          )}

          {showGoogleButton ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-[color:var(--border-faint)]" />
                <span className="text-[10px] uppercase tracking-[0.32em] text-[color:var(--text-muted)]">
                  {t(msg`或`)}
                </span>
                <span className="h-px flex-1 bg-[color:var(--border-faint)]" />
              </div>
              <div className="flex justify-center">
                {/* GoogleOAuthProvider 下沉到此处，让 @react-oauth/google
                    chunk 仅在 welcome 路由加载，省首屏 ~25-35KB。 */}
                <GoogleOAuthProvider
                  clientId={import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID ?? ""}
                >
                <GoogleLogin
                  onSuccess={(credentialResponse) => {
                    const idToken = credentialResponse.credential;
                    if (!idToken) {
                      setEntryError(
                        t(msg`Google 登录失败，请稍后重试。`),
                      );
                      return;
                    }
                    void continueWithGoogleSignIn(idToken);
                  }}
                  onError={() => {
                    setEntryError(
                      t(msg`Google 登录失败，请检查网络后重试。`),
                    );
                    track("login_fail", {
                      method: "google",
                      authMode,
                      message: "gis_onError", // i18n-ignore-line: telemetry error code
                    });
                  }}
                  useOneTap={false}
                  text={authMode === "register" ? "signup_with" : "signin_with"}
                  shape="pill"
                  size="large"
                  // GoogleLogin 的 width 只吃 200-400 px 字符串，没法 100%；移动端
                  // AppPage px-4 + AppSection px-6 = 双侧 40px 内边距，iPhone SE 375
                  // 视宽 → 内容仅 295px，Galaxy S22 360 → 仅 280px。原来 width=320
                  // 在这些机型上横向溢出 25~40px，触发整页水平滚动。改成桌面 320 /
                  // 移动 280：桌面 max-w-xl 容器 520px 内宽显得不会过小，移动正好
                  // 卡在最窄机型的可用宽内。
                  width={isDesktopLayout ? "320" : "280"}
                />
                </GoogleOAuthProvider>
              </div>
            </div>
          ) : null}

          {authMode === "register" ? (
            <label className="block space-y-2">
              <span className="text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
                {t(msg`邀请码（选填）`)}
              </span>
              <TextField
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                // 邀请码当前格式是 6 位大写英数；多点容差到 12 位避免以后扩位时
                // 把 input 卡死。
                maxLength={12}
                value={inviteCode}
                onChange={(event) => {
                  // 服务端 invite-code 格式是 "6 位大写英数"，仓库走精确匹配。
                  // 原来只剥空白：粘 "ABCD-1234" / "ab.cd!" / 全角空格 等都会原样
                  // 留下连字符 / 标点 / 全角，提交后被服务端打 INVITE_CODE_INVALID
                  // ——用户视角是"我码贴对了"但被拒。跟验证码字段 \D+ 的逻辑对齐：
                  // 直接 strip 所有非 A-Za-z0-9 字符（不只空白），再 toUpperCase
                  // + slice 到 maxLength=12。
                  const next = event.target.value
                    .replace(/[^A-Za-z0-9]/g, "")
                    .toUpperCase()
                    .slice(0, 12);
                  setInviteCode(next);
                  persistInviteCode(next);
                  setInviteCodeAutoFilled(false);
                  setEntryError("");
                }}
                onKeyDown={(event) => {
                  // 注册路径里邀请码是最后一格，跟 code/password 字段对齐：
                  // 用户敲完按 Enter 自然要提交，没 onKeyDown 时按下去啥也不发生。
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void continueWithCloudWorld();
                  }
                }}
                placeholder={t(msg`填写邀请人给你的 6 位邀请码`)}
              />
              {inviteCodeAutoFilled && inviteCode ? (
                <span className="text-xs text-[color:var(--text-muted)]">
                  {t(msg`已通过邀请链接自动填入，可手动修改。`)}
                </span>
              ) : null}
            </label>
          ) : null}

          {cloudAccessSessionQuery.isLoading ? (
            isDesktopLayout ? (
              <LoadingBlock
                className="px-0 py-0 text-left"
                label={t(msg`正在解析你的云世界...`)}
              />
            ) : (
              <MobileWelcomeStatusCard
                badge={t(msg`云世界`)}
                title={t(msg`正在解析你的世界`)}
                description={t(
                  msg`我们正在判断是为这个邮箱创建新世界，还是唤醒它已拥有的世界。`,
                )}
              />
            )
          ) : null}

          {currentCloudSession ? (
            isDesktopLayout ? (
              <InlineNotice tone={mobileNoticeTone(currentCloudSession)}>
                {describeCloudSession(t, currentCloudSession)}
              </InlineNotice>
            ) : (
              <MobileWelcomeNotice tone={mobileNoticeTone(currentCloudSession)}>
                {describeCloudSession(t, currentCloudSession)}
              </MobileWelcomeNotice>
            )
          ) : null}

          {currentCloudSession?.resolvedApiBaseUrl ? (
            isDesktopLayout ? (
              <InlineNotice tone="muted">
                {t(
                  msg`已解析到世界地址：${currentCloudSession.resolvedApiBaseUrl}`,
                )}
              </InlineNotice>
            ) : (
              <MobileWelcomeNotice tone="muted">
                {t(
                  msg`已解析到世界地址：${currentCloudSession.resolvedApiBaseUrl}`,
                )}
              </MobileWelcomeNotice>
            )
          ) : null}

          <Button
            onClick={() => void continueWithCloudWorld()}
            disabled={isContinuing || ownerSyncing || cloudWorldPending}
            variant="primary"
            size="lg"
            className="w-full rounded-2xl bg-[#07c160] text-white shadow-none hover:bg-[#06ad56]"
          >
            {describeCloudButtonLabel(
              t,
              currentCloudSession,
              isContinuing,
              ownerSyncing,
              authMode,
            )}
          </Button>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <label className="block space-y-2">
          <span className="text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
            {t(msg`本地世界地址`)}
          </span>
          <TextField
            // placeholder 之前误把 "i18n-ignore-line" 注释当成展示字符串塞进去了，
            // 直接出现在 UI 里。
            // i18n-ignore-line
            placeholder="http://127.0.0.1:3000"
            type="url"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={localApiBaseUrl}
            onChange={(event) => {
              setLocalApiBaseUrl(event.target.value);
              setEntryError("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void continueWithLocalWorld();
              }
            }}
          />
        </label>

        {localApiBaseUrlAdjusted ? (
          <InlineNotice tone="muted">
            {localApiBaseUrlAdjustment === "api-path"
              ? t(
                  msg`检测到你输入的是 /api 路径，已自动换算为对应的世界入口地址：${normalizedLocalApiBaseUrl}`,
                )
              : t(
                  msg`检测到你输入的是本机应用地址，已自动换算为对应的世界地址：${normalizedLocalApiBaseUrl}`,
                )}
          </InlineNotice>
        ) : null}

        <Button
          onClick={() => void continueWithLocalWorld()}
          disabled={!normalizedLocalApiBaseUrl || isContinuing}
          variant="primary"
          size="lg"
          className="w-full rounded-2xl bg-[#07c160] text-white shadow-none hover:bg-[#06ad56]"
        >
          {isContinuing ? t(msg`连接中...`) : t(msg`连接本地世界`)}
        </Button>
      </div>
    );
  }

  function renderOwnerStep() {
    return (
      <div className="space-y-5">
        <h2 className="text-3xl font-semibold tracking-[0.05em] text-[color:var(--text-primary)]">
          {t(msg`为世界主人命名`)}
        </h2>

        <div className="rounded-[28px] border border-black/5 bg-white p-5 shadow-none">
          <TextField
            // 没有可见 label，靠 aria-label 让屏幕阅读器知道这是世界主人名字。
            aria-label={t(msg`世界主人名字`)}
            autoComplete="nickname"
            maxLength={20}
            value={ownerName}
            onChange={(event) => {
              setOwnerName(event.target.value);
              setOwnerError("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void submitOwnerName();
              }
            }}
            placeholder={t(msg`输入你希望被怎么称呼（至少 ${MIN_OWNER_NAME_LENGTH} 个字）`)}
            className="text-center text-base"
            autoFocus
          />

          <p className="mt-2 text-center text-xs text-[color:var(--text-muted)]">
            {t(msg`这是世界里所有 AI 朋友对你的称呼，名字至少 ${MIN_OWNER_NAME_LENGTH} 个字。`)}
          </p>

          {ownerError ? (
            isDesktopLayout ? (
              <InlineNotice className="mt-3" tone="danger">
                {ownerError}
              </InlineNotice>
            ) : (
              <div className="mt-3">
                <MobileWelcomeNotice
                  tone="danger"
                  action={
                    <button
                      type="button"
                      onClick={handleBackToEntryStep}
                      className="shrink-0 rounded-full border border-[rgba(220,38,38,0.14)] bg-white px-2 py-0.5 text-[10px] font-medium text-[#b42318]"
                    >
                      {t(msg`返回上一步`)}
                    </button>
                  }
                >
                  {ownerError}
                </MobileWelcomeNotice>
              </div>
            )
          ) : null}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Button
              onClick={handleBackToEntryStep}
              disabled={isContinuing}
              variant="secondary"
              size="lg"
              className="rounded-2xl border-black/5 bg-[#f5f5f5] shadow-none hover:border-[rgba(7,193,96,0.16)] hover:bg-white"
            >
              {t(msg`返回`)}
            </Button>
            <Button
              onClick={() => void submitOwnerName()}
              disabled={
                isContinuing ||
                ownerName.trim().length < MIN_OWNER_NAME_LENGTH
              }
              variant="primary"
              size="lg"
              className="rounded-2xl bg-[#07c160] text-white shadow-none hover:bg-[#06ad56]"
            >
              {isContinuing ? t(msg`保存中...`) : t(msg`进入世界`)}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  function renderEntryStep() {
    return (
      <div className="space-y-5">
        {localWorldEntryEnabled ? (
          <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => chooseMode("cloud")}
            // aria-pressed 让屏幕阅读器/键盘用户能知道哪个 mode 当前选中——卡片
            // 视觉靠 border / bg 区分，没 aria-pressed 的话 VoiceOver 只读"按钮 云世界"
            // 不带选中状态。
            aria-pressed={mode === "cloud"}
            className={`rounded-[24px] border p-4 text-left transition ${
              mode === "cloud"
                ? "border-[rgba(7,193,96,0.24)] bg-[rgba(247,251,248,0.98)] shadow-none"
                : "border-[color:var(--border-faint)] bg-white hover:border-[rgba(7,193,96,0.16)]"
            }`}
          >
            <div className="text-sm font-medium text-[color:var(--text-primary)]">
              {t(msg`云世界`)}
            </div>
            <div className="mt-2 text-xs leading-6 text-[color:var(--text-secondary)]">
              {t(
                msg`通过邮箱登录。新用户会获得一个全新的世界，老用户会唤醒自己已有的世界。`,
              )}
            </div>
          </button>

          <button
            type="button"
            onClick={() => chooseMode("local")}
            aria-pressed={mode === "local"}
            className={`rounded-[24px] border p-4 text-left transition ${
              mode === "local"
                ? "border-[rgba(7,193,96,0.24)] bg-[rgba(247,251,248,0.98)] shadow-none"
                : "border-[color:var(--border-faint)] bg-white hover:border-[rgba(7,193,96,0.16)]"
            }`}
          >
            <div className="text-sm font-medium text-[color:var(--text-primary)]">
              {t(msg`本地世界`)}
            </div>
            <div className="mt-2 text-xs leading-6 text-[color:var(--text-secondary)]">
              {t(
                msg`输入世界入口地址并直接连接。若你拿到的是 /api 地址，也可以直接粘贴。`,
              )}
            </div>
          </button>
          </div>
        ) : null}

        {notice ? (
          isDesktopLayout ? <InlineNotice tone="success">{notice}</InlineNotice> : <MobileWelcomeNotice tone="success">{notice}</MobileWelcomeNotice>
        ) : null}

        {ownerSyncing && runtimeConfig.apiBaseUrl ? (
          isDesktopLayout ? (
            <LoadingBlock
              className="px-0 py-0 text-left"
              label={t(msg`正在加载世界主人...`)}
            />
          ) : (
            <MobileWelcomeStatusCard
              badge={t(msg`世界`)}
              title={t(msg`正在加载世界主人`)}
              description={t(
                msg`世界地址已连通，正在进入应用前同步世界主人资料。`,
              )}
            />
          )
        ) : null}

        {renderModeFields()}

        {entryError ? (
          isDesktopLayout ? (
            <ErrorBlock message={entryError} />
          ) : (
            <MobileWelcomeNotice
              tone="danger"
              action={
                // 收窄触发条件：原来 cloudAccessToken || (password|code) 是 OR，
                // 用户填错验证码 / 密码 → verify 报错 → 错误条出现"重新解析"按钮
                // → 点了又用同一份错码 verify 一次 → 同一份错误，无意义循环。
                // 改成只在 cloud 模式有 token（即 verify 已成功、错在 resolve
                // 阶段，可用 token 重新走 resolveMyCloudWorldAccess）或 local
                // 模式下显示。verify-failed 状态下不显示按钮，强制用户改
                // code/password 后再点"登录并进入"。
                ((mode === "local" && normalizedLocalApiBaseUrl) ||
                  (mode === "cloud" &&
                    (accountType === "email"
                      ? email.trim()
                      : phone.trim()) &&
                    cloudAccessToken &&
                    !isContinuing)) ? (
                  <button
                    type="button"
                    onClick={handleRetryEntryStep}
                    className="shrink-0 rounded-full border border-[rgba(220,38,38,0.14)] bg-white px-2 py-0.5 text-[10px] font-medium text-[#b42318]"
                  >
                    {mode === "local" ? t(msg`重新连接`) : t(msg`重新解析`)}
                  </button>
                ) : undefined
              }
            >
              {entryError}
            </MobileWelcomeNotice>
          )
        ) : null}
        {sendCodeMutation.isError &&
        sendCodeMutation.error instanceof Error &&
        // 错误只对"上次发送的那个号"有意义：用户把 phone 改成别的号之后，旧错
        // 误条还堆在底下显两份 danger 容易让人困惑（"我刚改了号怎么还报这个？"）。
        // 用 codeCooldownIdentityRef 跟 currentCodeIdentity 比，与 effective
        // cooldown 的隐藏逻辑保持一致。
        currentCodeIdentity === codeCooldownIdentityRef.current ? (
          isDesktopLayout ? (
            <ErrorBlock message={describeRequestError(sendCodeMutation.error)} />
          ) : (
            <MobileWelcomeNotice
              tone="danger"
              action={
                // cooldown > 0 时也不显示按钮：原来只看 phone+isPending，配合 R2
                // (新) 的 onError → cooldown 之后，用户首次 429 → cooldown 启动 →
                // 按钮还是显示 → 点 → 又 429 → cooldown reset。把 cooldown 那一格
                // 加进来，跟主发送按钮的 disabled 逻辑保持一致。
                phone.trim() && !sendCodeMutation.isPending && effectiveCooldownSeconds <= 0 ? (
                  <button
                    type="button"
                    onClick={handleRetrySendCode}
                    className="shrink-0 rounded-full border border-[rgba(220,38,38,0.14)] bg-white px-2 py-0.5 text-[10px] font-medium text-[#b42318]"
                  >
                    {t(msg`重试发送`)}
                  </button>
                ) : undefined
              }
            >
              {describeRequestError(sendCodeMutation.error)}
            </MobileWelcomeNotice>
          )
        ) : null}
        {sendEmailCodeMutation.isError &&
        sendEmailCodeMutation.error instanceof Error &&
        // 同 phone 路径：换了邮箱旧错误就不再相关，按 identity 隐藏。
        currentCodeIdentity === codeCooldownIdentityRef.current ? (
          isDesktopLayout ? (
            <ErrorBlock message={describeRequestError(sendEmailCodeMutation.error)} />
          ) : (
            <MobileWelcomeNotice
              tone="danger"
              action={
                // 同上：cooldown > 0 时也不显示按钮。
                email.trim() && !sendEmailCodeMutation.isPending && effectiveCooldownSeconds <= 0 ? (
                  <button
                    type="button"
                    onClick={handleRetrySendEmailCode}
                    className="shrink-0 rounded-full border border-[rgba(220,38,38,0.14)] bg-white px-2 py-0.5 text-[10px] font-medium text-[#b42318]"
                  >
                    {t(msg`重试发送`)}
                  </button>
                ) : undefined
              }
            >
              {describeRequestError(sendEmailCodeMutation.error)}
            </MobileWelcomeNotice>
          )
        ) : null}
        {cloudAccessSessionQuery.isError && cloudAccessSessionQuery.error instanceof Error ? (
          isDesktopLayout ? (
            <ErrorBlock message={describeRequestError(cloudAccessSessionQuery.error)} />
          ) : (
            <MobileWelcomeNotice
              tone="danger"
              action={
                cloudAccessSessionId &&
                cloudAccessToken &&
                !cloudAccessSessionQuery.isFetching ? (
                  <button
                    type="button"
                    onClick={handleRetryCloudSession}
                    className="shrink-0 rounded-full border border-[rgba(220,38,38,0.14)] bg-white px-2 py-0.5 text-[10px] font-medium text-[#b42318]"
                  >
                    {t(msg`重新解析`)}
                  </button>
                ) : undefined
              }
            >
              {describeRequestError(cloudAccessSessionQuery.error)}
            </MobileWelcomeNotice>
          )
        ) : null}
      </div>
    );
  }

  if (isDesktopLayout) {
    return (
      <AppPage className="relative flex min-h-full items-center justify-center overflow-hidden p-6 sm:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[rgba(30,20,10,0.14)] backdrop-blur-[18px]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,248,230,0.16),rgba(30,20,10,0.22)_74%)]" />
        <div className="relative z-10 w-full max-w-3xl">
          <div className="pointer-events-none absolute inset-0 rounded-[44px] bg-[rgba(255,255,255,0.24)] blur-3xl" />
          <AppSection className="relative mx-auto w-full max-w-xl rounded-[32px] border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(255,248,235,0.94))] px-7 py-8 shadow-[0_28px_72px_rgba(160,90,10,0.22)] backdrop-blur-2xl">
            <div className="inline-flex rounded-full border border-[rgba(249,115,22,0.24)] bg-white/78 px-3 py-1 text-[11px] uppercase tracking-[0.32em] text-[color:var(--brand-primary)]">
              {t(msg`世界入口`)}
            </div>
            <h1 className="mt-5 text-3xl font-semibold tracking-[0.08em] text-[color:var(--text-primary)]">
              {t(msg`连接你的世界`)}
            </h1>

            <div className="mt-6">{showOwnerStep ? renderOwnerStep() : renderEntryStep()}</div>
          </AppSection>
        </div>
      </AppPage>
    );
  }

  return (
    <AppPage className="bg-[#f5f5f5] px-4 py-8">
      <AppSection className="mx-auto w-full max-w-xl border-black/5 bg-white px-6 py-8 shadow-none">
        <div className="inline-flex rounded-full border border-[rgba(7,193,96,0.16)] bg-[rgba(7,193,96,0.08)] px-3 py-1 text-[11px] uppercase tracking-[0.32em] text-[#15803d]">
          {t(msg`世界入口`)}
        </div>
        <h1 className="mt-6 text-3xl font-semibold tracking-[0.08em] text-[color:var(--text-primary)]">
          {t(msg`连接你的世界`)}
        </h1>

        <div className="mt-6">{showOwnerStep ? renderOwnerStep() : renderEntryStep()}</div>
      </AppSection>
    </AppPage>
  );
}

function MobileWelcomeStatusCard({
  badge,
  title,
  description,
  tone = "default",
}: {
  badge: string;
  title: string;
  description: string;
  tone?: "default" | "danger";
}) {
  const toneClassName =
    tone === "danger"
      ? "border-[#f2c6c3] bg-[#fff7f5] text-[#b42318]"
      : "border-black/5 bg-[#f7faf8] text-[color:var(--text-secondary)]";
  const badgeClassName =
    tone === "danger"
      ? "border-[#f1d0cb] bg-[#fff1ef] text-[#b42318]"
      : "border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.08)] text-[#15803d]";

  return (
    <div className={`rounded-[24px] border px-4 py-4 shadow-none ${toneClassName}`}>
      <div className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium tracking-[0.24em] ${badgeClassName}`}>
        {badge}
      </div>
      <div className="mt-3 text-base font-medium text-[color:var(--text-primary)]">{title}</div>
      <p className="mt-1 text-sm leading-6">{description}</p>
    </div>
  );
}

function MobileWelcomeNotice({
  children,
  tone = "info",
  action,
}: {
  children: ReactNode;
  tone?: "danger" | "info" | "muted" | "success";
  action?: ReactNode;
}) {
  const toneClassName =
    tone === "danger"
      ? "border-[#f2c6c3] bg-[#fff7f5] text-[#b42318]"
      : tone === "success"
        ? "border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.08)] text-[#15803d]"
        : tone === "muted"
          ? "border-black/5 bg-[#f7f7f5] text-[color:var(--text-secondary)]"
          : "border-[rgba(22,163,74,0.12)] bg-[#f6fbf7] text-[color:var(--text-secondary)]";

  // role=alert + aria-live=assertive 让 VoiceOver/TalkBack 在错误出现的时候即时
  // 念出来；走查 r6 发现密码错误/验证码错误整块就是普通 div，盲读用户根本不知
  // 道页面发生了什么变化。其它色调（info/success/muted）走 polite 不打断阅读。
  const ariaRole = tone === "danger" ? "alert" : "status";
  const ariaLive = tone === "danger" ? "assertive" : "polite";

  return (
    <div
      role={ariaRole}
      aria-live={ariaLive}
      className={`rounded-[20px] border px-4 py-3 text-sm leading-6 ${toneClassName}`}
    >
      {action ? (
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 flex-1">{children}</span>
          {action}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
