import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  createMyCloudWorldRequest,
  getWorldOwner,
  getMyCloudWorld,
  sendCloudPhoneCode,
  verifyCloudPhoneCode,
  type CloudWorldLookupResponse,
} from "@yinjie/contracts";
import { Button, ErrorBlock, InlineNotice, LoadingBlock, SetupStatusCard, SetupStepList, TextField } from "@yinjie/ui";
import { describeRequestError } from "../../lib/request-error";
import { assertWorldReachable } from "../../lib/world-entry";
import { setAppRuntimeConfig, useAppRuntimeConfig } from "../../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../../store/world-owner-store";

type DesktopSetupPanelProps = {
  hasOwner: boolean;
  onContinue: (ownerReady: boolean) => void;
};

type WorldAccessMode = "cloud" | "local";

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function describeCloudStatus(data?: CloudWorldLookupResponse | null) {
  switch (data?.status) {
    case "active":
      return "云世界已开通";
    case "pending":
      return "申请单已提交";
    case "provisioning":
      return "正在准备世界";
    case "rejected":
      return "申请需要处理";
    case "disabled":
      return "云世界已停用";
    default:
      return "还没有找到云世界";
  }
}

export function DesktopSetupPanel({ hasOwner, onContinue }: DesktopSetupPanelProps) {
  const runtimeConfig = useAppRuntimeConfig();
  const hydrateOwner = useWorldOwnerStore((state) => state.hydrateOwner);
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
  const [notice, setNotice] = useState("");
  const [continueError, setContinueError] = useState("");
  const [isContinuing, setIsContinuing] = useState(false);

  const normalizedLocalApiBaseUrl = normalizeBaseUrl(localApiBaseUrl);
  const normalizedLocalSocketBaseUrl = normalizeBaseUrl(localSocketBaseUrl);
  const normalizedCloudApiBaseUrl = normalizeBaseUrl(cloudApiBaseUrl);

  const cloudStatusQuery = useQuery({
    queryKey: ["desktop-setup-cloud-world", normalizedCloudApiBaseUrl || "default", cloudAccessToken],
    queryFn: () => getMyCloudWorld(cloudAccessToken, normalizedCloudApiBaseUrl || undefined),
    enabled: Boolean(cloudAccessToken),
    retry: false,
  });

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
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => setNotice(""), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

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
      setNotice("验证码已发送。");
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
      setNotice("建世界申请已提交。");
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
  const localCanContinue = Boolean(normalizedLocalApiBaseUrl);
  const configuredWorldSummary =
    runtimeConfig.worldAccessMode === "cloud"
      ? runtimeConfig.cloudWorldId || runtimeConfig.cloudPhone || "等待云世界确认"
      : runtimeConfig.apiBaseUrl || "尚未配置";

  useEffect(() => {
    setContinueError("");
  }, [mode, normalizedLocalApiBaseUrl, currentCloudWorld?.apiBaseUrl]);

  const steps = useMemo(() => {
    if (mode === "cloud") {
      return [
        {
          label: "选择官方云入口",
          hint: normalizedCloudApiBaseUrl || runtimeConfig.cloudApiBaseUrl || "默认使用官方云平台地址。",
          ok: true,
        },
        {
          label: "验证手机号",
          hint: phone.trim() ? `当前手机号：${phone.trim()}` : "输入手机号并完成验证码验证。",
          ok: Boolean(cloudAccessToken),
        },
        {
          label: "确认世界状态",
          hint:
            currentCloudWorld?.apiBaseUrl ??
            cloudStatusQuery.data?.latestRequest?.note ??
            describeCloudStatus(cloudStatusQuery.data),
          ok: cloudCanContinue,
        },
      ];
    }

    return [
      {
        label: "选择本地入口",
        hint: "把这台桌面端连接到你自己的世界实例。",
        ok: true,
      },
      {
        label: "保存世界地址",
        hint: normalizedLocalApiBaseUrl || "先填写一个可访问的世界地址。",
        ok: Boolean(normalizedLocalApiBaseUrl),
      },
      {
        label: "准备进入",
        hint: localCanContinue ? "本地世界入口已经保存。" : "保存有效入口后再进入世界。",
        ok: localCanContinue,
      },
    ];
  }, [
    cloudCanContinue,
    cloudAccessToken,
    cloudStatusQuery.data,
    currentCloudWorld?.apiBaseUrl,
    localCanContinue,
    mode,
    normalizedCloudApiBaseUrl,
    normalizedLocalApiBaseUrl,
    phone,
    runtimeConfig.cloudApiBaseUrl,
  ]);

  function saveLocalWorld() {
    setAppRuntimeConfig({
      apiBaseUrl: normalizedLocalApiBaseUrl || undefined,
      socketBaseUrl: normalizedLocalSocketBaseUrl || normalizedLocalApiBaseUrl || undefined,
      worldAccessMode: "local",
      cloudPhone: undefined,
      cloudWorldId: undefined,
      bootstrapSource: "user",
      configStatus: normalizedLocalApiBaseUrl ? "configured" : "unconfigured",
    });
    setNotice("本地世界入口已保存。");
  }

  async function continueWithLocalWorld() {
    if (!normalizedLocalApiBaseUrl) {
      return;
    }

    setIsContinuing(true);
    setContinueError("");

    try {
      await assertWorldReachable(normalizedLocalApiBaseUrl);
      saveLocalWorld();
      const owner = await getWorldOwner(normalizedLocalApiBaseUrl);
      hydrateOwner(owner);
      onContinue(owner.onboardingCompleted);
    } catch (error) {
      setContinueError(describeRequestError(error, "当前世界地址暂时不可用，请检查后再试。"));
    } finally {
      setIsContinuing(false);
    }
  }

  async function continueWithCloudWorld() {
    if (!cloudCanContinue || !currentCloudWorld?.apiBaseUrl) {
      return;
    }

    setIsContinuing(true);
    setContinueError("");

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
      onContinue(owner.onboardingCompleted);
    } catch (error) {
      setContinueError(describeRequestError(error, "云世界暂时不可用，请稍后再试。"));
    } finally {
      setIsContinuing(false);
    }
  }

  function selectMode(nextMode: WorldAccessMode) {
    if (nextMode === mode) {
      return;
    }

    setMode(nextMode);
    setNotice("");
  }

  function handleCloudApiBaseUrlChange(value: string) {
    setCloudApiBaseUrl(value);
    if (normalizeBaseUrl(value) !== (runtimeConfig.cloudApiBaseUrl ?? "")) {
      setCloudAccessToken("");
    }
    setCode("");
    setContinueError("");
  }

  function handlePhoneChange(value: string) {
    setPhone(value);
    if (value.trim() !== (runtimeConfig.cloudPhone ?? "")) {
      setCloudAccessToken("");
    }
    setCode("");
    setContinueError("");
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-3">
        <SetupStatusCard
          title="当前入口模式"
          value={mode === "cloud" ? "官方云世界" : "本地世界"}
          detail={
            mode === "cloud"
              ? "通过手机号找到官方开通的云世界。"
              : "直接连接到你自己的世界实例。"
          }
          ok
        />
        <SetupStatusCard
          title="当前入口"
          value={configuredWorldSummary}
          detail="在这里切换入口，会同步更新这台桌面设备保存的运行时配置。"
          ok={Boolean(runtimeConfig.worldAccessMode)}
        />
        <SetupStatusCard
          title="下一步"
          value={hasOwner ? "回到世界" : "继续初始化"}
          detail={
            hasOwner
              ? "入口确认完成后，可以直接回到桌面聊天工作台。"
              : "入口确认完成后，将继续完成世界主人的首次命名。"
          }
          ok={hasOwner}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.96fr_1.04fr]">
        <div className="space-y-6">
          <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,248,239,0.94))] p-5 shadow-[var(--shadow-section)]">
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => selectMode("cloud")}
                variant={mode === "cloud" ? "primary" : "secondary"}
                size="lg"
                className="rounded-2xl"
              >
                使用官方云世界
              </Button>
              <Button
                onClick={() => selectMode("local")}
                variant={mode === "local" ? "primary" : "secondary"}
                size="lg"
                className="rounded-2xl"
              >
                使用本地世界
              </Button>
            </div>

            {notice ? <InlineNotice className="mt-4" tone="success">{notice}</InlineNotice> : null}

            <div className="mt-5">
              <SetupStepList steps={steps} />
            </div>
          </div>

          <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,251,247,0.98))] p-5 shadow-[var(--shadow-section)]">
            <div className="text-sm font-medium text-[color:var(--text-primary)]">
              {mode === "local" ? "本地世界连接" : "官方云世界验证"}
            </div>
            <div className="mt-2 text-sm leading-7 text-[color:var(--text-secondary)]">
              {mode === "local"
                ? "当你的桌面客户端需要连接自己的部署实例时，使用这里。"
                : "当你的世界由官方云平台托管时，使用这里完成验证。"}
            </div>

            {mode === "local" ? (
              <div className="mt-5 grid gap-4">
                <label className="block space-y-2">
                  <span className="text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
                    世界 API 地址
                  </span>
                  <TextField
                    value={localApiBaseUrl}
                    onChange={(event) => setLocalApiBaseUrl(event.target.value)}
                    placeholder="例如 http://127.0.0.1:3000"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
                    Socket 地址
                  </span>
                  <TextField
                    value={localSocketBaseUrl}
                    onChange={(event) => setLocalSocketBaseUrl(event.target.value)}
                    placeholder="通常与 API 地址保持一致"
                  />
                </label>

                <InlineNotice tone="info">
                  如果 Socket 服务与 API 服务使用同一地址，两个输入框可以保持一致。
                </InlineNotice>

                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={saveLocalWorld}
                    disabled={!localCanContinue || isContinuing}
                    variant="primary"
                    size="lg"
                  >
                    保存本地入口
                  </Button>
                  <Button
                    onClick={() => void continueWithLocalWorld()}
                    disabled={!localCanContinue || isContinuing}
                    variant="secondary"
                    size="lg"
                  >
                    {isContinuing ? "正在检查世界..." : hasOwner ? "进入隐界" : "继续"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-5 grid gap-4">
                <label className="block space-y-2">
                  <span className="text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
                    云平台地址
                  </span>
                  <TextField
                    value={cloudApiBaseUrl}
                    onChange={(event) => handleCloudApiBaseUrlChange(event.target.value)}
                    placeholder="留空可使用默认官方平台"
                  />
                </label>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block space-y-2">
                    <span className="text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
                      手机号
                    </span>
                    <TextField
                      value={phone}
                      onChange={(event) => handlePhoneChange(event.target.value)}
                      placeholder="输入申请云世界时使用的手机号"
                    />
                  </label>

                  <label className="block space-y-2">
                    <span className="text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
                      验证码
                    </span>
                    <TextField
                      value={code}
                      onChange={(event) => setCode(event.target.value)}
                      placeholder="输入收到的验证码"
                    />
                  </label>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={() => sendCodeMutation.mutate()}
                    disabled={!phone.trim() || sendCodeMutation.isPending}
                    variant="primary"
                    size="lg"
                  >
                    {sendCodeMutation.isPending ? "发送中..." : "发送验证码"}
                  </Button>
                  <Button
                    onClick={() => verifyCodeMutation.mutate()}
                    disabled={!phone.trim() || !code.trim() || verifyCodeMutation.isPending}
                    variant="secondary"
                    size="lg"
                  >
                    {verifyCodeMutation.isPending ? "验证中..." : "验证手机号"}
                  </Button>
                  <Button
                    onClick={() => void cloudStatusQuery.refetch()}
                    disabled={!cloudAccessToken || cloudStatusQuery.isFetching}
                    variant="secondary"
                    size="lg"
                  >
                    {cloudStatusQuery.isFetching ? "刷新中..." : "刷新状态"}
                  </Button>
                  <Button
                    onClick={() => void continueWithCloudWorld()}
                    disabled={!cloudCanContinue || isContinuing}
                    variant="secondary"
                    size="lg"
                  >
                    {isContinuing ? "正在检查世界..." : hasOwner ? "进入隐界" : "继续"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <section className="rounded-[28px] border border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,248,239,0.94))] p-5 shadow-[var(--shadow-section)]">
            <div className="text-sm font-medium text-[color:var(--text-primary)]">桌面端入口说明</div>
            <div className="mt-3 space-y-3 text-sm leading-7 text-[color:var(--text-secondary)]">
              <p>桌面端仍然保持 remote-connected 模式，但入口流程会按宽屏工作区来组织信息。</p>
              <p>入口确认完成后，聊天页会直接切换到桌面工作台，而不是退回手机式列表布局。</p>
            </div>
          </section>

          {mode === "cloud" ? (
            <section className="rounded-[28px] border border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,251,247,0.98))] p-5 shadow-[var(--shadow-section)]">
              <div className="text-sm font-medium text-[color:var(--text-primary)]">官方云世界状态</div>

              {cloudStatusQuery.isLoading ? (
                <LoadingBlock className="mt-4 px-0 py-0 text-left" label="正在检查你的云世界..." />
              ) : null}

              {cloudStatusQuery.data ? (
                <InlineNotice className="mt-4" tone={cloudCanContinue ? "success" : "info"}>
                  {cloudCanContinue
                    ? `世界已就绪：${currentCloudWorld?.name ?? "未命名世界"}`
                    : `当前状态：${describeCloudStatus(cloudStatusQuery.data)}`}
                </InlineNotice>
              ) : null}

              {currentCloudWorld?.apiBaseUrl ? (
                <InlineNotice className="mt-4" tone="muted">
                  世界地址：{currentCloudWorld.apiBaseUrl}
                </InlineNotice>
              ) : null}

              {cloudCanRequestWorld ? (
                <div className="mt-4 space-y-3 rounded-[24px] border border-[color:var(--border-faint)] bg-[rgba(255,255,255,0.82)] p-4">
                  <div className="text-sm font-medium text-[color:var(--text-primary)]">还没有开通云世界</div>
                  <div className="text-sm leading-7 text-[color:var(--text-secondary)]">
                    先提交建世界申请，平台的最新处理结果会一直显示在这里。
                  </div>
                  <TextField
                    value={worldName}
                    onChange={(event) => setWorldName(event.target.value)}
                    placeholder="先给你的世界起一个名字"
                  />
                  <Button
                    onClick={() => createWorldRequestMutation.mutate()}
                    disabled={!worldName.trim() || createWorldRequestMutation.isPending}
                    variant="primary"
                  >
                    {createWorldRequestMutation.isPending ? "提交中..." : "提交建世界申请"}
                  </Button>
                </div>
              ) : null}

              {cloudStatusQuery.data?.latestRequest?.note ? (
                <InlineNotice className="mt-4" tone="warning">
                  平台备注：{cloudStatusQuery.data.latestRequest.note}
                </InlineNotice>
              ) : null}
            </section>
          ) : (
            <section className="rounded-[28px] border border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,251,247,0.98))] p-5 shadow-[var(--shadow-section)]">
              <div className="text-sm font-medium text-[color:var(--text-primary)]">本地世界检查清单</div>
              <div className="mt-3 space-y-3 text-sm leading-7 text-[color:var(--text-secondary)]">
                <p>继续之前，先确认这台桌面设备可以访问到世界实例的 Core API。</p>
                <p>本地调试推荐默认地址：`http://127.0.0.1:3000`。</p>
                <p>除非你明确拆分了服务，否则 Socket 地址建议与 API 地址保持一致。</p>
              </div>
            </section>
          )}

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
          {continueError ? <ErrorBlock message={continueError} /> : null}
        </div>
      </section>
    </div>
  );
}


