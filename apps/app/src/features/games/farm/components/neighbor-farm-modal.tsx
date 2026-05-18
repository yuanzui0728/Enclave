import { useEffect, useState } from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import type { FarmCropId, FarmPlot } from "@yinjie/contracts";

const t = translateRuntimeMessage;
import { FARM_CROP_CATALOG } from "@yinjie/contracts";
import { AvatarChip } from "../../../../components/avatar-chip";
import { translateExpertDomains } from "../../../../lib/character-i18n";
import {
  useFarmNeighborDetail,
  useStealFromNeighbor,
} from "../use-farm-state";
import { useFarmAdjustedNow } from "../farm-clock-context";
import { formatRemainingMs, getStageEmoji } from "../crop-presentation";
import { GiftSheet } from "./gift-sheet";
import { playStealSwoosh } from "../audio/farm-sfx";

interface NeighborFarmModalProps {
  characterId: string | null;
  onClose: () => void;
}

interface StealToast {
  cropId: FarmCropId;
  amount: number;
  coinsGained: number;
  intimacyDelta: number;
  characterName: string;
  expiresAt: number;
}

export function NeighborFarmModal({
  characterId,
  onClose,
}: NeighborFarmModalProps) {
  const detailQuery = useFarmNeighborDetail(characterId);
  const stealMutation = useStealFromNeighbor();
  const nowMs = useFarmAdjustedNow();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toast, setToast] = useState<StealToast | null>(null);
  const [giftOpen, setGiftOpen] = useState(false);

  // 跟着 toast.expiresAt 走带 cleanup 的定时器；之前用裸 setTimeout，关掉模态或快连
  // 偷两次会留下野定时器，要么把后一个 toast 提前抹掉，要么对已卸载组件 setState。
  useEffect(() => {
    if (!toast) return;
    const remaining = toast.expiresAt - Date.now();
    if (remaining <= 0) {
      setToast(null);
      return;
    }
    const timer = window.setTimeout(() => setToast(null), remaining);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    // 走查新一轮 R7：早返 `if (!characterId) return null` 原本在 useEffect 之前，
    // 5 个上方 hook 永远跑 + 后面 2 个 useEffect 在 characterId 为 null 时被
    // skip → characterId 由 null 翻成有值时 React 看到「上轮 5 个 hook，本轮
    // 7 个 hook」，throw `Rendered more hooks than during the previous render`，
    // 真机上点邻居农场首次会让 React tree 直接崩，需要刷新整页才能恢复。
    // 把 useEffect 全部提到早返之前，里面用 characterId 决定是否真的挂监听。
    if (!characterId) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, characterId]);

  if (!characterId) return null;

  function handleSteal(plot: FarmPlot) {
    if (!detailQuery.data) return;
    setErrorMsg(null);
    stealMutation.mutate(
      { characterId: characterId!, plotIndex: plot.index },
      {
        onSuccess: (result) => {
          playStealSwoosh();
          setToast({
            ...result.stolen,
            characterName: detailQuery.data!.characterName,
            expiresAt: Date.now() + 3500,
          });
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
        className="flex max-h-[85vh] w-full max-w-md flex-col rounded-t-3xl bg-white shadow-xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {detailQuery.isLoading && (
          <div className="flex items-center justify-center py-12 text-sm text-stone-400">
            {t(msg`正在串门……`)}
          </div>
        )}
        {detailQuery.error && (
          <div className="px-4 py-6 text-center text-sm text-rose-600">
            {(detailQuery.error as Error).message}
          </div>
        )}
        {detailQuery.data && (
          <>
            <header className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
              <div className="flex items-center gap-2">
                <AvatarChip
                  name={detailQuery.data.characterName}
                  src={detailQuery.data.characterAvatar}
                  size="sm"
                />
                <div>
                  <div className="text-sm font-semibold">
                    {detailQuery.data.characterName} {t(msg`的农场`)}
                  </div>
                  <div className="text-[11px] text-stone-500">
                    Lv.{detailQuery.data.level} · {t(msg`好感`)} {detailQuery.data.intimacyLevel} ·{" "}
                    {translateExpertDomains(
                      t,
                      detailQuery.data.expertDomains.slice(0, 2),
                      "slash",
                    ) || "—"}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setGiftOpen(true)}
                  className="rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-700 hover:bg-amber-200"
                >
                  🎁 {t(msg`送礼`)}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full px-2 py-1 text-sm text-stone-500 hover:bg-stone-100"
                >
                  {t(msg`关闭`)}
                </button>
              </div>
            </header>

            {errorMsg && (
              <div className="bg-rose-50 px-4 py-2 text-xs text-rose-600">
                {errorMsg}
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-4 py-3">
              <div className="mb-3 grid grid-cols-3 gap-2">
                {detailQuery.data.plots.map((plot) => {
                  const isRipe =
                    plot.cropId != null &&
                    plot.maturedAt != null &&
                    nowMs >= plot.maturedAt;
                  const isRotten =
                    plot.cropId != null &&
                    plot.plantedAt != null &&
                    plot.maturedAt != null &&
                    nowMs >= plot.maturedAt + 24 * 3600 * 1000;
                  const stage = plot.cropId
                    ? isRotten
                      ? "rotten"
                      : isRipe
                        ? "ripe"
                        : plot.stage
                    : "empty";
                  const def = plot.cropId
                    ? FARM_CROP_CATALOG[plot.cropId]
                    : null;
                  const alreadyStolen = (plot.stolenBy ?? []).includes(
                    "owner",
                  );
                  const canSteal = isRipe && !isRotten && !alreadyStolen;
                  return (
                    <button
                      key={plot.index}
                      type="button"
                      disabled={!canSteal || stealMutation.isPending}
                      onClick={() => canSteal && handleSteal(plot)}
                      className={[
                        "relative flex aspect-square flex-col items-center justify-center rounded-xl border-2 px-1 py-1 text-center text-[10px] transition",
                        canSteal
                          ? "border-amber-400 bg-amber-50 hover:bg-amber-100"
                          : "border-stone-200 bg-stone-50",
                        isRotten ? "opacity-60" : "",
                      ].join(" ")}
                    >
                      <span className="text-2xl">
                        {getStageEmoji(stage, plot.cropId)}
                      </span>
                      <span className="mt-0.5 text-[10px] text-stone-500">
                        {!plot.cropId
                          ? t(msg`空`)
                          : isRotten
                            ? t(msg`腐烂`)
                            : isRipe
                              ? alreadyStolen
                                ? t(msg`已偷过`)
                                : t(msg`可顺`)
                              : plot.maturedAt
                                ? formatRemainingMs(plot.maturedAt - nowMs)
                                : ""}
                      </span>
                      {def && (
                        <span className="text-[9px] text-stone-400">
                          {def.nameZh}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="text-center text-[11px] text-stone-400">
                {t(msg`点击成熟（金边）田块即可顺走一份。每天最多 10 次，对方对你的好感度会降。`)}
              </p>

              {detailQuery.data.recentEvents.length > 0 && (
                <section className="mt-4">
                  <h3 className="mb-1 text-xs font-medium text-stone-500">
                    {t(msg`近期动向`)}
                  </h3>
                  <ul className="space-y-1 text-[11px] text-stone-500">
                    {detailQuery.data.recentEvents.slice(0, 5).map((event) => (
                      <li key={event.id} className="rounded-md bg-stone-50 px-2 py-1">
                        <span className="text-stone-400 mr-1">
                          {new Date(event.createdAt).toLocaleString("zh-CN", {
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {renderEventSummary(event)}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </>
        )}
      </div>

      {toast && (
        <div className="pointer-events-none fixed bottom-20 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-amber-600 px-4 py-2 text-sm text-white shadow-lg">
          {t(msg`顺走`)} {FARM_CROP_CATALOG[toast.cropId].nameZh} ×{toast.amount} ·
          🪙+{toast.coinsGained} · {toast.characterName} {t(msg`好感`)}{toast.intimacyDelta}
        </div>
      )}
      <GiftSheet
        neighbor={detailQuery.data ?? null}
        open={giftOpen}
        onClose={() => setGiftOpen(false)}
      />
    </div>
  );
}

function renderEventSummary(event: {
  kind: string;
  actorName: string;
  cropId?: string | null;
  payload?: Record<string, unknown> | null;
}): string {
  const cropName = event.cropId
    ? FARM_CROP_CATALOG[event.cropId as FarmCropId]?.nameZh ?? event.cropId
    : "";
  switch (event.kind) {
    case "plant":
      return `${event.actorName} ${t(msg`种了`)} ${cropName}`;
    case "harvest":
      return `${event.actorName} ${t(msg`收了`)} ${cropName || t(msg`作物`)}`;
    case "steal":
      return `${event.actorName} ${t(msg`顺走了`)} ${cropName || t(msg`作物`)}`;
    case "water":
      return `${event.actorName} ${t(msg`浇了水`)}`;
    case "weed":
      return `${event.actorName} ${t(msg`除了草`)}`;
    case "debug":
      return `${event.actorName} ${t(msg`除了虫`)}`;
    case "buy":
      return `${event.actorName} ${t(msg`进了种子`)}`;
    case "sell":
      return `${event.actorName} ${t(msg`卖了`)} ${cropName || t(msg`作物`)}`;
    case "level_up":
      return `${event.actorName} ${t(msg`升级了`)}`;
    case "intimacy_change":
      return t(msg`好感度变化`);
    case "fertilize":
      return `${event.actorName} ${t(msg`施了肥`)}`;
    case "pesticide":
      return `${event.actorName} ${t(msg`喷了农药`)}`;
    case "uproot":
      return `${event.actorName} ${t(msg`铲掉了作物`)}`;
    case "decorate":
      return `${event.actorName} ${t(msg`摆了一件装饰`)}`;
    default:
      return event.kind;
  }
}
