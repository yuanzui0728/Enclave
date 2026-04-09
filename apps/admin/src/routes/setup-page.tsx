import { useProviderSetup, Button, InlineNotice, ProviderSetupForm, SetupScaffold, SetupStatusCard, SetupStepList } from "@yinjie/ui";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { getSystemStatus } from "@yinjie/contracts";
import { resolveAdminCoreApiBaseUrl } from "../lib/core-api-base";

export function SetupPage() {
  const baseUrl = resolveAdminCoreApiBaseUrl();

  const systemStatusQuery = useQuery({
    queryKey: ["admin-setup-system-status", baseUrl],
    queryFn: () => getSystemStatus(baseUrl),
    retry: false,
  });

  const providerSetup = useProviderSetup({
    baseUrl,
    enabled: Boolean(systemStatusQuery.data?.coreApi.healthy),
    queryKeyPrefix: "admin-setup",
    invalidateOnSave: [
      ["admin-setup-system-status", baseUrl],
      ["admin-provider-config", baseUrl],
      ["admin-system-status", baseUrl],
    ],
  });

  const coreApiReady = Boolean(systemStatusQuery.data?.coreApi.healthy);
  const providerReady = providerSetup.providerReady;
  const setupSteps = [
    {
      label: "Remote API",
      ok: coreApiReady,
      hint: coreApiReady ? "world instance reachable" : "remote world API not reachable yet",
    },
    {
      label: "Provider",
      ok: providerReady,
      hint: providerReady ? "inference provider configured" : "save a provider to enable real generation",
    },
    {
      label: "Admin ready",
      ok: coreApiReady && providerReady,
      hint: coreApiReady && providerReady ? "instance ops ready" : "finish API + provider setup first",
    },
  ];

  const providerLoadError =
    (providerSetup.providerQuery.error instanceof Error && providerSetup.providerQuery.error.message) ||
    (providerSetup.availableModelsQuery.error instanceof Error &&
      providerSetup.availableModelsQuery.error.message) ||
    null;

  const providerActionError =
    (providerSetup.providerProbeMutation.error instanceof Error &&
      providerSetup.providerProbeMutation.error.message) ||
    (providerSetup.providerSaveMutation.error instanceof Error &&
      providerSetup.providerSaveMutation.error.message) ||
    null;

  return (
    <SetupScaffold
      badge="Admin Setup"
      title="Prepare this world instance for operations"
      description="The admin console now manages a single-user world instance. Verify the remote API, then configure the provider used by this world."
      heroAside={<SetupStepList steps={setupSteps} />}
      left={
        <section className="space-y-4 rounded-[30px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-6 shadow-[var(--shadow-card)]">
          <div className="grid gap-4 md:grid-cols-2">
            <SetupStatusCard
              title="Remote API"
              value={systemStatusQuery.data?.coreApi.version ?? "offline"}
              detail={
                systemStatusQuery.data?.coreApi.message ??
                "The admin console connects to a remote world instance rather than managing a local Core API."
              }
              ok={coreApiReady}
            />
            <SetupStatusCard
              title="Database"
              value={systemStatusQuery.data?.database.path ?? "unknown"}
              detail={
                systemStatusQuery.data
                  ? `connected=${systemStatusQuery.data.database.connected} wal=${systemStatusQuery.data.database.walEnabled}`
                  : "Waiting for instance status."
              }
              ok={Boolean(systemStatusQuery.data?.database.connected)}
            />
            <SetupStatusCard
              title="Scheduler"
              value={systemStatusQuery.data?.scheduler.mode ?? "unknown"}
              detail={
                systemStatusQuery.data
                  ? `${systemStatusQuery.data.scheduler.jobs.length} jobs · snapshots=${systemStatusQuery.data.scheduler.worldSnapshots}`
                  : "Waiting for scheduler status."
              }
              ok={Boolean(systemStatusQuery.data?.scheduler.healthy)}
            />
            <SetupStatusCard
              title="World Owner"
              value={String(systemStatusQuery.data?.worldSurface.ownerCount ?? 0)}
              detail="A healthy single-world instance should expose exactly one owner at runtime."
              ok={(systemStatusQuery.data?.worldSurface.ownerCount ?? 0) === 1}
            />
          </div>

          {systemStatusQuery.isError && systemStatusQuery.error instanceof Error ? (
            <InlineNotice tone="warning">{systemStatusQuery.error.message}</InlineNotice>
          ) : null}

          <InlineNotice tone={coreApiReady ? "success" : "warning"}>
            {coreApiReady
              ? providerReady
                ? "Remote API and provider are ready. This world can now run chats, feed, moments, and scheduler flows."
                : "Remote API is reachable. Configure the provider next."
              : "The admin console has not reached the remote world API yet."}
          </InlineNotice>
        </section>
      }
      right={
        <ProviderSetupForm
          className="rounded-[30px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-6 shadow-[var(--shadow-card)]"
          title="Provider Setup"
          description="Save the instance-level provider used by this world when the owner has not configured a personal API Key."
          statusLabel={providerReady ? "configured" : "pending"}
          endpointLabel="Endpoint"
          modeLabel="Mode"
          modelLabel="Model"
          apiKeyLabel="API Key"
          endpointPlaceholder="https://api.openai.com/v1"
          modelPlaceholder="gpt-4.1-mini"
          apiKeyPlaceholder="Enter the instance provider API Key"
          probeLabel="Test Provider"
          saveLabel="Save Provider"
          draft={providerSetup.providerDraft}
          availableModels={providerSetup.availableModelsQuery.data?.models ?? []}
          availableModelsId="admin-setup-available-models"
          disabled={!coreApiReady}
          validationMessage={providerSetup.providerValidationMessage}
          errorMessage={providerLoadError}
          actionErrorMessage={providerActionError}
          footerMessage={
            !coreApiReady
              ? "Reach the remote world API first."
              : providerSetup.providerProbeMutation.data
                ? providerSetup.providerProbeMutation.data.message
                : providerSetup.providerSaveMutation.data
                  ? `Saved provider ${providerSetup.providerSaveMutation.data.model} (${providerSetup.providerSaveMutation.data.mode})`
                  : "Saving here updates the instance-level provider for this world."
          }
          onSubmit={providerSetup.submitProviderSave}
          onProbe={providerSetup.submitProviderProbe}
          onChange={providerSetup.updateProviderDraft}
          probePending={providerSetup.providerProbeMutation.isPending}
          savePending={providerSetup.providerSaveMutation.isPending}
        />
      }
      footer={
        <section className="flex flex-wrap gap-3">
          <Link to="/">
            <Button variant="secondary">Back to Dashboard</Button>
          </Link>
        </section>
      }
      className="px-0 py-0"
    />
  );
}
