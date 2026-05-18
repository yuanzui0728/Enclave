import { useEffect, useState } from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import type { FarmLeaderboardType } from "@yinjie/contracts";
import { useFarmLeaderboard } from "../use-farm-state";

const t = translateRuntimeMessage;

interface LeaderboardSheetProps {
  open: boolean;
  onClose: () => void;
}

const TAB_OPTIONS: Array<{ id: FarmLeaderboardType; label: () => string; emoji: string }> = [
  { id: "level", label: () => t(msg`等级`), emoji: "📈" },
  { id: "harvest", label: () => t(msg`总收获`), emoji: "🌾" },
  { id: "coins", label: () => t(msg`金币`), emoji: "🪙" },
];

export function LeaderboardSheet({ open, onClose }: LeaderboardSheetProps) {
  const [tab, setTab] = useState<FarmLeaderboardType>("level");
  const query = useFarmLeaderboard(tab);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const entries = query.data?.entries ?? [];
  const ownerRank = query.data?.ownerRank ?? 0;

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
          <h2 className="text-base font-semibold">🏆 {t(msg`排行榜`)}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-2 py-1 text-sm text-stone-500 hover:bg-stone-100"
          >
            {t(msg`关闭`)}
          </button>
        </header>
        <div className="flex gap-1 border-b border-stone-100 px-4 py-2">
          {TAB_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setTab(opt.id)}
              className={`rounded-full px-3 py-1 text-xs ${
                tab === opt.id
                  ? "bg-emerald-600 text-white"
                  : "bg-stone-100 text-stone-600"
              }`}
            >
              {opt.emoji} {opt.label()}
            </button>
          ))}
        </div>
        {ownerRank > 0 && (
          <div className="bg-amber-50 px-4 py-2 text-xs text-amber-700">
            {t(msg`你目前排名第`)} {ownerRank}
          </div>
        )}
        <ul className="flex-1 overflow-y-auto px-2 py-2">
          {query.isLoading && (
            <li className="px-4 py-3 text-xs text-stone-500">{t(msg`加载中…`)}</li>
          )}
          {query.error && (
            <li className="px-4 py-3 text-xs text-rose-500">
              {(query.error as Error).message}
            </li>
          )}
          {entries.map((entry) => {
            const metric =
              tab === "level"
                ? entry.level
                : tab === "harvest"
                  ? entry.totalHarvested
                  : entry.coins;
            const metricSuffix =
              tab === "level"
                ? t(msg`级`)
                : tab === "harvest"
                  ? t(msg`个`)
                  : "🪙";
            return (
              <li
                key={entry.characterId ?? "owner"}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 ${
                  entry.isOwner
                    ? "bg-emerald-50 ring-1 ring-emerald-200"
                    : ""
                }`}
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                    entry.rank === 1
                      ? "bg-amber-100 text-amber-700"
                      : entry.rank === 2
                        ? "bg-stone-100 text-stone-700"
                        : entry.rank === 3
                          ? "bg-orange-100 text-orange-700"
                          : "bg-stone-50 text-stone-500"
                  }`}
                >
                  {entry.rank}
                </span>
                {entry.avatar ? (
                  <img
                    src={entry.avatar}
                    alt=""
                    className="h-7 w-7 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-stone-100 text-sm">
                    {entry.isOwner ? "🧑‍🌾" : "🙂"}
                  </span>
                )}
                <span className="flex-1 truncate text-sm">
                  {entry.isOwner ? t(msg`我`) : entry.name}
                </span>
                <span className="text-xs text-stone-500">
                  Lv.{entry.level}
                </span>
                <span className="text-sm font-medium text-emerald-700">
                  {metric.toLocaleString()} {metricSuffix}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
