type SetupStep = {
  label: string;
  hint: string;
  ok: boolean;
};

export function SetupStepList({ steps }: { steps: SetupStep[] }) {
  return (
    <div className="space-y-3">
      {steps.map((step) => (
        <div key={step.label} className="flex items-center justify-between rounded-[24px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-3 shadow-[var(--shadow-soft)]">
          <div>
            <div className="text-sm font-medium text-[color:var(--text-primary)]">{step.label}</div>
            <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">{step.hint}</div>
          </div>
          <div
            className={`rounded-full px-3 py-1 text-[11px] ${step.ok ? "bg-emerald-500/15 text-emerald-700" : "bg-amber-500/15 text-amber-700"}`}
          >
            {step.ok ? "ready" : "pending"}
          </div>
        </div>
      ))}
    </div>
  );
}
