type SetupStatusCardProps = {
  title: string;
  value: string;
  detail: string;
  ok: boolean;
  className?: string;
};

export function SetupStatusCard({ title, value, detail, ok, className }: SetupStatusCardProps) {
  return (
    <div className={className ?? "rounded-2xl border border-white/10 bg-black/20 p-4"}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-white">{title}</div>
        <div className={`rounded-full px-3 py-1 text-[11px] ${ok ? "bg-emerald-500/15 text-emerald-200" : "bg-amber-500/15 text-amber-200"}`}>
          {ok ? "ready" : "pending"}
        </div>
      </div>
      <div className="mt-3 text-base font-medium text-white">{value}</div>
      <div className="mt-2 text-sm leading-7 text-[color:var(--text-secondary)]">{detail}</div>
    </div>
  );
}
