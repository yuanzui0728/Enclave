import { msg } from "@lingui/macro";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { Button, InlineNotice, cn } from "@yinjie/ui";
import { Copy, Play, Share2 } from "lucide-react";
import { AvatarChip } from "../../../components/avatar-chip";
import {
  EmbeddedGameSlot,
  hasEmbeddedGame,
} from "../../games/embedded-game-registry";
import {
  gameCenterFeaturedGameIds,
  gameCenterFriendActivities,
  gameCenterHotRankings,
  gameCenterNewRankings,
  getGameCenterGame,
  getGameCenterToneStyle,
  type GameCenterFriendActivity,
  type GameCenterGame,
} from "../../games/game-center-data";

type NoticeActionState = {
  label: string;
  message: string;
  onAction: () => void;
};

type DesktopGamesWorkspaceProps = {
  selectedGameId: string;
  activeGameId: string | null;
  recentGameIds: string[];
  friendInviteStatusByActivityId: Record<string, string>;
  successNotice?: string;
  noticeTone?: "success" | "info";
  noticeActionState?: NoticeActionState | null;
  onSelectGame: (gameId: string) => void;
  onLaunchGame: (gameId: string) => void;
  onInviteFriend: (activityId: string) => void;
  onCopyGameToMobile: (gameId: string) => void;
  onDismissActiveGame: () => void;
  nativeMobileShareSupported: boolean;
};

function resolveGames(ids: string[]) {
  return ids
    .map((id) => getGameCenterGame(id))
    .filter((game): game is GameCenterGame => Boolean(game));
}

export function DesktopGamesWorkspace({
  selectedGameId,
  activeGameId,
  recentGameIds,
  friendInviteStatusByActivityId,
  successNotice,
  noticeTone = "success",
  noticeActionState,
  onSelectGame,
  onLaunchGame,
  onInviteFriend,
  onCopyGameToMobile,
  onDismissActiveGame,
  nativeMobileShareSupported,
}: DesktopGamesWorkspaceProps) {
  const t = useRuntimeTranslator();
  const featuredGames = resolveGames(gameCenterFeaturedGameIds);
  const selectedGame =
    getGameCenterGame(selectedGameId) ?? featuredGames[0] ?? null;

  if (!selectedGame) {
    return null;
  }

  const recentGames = resolveGames(recentGameIds);
  const myGames =
    recentGames.length > 0 ? recentGames : featuredGames.slice(0, 6);
  // 当「我的游戏」用 recents 接管时，featured[0]（隐界农场）不再出现在「我的游戏」里，
  // 此时「精选小游戏」需要把整份 featured 都展出来，否则 featured[0] 会从侧栏整段消失。
  const featuredRest =
    recentGames.length > 0 ? featuredGames : featuredGames.slice(1);
  const detailFriends = gameCenterFriendActivities.filter(
    (activity) => activity.gameId === selectedGame.id,
  );
  const isEmbeddedActive =
    activeGameId === selectedGame.id && hasEmbeddedGame(activeGameId);
  const isActive = activeGameId === selectedGame.id;
  const tone = getGameCenterToneStyle(selectedGame.tone);

  const launchLabel = isEmbeddedActive
    ? t(msg`退出游戏`)
    : isActive
      ? t(msg`继续玩`)
      : t(msg`开始游戏`);
  const handleLaunchClick = () => {
    if (isEmbeddedActive) {
      onDismissActiveGame();
      return;
    }
    onLaunchGame(selectedGame.id);
  };

  return (
    <div className="flex h-full min-h-0 bg-[color:var(--bg-app)]">
      {/* Left: list panel */}
      <aside className="flex w-[320px] shrink-0 flex-col border-r border-[color:var(--border-faint)] bg-white">
        <div className="flex items-center justify-between border-b border-[color:var(--border-faint)] px-4 py-3">
          <span className="text-[16px] font-semibold text-[color:var(--text-primary)]">
            {t(msg`游戏`)}
          </span>
          <button
            type="button"
            onClick={() => onCopyGameToMobile(selectedGame.id)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--text-secondary)] hover:bg-[rgba(0,0,0,0.04)]"
            aria-label={
              nativeMobileShareSupported
                ? t(msg`分享当前游戏`)
                : t(msg`复制游戏入口`)
            }
          >
            {nativeMobileShareSupported ? (
              <Share2 size={16} />
            ) : (
              <Copy size={16} />
            )}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto pb-4">
          {myGames.length > 0 ? (
            <>
              <DesktopSectionHeader title={t(msg`我的游戏`)} />
              <ul>
                {myGames.map((game) => (
                  <DesktopGameRow
                    key={`my-${game.id}`}
                    game={game}
                    active={game.id === selectedGame.id}
                    onClick={() => onSelectGame(game.id)}
                  />
                ))}
              </ul>
            </>
          ) : null}

          {gameCenterFriendActivities.length > 0 ? (
            <>
              <DesktopSectionHeader title={t(msg`好友在玩`)} />
              <ul>
                {gameCenterFriendActivities.map((activity) => {
                  const game = getGameCenterGame(activity.gameId);
                  if (!game) return null;
                  return (
                    <DesktopFriendListRow
                      key={`friend-${activity.id}`}
                      activity={activity}
                      game={game}
                      active={game.id === selectedGame.id}
                      onClick={() => onSelectGame(game.id)}
                    />
                  );
                })}
              </ul>
            </>
          ) : null}

          {featuredRest.length > 0 ? (
            <>
              <DesktopSectionHeader title={t(msg`精选小游戏`)} />
              <ul>
                {featuredRest.map((game) => (
                  <DesktopGameRow
                    key={`featured-${game.id}`}
                    game={game}
                    active={game.id === selectedGame.id}
                    onClick={() => onSelectGame(game.id)}
                    showSlogan
                  />
                ))}
              </ul>
            </>
          ) : null}

          <DesktopSectionHeader title={t(msg`热门小游戏`)} />
          <ul>
            {gameCenterHotRankings.map((entry) => {
              const game = getGameCenterGame(entry.gameId);
              if (!game) return null;
              return (
                <DesktopGameRow
                  key={`hot-${entry.gameId}`}
                  game={game}
                  rank={entry.rank}
                  active={game.id === selectedGame.id}
                  onClick={() => onSelectGame(game.id)}
                  showSlogan
                />
              );
            })}
          </ul>

          <DesktopSectionHeader title={t(msg`新游榜`)} />
          <ul>
            {gameCenterNewRankings.map((entry) => {
              const game = getGameCenterGame(entry.gameId);
              if (!game) return null;
              return (
                <DesktopGameRow
                  key={`new-${entry.gameId}`}
                  game={game}
                  rank={entry.rank}
                  active={game.id === selectedGame.id}
                  onClick={() => onSelectGame(game.id)}
                  showSlogan
                />
              );
            })}
          </ul>
        </div>
      </aside>

      {/* Right: detail */}
      <section className="flex min-w-0 flex-1 flex-col bg-[#f5f5f5]">
        <div className="flex items-center justify-between border-b border-[color:var(--border-faint)] bg-white px-6 py-3">
          <span className="text-[15px] font-semibold text-[color:var(--text-primary)]">
            {selectedGame.name}
          </span>
          <button
            type="button"
            onClick={() => onCopyGameToMobile(selectedGame.id)}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[color:var(--border-subtle)] bg-white px-3 text-[12px] font-medium text-[color:var(--text-secondary)] hover:bg-[rgba(0,0,0,0.02)]"
            aria-label={
              nativeMobileShareSupported
                ? t(msg`分享当前游戏`)
                : t(msg`复制游戏入口`)
            }
          >
            {nativeMobileShareSupported ? (
              <Share2 size={14} />
            ) : (
              <Copy size={14} />
            )}
            {nativeMobileShareSupported ? t(msg`系统分享`) : t(msg`复制入口`)}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-8 py-6">
          <div className="mx-auto w-full max-w-[760px] space-y-5">
            <div
              className={cn(
                "relative overflow-hidden rounded-[18px] p-6 shadow-none",
                tone.heroCardClassName,
              )}
              style={{ aspectRatio: "16 / 6" }}
            >
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute -right-12 top-0 h-44 w-44 rounded-full bg-white/12 blur-3xl" />
                <div className="absolute bottom-0 left-12 h-32 w-32 rounded-full bg-black/10 blur-3xl" />
              </div>
              <div className="relative flex h-full flex-col justify-end">
                <div className="inline-flex w-fit rounded-full border border-white/18 bg-white/15 px-2.5 py-0.5 text-[11px] font-medium tracking-[0.08em] text-white/85">
                  {selectedGame.badge}
                </div>
                <div className="mt-3 text-[24px] font-semibold leading-tight text-white">
                  {selectedGame.name}
                </div>
                <div className="mt-1.5 text-[14px] leading-snug text-white/85">
                  {selectedGame.slogan}
                </div>
              </div>
            </div>

            {selectedGame.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {selectedGame.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-[color:var(--border-faint)] bg-white px-2.5 py-0.5 text-[11px] text-[color:var(--text-secondary)]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="grid grid-cols-3 gap-3">
              <DesktopMetricCell
                label={t(msg`玩家热度`)}
                value={selectedGame.playersLabel}
              />
              <DesktopMetricCell
                label={t(msg`好友在玩`)}
                value={selectedGame.friendsLabel}
              />
              <DesktopMetricCell
                label={t(msg`更新状态`)}
                value={selectedGame.updateNote}
              />
            </div>

            {!isEmbeddedActive ? (
              <p className="text-[14px] leading-[1.65rem] text-[color:var(--text-secondary)]">
                {selectedGame.description}
              </p>
            ) : null}

            {!isEmbeddedActive ? (
              <div>
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleLaunchClick}
                  className="h-11 rounded-full bg-[#07C160] px-6 text-[14px] font-medium text-white hover:bg-[#06ad57]"
                >
                  <Play size={16} />
                  {launchLabel}
                </Button>
              </div>
            ) : null}

            {successNotice ? (
              <InlineNotice
                tone={noticeTone}
                className="rounded-[10px] px-3 py-2 text-[12px] leading-[1.4rem] shadow-none"
              >
                {noticeTone === "info" &&
                noticeActionState &&
                noticeActionState.message === successNotice ? (
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 flex-1">{successNotice}</span>
                    <button
                      type="button"
                      onClick={noticeActionState.onAction}
                      className="shrink-0 rounded-full border border-[rgba(15,23,42,0.08)] bg-white px-2.5 py-0.5 text-[11px] font-medium text-[color:var(--text-secondary)]"
                    >
                      {noticeActionState.label}
                    </button>
                  </div>
                ) : (
                  successNotice
                )}
              </InlineNotice>
            ) : null}

            {isEmbeddedActive && activeGameId ? (
              <div className="overflow-hidden rounded-[16px] border border-[color:var(--border-subtle)] bg-white">
                <EmbeddedGameSlot
                  gameId={activeGameId}
                  onExit={onDismissActiveGame}
                />
              </div>
            ) : null}

            {detailFriends.length > 0 ? (
              <section className="rounded-[16px] border border-[color:var(--border-faint)] bg-white">
                <div className="border-b border-[color:var(--border-faint)] px-4 py-2.5 text-[13px] font-medium text-[color:var(--text-primary)]">
                  {t(msg`正在玩 ${selectedGame.name} 的好友`)}
                </div>
                <ul>
                  {detailFriends.map((activity) => (
                    <DesktopFriendDetailRow
                      key={activity.id}
                      activity={activity}
                      invited={Boolean(
                        friendInviteStatusByActivityId[activity.id],
                      )}
                      onInvite={() => onInviteFriend(activity.id)}
                    />
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function DesktopSectionHeader({ title }: { title: string }) {
  return (
    <div className="px-4 pb-1.5 pt-4 text-[12px] font-medium text-[color:var(--text-muted)]">
      {title}
    </div>
  );
}

function DesktopGameAvatar({
  game,
  size = "sm",
}: {
  game: GameCenterGame;
  size?: "sm" | "md";
}) {
  const tone = getGameCenterToneStyle(game.tone);
  const sizeClass =
    size === "md"
      ? "h-10 w-10 rounded-[10px] text-[15px]"
      : "h-8 w-8 rounded-[8px] text-[13px]";
  // 用 game.id 的首字符做 avatar，跟 locale 无关。早前 [...game.name][0]
  // 在 en/ja/ko locale 也会落到中文，因为 game.name 是模块加载时算好的。
  const initial = (game.id[0] ?? "?").toUpperCase();
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center font-semibold",
        sizeClass,
        tone.iconClassName,
      )}
    >
      {initial}
    </div>
  );
}

function DesktopGameRow({
  game,
  active,
  onClick,
  rank,
  showSlogan,
}: {
  game: GameCenterGame;
  active: boolean;
  onClick: () => void;
  rank?: number;
  showSlogan?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-full items-center gap-2.5 px-4 py-2 text-left transition",
          active
            ? "bg-[rgba(7,193,96,0.08)] shadow-[inset_3px_0_0_0_var(--brand-primary)]"
            : "hover:bg-[rgba(0,0,0,0.03)]",
        )}
      >
        {typeof rank === "number" ? (
          <span
            className={cn(
              "w-4 shrink-0 text-center text-[12px] font-semibold tabular-nums",
              rank <= 3
                ? "text-[#d65e2f]"
                : "text-[color:var(--text-muted)]",
            )}
          >
            {rank}
          </span>
        ) : null}
        <DesktopGameAvatar game={game} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium text-[color:var(--text-primary)]">
            {game.name}
          </div>
          {showSlogan ? (
            <div className="mt-0.5 truncate text-[11px] text-[color:var(--text-muted)]">
              {game.slogan}
            </div>
          ) : null}
        </div>
      </button>
    </li>
  );
}

function DesktopFriendListRow({
  activity,
  game,
  active,
  onClick,
}: {
  activity: GameCenterFriendActivity;
  game: GameCenterGame;
  active: boolean;
  onClick: () => void;
}) {
  const t = useRuntimeTranslator();
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-full items-center gap-2.5 px-4 py-2 text-left transition",
          active
            ? "bg-[rgba(7,193,96,0.08)] shadow-[inset_3px_0_0_0_var(--brand-primary)]"
            : "hover:bg-[rgba(0,0,0,0.03)]",
        )}
      >
        <AvatarChip
          name={activity.friendName}
          src={activity.friendAvatar}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium text-[color:var(--text-primary)]">
            {activity.friendName}
          </div>
          <div className="mt-0.5 truncate text-[11px] text-[color:var(--text-muted)]">
            {t(msg`正在玩 ${game.name}`)}
          </div>
        </div>
      </button>
    </li>
  );
}

function DesktopMetricCell({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[12px] border border-[color:var(--border-faint)] bg-white px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-[0.1em] text-[color:var(--text-muted)]">
        {label}
      </div>
      <div className="mt-1 text-[13px] font-medium leading-snug text-[color:var(--text-primary)]">
        {value}
      </div>
    </div>
  );
}

function DesktopFriendDetailRow({
  activity,
  invited,
  onInvite,
}: {
  activity: GameCenterFriendActivity;
  invited: boolean;
  onInvite: () => void;
}) {
  const t = useRuntimeTranslator();
  return (
    <li className="flex items-center gap-3 border-b border-[color:var(--border-faint)] px-4 py-3 last:border-b-0">
      <AvatarChip
        name={activity.friendName}
        src={activity.friendAvatar}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium text-[color:var(--text-primary)]">
          {activity.friendName}
        </div>
        <div className="mt-0.5 truncate text-[12px] text-[color:var(--text-muted)]">
          {activity.status}
        </div>
      </div>
      <button
        type="button"
        onClick={onInvite}
        className={cn(
          "h-8 shrink-0 rounded-full px-4 text-[12px] font-medium",
          invited
            ? "border border-[color:var(--border-subtle)] bg-white text-[color:var(--text-secondary)]"
            : "bg-[#07C160] text-white hover:bg-[#06ad57]",
        )}
      >
        {invited ? t(msg`已邀约`) : t(msg`邀请`)}
      </button>
    </li>
  );
}
