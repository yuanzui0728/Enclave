type DesktopRuntimeActionsProps = {
  title: string;
  probeLabel: string;
  startLabel: string;
  restartLabel: string;
  stopLabel?: string;
  message: string;
  errorMessage?: string | null;
  busy?: boolean;
  onProbe: () => void;
  onStart: () => void;
  onRestart: () => void;
  onStop?: () => void;
};

export function DesktopRuntimeActions({
  title,
  probeLabel,
  startLabel,
  restartLabel,
  stopLabel,
  message,
  errorMessage,
  busy = false,
  onProbe,
  onStart,
  onRestart,
  onStop,
}: DesktopRuntimeActionsProps) {
  return (
    <section className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-5 shadow-[var(--shadow-section)]">
      <div className="text-sm font-medium text-[color:var(--text-primary)]">
        {title}
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onProbe}
          disabled={busy}
          className="rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-secondary)] px-4 py-2 text-sm text-[color:var(--text-secondary)] hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {probeLabel}
        </button>
        <button
          type="button"
          onClick={onStart}
          disabled={busy}
          className="rounded-full bg-[color:var(--brand-primary)] [background-image:var(--brand-gradient)] px-4 py-2 text-sm font-medium text-[color:var(--text-on-brand)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {startLabel}
        </button>
        <button
          type="button"
          onClick={onRestart}
          disabled={busy}
          className="rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-secondary)] px-4 py-2 text-sm text-[color:var(--text-secondary)] hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {restartLabel}
        </button>
        {onStop ? (
          <button
            type="button"
            onClick={onStop}
            disabled={busy}
            className="rounded-full border border-[color:var(--border-danger)] bg-[color:var(--state-danger-bg)] px-4 py-2 text-sm text-[color:var(--state-danger-text)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {stopLabel ?? "Stop"}
          </button>
        ) : null}
      </div>
      <div className="mt-4 text-xs leading-6 text-[color:var(--text-muted)]">
        {message}
      </div>
      {errorMessage ? (
        <div className="mt-3 text-sm text-[color:var(--state-danger-text)]">
          {errorMessage}
        </div>
      ) : null}
    </section>
  );
}
