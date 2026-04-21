type AdminSessionSourceGroupSummaryPillsProps = {
  activeSessions: number;
  totalSessions?: number | null;
  currentSessions?: number | null;
  expiredSessions?: number | null;
  revokedSessions?: number | null;
  refreshTokenReuseRevocations?: number | null;
  className?: string;
  pillClassName?: string;
};

export function AdminSessionSourceGroupSummaryPills({
  activeSessions,
  totalSessions,
  currentSessions,
  expiredSessions,
  revokedSessions,
  refreshTokenReuseRevocations,
  className = "flex flex-wrap gap-2 text-xs text-[color:var(--text-secondary)]",
  pillClassName = "px-2 py-1",
}: AdminSessionSourceGroupSummaryPillsProps) {
  return (
    <div className={className}>
      <span
        className={`rounded-full border border-emerald-300/40 bg-emerald-500/10 text-emerald-100 ${pillClassName}`}
      >
        {activeSessions} active
      </span>
      {typeof totalSessions === "number" ? (
        <span
          className={`rounded-full border border-[color:var(--border-faint)] ${pillClassName}`}
        >
          {totalSessions} total
        </span>
      ) : null}
      {typeof currentSessions === "number" && currentSessions > 0 ? (
        <span
          className={`rounded-full border border-[color:var(--border-brand)] bg-[color:var(--brand-soft)] text-[color:var(--brand-primary)] ${pillClassName}`}
        >
          {currentSessions} current
        </span>
      ) : null}
      {typeof expiredSessions === "number" && expiredSessions > 0 ? (
        <span
          className={`rounded-full border border-amber-300/40 bg-amber-500/10 text-amber-100 ${pillClassName}`}
        >
          {expiredSessions} expired
        </span>
      ) : null}
      {typeof revokedSessions === "number" && revokedSessions > 0 ? (
        <span
          className={`rounded-full border border-rose-300/40 bg-rose-500/10 text-rose-200 ${pillClassName}`}
        >
          {revokedSessions} revoked
        </span>
      ) : null}
      {typeof refreshTokenReuseRevocations === "number" &&
      refreshTokenReuseRevocations > 0 ? (
        <span
          className={`rounded-full border border-rose-300/40 bg-rose-500/10 text-rose-200 ${pillClassName}`}
        >
          {refreshTokenReuseRevocations} refresh reuse
        </span>
      ) : null}
    </div>
  );
}
