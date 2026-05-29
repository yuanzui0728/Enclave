import { useMemo, useState } from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import type { FarmPlayerStateView } from "@yinjie/contracts";
import { useFarmAdjustedNow } from "../farm-clock-context";

const t = translateRuntimeMessage;

interface FarmMascotProps {
  state: FarmPlayerStateView;
}

export function FarmMascot({ state }: FarmMascotProps) {
  const nowMs = useFarmAdjustedNow();
  // farm-clock-context 每秒推一次 nowMs，原来用 nowMs 做 useMemo 依赖
  // → 每秒重跑 buildMessages（5 次 state.plots.filter + 1 次 reduce），
  // 12 块田 ×5 filter ×60/min = 3600 操作/分钟全是浪费。messages 只在
  // 小时段切换时才会变内容，按 5 分钟桶做依赖即可。
  const timeBucket = Math.floor(nowMs / (5 * 60 * 1000));
  const messages = useMemo(() => buildMessages(state, nowMs), [state, timeBucket]); // eslint-disable-line react-hooks/exhaustive-deps
  const [cursor, setCursor] = useState(0);
  const message = messages[cursor % messages.length] ?? "";

  return (
    <button
      type="button"
      // 移动端 top-20 (80px) 会盖住 header + CoinDisplay 右侧的等级 pill；
      // 隐界农场是独立页（不挂 /tabs 底部 nav），所以挪到右下不挡其它任何东西。
      // 桌面端用 lg:absolute 钉在 FarmSky 右上角小按钮，需要显式 lg:bottom-auto
      // 把上一行的 bottom 重置掉，否则同时设置 top+bottom 会被 absolute 拉伸成竖条。
      className="farm-mascot group fixed right-4 z-30 flex items-end gap-2 lg:absolute lg:right-2 lg:top-2 lg:bottom-auto"
      style={{ bottom: "max(1rem, env(safe-area-inset-bottom, 0px))" }}
      onClick={() => setCursor((c) => c + 1)}
      title={t(msg`点我换一句`)}
    >
      <span className="farm-mascot__bubble pointer-events-none max-w-[180px] rounded-2xl rounded-br-sm bg-white/90 px-3 py-1.5 text-[length:var(--text-eyebrow)] text-stone-700 shadow-md backdrop-blur-sm">
        {message}
      </span>
      <span className="farm-mascot__avatar relative grid h-12 w-12 place-items-center rounded-full bg-amber-100 text-3xl shadow-md ring-2 ring-white">
        🦊
        <span className="farm-mascot__tag absolute -bottom-1 right-0 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-medium text-white">
          {t(msg`管家`)}
        </span>
      </span>

      <style>{`
        .farm-mascot__avatar {
          animation: farm-mascot-bob 3.4s ease-in-out infinite;
        }
        .farm-mascot:hover .farm-mascot__avatar {
          animation-play-state: paused;
          transform: scale(1.05);
        }
        @keyframes farm-mascot-bob {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-3px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .farm-mascot__avatar { animation: none; }
        }
      `}</style>
    </button>
  );
}

function buildMessages(state: FarmPlayerStateView, nowMs: number): string[] {
  const messages: string[] = [];
  const ripeCount = state.plots.filter(
    (p) => p.cropId && p.maturedAt != null && nowMs >= p.maturedAt && nowMs < p.maturedAt + 24 * 3600 * 1000,
  ).length;
  const rottenCount = state.plots.filter(
    (p) => p.cropId && p.maturedAt != null && nowMs >= p.maturedAt + 24 * 3600 * 1000,
  ).length;
  const weedCount = state.plots.reduce((acc, p) => acc + (p.weeds || 0), 0);
  const bugCount = state.plots.reduce((acc, p) => acc + (p.bugs || 0), 0);
  // weeklyStolenLog 同时记两边：玩家自己偷 NPC（thiefCharacterId='owner'）和 NPC
  // 偷玩家（thiefCharacterId=NPC_id）。提醒"今天来顺过你的菜"显然只该说后者，
  // 否则管家会冒出"我 今天来顺过你的菜"这种自言自语。
  const stolenRecently = state.weeklyStolenLog.filter(
    (entry) =>
      entry.thiefCharacterId !== "owner" &&
      nowMs - entry.atMs < 12 * 3600 * 1000,
  );
  const hour = new Date(nowMs).getHours();

  if (ripeCount > 0) {
    messages.push(t(msg`喵——有 ${ripeCount} 块田熟了，趁热收吧。`));
  }
  if (rottenCount > 0) {
    messages.push(t(msg`糟糕，${rottenCount} 块田已经坏掉了，铲了重种？`));
  }
  if (weedCount > 0 && bugCount > 0) {
    messages.push(t(msg`田里 ${weedCount} 处杂草、${bugCount} 只虫子，记得清一下。`));
  } else if (weedCount > 0) {
    messages.push(t(msg`田里 ${weedCount} 处杂草，记得清一下。`));
  } else if (bugCount > 0) {
    messages.push(t(msg`田里 ${bugCount} 只虫子，记得清一下。`));
  }
  if (stolenRecently.length > 0) {
    const first = stolenRecently[0]!;
    const thiefName = first.thiefName;
    messages.push(t(msg`提醒一下：${thiefName} 今天来顺过你的菜。`));
  }

  // 时段补一句
  if (hour < 6) {
    messages.push(t(msg`夜深了，作物也在睡觉，浇个水就回去歇会儿吧。`));
  } else if (hour < 11) {
    messages.push(t(msg`早上阳光好，正适合浇水。`));
  } else if (hour < 14) {
    messages.push(t(msg`中午阳光毒，浇水容易蒸发，等下午吧。`));
  } else if (hour < 19) {
    messages.push(t(msg`下午是好时候，串串门、看看邻居？`));
  } else {
    messages.push(t(msg`入夜啦，记得防一下夜里来串门的人。`));
  }

  // 兜底
  if (messages.length === 0) {
    messages.push(t(msg`今天没啥事儿，世界角色们各自忙各自的。`));
  }

  return messages;
}
