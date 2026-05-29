import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import type { FarmNeighborSummary } from "@yinjie/contracts";
import { AvatarChip } from "../../../../components/avatar-chip";
import { useFarmNeighbors } from "../use-farm-state";

const t = translateRuntimeMessage;

interface NeighborListPanelProps {
  onSelectNeighbor: (characterId: string) => void;
}

export function NeighborListPanel({ onSelectNeighbor }: NeighborListPanelProps) {
  const neighborsQuery = useFarmNeighbors({ limit: 30 });

  return (
    <section className="rounded-2xl border border-[color:var(--border-faint)]/60 bg-[color:var(--surface-card)]/75 p-3 shadow-md backdrop-blur-md">
      <header className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[color:var(--text-secondary)]">{t(msg`世界邻居`)}</h2>
        <span className="text-[length:var(--text-eyebrow)] text-[color:var(--text-dim)]">
          {neighborsQuery.data?.length ?? 0} {t(msg`位`)}
        </span>
      </header>
      {neighborsQuery.isLoading && (
        <p className="py-4 text-center text-xs text-[color:var(--text-dim)]">
          {t(msg`正在打听邻居们的动向……`)}
        </p>
      )}
      {neighborsQuery.error && (
        <p className="py-4 text-center text-xs text-[color:var(--brand-primary)]">
          {t(msg`邻居列表加载失败：`)}{(neighborsQuery.error as Error).message}
        </p>
      )}
      {neighborsQuery.data && neighborsQuery.data.length === 0 && (
        <p className="py-4 text-center text-xs text-[color:var(--text-dim)]">
          {t(msg`世界里还没有可串门的人。`)}
        </p>
      )}
      <ul className="max-h-72 overflow-y-auto">
        {neighborsQuery.data?.map((neighbor) => (
          <NeighborRow
            key={neighbor.characterId}
            neighbor={neighbor}
            onClick={() => onSelectNeighbor(neighbor.characterId)}
          />
        ))}
      </ul>
    </section>
  );
}

function NeighborRow({
  neighbor,
  onClick,
}: {
  neighbor: FarmNeighborSummary;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-[color:var(--brand-soft)]"
      >
        <div className="relative shrink-0">
          <AvatarChip
            name={neighbor.characterName}
            src={neighbor.characterAvatar}
            size="sm"
          />
          {neighbor.isOnline && (
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border border-[color:var(--border-faint)] bg-[color:var(--brand-primary)]" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-sm font-medium">
              {neighbor.characterName}
            </span>
            <span className="text-[10px] text-[color:var(--text-dim)]">
              Lv.{neighbor.level}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[length:var(--text-eyebrow)] text-[color:var(--text-muted)]">
            {neighbor.ripePlotCount > 0 ? (
              <span className="rounded-full bg-[color:var(--brand-soft)] px-1.5 py-0.5 text-[color:var(--brand-primary)]">
                ✨ {neighbor.ripePlotCount} {t(msg`块成熟`)}
              </span>
            ) : (
              <span className="text-[color:var(--text-dim)]">
                {neighbor.totalPlotCount} {t(msg`块田，暂无成熟`)}
              </span>
            )}
            {neighbor.intimacyLevel > 0 && (
              <span>♡ {neighbor.intimacyLevel}</span>
            )}
          </div>
        </div>
        <span className="text-[color:var(--text-dim)]">›</span>
      </button>
    </li>
  );
}
