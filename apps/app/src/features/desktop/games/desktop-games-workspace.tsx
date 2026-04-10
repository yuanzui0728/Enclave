import type { ReactNode } from "react";
import type { ConversationListItem } from "@yinjie/contracts";
import {
  Button,
  InlineNotice,
  LoadingBlock,
  cn,
} from "@yinjie/ui";
import {
  Clock3,
  Flame,
  Gamepad2,
  Gift,
  Pin,
  Play,
  Sparkles,
  Trophy,
  UsersRound,
} from "lucide-react";
import { AvatarChip } from "../../../components/avatar-chip";
import {
  formatConversationTimestamp,
  formatTimestamp,
} from "../../../lib/format";
import { isPersistedGroupConversation } from "../../../lib/conversation-route";
import { EmptyState } from "../../../components/empty-state";
import { GameCenterSessionPanel } from "../../games/game-center-session-panel";
import {
  gameCenterCategoryTabs,
  gameCenterEvents,
  getGameCenterEventActionLabel,
  getGameCenterEventStatusLabel,
  gameCenterFriendActivities,
  gameCenterGames,
  gameCenterHotRankings,
  gameCenterNewRankings,
  getGameCenterGame,
  getGameCenterToneStyle,
  type GameCenterCategoryId,
} from "../../games/game-center-data";

type DesktopGamesWorkspaceProps = {
  activeCategory: GameCenterCategoryId;
  activeGameId: string | null;
  activeInviteActivityId: string | null;
  eventActionStatusById: Record<string, string>;
  friendInviteSentAtByActivityId: Record<string, string>;
  friendInviteStatusByActivityId: Record<string, string>;
  lastInviteConversationTitleByActivityId: Record<string, string>;
  inviteConversationCandidates: ConversationListItem[];
  inviteConversationCandidatesLoading: boolean;
  launchCountById: Record<string, number>;
  pinnedGameIds: string[];
  recentGameIds: string[];
  selectedGameId: string;
  lastOpenedAtById: Record<string, string>;
  successNotice?: string;
  noticeTone?: "success" | "info";
  onCategoryChange: (categoryId: GameCenterCategoryId) => void;
  onCompleteEventAction: (eventId: string) => void;
  onCopyInviteToMobile: (activityId: string) => void;
  onOpenInviteToChat: (activityId: string) => void;
  onSendInviteToConversation: (
    activityId: string,
    conversationId: string,
  ) => void;
  onInviteFriend: (activityId: string) => void;
  onCopyGameToMobile: (gameId: string) => void;
  onDismissActiveGame: () => void;
  onLaunchGame: (gameId: string) => void;
  onSelectGame: (gameId: string) => void;
  onTogglePinnedGame: (gameId: string) => void;
};

function resolveGames(ids: string[]) {
  return ids
    .map((id) => getGameCenterGame(id))
    .filter((game): game is NonNullable<typeof game> => Boolean(game));
}

export function DesktopGamesWorkspace({
  activeCategory,
  activeGameId,
  activeInviteActivityId,
  eventActionStatusById,
  friendInviteSentAtByActivityId,
  friendInviteStatusByActivityId,
  lastInviteConversationTitleByActivityId,
  inviteConversationCandidates,
  inviteConversationCandidatesLoading,
  launchCountById,
  pinnedGameIds,
  recentGameIds,
  selectedGameId,
  lastOpenedAtById,
  successNotice,
  noticeTone = "success",
  onCategoryChange,
  onCompleteEventAction,
  onCopyInviteToMobile,
  onOpenInviteToChat,
  onSendInviteToConversation,
  onInviteFriend,
  onCopyGameToMobile,
  onDismissActiveGame,
  onLaunchGame,
  onSelectGame,
  onTogglePinnedGame,
}: DesktopGamesWorkspaceProps) {
  const selectedGame =
    getGameCenterGame(selectedGameId) ?? getGameCenterGame("signal-squad");
  const activeInviteActivity = activeInviteActivityId
    ? gameCenterFriendActivities.find((item) => item.id === activeInviteActivityId) ??
      null
    : null;
  const activeInviteGame = activeInviteActivity
    ? getGameCenterGame(activeInviteActivity.gameId)
    : null;
  const pinnedGames = resolveGames(pinnedGameIds);
  const recentGames = resolveGames(recentGameIds);
  const browseGames =
    activeCategory === "featured"
      ? gameCenterGames.slice(0, 6)
      : gameCenterGames.filter((game) => game.category === activeCategory);

  if (!selectedGame) {
    return null;
  }

  const selectedTone = getGameCenterToneStyle(selectedGame.tone);
  const selectedPinned = pinnedGameIds.includes(selectedGame.id);

  return (
    <div className="flex h-full min-h-0 bg-[linear-gradient(180deg,rgba(248,252,249,0.98),rgba(255,247,239,0.96))]">
      <aside className="flex w-[284px] shrink-0 flex-col border-r border-[rgba(15,23,42,0.06)] bg-[rgba(255,255,255,0.82)]">
        <div className="border-b border-[rgba(15,23,42,0.06)] px-5 py-5">
          <div className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--brand-secondary)]">
            Game Center
          </div>
          <div className="mt-2 text-[22px] font-semibold text-[color:var(--text-primary)]">
            游戏中心
          </div>
          <div className="mt-2 text-[13px] leading-6 text-[color:var(--text-secondary)]">
            按微信桌面端频道工作区的逻辑组织推荐、最近玩过、固定常玩和活动位。
          </div>
        </div>

        <div className="min-h-0 space-y-4 overflow-auto px-4 py-4">
          <div className="rounded-[24px] border border-[rgba(15,23,42,0.06)] bg-white/92 p-4 shadow-[var(--shadow-soft)]">
            <div className="text-xs text-[color:var(--text-muted)]">浏览频道</div>
            <div className="mt-3 space-y-2">
              {gameCenterCategoryTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onCategoryChange(tab.id)}
                  className={cn(
                    "w-full rounded-[18px] border px-3 py-3 text-left transition",
                    activeCategory === tab.id
                      ? "border-[rgba(47,122,63,0.18)] bg-[rgba(244,252,247,0.94)] shadow-[var(--shadow-soft)]"
                      : "border-[rgba(15,23,42,0.06)] bg-[rgba(248,250,252,0.88)] hover:bg-white",
                  )}
                >
                  <div className="text-sm font-medium text-[color:var(--text-primary)]">
                    {tab.label}
                  </div>
                  <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
                    {tab.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[24px] border border-[rgba(15,23,42,0.06)] bg-white/92 p-4 shadow-[var(--shadow-soft)]">
            <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--text-primary)]">
              <Pin size={15} className="text-[color:var(--brand-secondary)]" />
              固定常玩
            </div>
            <div className="mt-3 space-y-2">
              {pinnedGames.length ? (
                pinnedGames.map((game) => {
                  const tone = getGameCenterToneStyle(game.tone);
                  return (
                    <button
                      key={game.id}
                      type="button"
                      onClick={() => onSelectGame(game.id)}
                      className={cn(
                        "w-full rounded-[18px] border px-3 py-3 text-left transition",
                        selectedGame.id === game.id
                          ? tone.mutedPanelClassName
                          : "border-[rgba(15,23,42,0.06)] bg-[rgba(248,250,252,0.88)] hover:bg-white",
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
                            {game.name}
                          </div>
                          <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                            {game.updateNote}
                          </div>
                        </div>
                        <div
                          className={cn(
                            "rounded-full border px-2 py-1 text-[10px] font-medium",
                            tone.badgeClassName,
                          )}
                        >
                          常玩
                        </div>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="rounded-[18px] border border-dashed border-[rgba(15,23,42,0.08)] px-3 py-4 text-xs leading-6 text-[color:var(--text-muted)]">
                  从推荐区把常玩的游戏固定到这里，桌面工作区就能更像微信的常驻入口。
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[24px] border border-[rgba(15,23,42,0.06)] bg-white/92 p-4 shadow-[var(--shadow-soft)]">
            <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--text-primary)]">
              <Clock3 size={15} className="text-[color:var(--brand-secondary)]" />
              最近玩过
            </div>
            <div className="mt-3 space-y-2">
              {recentGames.map((game) => (
                <button
                  key={game.id}
                  type="button"
                  onClick={() => onSelectGame(game.id)}
                  className={cn(
                    "w-full rounded-[18px] border border-[rgba(15,23,42,0.06)] px-3 py-3 text-left transition hover:bg-white",
                    selectedGame.id === game.id
                      ? "bg-[rgba(255,248,239,0.92)]"
                      : "bg-[rgba(248,250,252,0.88)]",
                  )}
                >
                  <div className="text-sm font-medium text-[color:var(--text-primary)]">
                    {game.name}
                  </div>
                  <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                    {lastOpenedAtById[game.id]
                      ? `上次打开 ${formatConversationTimestamp(lastOpenedAtById[game.id])}`
                      : "尚未打开"}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-[rgba(15,23,42,0.06)] px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-dim)]">
                微信式桌面节奏
              </div>
              <div className="mt-1 text-[20px] font-semibold text-[color:var(--text-primary)]">
                最近玩过、固定常玩、推荐位和活动位都放进一个工作区
              </div>
              <div className="mt-1 text-[12px] leading-6 text-[color:var(--text-muted)]">
                首版先不做小游戏运行容器，点击开始游戏会先记录使用状态并回到内容工作区。
              </div>
            </div>
            {successNotice ? <InlineNotice tone={noticeTone}>{successNotice}</InlineNotice> : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-6 py-6">
          <div className="grid gap-6 xl:grid-cols-[1.25fr_0.95fr]">
            <div className="space-y-6">
              <article
                className={cn(
                  "relative overflow-hidden rounded-[34px] p-6 shadow-[var(--shadow-section)]",
                  selectedTone.heroCardClassName,
                )}
              >
                <div className="pointer-events-none absolute inset-0">
                  <div className="absolute -right-10 top-0 h-40 w-40 rounded-full bg-white/12 blur-3xl" />
                  <div className="absolute bottom-0 left-10 h-32 w-32 rounded-full bg-black/10 blur-3xl" />
                </div>
                <div className="relative">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="inline-flex rounded-full border border-white/18 bg-white/12 px-3 py-1 text-[11px] font-medium tracking-[0.18em] text-white/82">
                        {selectedGame.heroLabel}
                      </div>
                      <div className="mt-4 text-[32px] font-semibold tracking-[0.02em]">
                        {selectedGame.name}
                      </div>
                      <div className="mt-2 max-w-2xl text-sm leading-7 text-white/82">
                        {selectedGame.description}
                      </div>
                    </div>
                    <div className="rounded-[24px] border border-white/18 bg-white/12 px-4 py-4 backdrop-blur-sm">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-white/68">
                        状态
                      </div>
                      <div className="mt-2 text-lg font-semibold">
                        {selectedGame.badge}
                      </div>
                      <div className="mt-2 text-xs leading-6 text-white/78">
                        {selectedGame.updateNote}
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-3 md:grid-cols-3">
                    <DesktopMetric label="玩家热度" value={selectedGame.playersLabel} />
                    <DesktopMetric label="社交热度" value={selectedGame.friendsLabel} />
                    <DesktopMetric label="工作室" value={selectedGame.studio} />
                  </div>

                  <div className="mt-6 flex flex-wrap gap-2">
                    {selectedGame.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-white/18 bg-white/10 px-3 py-1 text-xs text-white/80"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  <div className="mt-6 flex flex-wrap gap-3">
                    <Button
                      variant="secondary"
                      size="lg"
                      onClick={() => onLaunchGame(selectedGame.id)}
                      className="border-white/18 bg-white text-[color:var(--text-primary)] hover:bg-white/92"
                    >
                      <Play size={16} />
                      开始游戏
                    </Button>
                    <Button
                      variant="secondary"
                      size="lg"
                      onClick={() => onTogglePinnedGame(selectedGame.id)}
                      className="border-white/18 bg-white/10 text-white hover:bg-white/18"
                    >
                      <Pin size={16} />
                      {selectedPinned ? "取消固定" : "固定常玩"}
                    </Button>
                    <Button
                      variant="secondary"
                      size="lg"
                      onClick={() => onCopyGameToMobile(selectedGame.id)}
                      className="border-white/18 bg-white/10 text-white hover:bg-white/18"
                    >
                      发到手机
                    </Button>
                  </div>
                </div>
              </article>

              <section className="rounded-[30px] border border-[rgba(15,23,42,0.06)] bg-white/92 p-5 shadow-[var(--shadow-soft)]">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-[color:var(--text-primary)]">
                      {activeCategory === "featured" ? "推荐位" : "当前频道"}
                    </div>
                    <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">
                      {activeCategory === "featured"
                        ? "优先看编辑推荐、好友热玩和适合回流的项目。"
                        : "按当前频道继续筛选，让桌面端浏览更接近微信的游戏中心。"}
                    </div>
                  </div>
                  <div className="rounded-full bg-[rgba(255,138,61,0.08)] px-3 py-1 text-[11px] font-medium text-[color:var(--brand-primary)]">
                    {browseGames.length} 个入口
                  </div>
                </div>

                <div className="mt-4 grid gap-3 xl:grid-cols-2">
                  {browseGames.map((game) => {
                    const tone = getGameCenterToneStyle(game.tone);
                    const pinned = pinnedGameIds.includes(game.id);
                    return (
                      <article
                        key={game.id}
                        className={cn(
                          "rounded-[24px] border p-4 transition",
                          tone.mutedPanelClassName,
                        )}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <button
                            type="button"
                            onClick={() => onSelectGame(game.id)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <div className="flex items-center gap-2">
                              <div
                                className={cn(
                                  "rounded-full border px-2 py-1 text-[10px] font-medium",
                                  tone.badgeClassName,
                                )}
                              >
                                {game.deckLabel}
                              </div>
                              <div className="text-[11px] text-[color:var(--text-muted)]">
                                {game.playersLabel}
                              </div>
                            </div>
                            <div className="mt-3 text-base font-semibold text-[color:var(--text-primary)]">
                              {game.name}
                            </div>
                            <div className="mt-1 text-sm leading-7 text-[color:var(--text-secondary)]">
                              {game.slogan}
                            </div>
                          </button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => onLaunchGame(game.id)}
                            className="shrink-0"
                          >
                            秒开
                          </Button>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          {game.tags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full bg-white/82 px-2.5 py-1 text-[11px] text-[color:var(--text-muted)]"
                            >
                              {tag}
                            </span>
                          ))}
                          {pinned ? (
                            <span className="rounded-full bg-[rgba(47,122,63,0.1)] px-2.5 py-1 text-[11px] text-[#2f7a3f]">
                              已固定
                            </span>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>

              <div className="grid gap-4 lg:grid-cols-2">
                <DesktopRankingPanel
                  title="热门榜"
                  icon={<Flame size={16} className="text-[color:var(--brand-primary)]" />}
                  entries={gameCenterHotRankings}
                  onSelectGame={onSelectGame}
                />
                <DesktopRankingPanel
                  title="新游榜"
                  icon={<Sparkles size={16} className="text-[color:var(--brand-secondary)]" />}
                  entries={gameCenterNewRankings}
                  onSelectGame={onSelectGame}
                />
              </div>
            </div>

            <div className="space-y-5">
              <GameCenterSessionPanel
                game={selectedGame}
                isActive={activeGameId === selectedGame.id}
                launchCount={launchCountById[selectedGame.id] ?? 0}
                lastOpenedAt={lastOpenedAtById[selectedGame.id]}
                onCopyToMobile={onCopyGameToMobile}
                onDismiss={activeGameId === selectedGame.id ? onDismissActiveGame : undefined}
                onLaunch={onLaunchGame}
              />

              <section className="rounded-[30px] border border-[rgba(15,23,42,0.06)] bg-white/92 p-5 shadow-[var(--shadow-soft)]">
                <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--text-primary)]">
                  <UsersRound size={16} className="text-[color:var(--brand-secondary)]" />
                  好友在玩
                </div>
                <div className="mt-4 space-y-3">
                  {gameCenterFriendActivities.map((activity) => {
                    const game = getGameCenterGame(activity.gameId);
                    if (!game) {
                      return null;
                    }

                    return (
                      <div
                        key={activity.id}
                        className="flex w-full items-start gap-3 rounded-[22px] border border-[rgba(15,23,42,0.06)] bg-[rgba(248,250,252,0.9)] px-3 py-3 text-left transition hover:bg-white"
                      >
                        <button
                          type="button"
                          onClick={() => onSelectGame(game.id)}
                          className="flex min-w-0 flex-1 items-start gap-3 text-left"
                        >
                          <AvatarChip name={activity.friendName} src={activity.friendAvatar} />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium text-[color:var(--text-primary)]">
                                {activity.friendName}
                              </span>
                              <span className="text-xs text-[color:var(--text-muted)]">
                                正在玩 {game.name}
                              </span>
                              {friendInviteStatusByActivityId[activity.id] ? (
                                <span className="rounded-full bg-[rgba(47,122,63,0.1)] px-2 py-1 text-[10px] text-[#2f7a3f]">
                                  已邀约
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-1 text-xs leading-6 text-[color:var(--text-secondary)]">
                              {activity.status}
                            </div>
                            <div className="mt-1 text-[11px] text-[color:var(--text-dim)]">
                              {friendInviteSentAtByActivityId[activity.id]
                                ? `上次邀约 ${formatConversationTimestamp(friendInviteSentAtByActivityId[activity.id])} · ${formatTimestamp(activity.updatedAt)}`
                                : formatTimestamp(activity.updatedAt)}
                            </div>
                            {lastInviteConversationTitleByActivityId[activity.id] ? (
                              <div className="mt-1 text-[11px] text-[color:var(--text-dim)]">
                                最近投递到 {lastInviteConversationTitleByActivityId[activity.id]}
                              </div>
                            ) : null}
                          </div>
                        </button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => onOpenInviteToChat(activity.id)}
                          className="shrink-0 rounded-full"
                        >
                          发到聊天
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => onInviteFriend(activity.id)}
                          className="shrink-0 rounded-full"
                        >
                          {friendInviteStatusByActivityId[activity.id]
                            ? "再邀一次"
                            : "邀请一起玩"}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => onCopyInviteToMobile(activity.id)}
                          className="shrink-0 rounded-full"
                        >
                          发到手机
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-[30px] border border-[rgba(15,23,42,0.06)] bg-white/92 p-5 shadow-[var(--shadow-soft)]">
                <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--text-primary)]">
                  <Gamepad2 size={16} className="text-[color:var(--brand-secondary)]" />
                  投递到最近会话
                </div>
                <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">
                  {activeInviteActivity
                    ? `把 ${activeInviteActivity.friendName} 的组局邀约发回消息流，点哪条会话就投递到哪条。`
                    : "先在上面选一条好友动态，再决定把组局邀约投递到哪条会话。"}
                </div>

                {!activeInviteActivity ? (
                  <div className="mt-4">
                    <EmptyState
                      title="还没有选中的组局邀约"
                      description="从“好友在玩”里点“发到聊天”，这里就会出现最近会话投递面板。"
                    />
                  </div>
                ) : inviteConversationCandidatesLoading ? (
                  <div className="mt-4">
                    <LoadingBlock label="正在读取最近会话..." />
                  </div>
                ) : inviteConversationCandidates.length ? (
                  <div className="mt-4 space-y-3">
                    <div className="rounded-[22px] border border-[rgba(15,23,42,0.06)] bg-[rgba(255,250,244,0.82)] px-4 py-4">
                      <div className="text-sm font-medium text-[color:var(--text-primary)]">
                        当前邀约
                      </div>
                      <div className="mt-2 text-xs leading-6 text-[color:var(--text-secondary)]">
                        {activeInviteActivity.friendName} 正在玩 {activeInviteGame?.name ?? "当前游戏"}，{activeInviteActivity.status}
                      </div>
                    </div>
                    {inviteConversationCandidates.map((conversation) => (
                      <div
                        key={conversation.id}
                        className="flex w-full items-start justify-between gap-3 rounded-[22px] border border-[rgba(15,23,42,0.06)] bg-[rgba(248,250,252,0.88)] px-4 py-4 text-left transition hover:bg-white"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            onSendInviteToConversation(
                              activeInviteActivity.id,
                              conversation.id,
                            )
                          }
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-sm font-medium text-[color:var(--text-primary)]">
                              {conversation.title}
                            </div>
                            <span className="text-[11px] text-[color:var(--text-muted)]">
                              {isPersistedGroupConversation(conversation) ? "群聊" : "单聊"}
                            </span>
                          </div>
                          <div className="mt-1 text-xs leading-6 text-[color:var(--text-secondary)]">
                            {conversation.lastMessage?.text || "把组局邀约投递到这条会话。"}
                          </div>
                          <div className="mt-1 text-[11px] text-[color:var(--text-dim)]">
                            {formatConversationTimestamp(conversation.lastActivityAt)}
                          </div>
                        </button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            onSendInviteToConversation(
                              activeInviteActivity.id,
                              conversation.id,
                            )
                          }
                          className="shrink-0 rounded-full"
                        >
                          发邀约
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4">
                    <EmptyState
                      title="还没有最近会话"
                      description="先回消息里产生一些会话，再把游戏邀约投递回来。"
                    />
                  </div>
                )}
              </section>

              <section className="rounded-[30px] border border-[rgba(15,23,42,0.06)] bg-white/92 p-5 shadow-[var(--shadow-soft)]">
                <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--text-primary)]">
                  <Gift size={16} className="text-[color:var(--brand-primary)]" />
                  活动与福利
                </div>
                <div className="mt-4 space-y-3">
                  {gameCenterEvents.map((event) => {
                    const tone = getGameCenterToneStyle(event.tone);
                    const engaged = Boolean(eventActionStatusById[event.id]);
                    return (
                      <article
                        key={event.id}
                        className={cn(
                          "rounded-[24px] border p-4",
                          tone.mutedPanelClassName,
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-sm font-semibold text-[color:var(--text-primary)]">
                                {event.title}
                              </div>
                              {engaged ? (
                                <span className="rounded-full bg-white/84 px-2.5 py-1 text-[10px] text-[color:var(--text-muted)]">
                                  {getGameCenterEventStatusLabel(event)}
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-2 text-xs leading-6 text-[color:var(--text-secondary)]">
                              {event.description}
                            </div>
                            <div className={cn("mt-2 text-[11px]", tone.softTextClassName)}>
                              {event.meta}
                            </div>
                          </div>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => onCompleteEventAction(event.id)}
                          >
                            {getGameCenterEventActionLabel(event, engaged)}
                          </Button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-[30px] border border-[rgba(15,23,42,0.06)] bg-[linear-gradient(180deg,rgba(255,250,245,0.98),rgba(255,255,255,0.95))] p-5 shadow-[var(--shadow-soft)]">
                <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--text-primary)]">
                  <Gamepad2 size={16} className="text-[color:var(--brand-secondary)]" />
                  首版说明
                </div>
                <div className="mt-3 space-y-3 text-xs leading-6 text-[color:var(--text-secondary)]">
                  <div>点击“开始游戏”会先写入最近玩过和固定常玩状态，确保桌面与移动端入口节奏先成立。</div>
                  <div>后续再补小游戏运行容器、好友组局邀请和真实活动编排，避免这次直接把范围做成平台级工程。</div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function DesktopMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-white/18 bg-white/10 px-4 py-4">
      <div className="text-[11px] uppercase tracking-[0.14em] text-white/68">
        {label}
      </div>
      <div className="mt-2 text-sm font-medium text-white">{value}</div>
    </div>
  );
}

function DesktopRankingPanel({
  title,
  icon,
  entries,
  onSelectGame,
}: {
  title: string;
  icon: ReactNode;
  entries: typeof gameCenterHotRankings;
  onSelectGame: (gameId: string) => void;
}) {
  return (
    <section className="rounded-[30px] border border-[rgba(15,23,42,0.06)] bg-white/92 p-5 shadow-[var(--shadow-soft)]">
      <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--text-primary)]">
        {icon}
        {title}
      </div>
      <div className="mt-4 space-y-3">
        {entries.map((entry) => {
          const game = getGameCenterGame(entry.gameId);
          if (!game) {
            return null;
          }

          const tone = getGameCenterToneStyle(game.tone);

          return (
            <button
              key={`${title}-${entry.gameId}`}
              type="button"
              onClick={() => onSelectGame(entry.gameId)}
              className="flex w-full items-start gap-3 rounded-[22px] border border-[rgba(15,23,42,0.06)] bg-[rgba(248,250,252,0.88)] px-4 py-4 text-left transition hover:bg-white"
            >
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] border text-sm font-semibold",
                  tone.badgeClassName,
                )}
              >
                {entry.rank}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
                    {game.name}
                  </div>
                  {entry.rank === 1 ? (
                    <Trophy size={14} className="text-[color:var(--brand-primary)]" />
                  ) : null}
                </div>
                <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                  {game.playersLabel}
                </div>
                <div className="mt-2 text-xs leading-6 text-[color:var(--text-secondary)]">
                  {entry.note}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
