import { useQuery } from "@tanstack/react-query";
import { HardDriveDownload, LayoutPanelTop, ShieldCheck, Sparkles } from "lucide-react";
import {
  getAiModel,
  getAvailableModels,
  getLatestWorldContext,
  getSystemStatus,
  listCharacters,
} from "@yinjie/contracts";
import {
  AppHeader,
  AppPage,
  AppSection,
  InlineNotice,
  MetricCard,
  PanelEmpty,
  SectionHeading,
  StatusPill,
} from "@yinjie/ui";

const runtimeHighlights = [
  {
    title: "Desktop Runtime",
    description:
      "Tauri and Rust take over packaging, local process management, updates, secrets, and runtime observability.",
    icon: LayoutPanelTop,
  },
  {
    title: "Core API Parity",
    description:
      "The new Rust Core API is being migrated module by module while the old /api surface stays behavior-compatible.",
    icon: ShieldCheck,
  },
  {
    title: "Inference Gateway",
    description:
      "High-intensity model traffic will be centralized behind one gateway with queueing, retries, and provider abstraction.",
    icon: Sparkles,
  },
  {
    title: "Self-hosted Delivery",
    description:
      "Each user runs a private AI world locally and only needs a provider endpoint plus an API key or local compatible base URL.",
    icon: HardDriveDownload,
  },
];

export function DashboardPage() {
  const baseUrl = import.meta.env.VITE_CORE_API_BASE_URL;

  const statusQuery = useQuery({
    queryKey: ["system-status", baseUrl],
    queryFn: () => getSystemStatus(baseUrl),
  });

  const aiModelQuery = useQuery({
    queryKey: ["active-ai-model", baseUrl],
    queryFn: () => getAiModel(baseUrl),
  });

  const availableModelsQuery = useQuery({
    queryKey: ["available-models", baseUrl],
    queryFn: () => getAvailableModels(baseUrl),
  });

  const charactersQuery = useQuery({
    queryKey: ["runtime-characters", baseUrl],
    queryFn: () => listCharacters(baseUrl),
  });

  const worldContextQuery = useQuery({
    queryKey: ["runtime-world-context", baseUrl],
    queryFn: () => getLatestWorldContext(baseUrl),
  });

  const migratedModules = statusQuery.data?.legacySurface.migratedModules ?? [];
  const characterCount = charactersQuery.data?.length ?? statusQuery.data?.legacySurface.charactersCount ?? 0;
  const modelCount = availableModelsQuery.data?.models.length ?? 0;
  const schedulerJobs = statusQuery.data?.scheduler.jobs.length ?? 0;
  const hasQueryError =
    statusQuery.error instanceof Error ||
    aiModelQuery.error instanceof Error ||
    availableModelsQuery.error instanceof Error ||
    charactersQuery.error instanceof Error ||
    worldContextQuery.error instanceof Error;

  return (
    <AppPage className="space-y-6">
      <AppHeader
        eyebrow="Runtime View"
        title="Hidden World Migration Dashboard"
        description="这是一张迁移中的产品运行面板，用来快速看新运行时、契约层和兼容面状态。"
      />

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <AppSection className="overflow-hidden bg-[linear-gradient(135deg,rgba(249,115,22,0.22),rgba(251,191,36,0.04)_35%,rgba(15,23,32,0.78)_78%)]">
          <div className="max-w-2xl space-y-5">
            <SectionHeading>Production Refactor</SectionHeading>
            <h1 className="text-4xl font-semibold leading-tight text-white">
              Move Hidden World out of demo mode and into a desktop-ready, self-hosted production runtime.
            </h1>
            <p className="max-w-xl text-base leading-8 text-[color:var(--text-secondary)]">
              The compatibility layer is now being migrated in slices. Config, auth, and characters are the first
              modules to land in shared contracts and the new Rust route surface without changing product rules.
            </p>
            <div className="flex flex-wrap gap-3">
              <StatusPill tone="healthy">Workspace Ready</StatusPill>
              <StatusPill tone={migratedModules.length >= 3 ? "healthy" : "warning"}>
                {migratedModules.length} Modules Migrated
              </StatusPill>
              <StatusPill>{modelCount} Models Catalogued</StatusPill>
            </div>
          </div>
        </AppSection>

        <AppSection className="bg-[color:var(--surface-secondary)]">
          <SectionHeading>System Snapshot</SectionHeading>
          <div className="mt-4 space-y-4">
            <MetricCard
              label="Core API"
              value={statusQuery.data?.coreApi.version ?? "offline"}
              meta={
                <StatusPill tone={statusQuery.data?.coreApi.healthy ? "healthy" : "warning"}>
                  {statusQuery.isLoading ? "probing" : statusQuery.data?.coreApi.healthy ? "online" : "offline"}
                </StatusPill>
              }
              detail={
                statusQuery.error instanceof Error
                  ? statusQuery.error.message
                  : statusQuery.data?.coreApi.message ?? "Waiting for the Rust Core API process."
              }
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <MetricCard label="Active Model" value={aiModelQuery.data?.model ?? "pending"} />
              <MetricCard label="Characters Surface" value={characterCount} />
            </div>

            <MetricCard
              label="World Context"
              value={worldContextQuery.data?.localTime ?? "pending snapshot"}
              detail={
                worldContextQuery.data?.season
                  ? `season: ${worldContextQuery.data.season}`
                  : "Latest world context will mirror the legacy /api/world/context route."
              }
            />
          </div>
        </AppSection>
      </div>

      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {runtimeHighlights.map(({ title, description, icon: Icon }) => (
          <AppSection key={title} className="bg-[color:var(--surface-secondary)]">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-[color:var(--brand-secondary)]">
              <Icon size={22} />
            </div>
            <div className="mt-5 text-lg font-semibold">{title}</div>
            <p className="mt-2 text-sm leading-7 text-[color:var(--text-secondary)]">{description}</p>
          </AppSection>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <AppSection>
          <SectionHeading>Frozen Product Logic</SectionHeading>
          <ul className="mt-4 space-y-3 text-sm leading-7 text-[color:var(--text-secondary)]">
            <li>Chat, social triggers, moments, feed, scheduling, and the AI world rules remain untouched.</li>
            <li>The legacy `/api/*` semantics and `/chat` event names are preserved as migration targets.</li>
            <li>The old `api/`, `web/`, and `admin/` code stays in the repo as the behavior baseline.</li>
          </ul>
        </AppSection>

        <AppSection>
          <SectionHeading>Current Migration Slice</SectionHeading>
          <ul className="mt-4 space-y-3 text-sm leading-7 text-[color:var(--text-secondary)]">
            <li>Migrated modules: {migratedModules.length > 0 ? migratedModules.join(", ") : "pending"}.</li>
            <li>Typed contract coverage now includes auth session flow, AI model config, and character CRUD shapes.</li>
            <li>New app and admin screens are already wired against the same shared client surface.</li>
            <li>Scheduler visibility is online with {schedulerJobs} mirrored jobs from the legacy cadence list.</li>
          </ul>
        </AppSection>
      </section>
      {hasQueryError ? (
        <InlineNotice tone="warning">
          部分运行时信息暂时不可用。
          {statusQuery.error instanceof Error ? ` Core API: ${statusQuery.error.message}` : ""}
          {aiModelQuery.error instanceof Error ? ` 模型配置: ${aiModelQuery.error.message}` : ""}
          {availableModelsQuery.error instanceof Error ? ` 模型目录: ${availableModelsQuery.error.message}` : ""}
          {charactersQuery.error instanceof Error ? ` 角色列表: ${charactersQuery.error.message}` : ""}
          {worldContextQuery.error instanceof Error ? ` 世界状态: ${worldContextQuery.error.message}` : ""}
        </InlineNotice>
      ) : null}
      {!statusQuery.data && statusQuery.error instanceof Error ? <PanelEmpty message={statusQuery.error.message} /> : null}
    </AppPage>
  );
}
