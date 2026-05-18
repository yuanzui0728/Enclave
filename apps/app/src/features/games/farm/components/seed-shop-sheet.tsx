import { useEffect, useState } from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import {
  FARM_CONSUMABLE_CATALOG,
  FARM_CONSUMABLE_IDS,
  FARM_DECORATION_CATALOG,
  FARM_DECORATION_IDS,
  isFarmCropInSeason,
  type FarmConsumableId,
  type FarmCropId,
  type FarmDecorationId,
  type FarmPlayerStateView,
} from "@yinjie/contracts";
import { listCropPresentations } from "../crop-presentation";
import {
  useBuyFarmConsumable,
  useBuyFarmDecoration,
  useBuyFarmSeed,
  usePlaceFarmDecoration,
} from "../use-farm-state";

const t = translateRuntimeMessage;

interface SeedShopSheetProps {
  state: FarmPlayerStateView;
  open: boolean;
  onClose: () => void;
}

export function SeedShopSheet({ state, open, onClose }: SeedShopSheetProps) {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pendingCropId, setPendingCropId] = useState<FarmCropId | null>(null);
  const [pendingConsumableId, setPendingConsumableId] =
    useState<FarmConsumableId | null>(null);
  const [pendingDecorationId, setPendingDecorationId] =
    useState<FarmDecorationId | null>(null);
  const [tab, setTab] = useState<"seed" | "consumable" | "decoration">("seed");
  const buyMutation = useBuyFarmSeed();
  const buyConsumableMutation = useBuyFarmConsumable();
  const buyDecorationMutation = useBuyFarmDecoration();
  const placeDecorationMutation = usePlaceFarmDecoration();
  const presentations = listCropPresentations();

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  function handleBuy(cropId: FarmCropId, quantity: number) {
    setErrorMsg(null);
    setPendingCropId(cropId);
    buyMutation.mutate(
      { cropId, quantity },
      {
        onSettled: () => setPendingCropId(null),
        onError: (err) => setErrorMsg((err as Error).message),
      },
    );
  }

  function handleBuyConsumable(consumableId: FarmConsumableId, quantity: number) {
    setErrorMsg(null);
    setPendingConsumableId(consumableId);
    buyConsumableMutation.mutate(
      { consumableId, quantity },
      {
        onSettled: () => setPendingConsumableId(null),
        onError: (err) => setErrorMsg((err as Error).message),
      },
    );
  }

  function handleBuyDecoration(decorationId: FarmDecorationId) {
    setErrorMsg(null);
    setPendingDecorationId(decorationId);
    buyDecorationMutation.mutate(
      { decorationId, quantity: 1 },
      {
        onSettled: () => setPendingDecorationId(null),
        onError: (err) => setErrorMsg((err as Error).message),
      },
    );
  }

  function handlePlaceDecoration(decorationId: FarmDecorationId) {
    setErrorMsg(null);
    // 简单铺：在 [10-90]% 区域里随机一个位置，避免压到正中间网格。
    const x = 10 + Math.random() * 80;
    const y = 10 + Math.random() * 80;
    placeDecorationMutation.mutate(
      { decorationId, x, y },
      {
        onError: (err) => setErrorMsg((err as Error).message),
      },
    );
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-stone-900/30 sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col rounded-t-3xl bg-white shadow-xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
          <h2 className="text-base font-semibold">{t(msg`农资店`)}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-2 py-1 text-sm text-stone-500 hover:bg-stone-100"
          >
            {t(msg`关闭`)}
          </button>
        </header>
        <div className="flex gap-1 border-b border-stone-100 px-4 py-2">
          <button
            type="button"
            onClick={() => setTab("seed")}
            className={`rounded-full px-3 py-1 text-xs ${
              tab === "seed"
                ? "bg-emerald-600 text-white"
                : "bg-stone-100 text-stone-600"
            }`}
          >
            🌱 {t(msg`种子`)}
          </button>
          <button
            type="button"
            onClick={() => setTab("consumable")}
            className={`rounded-full px-3 py-1 text-xs ${
              tab === "consumable"
                ? "bg-emerald-600 text-white"
                : "bg-stone-100 text-stone-600"
            }`}
          >
            🧴 {t(msg`化肥 / 农药 / 狗粮`)}
          </button>
          <button
            type="button"
            onClick={() => setTab("decoration")}
            className={`rounded-full px-3 py-1 text-xs ${
              tab === "decoration"
                ? "bg-emerald-600 text-white"
                : "bg-stone-100 text-stone-600"
            }`}
          >
            🌸 {t(msg`装饰`)}
          </button>
        </div>
        {errorMsg && (
          <div className="bg-rose-50 px-4 py-2 text-xs text-rose-600">
            {errorMsg}
          </div>
        )}
        {tab === "decoration" ? (
          <ul className="flex-1 overflow-y-auto px-4 py-2">
            {FARM_DECORATION_IDS.map((id) => {
              const def = FARM_DECORATION_CATALOG[id];
              const locked = state.level < def.unlockLevel;
              const owned = state.decorationInventory?.[id] ?? 0;
              const affordable = state.coins >= def.price;
              const isPending = pendingDecorationId === id;
              const placeCount = state.placedDecorations.filter(
                (p) => p.type === id,
              ).length;
              return (
                <li
                  key={id}
                  className="flex items-center gap-3 border-b border-stone-100 py-3 last:border-b-0"
                >
                  <span className="text-2xl">{def.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">{def.nameZh}</span>
                      <span className="text-xs text-stone-500">🪙 {def.price}</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-stone-500">
                      {def.descriptionZh}
                    </div>
                    <div className="mt-0.5 text-[11px] text-stone-400">
                      {t(msg`库存`)} {owned} · {t(msg`已摆`)} {placeCount}
                      {locked && (
                        <span className="ml-2 text-amber-600">
                          Lv.{def.unlockLevel} {t(msg`解锁`)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => handleBuyDecoration(id)}
                      disabled={locked || !affordable || isPending}
                      className={[
                        "rounded-full px-3 py-1 text-xs font-medium transition",
                        locked || !affordable
                          ? "cursor-not-allowed bg-stone-100 text-stone-400"
                          : "bg-emerald-600 text-white hover:bg-emerald-700",
                      ].join(" ")}
                    >
                      {isPending
                        ? t(msg`购买中`)
                        : locked
                          ? t(msg`未解锁`)
                          : !affordable
                            ? t(msg`金币不足`)
                            : t(msg`购买 1`)}
                    </button>
                    {owned > 0 && (
                      <button
                        type="button"
                        onClick={() => handlePlaceDecoration(id)}
                        disabled={placeDecorationMutation.isPending}
                        className="rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-700 hover:bg-amber-200 disabled:opacity-50"
                      >
                        {t(msg`摆出来`)}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : tab === "consumable" ? (
          <ul className="flex-1 overflow-y-auto px-4 py-2">
            {FARM_CONSUMABLE_IDS.map((id) => {
              const def = FARM_CONSUMABLE_CATALOG[id];
              const locked = state.level < def.unlockLevel;
              const owned = state.consumables?.[id] ?? 0;
              const affordable = state.coins >= def.price;
              const isPending = pendingConsumableId === id;
              return (
                <li
                  key={id}
                  className="flex items-center gap-3 border-b border-stone-100 py-3 last:border-b-0"
                >
                  <span className="text-2xl">{def.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">{def.nameZh}</span>
                      <span className="text-xs text-stone-500">
                        🪙 {def.price} {t(msg`/ 个`)}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-stone-500">
                      {def.descriptionZh}
                    </div>
                    <div className="mt-0.5 text-[11px] text-stone-400">
                      {t(msg`已存`)} {owned}
                      {locked && (
                        <span className="ml-2 text-amber-600">
                          Lv.{def.unlockLevel} {t(msg`解锁`)}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleBuyConsumable(id, 1)}
                    disabled={locked || !affordable || isPending}
                    className={[
                      "rounded-full px-3 py-1 text-xs font-medium transition",
                      locked || !affordable
                        ? "cursor-not-allowed bg-stone-100 text-stone-400"
                        : "bg-emerald-600 text-white hover:bg-emerald-700",
                    ].join(" ")}
                  >
                    {isPending
                      ? t(msg`购买中`)
                      : locked
                        ? t(msg`未解锁`)
                        : !affordable
                          ? t(msg`金币不足`)
                          : t(msg`购买 1`)}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
        <ul className="flex-1 overflow-y-auto px-4 py-2">
          {presentations.filter((c) => isFarmCropInSeason(c.id)).map((crop) => {
            const locked = state.level < crop.unlockLevel;
            const owned = state.seedBag[crop.id] ?? 0;
            const affordable = state.coins >= crop.seedCost;
            const isPending = pendingCropId === crop.id;
            return (
              <li
                key={crop.id}
                className="flex items-center gap-3 border-b border-stone-100 py-3 last:border-b-0"
              >
                <span className="text-2xl">{crop.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{crop.nameZh}</span>
                    <span className="text-xs text-stone-500">
                      {crop.growHours}{t(msg`h 成熟`)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between text-[11px] text-stone-500">
                    <span>
                      🪙 {crop.seedCost} {t(msg`/ 包，售价`)} {crop.sellPrice} {t(msg`/ 个`)}
                    </span>
                    <span>{t(msg`已存`)} {owned}</span>
                  </div>
                  {locked && (
                    <div className="mt-1 text-[11px] text-amber-600">
                      Lv.{crop.unlockLevel} {t(msg`解锁`)}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleBuy(crop.id, 1)}
                  disabled={locked || !affordable || isPending}
                  className={[
                    "rounded-full px-3 py-1 text-xs font-medium transition",
                    locked || !affordable
                      ? "cursor-not-allowed bg-stone-100 text-stone-400"
                      : "bg-emerald-600 text-white hover:bg-emerald-700",
                  ].join(" ")}
                >
                  {isPending ? t(msg`购买中`) : locked ? t(msg`未解锁`) : !affordable ? t(msg`金币不足`) : t(msg`购买 1`)}
                </button>
              </li>
            );
          })}
        </ul>
        )}
      </div>
    </div>
  );
}
