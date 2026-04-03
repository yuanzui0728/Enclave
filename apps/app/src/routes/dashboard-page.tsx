import { useQuery } from "@tanstack/react-query";
import { HardDriveDownload, LayoutPanelTop, ShieldCheck, Sparkles } from "lucide-react";
import {
  getAiModel,
  getAvailableModels,
  getLatestWorldContext,
  getSystemStatus,
  listCharacters,
} from "@yinjie/contracts";
import { Card, SectionHeading, StatusPill } from "@yinjie/ui";

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

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card className="overflow-hidden bg-[linear-gradient(135deg,rgba(249,115,22,0.22),rgba(251,191,36,0.04)_35%,rgba(15,23,32,0.78)_78%)]">
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
        </Card>

        <Card className="bg-[color:var(--surface-secondary)]">
          <SectionHeading>System Snapshot</SectionHeading>
          <div className="mt-4 space-y-4">
            <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
              <div className="text-sm text-[color:var(--text-secondary)]">Core API</div>
              <div className="mt-2 flex items-center justify-between">
                <div className="text-xl font-semibold">{statusQuery.data?.coreApi.version ?? "offline"}</div>
                <StatusPill tone={statusQuery.data?.coreApi.healthy ? "healthy" : "warning"}>
                  {statusQuery.isLoading ? "probing" : statusQuery.data?.coreApi.healthy ? "online" : "offline"}
                </StatusPill>
              </div>
              <div className="mt-3 text-sm text-[color:var(--text-muted)]">
                {statusQuery.error instanceof Error
                  ? statusQuery.error.message
                  : statusQuery.data?.coreApi.message ?? "Waiting for the Rust Core API process."}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
                <div className="text-sm text-[color:var(--text-secondary)]">Active Model</div>
                <div className="mt-2 text-lg font-semibold">{aiModelQuery.data?.model ?? "pending"}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
                <div className="text-sm text-[color:var(--text-secondary)]">Characters Surface</div>
                <div className="mt-2 text-lg font-semibold">{characterCount}</div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
              <div className="text-sm text-[color:var(--text-secondary)]">World Context</div>
              <div className="mt-2 text-lg font-semibold">
                {worldContextQuery.data?.localTime ?? "pending snapshot"}
              </div>
              <div className="mt-3 text-sm text-[color:var(--text-muted)]">
                {worldContextQuery.data?.season
                  ? `season: ${worldContextQuery.data.season}`
                  : "Latest world context will mirror the legacy /api/world/context route."}
              </div>
            </div>
          </div>
        </Card>
      </div>

      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {runtimeHighlights.map(({ title, description, icon: Icon }) => (
          <Card key={title} className="bg-[color:var(--surface-secondary)]">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-[color:var(--brand-secondary)]">
              <Icon size={22} />
            </div>
            <div className="mt-5 text-lg font-semibold">{title}</div>
            <p className="mt-2 text-sm leading-7 text-[color:var(--text-secondary)]">{description}</p>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card>
          <SectionHeading>Frozen Product Logic</SectionHeading>
          <ul className="mt-4 space-y-3 text-sm leading-7 text-[color:var(--text-secondary)]">
            <li>Chat, social triggers, moments, feed, scheduling, and the AI world rules remain untouched.</li>
            <li>The legacy `/api/*` semantics and `/chat` event names are preserved as migration targets.</li>
            <li>The old `api/`, `web/`, and `admin/` code stays in the repo as the behavior baseline.</li>
          </ul>
        </Card>

        <Card>
          <SectionHeading>Current Migration Slice</SectionHeading>
          <ul className="mt-4 space-y-3 text-sm leading-7 text-[color:var(--text-secondary)]">
            <li>Migrated modules: {migratedModules.length > 0 ? migratedModules.join(", ") : "pending"}.</li>
            <li>Typed contract coverage now includes auth session flow, AI model config, and character CRUD shapes.</li>
            <li>New app and admin screens are already wired against the same shared client surface.</li>
            <li>Scheduler visibility is online with {schedulerJobs} mirrored jobs from the legacy cadence list.</li>
          </ul>
        </Card>
      </section>
    </div>
  );
}
