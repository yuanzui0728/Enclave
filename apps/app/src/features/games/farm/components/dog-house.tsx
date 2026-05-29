import { useState } from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import {
  FARM_DOG_LEVEL_CAP,
  FARM_DOG_UNLOCK_LEVEL,
  FARM_DOG_UPGRADE_COSTS,
  type FarmPlayerStateView,
} from "@yinjie/contracts";
import { useBuyFarmDog, useFeedFarmDog } from "../use-farm-state";
import { playDogBark } from "../audio/farm-sfx";

const t = translateRuntimeMessage;

const DOG_BREED_EMOJI = ["🏚️", "🐕", "🦮", "🐕‍🦺", "🐺", "🦊"]; // index = level (0..5)

interface DogHouseProps {
  state: FarmPlayerStateView;
}

export function DogHouse({ state }: DogHouseProps) {
  const [expanded, setExpanded] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const buyMutation = useBuyFarmDog();
  const feedMutation = useFeedFarmDog();

  const dog = state.dog;
  const dogFoodCount = state.consumables?.dog_food ?? 0;
  const playerLevel = state.level;
  const eligibleToBuy = playerLevel >= FARM_DOG_UNLOCK_LEVEL;
  const isMaxed = dog.level >= FARM_DOG_LEVEL_CAP;
  const nextLevel = Math.min(dog.level + 1, FARM_DOG_LEVEL_CAP);
  const nextCost = FARM_DOG_UPGRADE_COSTS[nextLevel] ?? 0;
  const emoji = DOG_BREED_EMOJI[Math.max(0, Math.min(FARM_DOG_LEVEL_CAP, dog.level))];

  const isPending = buyMutation.isPending || feedMutation.isPending;

  function handleError(err: unknown) {
    setErrorMsg(err instanceof Error ? err.message : String(err));
  }

  function handleBuyOrUpgrade() {
    setErrorMsg(null);
    buyMutation.mutate(undefined, { onError: handleError });
  }

  function handleFeed() {
    setErrorMsg(null);
    feedMutation.mutate(undefined, {
      onSuccess: () => playDogBark(),
      onError: handleError,
    });
  }

  const energyPct = Math.max(0, Math.min(100, Math.round(dog.energy)));
  const energyColor =
    energyPct < 30
      ? "bg-[color:var(--brand-primary)]"
      : energyPct < 60
        ? "bg-[color:var(--brand-primary)]"
        : "bg-[color:var(--brand-primary)]";

  return (
    <div
      className="pointer-events-auto rounded-2xl border border-[color:var(--border-brand)]/70 bg-[color:var(--surface-card)]/85 px-3 py-2 text-xs shadow-md backdrop-blur-md"
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
      >
        <span className="text-xl leading-none">{emoji}</span>
        <span className="flex-1">
          <span className="font-medium text-[color:var(--text-primary)]">
            {dog.level <= 0 ? t(msg`狗窝`) : t(msg`看家狗 Lv.${dog.level}`)}
          </span>
          {dog.level > 0 && (
            <span className="ml-2 text-[10px] text-[color:var(--text-muted)]">
              {t(msg`能量`)} {energyPct}/100
            </span>
          )}
        </span>
        <span className="text-[color:var(--text-dim)]">{expanded ? "▾" : "▸"}</span>
      </button>

      {dog.level > 0 && (
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--surface-soft)]">
          <div
            className={`h-full ${energyColor} transition-all`}
            style={{ width: `${energyPct}%` }}
          />
        </div>
      )}

      {expanded && (
        <div className="mt-2 flex flex-col gap-2">
          {errorMsg && (
            <div className="rounded-md bg-[color:var(--brand-soft)] px-2 py-1 text-[length:var(--text-eyebrow)] text-[color:var(--brand-primary)]">
              {errorMsg}
            </div>
          )}

          {!eligibleToBuy && dog.level <= 0 && (
            <div className="rounded-md bg-[color:var(--surface-soft)] px-2 py-1 text-[length:var(--text-eyebrow)] text-[color:var(--text-muted)]">
              {t(msg`等级达到 ${FARM_DOG_UNLOCK_LEVEL} 级即可买狗看家`)}
            </div>
          )}

          {dog.level > 0 && (
            <div className="text-[length:var(--text-eyebrow)] text-[color:var(--text-muted)]">
              {t(
                msg`狗会随机拦截想偷你菜的人；能量越足越凶。能量低于 30 时防御减半。`,
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {!isMaxed && (
              <button
                type="button"
                onClick={handleBuyOrUpgrade}
                disabled={isPending || !eligibleToBuy || state.coins < nextCost}
                className="inline-flex min-h-[36px] items-center gap-1 rounded-full bg-[color:var(--brand-primary)] px-3 py-1.5 text-xs text-[color:var(--text-on-brand)] shadow-sm hover:bg-[color:var(--brand-primary)] disabled:opacity-60"
              >
                {dog.level <= 0
                  ? `🐶 ${t(msg`买狗`)} 🪙${nextCost}`
                  : `⬆️ ${t(msg`升到 Lv.${nextLevel}`)} 🪙${nextCost}`}
              </button>
            )}
            {dog.level > 0 && (
              <button
                type="button"
                onClick={handleFeed}
                disabled={isPending || dogFoodCount <= 0}
                title={
                  dogFoodCount <= 0 ? t(msg`狗粮不足，先去农资店买`) : t(msg`喂狗`)
                }
                className="inline-flex min-h-[36px] items-center gap-1 rounded-full bg-[color:var(--brand-primary)] px-3 py-1.5 text-xs text-[color:var(--text-on-brand)] shadow-sm hover:bg-[color:var(--brand-primary)] disabled:opacity-60"
              >
                🦴 {t(msg`喂狗`)}
                {dogFoodCount > 0 && (
                  <span className="text-[color:var(--brand-primary)]">×{dogFoodCount}</span>
                )}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
