import { msg } from "@lingui/macro";
import type { FarmPlayerStateView } from "@yinjie/contracts";
import { FARM_LEVEL_EXPERIENCE_THRESHOLDS } from "@yinjie/contracts";
import { translateRuntimeMessage } from "@yinjie/i18n";

const t = translateRuntimeMessage;

interface CoinDisplayProps {
  state: FarmPlayerStateView;
}

export function CoinDisplay({ state }: CoinDisplayProps) {
  const currentLevel = state.level;
  const currentLevelXp =
    FARM_LEVEL_EXPERIENCE_THRESHOLDS[currentLevel - 1] ?? 0;
  // thresholds 数组定义到 Lv.10。到顶后没有"下一级"，之前用 currentLevelXp+100
  // 兜底会让顶级玩家看到"经验 0 / 100"和半空进度条，像还差一点升级——其实是已满级。
  const isMaxLevel = currentLevel >= FARM_LEVEL_EXPERIENCE_THRESHOLDS.length;
  const nextLevelXp = isMaxLevel
    ? state.experience
    : (FARM_LEVEL_EXPERIENCE_THRESHOLDS[currentLevel] ?? currentLevelXp);
  const progress = isMaxLevel
    ? 1
    : Math.max(
        0,
        Math.min(
          1,
          (state.experience - currentLevelXp) /
            Math.max(1, nextLevelXp - currentLevelXp),
        ),
      );

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-[color:var(--border-faint)]/60 bg-[color:var(--surface-card)]/65 px-4 py-3 shadow-md backdrop-blur-md">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 text-base font-semibold text-[color:var(--brand-primary)] drop-shadow-sm">
          <span className="text-lg">🪙</span>
          {state.coins.toLocaleString()}
        </span>
        <span className="rounded-full bg-[color:var(--brand-primary)] px-2 py-0.5 text-xs font-medium text-[color:var(--text-on-brand)] shadow-sm">
          Lv.{currentLevel}
        </span>
      </div>
      <div className="flex items-center justify-between text-xs text-[color:var(--text-muted)]">
        <span>
          {isMaxLevel
            ? t(msg`经验 ${state.experience}（已满级）`)
            : t(
                msg`经验 ${state.experience - currentLevelXp} / ${nextLevelXp - currentLevelXp}`,
              )}
        </span>
        <span>{t(msg`田块 ${state.plotCount}`)}</span>
      </div>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-[color:var(--surface-soft)]/80">
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-[color:var(--brand-primary)] to-[color:var(--brand-primary)] transition-all"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </div>
  );
}
