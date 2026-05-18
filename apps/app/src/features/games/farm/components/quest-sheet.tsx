import { useEffect, useState } from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { useClaimFarmQuest, useFarmQuests } from "../use-farm-state";

const t = translateRuntimeMessage;

interface QuestSheetProps {
  open: boolean;
  onClose: () => void;
}

export function QuestSheet({ open, onClose }: QuestSheetProps) {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [tab, setTab] = useState<"daily" | "achievement">("daily");
  const query = useFarmQuests();
  const claim = useClaimFarmQuest();

  useEffect(() => {
    if (!open) return;
    setErrorMsg(null);
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const all = query.data?.quests ?? [];
  const items = all.filter((q) => q.kind === tab);

  function handleClaim(questId: string) {
    setErrorMsg(null);
    claim.mutate(
      { questId },
      { onError: (err) => setErrorMsg((err as Error).message) },
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
          <h2 className="text-base font-semibold">📋 {t(msg`任务`)}</h2>
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
            onClick={() => setTab("daily")}
            className={`rounded-full px-3 py-1 text-xs ${
              tab === "daily" ? "bg-emerald-600 text-white" : "bg-stone-100 text-stone-600"
            }`}
          >
            🌅 {t(msg`日常`)}
          </button>
          <button
            type="button"
            onClick={() => setTab("achievement")}
            className={`rounded-full px-3 py-1 text-xs ${
              tab === "achievement"
                ? "bg-emerald-600 text-white"
                : "bg-stone-100 text-stone-600"
            }`}
          >
            🏅 {t(msg`成就`)}
          </button>
        </div>
        {errorMsg && (
          <div className="bg-rose-50 px-4 py-2 text-xs text-rose-600">{errorMsg}</div>
        )}
        <ul className="flex-1 overflow-y-auto px-2 py-2">
          {query.isLoading && (
            <li className="px-3 py-3 text-xs text-stone-500">{t(msg`加载中…`)}</li>
          )}
          {items.length === 0 && !query.isLoading && (
            <li className="px-3 py-3 text-xs text-stone-400">
              {t(msg`暂无任务`)}
            </li>
          )}
          {items.map((q) => {
            const pct = Math.min(100, Math.round((q.progress / Math.max(1, q.goal)) * 100));
            const done = q.progress >= q.goal;
            return (
              <li
                key={q.id}
                className="flex flex-col gap-1 border-b border-stone-100 px-2 py-2 last:border-b-0"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{q.nameZh}</span>
                  <span className="text-xs text-stone-500">
                    {q.progress} / {q.goal}
                  </span>
                </div>
                <span className="text-[11px] text-stone-500">{q.descriptionZh}</span>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-200">
                  <div
                    className={`h-full ${done ? "bg-emerald-500" : "bg-amber-400"} transition-all`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px]">
                  <span className="text-stone-500">
                    🪙{q.rewardCoins}
                    {q.rewardExperience > 0 && ` · ✨${q.rewardExperience}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleClaim(q.id)}
                    disabled={!done || q.claimed || claim.isPending}
                    className={`rounded-full px-3 py-1 text-[11px] font-medium ${
                      q.claimed
                        ? "bg-stone-100 text-stone-400"
                        : done
                          ? "bg-emerald-600 text-white hover:bg-emerald-700"
                          : "bg-stone-100 text-stone-400"
                    }`}
                  >
                    {q.claimed
                      ? t(msg`已领取`)
                      : done
                        ? t(msg`领取奖励`)
                        : t(msg`未完成`)}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
