import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import {
  fetchCommunityGameBoard,
  type CommunityGameBoardItem,
} from "@yinjie/contracts";

const t = translateRuntimeMessage;

/**
 * 隐界游戏板块里的「社区共创」区：拉 cloud-api 全局板块，展示 wiki 用户用自然
 * 语言创作并发布的 embedded_web 游戏，点开走 /tabs/games/play/$gameId 在沙箱里玩。
 * 自包含：拉取失败 / 为空时静默不渲染，不影响原有静态游戏区。
 */
export function CommunityGamesSection() {
  const navigate = useNavigate();
  const [games, setGames] = useState<CommunityGameBoardItem[]>([]);

  useEffect(() => {
    let alive = true;
    fetchCommunityGameBoard()
      .then((res) => {
        if (alive && res?.games) setGames(res.games);
      })
      .catch(() => {
        /* 板块未上线 / 网络异常：静默降级 */
      });
    return () => {
      alive = false;
    };
  }, []);

  if (games.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-[color:var(--yj-text,#1e143a)]">
          {t(msg`社区共创`)}
        </h2>
        <span className="text-xs text-[color:var(--yj-text-muted,#776a9a)]">
          {t(msg`大家用一句话造的游戏`)}
        </span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {games.map((g) => (
          <button
            key={g.gameId}
            type="button"
            onClick={() =>
              void navigate({
                to: "/tabs/games/play/$gameId",
                params: { gameId: g.gameId },
              })
            }
            className="flex w-44 shrink-0 flex-col gap-1 rounded-2xl border border-black/5 bg-white/70 p-3 text-left shadow-sm"
          >
            <div className="truncate text-sm font-semibold text-[color:var(--yj-text,#1e143a)]">
              {g.name}
            </div>
            <div className="line-clamp-2 text-xs text-[color:var(--yj-text-muted,#776a9a)]">
              {g.slogan}
            </div>
            <div className="mt-auto truncate text-[10px] text-[color:var(--yj-text-muted,#8e81b0)]">
              {g.authorDisplayName
                ? t(msg`作者 ${g.authorDisplayName}`)
                : t(msg`社区作品`)}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
