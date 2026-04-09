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
import {
  Button,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  SetupScaffold,
  SetupStatusCard,
  SetupStepList,
  TextField,
} from "@yinjie/ui";
import { describeRequestError } from "../../../lib/request-error";
import { assertWorldReachable } from "../../../lib/world-entry";
import { setAppRuntimeConfig, useAppRuntimeConfig } from "../../../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../../../store/world-owner-store";

type MobileSetupPanelProps = {
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
      return "申请单待处理";
    case "provisioning":
      return "正在准备中";
    case "rejected":
      return "申请被退回";
    case "disabled":
      return "云世界已停用";
    default:
      return "还没有找到云世界";
  }
}

export function MobileSetupPanel({ hasOwner, onContinue }: MobileSetupPanelProps) {
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
    queryKey: ["setup-cloud-world", normalizedCloudApiBaseUrl || "default", cloudAccessToken],
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
          label: "选择官方云",
          hint:
            normalizedCloudApiBaseUrl ||
            runtimeConfig.cloudApiBaseUrl ||
            "默认使用官方云平台地址。",
          ok: true,
        },
        {
          label: "验证手机号",
          hint: phone.trim()
            ? `当前手机号：${phone.trim()}`
            : "输入手机号并完成验证码验证。",
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
        label: "选择本地实例",
        hint: "填写你自己的世界实例地址。",
        ok: true,
      },
      {
        label: "填写世界地址",
        hint: normalizedLocalApiBaseUrl || "先填写一个可访问的世界地址。",
        ok: Boolean(normalizedLocalApiBaseUrl),
      },
      {
        label: "准备进入",
        hint: localCanContinue
          ? "地址已保存，可以继续进入。"
          : "保存有效地址后才可以继续。",
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
    setMode(nextMode);
    setNotice("");
    if (nextMode === "local") {
      return;
    }

    setCloudAccessToken("");
    setCode("");
  }

  const modeButtonClassName = "flex-1 rounded-[24px]";

  return (
    <SetupScaffold
      badge="世界入口"
      title="先选定这台设备要进入的世界"
      description="进入客户端之前，先决定接入官方云世界还是你自己的本地实例。入口理顺之后，聊天、发现和资料体验都会更顺。"
      heroAside={<SetupStepList steps={steps} />}
      left={
        <div className="space-y-5">
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <SetupStatusCard
              title="当前入口模式"
              value={mode === "cloud" ? "官方云世界" : "本地世界"}
              detail={
                mode === "cloud"
                  ? "通过手机号找到官方开通的云世界。"
                  : "直接连接你自己的实例地址。"
              }
              ok
            />
            <SetupStatusCard
              title="当前入口"
              value={configuredWorldSummary}
              detail="切换世界入口会同步更新这台设备上保存的运行时配置。"
              ok={Boolean(runtimeConfig.worldAccessMode)}
            />
            <SetupStatusCard
              title="下一步"
              value={hasOwner ? "直接回到世界" : "继续完成初始化"}
              detail={
                hasOwner
                  ? "确认入口后即可回到聊天、发现和资料页面。"
                  : "确认入口后会继续进入世界主人的首次命名。"
              }
              ok={hasOwner}
            />
          </section>

          {notice ? <InlineNotice tone="success">{notice}</InlineNotice> : null}

          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => selectMode("cloud")}
              variant={mode === "cloud" ? "primary" : "secondary"}
              size="lg"
              className={modeButtonClassName}
            >
              进入官方云世界
            </Button>
            <Button
              onClick={() => selectMode("local")}
              variant={mode === "local" ? "primary" : "secondary"}
              size="lg"
              className={modeButtonClassName}
            >
              进入本地世界
            </Button>
          </div>

          {mode === "local" ? (
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
          ) : (
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
          )}
        </div>
      }
      right={
        <section className="rounded-[30px] border border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(246,251,247,0.98))] p-5 shadow-[var(--shadow-section)]">
          {mode === "local" ? (
            <div className="space-y-4">
              <div className="text-sm font-medium text-[color:var(--text-primary)]">本地世界入口</div>
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
                如果 Socket 地址与 API 地址相同，两个输入框可以保持一致。保存后这台设备会默认使用这个入口。
              </InlineNotice>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-sm font-medium text-[color:var(--text-primary)]">官方云世界入口</div>

              <label className="block space-y-2">
                <span className="text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
                  云平台地址
                </span>
                <TextField
                  value={cloudApiBaseUrl}
                  onChange={(event) => setCloudApiBaseUrl(event.target.value)}
                  placeholder="留空可使用默认官方平台"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
                  手机号
                </span>
                <TextField
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
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

              {cloudStatusQuery.isLoading ? (
                <LoadingBlock className="px-0 py-0 text-left" label="正在检查云世界状态..." />
              ) : null}
              {cloudStatusQuery.data ? (
                <InlineNotice tone={cloudCanContinue ? "success" : "info"}>
                  {cloudCanContinue
                    ? `已找到云世界：${currentCloudWorld?.name ?? "未命名世界"}`
                    : `当前状态：${describeCloudStatus(cloudStatusQuery.data)}`}
                </InlineNotice>
              ) : null}

              {currentCloudWorld?.apiBaseUrl ? (
                <InlineNotice tone="muted">
                  世界地址：{currentCloudWorld.apiBaseUrl}
                </InlineNotice>
              ) : null}

              {cloudCanRequestWorld ? (
                <div className="space-y-3 rounded-[24px] border border-[color:var(--border-faint)] bg-[rgba(255,255,255,0.78)] p-4">
                  <div className="text-sm font-medium text-[color:var(--text-primary)]">还没有开通云世界</div>
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
                <InlineNotice tone="warning">
                  平台备注：{cloudStatusQuery.data.latestRequest.note}
                </InlineNotice>
              ) : null}
            </div>
          )}

          {sendCodeMutation.isError && sendCodeMutation.error instanceof Error ? (
            <ErrorBlock className="mt-4" message={sendCodeMutation.error.message} />
          ) : null}
          {verifyCodeMutation.isError && verifyCodeMutation.error instanceof Error ? (
            <ErrorBlock className="mt-4" message={verifyCodeMutation.error.message} />
          ) : null}
          {cloudStatusQuery.isError && cloudStatusQuery.error instanceof Error ? (
            <ErrorBlock className="mt-4" message={cloudStatusQuery.error.message} />
          ) : null}
          {createWorldRequestMutation.isError && createWorldRequestMutation.error instanceof Error ? (
            <ErrorBlock className="mt-4" message={createWorldRequestMutation.error.message} />
          ) : null}
          {continueError ? <ErrorBlock className="mt-4" message={continueError} /> : null}
        </section>
      }
    />
  );
}
