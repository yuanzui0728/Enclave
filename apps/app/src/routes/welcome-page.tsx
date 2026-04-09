import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  DEFAULT_CORE_API_BASE_URL,
  createMyCloudWorldRequest,
  getMyCloudWorld,
  getWorldOwner,
  sendCloudPhoneCode,
  updateWorldOwner,
  verifyCloudPhoneCode,
  type CloudWorldLookupResponse,
} from "@yinjie/contracts";
import { AppPage, AppSection, Button, ErrorBlock, InlineNotice, LoadingBlock, TextField } from "@yinjie/ui";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { describeRequestError } from "../lib/request-error";
import { assertWorldReachable } from "../lib/world-entry";
import { setAppRuntimeConfig, useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

type WorldAccessMode = "cloud" | "local";

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function describeCloudStatus(data?: CloudWorldLookupResponse | null) {
  switch (data?.status) {
    case "active":
      return "你的官方世界已经准备好了。";
    case "pending":
      return "建世界申请已提交，等待官方处理。";
    case "provisioning":
      return "官方正在为你准备世界。";
    case "rejected":
      return "申请需要你补充信息后重新提交。";
    case "disabled":
      return "这个官方世界当前不可用。";
    default:
      return "还没有找到可进入的官方世界。";
  }
}

export function WelcomePage() {
  const navigate = useNavigate();
  const isDesktopLayout = useDesktopLayout();
  const runtimeConfig = useAppRuntimeConfig();
  const hydrateOwner = useWorldOwnerStore((state) => state.hydrateOwner);
  const storedName = useWorldOwnerStore((state) => state.username);
  const onboardingCompleted = useWorldOwnerStore((state) => state.onboardingCompleted);

  const [mode, setMode] = useState<WorldAccessMode>(
    runtimeConfig.worldAccessMode ?? (runtimeConfig.apiBaseUrl ? "local" : "cloud"),
  );
  const [localApiBaseUrl, setLocalApiBaseUrl] = useState(
    runtimeConfig.apiBaseUrl ?? DEFAULT_CORE_API_BASE_URL,
  );
  const [phone, setPhone] = useState(runtimeConfig.cloudPhone ?? "");
  const [code, setCode] = useState("");
  const [worldName, setWorldName] = useState("");
  const [cloudAccessToken, setCloudAccessToken] = useState("");
  const [ownerName, setOwnerName] = useState(storedName ?? "");
  const [readyBaseUrl, setReadyBaseUrl] = useState<string | null>(null);
  const [ownerSyncing, setOwnerSyncing] = useState(false);
  const [notice, setNotice] = useState("");
  const [entryError, setEntryError] = useState("");
  const [ownerError, setOwnerError] = useState("");
  const [isContinuing, setIsContinuing] = useState(false);

  const normalizedLocalApiBaseUrl = normalizeBaseUrl(localApiBaseUrl);
  const normalizedCloudApiBaseUrl = normalizeBaseUrl(runtimeConfig.cloudApiBaseUrl ?? "");
  const showOwnerStep = Boolean(readyBaseUrl) && !onboardingCompleted;

  useEffect(() => {
    setLocalApiBaseUrl(runtimeConfig.apiBaseUrl ?? DEFAULT_CORE_API_BASE_URL);
    setPhone(runtimeConfig.cloudPhone ?? "");
    if (runtimeConfig.worldAccessMode) {
      setMode(runtimeConfig.worldAccessMode);
    }
  }, [
    runtimeConfig.apiBaseUrl,
    runtimeConfig.cloudPhone,
    runtimeConfig.worldAccessMode,
  ]);

  useEffect(() => {
    setOwnerName(storedName ?? "");
  }, [storedName]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => setNotice(""), 2800);
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
          setEntryError(describeRequestError(error, "当前还没连上你的世界，请重新检查入口。"));
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

  const cloudStatusQuery = useQuery({
    queryKey: ["welcome-cloud-world", normalizedCloudApiBaseUrl || "default", cloudAccessToken],
    queryFn: () => getMyCloudWorld(cloudAccessToken, normalizedCloudApiBaseUrl || undefined),
    enabled: Boolean(cloudAccessToken),
    retry: false,
  });

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
      setNotice("验证码已发送，请查收短信。");
      setEntryError("");
      setCloudAccessToken("");
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

  const createWorldRequestMutation = useMutation({
    mutationFn: () =>
      createMyCloudWorldRequest(
        {
          worldName: worldName.trim(),
        },
        cloudAccessToken,
        normalizedCloudApiBaseUrl || undefined,
      ),
    onSuccess: async () => {
      setNotice("建世界申请已经提交。");
      setEntryError("");
      await cloudStatusQuery.refetch();
    },
  });

  const currentCloudWorld = cloudStatusQuery.data?.world ?? null;
  const cloudCanRequestWorld =
    Boolean(cloudAccessToken) &&
    (cloudStatusQuery.data?.status === "none" || cloudStatusQuery.data?.status === "rejected");

  function chooseMode(nextMode: WorldAccessMode) {
    setMode(nextMode);
    setEntryError("");
    setOwnerError("");
    setNotice("");
  }

  async function continueWithLocalWorld() {
    if (!normalizedLocalApiBaseUrl) {
      setEntryError("先填写你的世界地址。");
      return;
    }

    setIsContinuing(true);
    setEntryError("");
    setOwnerError("");

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

      setNotice("世界已连上。");
    } catch (error) {
      setReadyBaseUrl(null);
      setEntryError(describeRequestError(error, "当前世界地址暂时不可用，请检查后重试。"));
    } finally {
      setIsContinuing(false);
    }
  }

  async function continueWithCloudWorld() {
    if (!phone.trim()) {
      setEntryError("先填写手机号。");
      return;
    }

    if (!cloudAccessToken && !code.trim()) {
      setEntryError("先填写验证码。");
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
        setNotice("手机号验证完成，正在检查你的官方世界。");
      }

      const cloudStatus = await getMyCloudWorld(accessToken, normalizedCloudApiBaseUrl || undefined);
      const cloudWorld = cloudStatus.world ?? null;

      setCloudAccessToken(accessToken);
      setAppRuntimeConfig({
        apiBaseUrl: undefined,
        socketBaseUrl: undefined,
        worldAccessMode: "cloud",
        cloudApiBaseUrl: normalizedCloudApiBaseUrl || undefined,
        cloudPhone: verifiedPhone,
        cloudWorldId: cloudWorld?.id,
        bootstrapSource: "user",
      });

      if (cloudStatus.status !== "active" || !cloudWorld?.apiBaseUrl) {
        setEntryError(describeCloudStatus(cloudStatus));
        return;
      }

      await assertWorldReachable(cloudWorld.apiBaseUrl);
      setAppRuntimeConfig({
        apiBaseUrl: cloudWorld.apiBaseUrl,
        socketBaseUrl: cloudWorld.apiBaseUrl,
        worldAccessMode: "cloud",
        cloudApiBaseUrl: normalizedCloudApiBaseUrl || undefined,
        cloudPhone: verifiedPhone,
        cloudWorldId: cloudWorld.id,
        bootstrapSource: "user",
        configStatus: "configured",
      });

      const owner = await getWorldOwner(cloudWorld.apiBaseUrl);
      hydrateOwner(owner);
      setReadyBaseUrl(cloudWorld.apiBaseUrl);
      setOwnerName(owner.username ?? "");
      if (owner.onboardingCompleted) {
        void navigate({ to: "/tabs/chat", replace: true });
        return;
      }

      setNotice("世界已连上。");
    } catch (error) {
      setReadyBaseUrl(null);
      setEntryError(describeRequestError(error, "官方世界暂时不可用，请稍后再试。"));
    } finally {
      setIsContinuing(false);
    }
  }

  async function submitOwnerName() {
    const username = ownerName.trim();
    if (!username) {
      setOwnerError("告诉我们怎么称呼你。");
      return;
    }

    if (!readyBaseUrl) {
      setOwnerError("先连上你的世界，再继续。");
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
      setOwnerError(describeRequestError(error, "保存名字失败，请稍后重试。"));
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
                setEntryError("");
              }}
              placeholder="输入申请官方世界时使用的手机号"
            />
          </label>

          <div className="space-y-2">
            <span className="block text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)]">验证码</span>
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <TextField
                  value={code}
                  onChange={(event) => {
                    setCode(event.target.value);
                    setEntryError("");
                  }}
                  placeholder="输入短信验证码"
                />
              </div>
              <Button
                onClick={() => sendCodeMutation.mutate()}
                disabled={!phone.trim() || sendCodeMutation.isPending}
                variant="secondary"
                size="lg"
                className="shrink-0 rounded-2xl px-5"
              >
                {sendCodeMutation.isPending ? "发送中..." : "发送验证码"}
              </Button>
            </div>
          </div>

          {cloudStatusQuery.isLoading ? (
            <LoadingBlock className="px-0 py-0 text-left" label="正在检查你的官方世界..." />
          ) : null}

          {cloudStatusQuery.data ? (
            <InlineNotice tone={cloudStatusQuery.data.status === "active" ? "success" : "info"}>
              {cloudStatusQuery.data.status === "active"
                ? `世界已准备好：${currentCloudWorld?.name ?? "未命名世界"}`
                : describeCloudStatus(cloudStatusQuery.data)}
            </InlineNotice>
          ) : null}

          {currentCloudWorld?.apiBaseUrl ? (
            <InlineNotice tone="muted">世界地址：{currentCloudWorld.apiBaseUrl}</InlineNotice>
          ) : null}

          {cloudCanRequestWorld ? (
            <div className="rounded-[24px] border border-[color:var(--border-faint)] bg-white/78 p-4">
              <TextField
                value={worldName}
                onChange={(event) => setWorldName(event.target.value)}
                placeholder="给你的世界起个名字"
              />
              <Button
                onClick={() => createWorldRequestMutation.mutate()}
                disabled={!worldName.trim() || createWorldRequestMutation.isPending}
                variant="primary"
                className="mt-4 rounded-2xl"
              >
                {createWorldRequestMutation.isPending ? "提交中..." : "提交建世界申请"}
              </Button>
            </div>
          ) : null}

          <Button
            onClick={() => void continueWithCloudWorld()}
            disabled={isContinuing}
            variant="primary"
            size="lg"
            className="w-full rounded-2xl"
          >
            {isContinuing ? "进入中..." : "进入我的世界"}
          </Button>

        </div>
      );
    }

    return (
      <div className="space-y-4">
        <label className="block space-y-2">
          <span className="text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)]">世界地址</span>
          <TextField
            value={localApiBaseUrl}
            onChange={(event) => {
              setLocalApiBaseUrl(event.target.value);
              setEntryError("");
            }}
            placeholder="例如 http://127.0.0.1:3000"
          />
        </label>

        <Button
          onClick={() => void continueWithLocalWorld()}
          disabled={!normalizedLocalApiBaseUrl || isContinuing}
          variant="primary"
          size="lg"
          className="w-full rounded-2xl"
        >
          {isContinuing ? "连接中..." : "进入我的世界"}
        </Button>
      </div>
    );
  }

  function renderOwnerStep() {
    return (
      <div className="space-y-5">
        <h2 className="text-3xl font-semibold tracking-[0.05em] text-[color:var(--text-primary)]">
          怎么称呼你？
        </h2>

        <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-white/84 p-5 shadow-[var(--shadow-section)]">
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
            placeholder="输入你希望世界如何称呼你"
            className="text-center text-base"
            autoFocus
          />

          {ownerError ? (
            <InlineNotice className="mt-3" tone="danger">
              {ownerError}
            </InlineNotice>
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
              className="rounded-2xl"
            >
              返回
            </Button>
            <Button
              onClick={() => void submitOwnerName()}
              disabled={isContinuing || !ownerName.trim()}
              variant="primary"
              size="lg"
              className="rounded-2xl"
            >
              {isContinuing ? "进入中..." : "进入我的世界"}
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
                ? "border-[rgba(255,179,71,0.48)] bg-[rgba(255,248,236,0.94)] shadow-[var(--shadow-soft)]"
                : "border-[color:var(--border-faint)] bg-white/76 hover:bg-white"
            }`}
          >
            <div className="text-sm font-medium text-[color:var(--text-primary)]">官方托管</div>
          </button>

          <button
            type="button"
            onClick={() => chooseMode("local")}
            className={`rounded-[24px] border p-4 text-left transition ${
              mode === "local"
                ? "border-[rgba(96,165,250,0.42)] bg-[rgba(244,249,255,0.95)] shadow-[var(--shadow-soft)]"
                : "border-[color:var(--border-faint)] bg-white/76 hover:bg-white"
            }`}
          >
            <div className="text-sm font-medium text-[color:var(--text-primary)]">本地世界</div>
          </button>
        </div>

        {notice ? <InlineNotice tone="success">{notice}</InlineNotice> : null}
        {ownerSyncing && runtimeConfig.apiBaseUrl ? (
          <LoadingBlock className="px-0 py-0 text-left" label="正在同步你的世界状态..." />
        ) : null}

        {renderModeFields()}

        {entryError ? <ErrorBlock message={entryError} /> : null}
        {sendCodeMutation.isError && sendCodeMutation.error instanceof Error ? (
          <ErrorBlock message={sendCodeMutation.error.message} />
        ) : null}
        {cloudStatusQuery.isError && cloudStatusQuery.error instanceof Error ? (
          <ErrorBlock message={cloudStatusQuery.error.message} />
        ) : null}
        {createWorldRequestMutation.isError && createWorldRequestMutation.error instanceof Error ? (
          <ErrorBlock message={createWorldRequestMutation.error.message} />
        ) : null}
      </div>
    );
  }

  if (isDesktopLayout) {
    return (
      <AppPage className="relative flex min-h-full items-center justify-center overflow-hidden p-6 sm:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[rgba(35,41,38,0.18)] backdrop-blur-[18px]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),rgba(28,34,31,0.28)_74%)]" />
        <div className="relative z-10 w-full max-w-3xl">
          <div className="pointer-events-none absolute inset-0 rounded-[44px] bg-[rgba(255,255,255,0.24)] blur-3xl" />
          <AppSection className="relative mx-auto w-full max-w-xl rounded-[32px] border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(252,248,242,0.94))] px-7 py-8 shadow-[0_28px_72px_rgba(42,50,46,0.34)] backdrop-blur-2xl">
            <div className="inline-flex rounded-full border border-[rgba(255,179,71,0.24)] bg-white/78 px-3 py-1 text-[11px] uppercase tracking-[0.32em] text-[color:var(--brand-secondary)]">
              世界入口
            </div>
            <h1 className="mt-5 text-3xl font-semibold tracking-[0.08em] text-[color:var(--text-primary)]">
              进入你的世界
            </h1>

            <div className="mt-6">
              {showOwnerStep ? renderOwnerStep() : renderEntryStep()}
            </div>
          </AppSection>
        </div>
      </AppPage>
    );
  }

  return (
    <AppPage className="py-8">
      <AppSection className="mx-auto w-full max-w-xl bg-[linear-gradient(145deg,rgba(255,255,255,0.98),rgba(255,246,232,0.94)_44%,rgba(240,251,245,0.96))] px-6 py-8">
        <div className="inline-flex rounded-full border border-[rgba(255,179,71,0.24)] bg-white/78 px-3 py-1 text-[11px] uppercase tracking-[0.32em] text-[color:var(--brand-secondary)]">
          世界入口
        </div>
        <h1 className="mt-6 text-3xl font-semibold tracking-[0.08em] text-[color:var(--text-primary)]">
          进入你的世界
        </h1>

        <div className="mt-6">
          {showOwnerStep ? renderOwnerStep() : renderEntryStep()}
        </div>
      </AppSection>
    </AppPage>
  );
}
