import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  createMyCloudWorldRequest,
  getMyCloudWorld,
  getWorldOwner,
  sendCloudPhoneCode,
  updateWorldOwner,
  verifyCloudPhoneCode,
  type CloudWorldLookupResponse,
} from "@yinjie/contracts";
import { AppPage, AppSection, Button, ErrorBlock, InlineNotice, LoadingBlock, TextField } from "@yinjie/ui";
import { DesktopEntryShell } from "../features/desktop/desktop-entry-shell";
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
      return "你的云世界已经准备好了。";
    case "pending":
      return "建世界申请已提交，等待官方处理。";
    case "provisioning":
      return "官方正在为你准备世界。";
    case "rejected":
      return "申请需要你补充信息后重新提交。";
    case "disabled":
      return "这个云世界当前不可用。";
    default:
      return "还没有找到可进入的云世界。";
  }
}

function LegalLinks() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-[color:var(--text-muted)]">
      <Link to="/legal/privacy" className="transition hover:text-[color:var(--text-primary)]">
        隐私政策
      </Link>
      <Link to="/legal/terms" className="transition hover:text-[color:var(--text-primary)]">
        用户协议
      </Link>
      <Link to="/legal/community" className="transition hover:text-[color:var(--text-primary)]">
        社区规范
      </Link>
    </div>
  );
}

export function WelcomePage() {
  const navigate = useNavigate();
  const isDesktopLayout = useDesktopLayout();
  const runtimeConfig = useAppRuntimeConfig();
  const hydrateOwner = useWorldOwnerStore((state) => state.hydrateOwner);
  const ownerId = useWorldOwnerStore((state) => state.id);
  const storedName = useWorldOwnerStore((state) => state.username);
  const onboardingCompleted = useWorldOwnerStore((state) => state.onboardingCompleted);

  const [mode, setMode] = useState<WorldAccessMode>(
    runtimeConfig.worldAccessMode ?? (runtimeConfig.apiBaseUrl ? "local" : "cloud"),
  );
  const [localApiBaseUrl, setLocalApiBaseUrl] = useState(runtimeConfig.apiBaseUrl ?? "");
  const [localSocketBaseUrl, setLocalSocketBaseUrl] = useState(
    runtimeConfig.socketBaseUrl ?? runtimeConfig.apiBaseUrl ?? "",
  );
  const [cloudApiBaseUrl, setCloudApiBaseUrl] = useState(runtimeConfig.cloudApiBaseUrl ?? "");
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
  const normalizedLocalSocketBaseUrl = normalizeBaseUrl(localSocketBaseUrl);
  const normalizedCloudApiBaseUrl = normalizeBaseUrl(cloudApiBaseUrl);
  const resolvedOwnerBaseUrl = readyBaseUrl ?? runtimeConfig.apiBaseUrl ?? null;

  useEffect(() => {
    setLocalApiBaseUrl(runtimeConfig.apiBaseUrl ?? "");
    setLocalSocketBaseUrl(runtimeConfig.socketBaseUrl ?? runtimeConfig.apiBaseUrl ?? "");
    setCloudApiBaseUrl(runtimeConfig.cloudApiBaseUrl ?? "");
    setPhone(runtimeConfig.cloudPhone ?? "");
    if (runtimeConfig.worldAccessMode) {
      setMode(runtimeConfig.worldAccessMode);
    }
  }, [
    runtimeConfig.apiBaseUrl,
    runtimeConfig.cloudApiBaseUrl,
    runtimeConfig.cloudPhone,
    runtimeConfig.socketBaseUrl,
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

  const verifyCodeMutation = useMutation({
    mutationFn: () =>
      verifyCloudPhoneCode(
        {
          phone: phone.trim(),
          code: code.trim(),
        },
        normalizedCloudApiBaseUrl || undefined,
      ),
    onSuccess: (result) => {
      setPhone(result.phone);
      setCode("");
      setCloudAccessToken(result.accessToken);
      setNotice("手机号验证完成，正在检查你的云世界。");
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
  const cloudCanContinue = Boolean(
    cloudStatusQuery.data?.status === "active" && currentCloudWorld?.apiBaseUrl,
  );
  const cloudCanRequestWorld =
    Boolean(cloudAccessToken) &&
    (cloudStatusQuery.data?.status === "none" || cloudStatusQuery.data?.status === "rejected");
  const showOwnerStep = Boolean(resolvedOwnerBaseUrl) && !onboardingCompleted;

  const currentStep = showOwnerStep ? 2 : 1;
  const summaryText = useMemo(() => {
    if (showOwnerStep) {
      return "世界已经连上了，最后一步是告诉我们怎么称呼你。";
    }

    if (mode === "cloud") {
      return "默认推荐官方云世界，输入手机号后继续。";
    }

    return "如果你已经有世界地址，只需要填一个 API 地址。";
  }, [mode, showOwnerStep]);

  function chooseMode(nextMode: WorldAccessMode) {
    setMode(nextMode);
    setEntryError("");
    setOwnerError("");
    if (nextMode === "cloud") {
      setReadyBaseUrl(null);
    }
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
      socketBaseUrl: normalizedLocalSocketBaseUrl || normalizedLocalApiBaseUrl,
      worldAccessMode: "local",
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

      setNotice("世界已连上，现在给自己起个名字。");
    } catch (error) {
      setReadyBaseUrl(null);
      setEntryError(describeRequestError(error, "当前世界地址暂时不可用，请检查后重试。"));
    } finally {
      setIsContinuing(false);
    }
  }

  async function continueWithCloudWorld() {
    if (!cloudCanContinue || !currentCloudWorld?.apiBaseUrl) {
      setEntryError("先完成手机号验证，并等待云世界准备完成。");
      return;
    }

    setIsContinuing(true);
    setEntryError("");
    setOwnerError("");

    try {
      await assertWorldReachable(currentCloudWorld.apiBaseUrl);
      setAppRuntimeConfig({
        apiBaseUrl: currentCloudWorld.apiBaseUrl,
        socketBaseUrl: currentCloudWorld.apiBaseUrl,
        worldAccessMode: "cloud",
        cloudApiBaseUrl: normalizedCloudApiBaseUrl || undefined,
        cloudPhone: phone.trim() || runtimeConfig.cloudPhone,
        cloudWorldId: currentCloudWorld.id,
        bootstrapSource: "user",
        configStatus: "configured",
      });

      const owner = await getWorldOwner(currentCloudWorld.apiBaseUrl);
      hydrateOwner(owner);
      setReadyBaseUrl(currentCloudWorld.apiBaseUrl);
      setOwnerName(owner.username ?? "");
      if (owner.onboardingCompleted) {
        void navigate({ to: "/tabs/chat", replace: true });
        return;
      }

      setNotice("世界已连上，现在给自己起个名字。");
    } catch (error) {
      setReadyBaseUrl(null);
      setEntryError(describeRequestError(error, "云世界暂时不可用，请稍后再试。"));
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

    if (!resolvedOwnerBaseUrl) {
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
        resolvedOwnerBaseUrl,
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
                setEntryError("");
                if (event.target.value.trim() !== (runtimeConfig.cloudPhone ?? "")) {
                  setCloudAccessToken("");
                }
              }}
              placeholder="输入申请云世界时使用的手机号"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)]">验证码</span>
            <TextField
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
                setEntryError("");
              }}
              placeholder="输入短信验证码"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              onClick={() => sendCodeMutation.mutate()}
              disabled={!phone.trim() || sendCodeMutation.isPending}
              variant="primary"
              size="lg"
              className="rounded-2xl"
            >
              {sendCodeMutation.isPending ? "发送中..." : "发送验证码"}
            </Button>
            <Button
              onClick={() => verifyCodeMutation.mutate()}
              disabled={!phone.trim() || !code.trim() || verifyCodeMutation.isPending}
              variant="secondary"
              size="lg"
              className="rounded-2xl"
            >
              {verifyCodeMutation.isPending ? "验证中..." : "验证手机号"}
            </Button>
          </div>

          {cloudStatusQuery.isLoading ? (
            <LoadingBlock className="px-0 py-0 text-left" label="正在检查你的云世界..." />
          ) : null}

          {cloudStatusQuery.data ? (
            <InlineNotice tone={cloudCanContinue ? "success" : "info"}>
              {cloudCanContinue
                ? `世界已准备好：${currentCloudWorld?.name ?? "未命名世界"}`
                : describeCloudStatus(cloudStatusQuery.data)}
            </InlineNotice>
          ) : null}

          {currentCloudWorld?.apiBaseUrl ? (
            <InlineNotice tone="muted">世界地址：{currentCloudWorld.apiBaseUrl}</InlineNotice>
          ) : null}

          {cloudCanRequestWorld ? (
            <div className="rounded-[24px] border border-[color:var(--border-faint)] bg-white/78 p-4">
              <div className="text-sm font-medium text-[color:var(--text-primary)]">还没有云世界</div>
              <p className="mt-2 text-sm leading-7 text-[color:var(--text-secondary)]">
                先给你的世界起个名字，提交申请后我们会继续为你开通。
              </p>
              <TextField
                value={worldName}
                onChange={(event) => setWorldName(event.target.value)}
                placeholder="例如 我的隐界"
                className="mt-4"
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

          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              onClick={() => void cloudStatusQuery.refetch()}
              disabled={!cloudAccessToken || cloudStatusQuery.isFetching}
              variant="secondary"
              size="lg"
              className="rounded-2xl"
            >
              {cloudStatusQuery.isFetching ? "刷新中..." : "刷新状态"}
            </Button>
            <Button
              onClick={() => void continueWithCloudWorld()}
              disabled={!cloudCanContinue || isContinuing}
              variant="primary"
              size="lg"
              className="rounded-2xl"
            >
              {isContinuing ? "连接中..." : "进入我的世界"}
            </Button>
          </div>

          <details className="rounded-[24px] border border-[color:var(--border-faint)] bg-[rgba(255,255,255,0.72)] px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium text-[color:var(--text-primary)]">高级设置</summary>
            <div className="mt-4">
              <label className="block space-y-2">
                <span className="text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)]">云平台地址</span>
                <TextField
                  value={cloudApiBaseUrl}
                  onChange={(event) => {
                    setCloudApiBaseUrl(event.target.value);
                    setCloudAccessToken("");
                    setCode("");
                    setEntryError("");
                  }}
                  placeholder="留空则使用官方默认地址"
                />
              </label>
            </div>
          </details>
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

        <InlineNotice tone="info">
          如果你已经有自己的世界地址，只需要填这一项就够了。
        </InlineNotice>

        <details className="rounded-[24px] border border-[color:var(--border-faint)] bg-[rgba(255,255,255,0.72)] px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-[color:var(--text-primary)]">高级设置</summary>
          <div className="mt-4">
            <label className="block space-y-2">
              <span className="text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)]">Socket 地址</span>
              <TextField
                value={localSocketBaseUrl}
                onChange={(event) => setLocalSocketBaseUrl(event.target.value)}
                placeholder="留空则默认跟世界地址一致"
              />
            </label>
          </div>
        </details>

        <Button
          onClick={() => void continueWithLocalWorld()}
          disabled={!normalizedLocalApiBaseUrl || isContinuing}
          variant="primary"
          size="lg"
          className="w-full rounded-2xl"
        >
          {isContinuing ? "连接中..." : "连接我的世界"}
        </Button>
      </div>
    );
  }

  function renderOwnerStep() {
    return (
      <div className="space-y-5">
        <div>
          <div className="inline-flex rounded-full border border-[rgba(255,179,71,0.24)] bg-white/88 px-3 py-1 text-[11px] uppercase tracking-[0.32em] text-[color:var(--brand-secondary)]">
            第 2 步
          </div>
          <h2 className="mt-4 text-3xl font-semibold tracking-[0.05em] text-[color:var(--text-primary)]">
            怎么称呼你？
          </h2>
          <p className="mt-3 text-sm leading-7 text-[color:var(--text-secondary)]">
            你的角色们会记住这个名字，并围绕你继续展开故事。
          </p>
        </div>

        <div className="grid gap-3 text-left sm:grid-cols-3">
          <div className="rounded-[22px] bg-white/82 p-4 shadow-[var(--shadow-soft)]">
            <div className="text-sm font-medium text-[color:var(--text-primary)]">更自然</div>
            <div className="mt-2 text-xs leading-6 text-[color:var(--text-muted)]">对话会直接围绕你的身份展开。</div>
          </div>
          <div className="rounded-[22px] bg-white/82 p-4 shadow-[var(--shadow-soft)]">
            <div className="text-sm font-medium text-[color:var(--text-primary)]">更亲近</div>
            <div className="mt-2 text-xs leading-6 text-[color:var(--text-muted)]">世界里的角色会更准确地回应你。</div>
          </div>
          <div className="rounded-[22px] bg-white/82 p-4 shadow-[var(--shadow-soft)]">
            <div className="text-sm font-medium text-[color:var(--text-primary)]">更有归属</div>
            <div className="mt-2 text-xs leading-6 text-[color:var(--text-muted)]">从这里开始，这个世界真正属于你。</div>
          </div>
        </div>

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
              }}
              disabled={isContinuing}
              variant="secondary"
              size="lg"
              className="rounded-2xl"
            >
              返回修改入口
            </Button>
            <Button
              onClick={() => void submitOwnerName()}
              disabled={isContinuing || !ownerName.trim()}
              variant="primary"
              size="lg"
              className="rounded-2xl"
            >
              {isContinuing ? "进入中..." : "从这里开始"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  function renderEntryStep() {
    return (
      <div className="space-y-5">
        <div>
          <div className="inline-flex rounded-full border border-[rgba(255,179,71,0.24)] bg-white/88 px-3 py-1 text-[11px] uppercase tracking-[0.32em] text-[color:var(--brand-secondary)]">
            第 1 步
          </div>
          <h2 className="mt-4 text-3xl font-semibold tracking-[0.05em] text-[color:var(--text-primary)]">
            先连上你的世界
          </h2>
          <p className="mt-3 text-sm leading-7 text-[color:var(--text-secondary)]">{summaryText}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => chooseMode("cloud")}
            className={`rounded-[24px] border p-4 text-left transition ${
              mode === "cloud"
                ? "border-[rgba(255,179,71,0.48)] bg-[rgba(255,248,236,0.94)] shadow-[var(--shadow-soft)]"
                : "border-[color:var(--border-faint)] bg-white/76 hover:bg-white"
            }`}
          >
            <div className="text-sm font-medium text-[color:var(--text-primary)]">使用官方云世界</div>
            <div className="mt-2 text-sm leading-7 text-[color:var(--text-secondary)]">
              默认推荐。输入手机号，确认后直接进入你的云世界。
            </div>
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
            <div className="text-sm font-medium text-[color:var(--text-primary)]">我已有世界地址</div>
            <div className="mt-2 text-sm leading-7 text-[color:var(--text-secondary)]">
              适合已经部署好实例，或手里已经有地址的情况。
            </div>
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
        {verifyCodeMutation.isError && verifyCodeMutation.error instanceof Error ? (
          <ErrorBlock message={verifyCodeMutation.error.message} />
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

  const content = (
    <div className="mx-auto w-full max-w-2xl">
      {showOwnerStep ? renderOwnerStep() : renderEntryStep()}
      <div className="mt-8">
        <LegalLinks />
      </div>
    </div>
  );

  if (isDesktopLayout) {
    return (
      <DesktopEntryShell
        badge="世界入口"
        title="进入你的世界"
        description="只保留两步：先连上世界，再告诉它怎么称呼你。其余复杂配置都收进次级入口。"
        aside={
          <div className="space-y-3">
            <div className="rounded-[24px] border border-[color:var(--border-faint)] bg-white/82 p-5 shadow-[var(--shadow-soft)]">
              <div className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--text-muted)]">Step {currentStep}/2</div>
              <div className="mt-2 text-xl font-semibold text-[color:var(--text-primary)]">
                {showOwnerStep ? "告诉世界怎么称呼你" : "选择进入方式"}
              </div>
              <div className="mt-3 text-sm leading-7 text-[color:var(--text-secondary)]">{summaryText}</div>
            </div>

            <div className="rounded-[24px] border border-[color:var(--border-faint)] bg-white/82 p-5 shadow-[var(--shadow-soft)]">
              <div className="text-sm font-medium text-[color:var(--text-primary)]">你现在不会再看到什么</div>
              <div className="mt-3 space-y-2 text-sm leading-7 text-[color:var(--text-secondary)]">
                <p>不需要先理解 setup 和 onboarding 的区别。</p>
                <p>不需要先面对大段平台说明和状态卡。</p>
                <p>普通情况下也不需要手动填写 Socket 地址。</p>
              </div>
            </div>

            {ownerId ? (
              <InlineNotice tone="info">
                这个设备已经识别到世界主人记录，接下来只会继续未完成的那一步。
              </InlineNotice>
            ) : null}
          </div>
        }
      >
        {content}
      </DesktopEntryShell>
    );
  }

  return (
    <AppPage className="py-8">
      <AppSection className="mx-auto w-full max-w-2xl bg-[linear-gradient(145deg,rgba(255,255,255,0.98),rgba(255,246,232,0.94)_44%,rgba(240,251,245,0.96))] px-6 py-8">
        <div className="inline-flex rounded-full border border-[rgba(255,179,71,0.24)] bg-white/78 px-3 py-1 text-[11px] uppercase tracking-[0.32em] text-[color:var(--brand-secondary)]">
          世界入口
        </div>
        <h1 className="mt-6 text-3xl font-semibold tracking-[0.08em] text-[color:var(--text-primary)]">
          进入你的世界
        </h1>
        <p className="mt-4 text-sm leading-7 text-[color:var(--text-secondary)]">
          只保留两步：先连上世界，再告诉它怎么称呼你。
        </p>

        <div className="mt-6 rounded-[24px] border border-[color:var(--border-faint)] bg-white/80 px-4 py-3 text-sm text-[color:var(--text-secondary)]">
          当前进度：第 {currentStep} 步，共 2 步
        </div>

        <div className="mt-6">{content}</div>
      </AppSection>
    </AppPage>
  );
}
