import { useEffect, useState } from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import {
  FARM_CONSUMABLE_CATALOG,
  FARM_CROP_CATALOG,
  type FarmConsumableId,
  type FarmCropId,
  type FarmNeighborSummary,
  type FarmPlayerStateView,
} from "@yinjie/contracts";
import { useFarmState, useGiftFarmCoins, useGiftFarmItem } from "../use-farm-state";

const t = translateRuntimeMessage;

interface GiftSheetProps {
  neighbor: FarmNeighborSummary | null;
  open: boolean;
  onClose: () => void;
  onGifted?: (intimacyDelta: number) => void;
}

type Tab = "coins" | "crop" | "seed" | "consumable";

export function GiftSheet({ neighbor, open, onClose, onGifted }: GiftSheetProps) {
  const [tab, setTab] = useState<Tab>("coins");
  const [amount, setAmount] = useState(100);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const stateQuery = useFarmState();
  const giftCoinsMutation = useGiftFarmCoins();
  const giftItemMutation = useGiftFarmItem();

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open || !neighbor) return null;

  const state: FarmPlayerStateView | undefined = stateQuery.data;
  const isPending = giftCoinsMutation.isPending || giftItemMutation.isPending;
  // 服务端 100 满好感会 409 拦掉送礼；UI 也提前禁用，告诉玩家原因，别白白点几下再吃 toast。
  const intimacyMaxed = (neighbor.intimacyLevel ?? 0) >= 100;

  function handleGiftCoins() {
    if (!neighbor) return;
    setErrorMsg(null);
    giftCoinsMutation.mutate(
      { characterId: neighbor.characterId, amount },
      {
        onSuccess: (res) => {
          onGifted?.(res.intimacyDelta);
          onClose();
        },
        onError: (err) => setErrorMsg((err as Error).message),
      },
    );
  }

  function handleGiftItem(
    itemKind: "crop" | "seed" | "consumable",
    itemId: string,
  ) {
    if (!neighbor) return;
    setErrorMsg(null);
    giftItemMutation.mutate(
      { characterId: neighbor.characterId, itemKind, itemId, quantity: 1 },
      {
        onSuccess: (res) => {
          onGifted?.(res.intimacyDelta);
          onClose();
        },
        onError: (err) => setErrorMsg((err as Error).message),
      },
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col rounded-t-3xl bg-[color:var(--surface-card)] shadow-xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-[color:var(--border-subtle)] px-4 py-3">
          <h2 className="text-base font-semibold">
            🎁 {t(msg`给`)} {neighbor.characterName} {t(msg`送礼`)}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-2 py-1 text-sm text-[color:var(--text-muted)] hover:bg-[color:var(--surface-soft)]"
          >
            {t(msg`关闭`)}
          </button>
        </header>
        <div className="flex flex-wrap gap-1 border-b border-[color:var(--border-subtle)] px-4 py-2">
          {(["coins", "crop", "seed", "consumable"] as Tab[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-full px-3 py-1 text-xs ${
                tab === id
                  ? "bg-[color:var(--brand-primary)] text-[color:var(--text-on-brand)]"
                  : "bg-[color:var(--surface-soft)] text-[color:var(--text-muted)]"
              }`}
            >
              {id === "coins"
                ? `🪙 ${t(msg`金币`)}`
                : id === "crop"
                  ? `🌾 ${t(msg`仓库作物`)}`
                  : id === "seed"
                    ? `🌱 ${t(msg`种子`)}`
                    : `🧴 ${t(msg`化肥/农药`)}`}
            </button>
          ))}
        </div>
        {errorMsg && (
          <div className="bg-[color:var(--brand-soft)] px-4 py-2 text-xs text-[color:var(--brand-primary)]">{errorMsg}</div>
        )}
        {intimacyMaxed && (
          <div className="bg-[color:var(--brand-soft)] px-4 py-2 text-xs text-[color:var(--brand-primary)]">
            {t(msg`${neighbor.characterName} 的好感度已满，送礼不会再涨好感。`)}
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {tab === "coins" && (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-[color:var(--text-muted)]">
                {t(msg`每 100 金币换 1 点好感。最多 2000 金币 / 次。`)}
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={2000}
                  step={100}
                  value={amount}
                  onChange={(e) =>
                    setAmount(Math.max(1, Math.min(2000, Number(e.target.value) || 0)))
                  }
                  className="flex-1 rounded-xl border border-[color:var(--border-subtle)] px-3 py-2 text-sm"
                />
                <span className="text-xs text-[color:var(--text-muted)]">
                  🪙{state?.coins ?? 0}
                </span>
              </div>
              <button
                type="button"
                onClick={handleGiftCoins}
                disabled={isPending || intimacyMaxed || (state?.coins ?? 0) < amount}
                className="self-end rounded-full bg-[color:var(--brand-primary)] px-4 py-1.5 text-sm text-[color:var(--text-on-brand)] shadow disabled:opacity-60"
              >
                {t(msg`赠送 🪙`)} {amount}
              </button>
            </div>
          )}

          {tab === "crop" && state && (
            <ul className="flex flex-col gap-1">
              {Object.entries(state.warehouse ?? {}).filter(([, n]) => (n ?? 0) > 0).map(([cropId, count]) => {
                const def = FARM_CROP_CATALOG[cropId as FarmCropId];
                if (!def) return null;
                return (
                  <li key={cropId} className="flex items-center gap-2 border-b border-[color:var(--border-subtle)] py-2">
                    <span className="text-xl">{def.emoji}</span>
                    <span className="flex-1 text-sm">{def.nameZh}</span>
                    <span className="text-xs text-[color:var(--text-muted)]">×{count}</span>
                    <button
                      type="button"
                      onClick={() => handleGiftItem("crop", cropId)}
                      disabled={isPending || intimacyMaxed}
                      className="rounded-full bg-[color:var(--brand-primary)] px-3 py-1 text-xs text-[color:var(--text-on-brand)] shadow disabled:opacity-60"
                    >
                      {t(msg`送 1`)}
                    </button>
                  </li>
                );
              })}
              {Object.values(state.warehouse ?? {}).every((n) => (n ?? 0) <= 0) && (
                <li className="px-2 py-3 text-xs text-[color:var(--text-dim)]">{t(msg`仓库空空如也`)}</li>
              )}
            </ul>
          )}

          {tab === "seed" && state && (
            <ul className="flex flex-col gap-1">
              {Object.entries(state.seedBag ?? {}).filter(([, n]) => (n ?? 0) > 0).map(([cropId, count]) => {
                const def = FARM_CROP_CATALOG[cropId as FarmCropId];
                if (!def) return null;
                return (
                  <li key={cropId} className="flex items-center gap-2 border-b border-[color:var(--border-subtle)] py-2">
                    <span className="text-xl">{def.emoji}</span>
                    <span className="flex-1 text-sm">{def.nameZh}{t(msg`种子`)}</span>
                    <span className="text-xs text-[color:var(--text-muted)]">×{count}</span>
                    <button
                      type="button"
                      onClick={() => handleGiftItem("seed", cropId)}
                      disabled={isPending || intimacyMaxed}
                      className="rounded-full bg-[color:var(--brand-primary)] px-3 py-1 text-xs text-[color:var(--text-on-brand)] shadow disabled:opacity-60"
                    >
                      {t(msg`送 1`)}
                    </button>
                  </li>
                );
              })}
              {Object.values(state.seedBag ?? {}).every((n) => (n ?? 0) <= 0) && (
                <li className="px-2 py-3 text-xs text-[color:var(--text-dim)]">{t(msg`种子袋空空如也`)}</li>
              )}
            </ul>
          )}

          {tab === "consumable" && state && (
            <ul className="flex flex-col gap-1">
              {(Object.entries(state.consumables ?? {}) as [FarmConsumableId, number][]).filter(([, n]) => (n ?? 0) > 0).map(([id, count]) => {
                const def = FARM_CONSUMABLE_CATALOG[id];
                if (!def) return null;
                return (
                  <li key={id} className="flex items-center gap-2 border-b border-[color:var(--border-subtle)] py-2">
                    <span className="text-xl">{def.emoji}</span>
                    <span className="flex-1 text-sm">{def.nameZh}</span>
                    <span className="text-xs text-[color:var(--text-muted)]">×{count}</span>
                    <button
                      type="button"
                      onClick={() => handleGiftItem("consumable", id)}
                      disabled={isPending || intimacyMaxed}
                      className="rounded-full bg-[color:var(--brand-primary)] px-3 py-1 text-xs text-[color:var(--text-on-brand)] shadow disabled:opacity-60"
                    >
                      {t(msg`送 1`)}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
