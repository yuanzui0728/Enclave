import { useEffect, useState } from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import type { FarmCropId, FarmPlayerStateView } from "@yinjie/contracts";
import { FARM_CROP_CATALOG } from "@yinjie/contracts";
import { useSellFarmCrop } from "../use-farm-state";

const t = translateRuntimeMessage;

interface WarehouseSheetProps {
  state: FarmPlayerStateView;
  open: boolean;
  onClose: () => void;
}

export function WarehouseSheet({ state, open, onClose }: WarehouseSheetProps) {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pendingCropId, setPendingCropId] = useState<FarmCropId | null>(null);
  const sellMutation = useSellFarmCrop();

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const entries = (Object.entries(state.warehouse) as [FarmCropId, number][])
    .filter(([_id, count]) => count > 0)
    .sort(([, a], [, b]) => b - a);

  function handleSell(cropId: FarmCropId, quantity: number) {
    setErrorMsg(null);
    setPendingCropId(cropId);
    sellMutation.mutate(
      { cropId, quantity },
      {
        onSettled: () => setPendingCropId(null),
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
        className="flex max-h-[80vh] w-full max-w-md flex-col rounded-t-3xl bg-[color:var(--surface-card)] shadow-xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-[color:var(--border-subtle)] px-4 py-3">
          <h2 className="text-base font-semibold">{t(msg`仓库`)}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-2 py-1 text-sm text-[color:var(--text-muted)] hover:bg-[color:var(--surface-soft)]"
          >
            {t(msg`关闭`)}
          </button>
        </header>
        {errorMsg && (
          <div className="bg-[color:var(--brand-soft)] px-4 py-2 text-xs text-[color:var(--brand-primary)]">
            {errorMsg}
          </div>
        )}
        <ul className="flex-1 overflow-y-auto px-4 py-2">
          {entries.length === 0 && (
            <li className="py-8 text-center text-sm text-[color:var(--text-dim)]">
              {t(msg`仓库还是空的，先去种点东西吧`)}
            </li>
          )}
          {entries.map(([cropId, count]) => {
            const def = FARM_CROP_CATALOG[cropId];
            if (!def) return null;
            const isPending = pendingCropId === cropId;
            return (
              <li
                key={cropId}
                className="flex items-center gap-3 border-b border-[color:var(--border-subtle)] py-3 last:border-b-0"
              >
                <span className="text-2xl">{def.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{def.nameZh}</span>
                    <span className="text-xs text-[color:var(--text-muted)]">
                      {t(msg`存量`)} {count}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[length:var(--text-eyebrow)] text-[color:var(--text-muted)]">
                    🪙 {def.sellPrice} {t(msg`/ 个`)}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => handleSell(cropId, 1)}
                    disabled={isPending}
                    className="rounded-full bg-[color:var(--brand-primary)] px-2 py-1 text-xs text-[color:var(--text-on-brand)] hover:bg-[color:var(--brand-primary)] disabled:opacity-60"
                  >
                    {t(msg`卖 1`)}
                  </button>
                  {count > 1 && (
                    <button
                      type="button"
                      onClick={() => handleSell(cropId, count)}
                      disabled={isPending}
                      className="rounded-full bg-[color:var(--brand-primary)] px-2 py-1 text-xs text-[color:var(--text-on-brand)] hover:bg-[color:var(--brand-primary)] disabled:opacity-60"
                    >
                      {t(msg`全卖`)}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
