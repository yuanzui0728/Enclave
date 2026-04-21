import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DEFAULT_CORE_API_BASE_URL,
  getMyCloudWorldAccessSession,
  getWorldOwner,
  resolveMyCloudWorldAccess,
  sendCloudPhoneCode,
  updateWorldOwner,
  verifyCloudPhoneCode,
  type WorldAccessSessionSummary,
} from "@yinjie/contracts";
import { AppPage, AppSection, Button, ErrorBlock, InlineNotice, LoadingBlock, TextField } from "@yinjie/ui";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { describeRequestError } from "../lib/request-error";
import { assertWorldReachable } from "../lib/world-entry";
import { setAppRuntimeConfig, useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

type WorldAccessMode = "cloud" | "local";
type LocalWorldApiAdjustment = "api-path" | "app-dev-port";

const LOCAL_APP_DEV_PORT = "5180";
const LOCAL_CORE_API_PORT = "3000";
const WAITING_CLOUD_SESSION_STATUSES = new Set<WorldAccessSessionSummary["status"]>(["pending", "resolving", "waiting"]);
const FAILURE_CLOUD_SESSION_STATUSES = new Set<WorldAccessSessionSummary["status"]>(["failed", "disabled", "expired"]);
const WORLD_ACCESS_MESSAGE_MAP: Record<string, string> = {
  "World is missing an API endpoint.": "世界缺少可用的 API 地址。",
  "The world finished starting but no apiBaseUrl is available yet.": "世界已经启动完成，但暂时还没有可用的 API 地址。",
  "World is ready.": "世界已就绪。",
  "Waking the existing world.": "正在唤醒已有世界。",
  "World startup failed.": "世界启动失败。",
  "The world could not be started.": "世界暂时无法启动。",
  "World is disabled.": "世界已被停用。",
  "This world is currently disabled by ops.": "该世界当前已被运维停用。",
  "World is being deleted.": "世界正在删除中。",
  "The world is being deleted and cannot be resumed.": "世界正在删除，无法恢复。",
  "Creating a brand new world.": "正在创建全新的世界。",
  "Cloud access session is missing.": "云世界访问会话缺失。",
};

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
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

function translateWorldAccessText(message?: string | null) {
  if (!message) {
    return undefined;
  }

  return WORLD_ACCESS_MESSAGE_MAP[message] ?? message;
}

function describeCloudSessionFailure(session: WorldAccessSessionSummary) {
  return translateWorldAccessText(session.failureReason) ?? translateWorldAccessText(session.displayStatus) ?? "世界当前不可用。";
}

function describeCloudSession(session?: WorldAccessSessionSummary | null) {
  if (!session) {
    return "请先验证手机号，以解析你的云世界。";
  }

  if (session.status === "ready") {
    return "世界已就绪，正在连接...";
  }

  if (FAILURE_CLOUD_SESSION_STATUSES.has(session.status)) {
    return describeCloudSessionFailure(session);
  }

  const translatedDisplayStatus = translateWorldAccessText(session.displayStatus) ?? session.displayStatus;
  if (session.estimatedWaitSeconds && session.estimatedWaitSeconds > 0) {
    return `${translatedDisplayStatus} 预计等待：${session.estimatedWaitSeconds} 秒。`;
  }

  return translatedDisplayStatus;
}

function describeCloudButtonLabel(
  session: WorldAccessSessionSummary | null,
  isContinuing: boolean,
  ownerSyncing: boolean,
) {
  if (ownerSyncing) {
    return "连接中...";
  }

  if (isContinuing) {
    return "解析中...";
  }

  if (!session) {
    return "解析我的世界";
  }

  if (session.status === "ready") {
    return "连接中...";
  }

  if (WAITING_CLOUD_SESSION_STATUSES.has(session.status)) {
    return session.phase === "starting" ? "正在唤醒世界..." : "正在创建世界...";
  }

  return "解析我的世界";
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

export function WelcomePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isDesktopLayout = useDesktopLayout();
  const runtimeConfig = useAppRuntimeConfig();
  const hydrateOwner = useWorldOwnerStore((state) => state.hydrateOwner);
  const storedName = useWorldOwnerStore((state) => state.username);
  const onboardingCompleted = useWorldOwnerStore((state) => state.onboardingCompleted);

  const [mode, setMode] = useState<WorldAccessMode>(
    runtimeConfig.worldAccessMode ?? (runtimeConfig.apiBaseUrl ? "local" : "cloud"),
  );
  const [localApiBaseUrl, setLocalApiBaseUrl] = useState(resolveDefaultLocalApiBaseUrl(runtimeConfig.apiBaseUrl) ?? "");
  const [phone, setPhone] = useState(runtimeConfig.cloudPhone ?? "");
  const [code, setCode] = useState("");
  const [cloudAccessToken, setCloudAccessToken] = useState("");
  const [cloudAccessSessionId, setCloudAccessSessionId] = useState<string | null>(null);
  const [connectedAccessSessionId, setConnectedAccessSessionId] = useState<string | null>(null);
  const [ownerName, setOwnerName] = useState(storedName ?? "");
  const [readyBaseUrl, setReadyBaseUrl] = useState<string | null>(null);
  const [ownerSyncing, setOwnerSyncing] = useState(false);
  const [notice, setNotice] = useState("");
  const [entryError, setEntryError] = useState("");
  const [ownerError, setOwnerError] = useState("");
  const [isContinuing, setIsContinuing] = useState(false);
  const cloudConnectKeyRef = useRef<string | null>(null);

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
    setPhone(runtimeConfig.cloudPhone ?? "");
    if (runtimeConfig.worldAccessMode) {
      setMode(runtimeConfig.worldAccessMode);
    }
  }, [runtimeConfig.apiBaseUrl, runtimeConfig.cloudPhone, runtimeConfig.worldAccessMode]);

  useEffect(() => {
    setOwnerName(storedName ?? "");
  }, [storedName]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!runtimeConfig.apiBaseUrl || !runtimeConfig.worldAccessMode) {
      setReadyBaseUrl(null);
      setOwnerSyncing(false);
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
      .catch((error) => {
        if (!active) {
          return;
        }

        setReadyBaseUrl(null);
        if (!onboardingCompleted) {
          setEntryError(describeRequestError(error, "无法连接到所选世界。"));
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
  }, [hydrateOwner, navigate, onboardingCompleted, runtimeConfig.apiBaseUrl, runtimeConfig.worldAccessMode]);

  const cloudAccessSessionQuery = useQuery({
    queryKey: cloudAccessSessionQueryKey ?? ["welcome-cloud-access-session", "idle"],
    queryFn: () => {
      if (!cloudAccessSessionId || !cloudAccessToken) {
        throw new Error("云世界访问会话缺失。");
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
      setEntryError(translateWorldAccessText(session.failureReason) ?? "世界已解析完成，但没有可用的 API 地址。");
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
      setNotice("已连接到云世界。");

      if (owner.onboardingCompleted) {
        void navigate({ to: "/tabs/chat", replace: true });
      }
    } catch (error) {
      setReadyBaseUrl(null);
      setEntryError(describeRequestError(error, "世界已就绪，但暂时还无法访问。"));
    } finally {
      setOwnerSyncing(false);
    }
  }, [hydrateOwner, navigate, normalizedCloudApiBaseUrl]);

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
      setCode("");
      setCloudAccessToken("");
      setCloudAccessSessionId(null);
      setConnectedAccessSessionId(null);
      setNotice("验证码已发送。");
      setEntryError("");
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
  });

  function chooseMode(nextMode: WorldAccessMode) {
    setMode(nextMode);
    setEntryError("");
    setOwnerError("");
    setNotice("");
  }

  async function continueWithLocalWorld() {
    if (!normalizedLocalApiBaseUrl) {
      setEntryError("请输入本地世界 API 地址。");
      return;
    }

    setIsContinuing(true);
    setEntryError("");
    setOwnerError("");

    if (localApiBaseUrlAdjusted) {
      setLocalApiBaseUrl(normalizedLocalApiBaseUrl);
    }

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

      setNotice("已连接到本地世界。");
    } catch (error) {
      setReadyBaseUrl(null);
      setEntryError(describeRequestError(error, "无法连接到本地世界。"));
    } finally {
      setIsContinuing(false);
    }
  }

  async function continueWithCloudWorld() {
    if (!phone.trim()) {
      setEntryError("请输入手机号。");
      return;
    }

    if (!cloudAccessToken && !code.trim()) {
      setEntryError("请输入验证码。");
      return;
    }

    setIsContinuing(true);
    setEntryError("");
    setOwnerError("");

    try {
      let accessToken = cloudAccessToken;
      let verifiedPhone = phone.trim();

      if (!accessToken) {
        const verifyResult = await verifyCloudPhoneCode(
          {
            phone: phone.trim(),
            code: code.trim(),
          },
          normalizedCloudApiBaseUrl || undefined,
        );

        accessToken = verifyResult.accessToken;
        verifiedPhone = verifyResult.phone;
        setPhone(verifyResult.phone);
        setCloudAccessToken(verifyResult.accessToken);
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
        setEntryError(describeCloudSessionFailure(session));
        return;
      }

      setNotice(describeCloudSession(session));

      if (session.status === "ready") {
        await connectToResolvedCloudWorld(accessToken, verifiedPhone, session);
      }
    } catch (error) {
      setReadyBaseUrl(null);
      setEntryError(describeRequestError(error, "解析云世界访问失败。"));
    } finally {
      setIsContinuing(false);
    }
  }

  async function submitOwnerName() {
    const username = ownerName.trim();
    if (!username) {
      setOwnerError("请输入世界主人的名字。");
      return;
    }

    if (!readyBaseUrl) {
      setOwnerError("请先连接世界，再设置世界主人名称。");
      return;
    }

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
      setOwnerError(describeRequestError(error, "保存世界主人资料失败。"));
    } finally {
      setIsContinuing(false);
    }
  }

  function renderModeFields() {
    if (mode === "cloud") {
      return (
        <div className="space-y-4">
          <label className="block space-y-2">
            <span className="text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)]">手机号</span>
            <TextField
              value={phone}
              onChange={(event) => {
                setPhone(event.target.value);
                setCode("");
                setCloudAccessToken("");
                setCloudAccessSessionId(null);
                setConnectedAccessSessionId(null);
                setEntryError("");
              }}
              placeholder="请输入手机号"
            />
          </label>

          <div className="space-y-2">
            <span className="block text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
              验证码
            </span>
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <TextField
                  value={code}
                  onChange={(event) => {
                    setCode(event.target.value);
                    setEntryError("");
                  }}
                  placeholder="请输入验证码"
                />
              </div>
              <Button
                onClick={() => sendCodeMutation.mutate()}
                disabled={!phone.trim() || sendCodeMutation.isPending}
                variant="secondary"
                size="lg"
                className="shrink-0 rounded-2xl border-black/5 bg-[#f5f5f5] px-5 shadow-none hover:border-[rgba(7,193,96,0.16)] hover:bg-white"
              >
                {sendCodeMutation.isPending ? "发送中..." : "发送验证码"}
              </Button>
            </div>
          </div>

          {cloudAccessSessionQuery.isLoading ? (
            isDesktopLayout ? (
              <LoadingBlock className="px-0 py-0 text-left" label="正在解析你的云世界..." />
            ) : (
              <MobileWelcomeStatusCard
                badge="云世界"
                title="正在解析你的世界"
                description="我们正在判断是为这个手机号创建新世界，还是唤醒它已拥有的世界。"
              />
            )
          ) : null}

          {currentCloudSession ? (
            isDesktopLayout ? (
              <InlineNotice tone={mobileNoticeTone(currentCloudSession)}>
                {describeCloudSession(currentCloudSession)}
              </InlineNotice>
            ) : (
              <MobileWelcomeNotice tone={mobileNoticeTone(currentCloudSession)}>
                {describeCloudSession(currentCloudSession)}
              </MobileWelcomeNotice>
            )
          ) : null}

          {currentCloudSession?.resolvedApiBaseUrl ? (
            isDesktopLayout ? (
              <InlineNotice tone="muted">已解析到世界地址：{currentCloudSession.resolvedApiBaseUrl}</InlineNotice>
            ) : (
              <MobileWelcomeNotice tone="muted">
                已解析到世界地址：{currentCloudSession.resolvedApiBaseUrl}
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
            {describeCloudButtonLabel(currentCloudSession, isContinuing, ownerSyncing)}
          </Button>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <label className="block space-y-2">
          <span className="text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)]">本地世界地址</span>
          <TextField
            value={localApiBaseUrl}
            onChange={(event) => {
              setLocalApiBaseUrl(event.target.value);
              setEntryError("");
            }}
            placeholder="http://127.0.0.1:3000"
          />
        </label>

        {localApiBaseUrlAdjusted ? (
          <InlineNotice tone="muted">
            {localApiBaseUrlAdjustment === "api-path"
              ? `检测到你输入的是 /api 路径，已自动换算为对应的世界入口地址：${normalizedLocalApiBaseUrl}`
              : `检测到你输入的是本机应用地址，已自动换算为对应的 Core API 地址：${normalizedLocalApiBaseUrl}`}
          </InlineNotice>
        ) : null}

        <Button
          onClick={() => void continueWithLocalWorld()}
          disabled={!normalizedLocalApiBaseUrl || isContinuing}
          variant="primary"
          size="lg"
          className="w-full rounded-2xl bg-[#07c160] text-white shadow-none hover:bg-[#06ad56]"
        >
          {isContinuing ? "连接中..." : "连接本地世界"}
        </Button>
      </div>
    );
  }

  function renderOwnerStep() {
    return (
      <div className="space-y-5">
        <h2 className="text-3xl font-semibold tracking-[0.05em] text-[color:var(--text-primary)]">为世界主人命名</h2>

        <div className="rounded-[28px] border border-black/5 bg-white p-5 shadow-none">
          <TextField
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
            placeholder="为这个世界设置主人的名字"
            className="text-center text-base"
            autoFocus
          />

          {ownerError ? (
            isDesktopLayout ? (
              <InlineNotice className="mt-3" tone="danger">
                {ownerError}
              </InlineNotice>
            ) : (
              <div className="mt-3">
                <MobileWelcomeNotice tone="danger">{ownerError}</MobileWelcomeNotice>
              </div>
            )
          ) : null}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Button
              onClick={() => {
                setReadyBaseUrl(null);
                setOwnerError("");
                setEntryError("");
                setNotice("");
              }}
              disabled={isContinuing}
              variant="secondary"
              size="lg"
              className="rounded-2xl border-black/5 bg-[#f5f5f5] shadow-none hover:border-[rgba(7,193,96,0.16)] hover:bg-white"
            >
              返回
            </Button>
            <Button
              onClick={() => void submitOwnerName()}
              disabled={isContinuing || !ownerName.trim()}
              variant="primary"
              size="lg"
              className="rounded-2xl bg-[#07c160] text-white shadow-none hover:bg-[#06ad56]"
            >
              {isContinuing ? "保存中..." : "进入世界"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  function renderEntryStep() {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => chooseMode("cloud")}
            className={`rounded-[24px] border p-4 text-left transition ${
              mode === "cloud"
                ? "border-[rgba(7,193,96,0.24)] bg-[rgba(247,251,248,0.98)] shadow-none"
                : "border-[color:var(--border-faint)] bg-white hover:border-[rgba(7,193,96,0.16)]"
            }`}
          >
            <div className="text-sm font-medium text-[color:var(--text-primary)]">云世界</div>
            <div className="mt-2 text-xs leading-6 text-[color:var(--text-secondary)]">
              通过手机号登录。新用户会获得一个全新的世界，老用户会唤醒自己已有的世界。
            </div>
          </button>

          <button
            type="button"
            onClick={() => chooseMode("local")}
            className={`rounded-[24px] border p-4 text-left transition ${
              mode === "local"
                ? "border-[rgba(7,193,96,0.24)] bg-[rgba(247,251,248,0.98)] shadow-none"
                : "border-[color:var(--border-faint)] bg-white hover:border-[rgba(7,193,96,0.16)]"
            }`}
          >
            <div className="text-sm font-medium text-[color:var(--text-primary)]">本地世界</div>
            <div className="mt-2 text-xs leading-6 text-[color:var(--text-secondary)]">
              输入世界入口地址并直接连接。若你拿到的是 /api 地址，也可以直接粘贴。
            </div>
          </button>
        </div>

        {notice ? (
          isDesktopLayout ? <InlineNotice tone="success">{notice}</InlineNotice> : <MobileWelcomeNotice tone="success">{notice}</MobileWelcomeNotice>
        ) : null}

        {ownerSyncing && runtimeConfig.apiBaseUrl ? (
          isDesktopLayout ? (
            <LoadingBlock className="px-0 py-0 text-left" label="正在加载世界主人..." />
          ) : (
            <MobileWelcomeStatusCard
              badge="世界"
              title="正在加载世界主人"
              description="世界地址已连通，正在进入应用前同步世界主人资料。"
            />
          )
        ) : null}

        {renderModeFields()}

        {entryError ? (
          isDesktopLayout ? <ErrorBlock message={entryError} /> : <MobileWelcomeNotice tone="danger">{entryError}</MobileWelcomeNotice>
        ) : null}
        {sendCodeMutation.isError && sendCodeMutation.error instanceof Error ? (
          isDesktopLayout ? (
            <ErrorBlock message={sendCodeMutation.error.message} />
          ) : (
            <MobileWelcomeNotice tone="danger">{sendCodeMutation.error.message}</MobileWelcomeNotice>
          )
        ) : null}
        {cloudAccessSessionQuery.isError && cloudAccessSessionQuery.error instanceof Error ? (
          isDesktopLayout ? (
            <ErrorBlock message={cloudAccessSessionQuery.error.message} />
          ) : (
            <MobileWelcomeNotice tone="danger">{cloudAccessSessionQuery.error.message}</MobileWelcomeNotice>
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
              世界入口
            </div>
            <h1 className="mt-5 text-3xl font-semibold tracking-[0.08em] text-[color:var(--text-primary)]">
              连接你的世界
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
          世界入口
        </div>
        <h1 className="mt-6 text-3xl font-semibold tracking-[0.08em] text-[color:var(--text-primary)]">
          连接你的世界
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
}: {
  children: ReactNode;
  tone?: "danger" | "info" | "muted" | "success";
}) {
  const toneClassName =
    tone === "danger"
      ? "border-[#f2c6c3] bg-[#fff7f5] text-[#b42318]"
      : tone === "success"
        ? "border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.08)] text-[#15803d]"
        : tone === "muted"
          ? "border-black/5 bg-[#f7f7f5] text-[color:var(--text-secondary)]"
          : "border-[rgba(22,163,74,0.12)] bg-[#f6fbf7] text-[color:var(--text-secondary)]";

  return <div className={`rounded-[20px] border px-4 py-3 text-sm leading-6 ${toneClassName}`}>{children}</div>;
}
