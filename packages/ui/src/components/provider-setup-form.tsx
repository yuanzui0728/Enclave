import type { ProviderConfig } from "@yinjie/config";

type ProviderSetupFormProps = {
  title: string;
  description: string;
  statusLabel: string;
  endpointLabel: string;
  modeLabel: string;
  modelLabel: string;
  apiKeyLabel: string;
  apiKeyPlaceholder: string;
  endpointPlaceholder: string;
  modelPlaceholder: string;
  probeLabel: string;
  saveLabel: string;
  draft: ProviderConfig;
  availableModels: string[];
  availableModelsId: string;
  disabled: boolean;
  validationMessage?: string | null;
  errorMessage?: string | null;
  actionErrorMessage?: string | null;
  footerMessage: string;
  onSubmit: () => void;
  onProbe: () => void;
  onChange: <K extends keyof ProviderConfig>(field: K, value: ProviderConfig[K]) => void;
  savePending?: boolean;
  probePending?: boolean;
  className?: string;
};

export function ProviderSetupForm({
  title,
  description,
  statusLabel,
  endpointLabel,
  modeLabel,
  modelLabel,
  apiKeyLabel,
  apiKeyPlaceholder,
  endpointPlaceholder,
  modelPlaceholder,
  probeLabel,
  saveLabel,
  draft,
  availableModels,
  availableModelsId,
  disabled,
  validationMessage,
  errorMessage,
  actionErrorMessage,
  footerMessage,
  onSubmit,
  onProbe,
  onChange,
  savePending,
  probePending,
  className,
}: ProviderSetupFormProps) {
  return (
    <section className={className ?? "rounded-[28px] border border-white/10 bg-white/5 p-5"}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-white">{title}</div>
          <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">{description}</div>
        </div>
        <div
          className={`rounded-full px-3 py-1 text-[11px] ${statusLabel === "configured" ? "bg-emerald-500/15 text-emerald-200" : "bg-amber-500/15 text-amber-200"}`}
        >
          {statusLabel}
        </div>
      </div>

      <form
        className="mt-4 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <label className="block space-y-2 text-sm text-white">
          <span>{endpointLabel}</span>
          <input
            value={draft.endpoint}
            onChange={(event) => onChange("endpoint", event.target.value)}
            disabled={disabled}
            className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none disabled:cursor-not-allowed disabled:opacity-50"
            placeholder={endpointPlaceholder}
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-2 text-sm text-white">
            <span>{modeLabel}</span>
            <select
              value={draft.mode}
              onChange={(event) => onChange("mode", event.target.value === "cloud" ? "cloud" : "local-compatible")}
              disabled={disabled}
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="local-compatible">local-compatible</option>
              <option value="cloud">cloud</option>
            </select>
          </label>

          <label className="block space-y-2 text-sm text-white">
            <span>{modelLabel}</span>
            <input
              value={draft.model}
              onChange={(event) => onChange("model", event.target.value)}
              disabled={disabled}
              list={availableModelsId}
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none disabled:cursor-not-allowed disabled:opacity-50"
              placeholder={modelPlaceholder}
            />
            <datalist id={availableModelsId}>
              {availableModels.map((model) => (
                <option key={model} value={model} />
              ))}
            </datalist>
          </label>
        </div>

        <label className="block space-y-2 text-sm text-white">
          <span>{apiKeyLabel}</span>
          <input
            value={draft.apiKey ?? ""}
            onChange={(event) => onChange("apiKey", event.target.value)}
            disabled={disabled}
            type="password"
            className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none disabled:cursor-not-allowed disabled:opacity-50"
            placeholder={apiKeyPlaceholder}
          />
        </label>

        {validationMessage ? (
          <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {validationMessage}
          </div>
        ) : null}

        {errorMessage ? (
          <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {errorMessage}
          </div>
        ) : null}

        {actionErrorMessage ? (
          <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {actionErrorMessage}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={disabled || probePending}
            onClick={onProbe}
            className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {probeLabel}
          </button>
          <button
            type="submit"
            disabled={disabled || savePending}
            className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saveLabel}
          </button>
        </div>

        <div className="text-xs leading-6 text-[color:var(--text-muted)]">{footerMessage}</div>
      </form>
    </section>
  );
}
