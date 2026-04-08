import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  createMyCloudWorldRequest,
  getMyCloudWorld,
  sendCloudPhoneCode,
  verifyCloudPhoneCode,
  type CloudWorldLookupResponse,
} from "@yinjie/contracts";
import { Button, ErrorBlock, InlineNotice, LoadingBlock, SetupStatusCard, SetupStepList, TextField } from "@yinjie/ui";
import { setAppRuntimeConfig, useAppRuntimeConfig } from "../../runtime/runtime-config-store";

type DesktopSetupPanelProps = {
  token: string | null;
  onContinue: () => void;
};

type WorldAccessMode = "cloud" | "local";

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function describeCloudStatus(data?: CloudWorldLookupResponse | null) {
  switch (data?.status) {
    case "active":
      return "World is active";
    case "pending":
      return "Request received";
    case "provisioning":
      return "Provisioning in progress";
    case "rejected":
      return "Request needs attention";
    case "disabled":
      return "World is disabled";
    default:
      return "No cloud world found";
  }
}

export function DesktopSetupPanel({ token, onContinue }: DesktopSetupPanelProps) {
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
      setNotice("Verification code sent.");
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
      setNotice("Phone verified. Checking your cloud world now.");
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
      setNotice("Cloud world request submitted.");
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
      ? runtimeConfig.cloudWorldId || runtimeConfig.cloudPhone || "Cloud world pending"
      : runtimeConfig.apiBaseUrl || "Not configured yet";

  const steps = useMemo(() => {
    if (mode === "cloud") {
      return [
        {
          label: "Choose cloud entry",
          hint: normalizedCloudApiBaseUrl || runtimeConfig.cloudApiBaseUrl || "Use the default cloud platform.",
          ok: true,
        },
        {
          label: "Verify phone",
          hint: phone.trim() ? `Current phone: ${phone.trim()}` : "Enter your phone number and verify it.",
          ok: Boolean(cloudAccessToken),
        },
        {
          label: "Confirm world",
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
        label: "Choose local entry",
        hint: "Connect this desktop app to your own world endpoint.",
        ok: true,
      },
      {
        label: "Save API endpoint",
        hint: normalizedLocalApiBaseUrl || "Fill in a reachable world API URL.",
        ok: Boolean(normalizedLocalApiBaseUrl),
      },
      {
        label: "Ready to enter",
        hint: localCanContinue ? "The local world endpoint is saved." : "Save the endpoint before entering the world.",
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
    setNotice("Local world entry saved.");
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

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-3">
        <SetupStatusCard
          title="Current mode"
          value={mode === "cloud" ? "Cloud world" : "Local world"}
          detail={
            mode === "cloud"
              ? "Look up your official cloud world with a phone number."
              : "Connect directly to a self-hosted world API."
          }
          ok
        />
        <SetupStatusCard
          title="Current entry"
          value={configuredWorldSummary}
          detail="Switching the entry here updates the runtime configuration saved on this desktop."
          ok={Boolean(runtimeConfig.worldAccessMode)}
        />
        <SetupStatusCard
          title="Next step"
          value={token ? "Return to world" : "Finish setup"}
          detail={
            token
              ? "After the entry is confirmed, the desktop app can jump back into your world."
              : "After the entry is confirmed, you can continue into onboarding."
          }
          ok={Boolean(token)}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.96fr_1.04fr]">
        <div className="space-y-6">
          <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.035))] p-5 shadow-[var(--shadow-section)]">
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => selectMode("cloud")}
                variant={mode === "cloud" ? "primary" : "secondary"}
                size="lg"
                className="rounded-2xl"
              >
                Use cloud world
              </Button>
              <Button
                onClick={() => selectMode("local")}
                variant={mode === "local" ? "primary" : "secondary"}
                size="lg"
                className="rounded-2xl"
              >
                Use local world
              </Button>
            </div>

            {notice ? <InlineNotice className="mt-4" tone="success">{notice}</InlineNotice> : null}

            <div className="mt-5">
              <SetupStepList steps={steps} />
            </div>
          </div>

          <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.035))] p-5 shadow-[var(--shadow-section)]">
            <div className="text-sm font-medium text-white">
              {mode === "local" ? "Local world connection" : "Cloud world verification"}
            </div>
            <div className="mt-2 text-sm leading-7 text-[color:var(--text-secondary)]">
              {mode === "local"
                ? "Use this when your desktop app should connect to your own deployment."
                : "Use this when your world is hosted on the official cloud platform."}
            </div>

            {mode === "local" ? (
              <div className="mt-5 grid gap-4">
                <label className="block space-y-2">
                  <span className="text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
                    World API URL
                  </span>
                  <TextField
                    value={localApiBaseUrl}
                    onChange={(event) => setLocalApiBaseUrl(event.target.value)}
                    placeholder="http://127.0.0.1:3000"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
                    Socket URL
                  </span>
                  <TextField
                    value={localSocketBaseUrl}
                    onChange={(event) => setLocalSocketBaseUrl(event.target.value)}
                    placeholder="http://127.0.0.1:3000"
                  />
                </label>

                <InlineNotice tone="info">
                  If the socket service lives on the same address, you can keep both fields identical.
                </InlineNotice>

                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={saveLocalWorld}
                    disabled={!localCanContinue}
                    variant="primary"
                    size="lg"
                  >
                    Save local entry
                  </Button>
                  <Button
                    onClick={continueWithLocalWorld}
                    disabled={!localCanContinue}
                    variant="secondary"
                    size="lg"
                  >
                    {token ? "Enter Yinjie" : "Continue"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-5 grid gap-4">
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

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block space-y-2">
                    <span className="text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
                      Phone number
                    </span>
                    <TextField
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      placeholder="Enter phone number"
                    />
                  </label>

                  <label className="block space-y-2">
                    <span className="text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
                      Verification code
                    </span>
                    <TextField
                      value={code}
                      onChange={(event) => setCode(event.target.value)}
                      placeholder="Enter verification code"
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
                    {sendCodeMutation.isPending ? "Sending..." : "Send code"}
                  </Button>
                  <Button
                    onClick={() => verifyCodeMutation.mutate()}
                    disabled={!phone.trim() || !code.trim() || verifyCodeMutation.isPending}
                    variant="secondary"
                    size="lg"
                  >
                    {verifyCodeMutation.isPending ? "Verifying..." : "Verify phone"}
                  </Button>
                  <Button
                    onClick={() => void cloudStatusQuery.refetch()}
                    disabled={!cloudAccessToken || cloudStatusQuery.isFetching}
                    variant="secondary"
                    size="lg"
                  >
                    {cloudStatusQuery.isFetching ? "Refreshing..." : "Refresh status"}
                  </Button>
                  <Button
                    onClick={continueWithCloudWorld}
                    disabled={!cloudCanContinue}
                    variant="secondary"
                    size="lg"
                  >
                    {token ? "Enter Yinjie" : "Continue"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <section className="rounded-[28px] border border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.035))] p-5 shadow-[var(--shadow-section)]">
            <div className="text-sm font-medium text-white">Desktop entry notes</div>
            <div className="mt-3 space-y-3 text-sm leading-7 text-[color:var(--text-secondary)]">
              <p>The desktop shell stays in remote-connected mode, but the entry flow is laid out for a wide workspace.</p>
              <p>Once the entry is confirmed, chat pages switch to the desktop workspace instead of the mobile list layout.</p>
            </div>
          </section>

          {mode === "cloud" ? (
            <section className="rounded-[28px] border border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.035))] p-5 shadow-[var(--shadow-section)]">
              <div className="text-sm font-medium text-white">Cloud world status</div>

              {cloudStatusQuery.isLoading ? (
                <LoadingBlock className="mt-4 px-0 py-0 text-left" label="Checking your cloud world..." />
              ) : null}

              {cloudStatusQuery.data ? (
                <InlineNotice className="mt-4" tone={cloudCanContinue ? "success" : "info"}>
                  {cloudCanContinue
                    ? `World ready: ${currentCloudWorld?.name ?? "Unnamed world"}`
                    : `Current status: ${describeCloudStatus(cloudStatusQuery.data)}`}
                </InlineNotice>
              ) : null}

              {currentCloudWorld?.apiBaseUrl ? (
                <InlineNotice className="mt-4" tone="muted">
                  API: {currentCloudWorld.apiBaseUrl}
                </InlineNotice>
              ) : null}

              {cloudCanRequestWorld ? (
                <div className="mt-4 space-y-3 rounded-[24px] border border-[color:var(--border-faint)] bg-black/10 p-4">
                  <div className="text-sm font-medium text-white">No cloud world yet</div>
                  <div className="text-sm leading-7 text-[color:var(--text-secondary)]">
                    Submit a world request and we will keep showing the latest platform response here.
                  </div>
                  <TextField
                    value={worldName}
                    onChange={(event) => setWorldName(event.target.value)}
                    placeholder="Name your world"
                  />
                  <Button
                    onClick={() => createWorldRequestMutation.mutate()}
                    disabled={!worldName.trim() || createWorldRequestMutation.isPending}
                    variant="primary"
                  >
                    {createWorldRequestMutation.isPending ? "Submitting..." : "Submit world request"}
                  </Button>
                </div>
              ) : null}

              {cloudStatusQuery.data?.latestRequest?.note ? (
                <InlineNotice className="mt-4" tone="warning">
                  Platform note: {cloudStatusQuery.data.latestRequest.note}
                </InlineNotice>
              ) : null}
            </section>
          ) : (
            <section className="rounded-[28px] border border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.035))] p-5 shadow-[var(--shadow-section)]">
              <div className="text-sm font-medium text-white">Local world checklist</div>
              <div className="mt-3 space-y-3 text-sm leading-7 text-[color:var(--text-secondary)]">
                <p>Confirm the Core API is reachable from this desktop before continuing.</p>
                <p>Recommended default for local debugging: `http://127.0.0.1:3000`.</p>
                <p>Keep the socket URL aligned with the API URL unless you intentionally expose them separately.</p>
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
        </div>
      </section>
    </div>
  );
}
