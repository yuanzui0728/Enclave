import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  createMyCloudWorldRequest,
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
import { setAppRuntimeConfig, useAppRuntimeConfig } from "../../../runtime/runtime-config-store";

type MobileSetupPanelProps = {
  hasOwner: boolean;
  onContinue: () => void;
};

type WorldAccessMode = "cloud" | "local";

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function describeCloudStatus(data?: CloudWorldLookupResponse | null) {
  switch (data?.status) {
    case "active":
      return "已开�?;
    case "pending":
      return "待审�?;
    case "provisioning":
      return "开通中";
    case "rejected":
      return "申请被驳�?;
    case "disabled":
      return "已停�?;
    default:
      return "未发现云世界";
  }
}

export function MobileSetupPanel({ hasOwner, onContinue }: MobileSetupPanelProps) {
  const runtimeConfig = useAppRuntimeConfig();
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
      setNotice("验证码已发送，请查看手机短信�?);
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
      setNotice("手机号验证成功，正在查询你的云世界�?);
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
      setNotice("建世界申请已提交，等待平台开通�?);
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
      ? runtimeConfig.cloudWorldId || runtimeConfig.cloudPhone || "云世界待确认"
      : runtimeConfig.apiBaseUrl || "未配�?;

  const steps = useMemo(() => {
    if (mode === "cloud") {
      return [
        {
          label: "选择云世�?,
          hint: normalizedCloudApiBaseUrl || runtimeConfig.cloudApiBaseUrl || "将使用默认云世界平台地址�?,
          ok: true,
        },
        {
          label: "手机号验�?,
          hint: phone.trim() ? `当前手机号：${phone.trim()}` : "先输入手机号并完成验证码验证�?,
          ok: Boolean(cloudAccessToken),
        },
        {
          label: "云世界状�?,
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
        label: "选择本地世界",
        hint: "输入你自己的隐界实例地址�?,
        ok: true,
      },
      {
        label: "World API",
        hint: normalizedLocalApiBaseUrl || "先填写一个可访问的世界地址�?,
        ok: Boolean(normalizedLocalApiBaseUrl),
      },
      {
        label: "准备进入",
        hint: localCanContinue ? "地址已保存，可以继续进入世界�? : "保存地址后才能继续�?,
        ok: localCanContinue,
      },
    ];
  }, [
    cloudCanContinue,
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
    setNotice("本地世界入口已保存�?);
  }

  function continueWithLocalWorld() {
    if (!normalizedLocalApiBaseUrl) {
      return;
    }

    saveLocalWorld();
    onContinue();
  }

  function continueWithCloudWorld() {
    if (!cloudCanContinue || !currentCloudWorld?.apiBaseUrl) {
      return;
    }

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
    onContinue();
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

  const modeButtonClassName = "flex-1 rounded-2xl";

  return (
    <SetupScaffold
      badge="世界入口"
      title="先确认你要进入哪一个世�?
      description="现在进入客户端前，必须先决定你要连接官方云世界，还是你自己托管的本地世界�?
      heroAside={<SetupStepList steps={steps} />}
      left={
        <div className="space-y-5">
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <SetupStatusCard
              title="当前模式"
              value={mode === "cloud" ? "云世�? : "本地世界"}
              detail={mode === "cloud" ? "通过手机号找到已开通的世界�?: "直接连接你自己的实例地址�?}
              ok
            />
            <SetupStatusCard
              title="当前入口"
              value={configuredWorldSummary}
              detail="切换世界入口后，会覆盖当前客户端保存的入口配置�?
              ok={Boolean(runtimeConfig.worldAccessMode)}
            />
            <SetupStatusCard
              title="继续进入"
              value={hasOwner ? "已有主人状�? : "尚未进入世界"}
              detail={hasOwner ? "可继续进入聊天与世界页面�? : "入口确认后会继续到资料初始化或世界主页�?}
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
              进入云世�?
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
                disabled={!localCanContinue}
                variant="primary"
                size="lg"
              >
                保存本地世界
              </Button>
              <Button
                onClick={continueWithLocalWorld}
                disabled={!localCanContinue}
                variant="secondary"
                size="lg"
              >
                {hasOwner ? "进入隐界" : "继续进入"}
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
                {verifyCodeMutation.isPending ? "验证�?.." : "验证手机�?}
              </Button>
              <Button
                onClick={() => void cloudStatusQuery.refetch()}
                disabled={!cloudAccessToken || cloudStatusQuery.isFetching}
                variant="secondary"
                size="lg"
              >
                {cloudStatusQuery.isFetching ? "刷新�?.." : "刷新云世界状�?}
              </Button>
              <Button
                onClick={continueWithCloudWorld}
                disabled={!cloudCanContinue}
                variant="secondary"
                size="lg"
              >
                {hasOwner ? "进入隐界" : "继续进入"}
              </Button>
            </div>
          )}
        </div>
      }
      right={
        <section className="rounded-[28px] border border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.04))] p-5 shadow-[var(--shadow-section)]">
          {mode === "local" ? (
            <div className="space-y-4">
              <div className="text-sm font-medium text-white">本地世界入口</div>
              <label className="block space-y-2">
                <span className="text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
                  World API URL
                </span>
                <TextField
                  value={localApiBaseUrl}
                  onChange={(event) => setLocalApiBaseUrl(event.target.value)}
                  placeholder="https://host.example.com"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
                  Socket URL
                </span>
                <TextField
                  value={localSocketBaseUrl}
                  onChange={(event) => setLocalSocketBaseUrl(event.target.value)}
                  placeholder="https://host.example.com"
                />
              </label>

              <InlineNotice tone="info">
                如果 Socket 地址�?World API 一样，可以直接保持一致。保存后客户端就会把它当成你的默认入口�?
              </InlineNotice>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-sm font-medium text-white">云世界入�?/div>

              <label className="block space-y-2">
                <span className="text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
                  Cloud API URL
                </span>
                <TextField
                  value={cloudApiBaseUrl}
                  onChange={(event) => setCloudApiBaseUrl(event.target.value)}
                  placeholder="https://cloud.example.com"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
                  手机�?
                </span>
                <TextField
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="请输入手机号"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
                  验证�?
                </span>
                <TextField
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="请输入验证码"
                />
              </label>

              {cloudStatusQuery.isLoading ? <LoadingBlock className="px-0 py-0 text-left" label="正在查询云世界状�?.." /> : null}
              {cloudStatusQuery.data ? (
                <InlineNotice tone={cloudCanContinue ? "success" : "info"}>
                  {cloudCanContinue
                    ? `已找到云世界�?{currentCloudWorld?.name ?? "未命名世�?}`
                    : `当前状态：${describeCloudStatus(cloudStatusQuery.data)}`}
                </InlineNotice>
              ) : null}

              {currentCloudWorld?.apiBaseUrl ? (
                <InlineNotice tone="muted">
                  云世界地址：{currentCloudWorld.apiBaseUrl}
                </InlineNotice>
              ) : null}

              {cloudCanRequestWorld ? (
                <div className="space-y-3 rounded-[24px] border border-[color:var(--border-faint)] bg-black/10 p-4">
                  <div className="text-sm font-medium text-white">还没有云世界，先提交申请</div>
                  <TextField
                    value={worldName}
                    onChange={(event) => setWorldName(event.target.value)}
                    placeholder="给你的世界起个名�?
                  />
                  <Button
                    onClick={() => createWorldRequestMutation.mutate()}
                    disabled={!worldName.trim() || createWorldRequestMutation.isPending}
                    variant="primary"
                  >
                    {createWorldRequestMutation.isPending ? "提交�?.." : "提交建世界申�?}
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
        </section>
      }
    />
  );
}


