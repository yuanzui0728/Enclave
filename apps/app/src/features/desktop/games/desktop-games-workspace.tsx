import type { ReactNode } from "react";
import type { ConversationListItem } from "@yinjie/contracts";
import { Button, InlineNotice, LoadingBlock, cn } from "@yinjie/ui";
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
import { useLocalChatMessageActionState } from "../../chat/local-chat-message-actions";
import {
  formatConversationTimestamp,
  formatTimestamp,
} from "../../../lib/format";
import { getConversationPreviewParts } from "../../../lib/conversation-preview";
import {
  getConversationThreadLabel,
  isPersistedGroupConversation,
} from "../../../lib/conversation-route";
import { EmptyState } from "../../../components/empty-state";
import { GameCenterSessionPanel } from "../../games/game-center-session-panel";
import {
  getGameCenterEventActionLabel,
  getGameCenterEventStatusLabel,
  getGameCenterGame,
  getGameCenterToneStyle,
  type GameCenterCategoryId,
  type GameCenterCategoryTab,
  type GameCenterEvent,
  type GameCenterFriendActivity,
  type GameCenterGame,
  type GameCenterPrimarySection,
  type GameCenterPrimarySectionId,
  type GameCenterRankingEntry,
  type GameCenterShelf,
  type GameCenterStory,
} from "../../games/game-center-data";

type DesktopGamesWorkspaceProps = {
  activeSection: GameCenterPrimarySectionId;
  activeCategory: GameCenterCategoryId;
  activeGameId: string | null;
  activeInviteActivityId: string | null;
  categoryTabs: GameCenterCategoryTab[];
  eventActionStatusById: Record<string, string>;
  events: GameCenterEvent[];
  friendActivities: GameCenterFriendActivity[];
  friendInviteSentAtByActivityId: Record<string, string>;
  friendInviteStatusByActivityId: Record<string, string>;
  games: GameCenterGame[];
  hotRankings: GameCenterRankingEntry[];
  lastInviteConversationPathByActivityId: Record<string, string>;
  lastInviteConversationTitleByActivityId: Record<string, string>;
  inviteConversationCandidates: ConversationListItem[];
  inviteConversationCandidatesLoading: boolean;
  launchCountById: Record<string, number>;
  newRankings: GameCenterRankingEntry[];
  pinnedGameIds: string[];
  primarySections: GameCenterPrimarySection[];
  recentGameIds: string[];
  selectedGameId: string;
  shelves: GameCenterShelf[];
  stories: GameCenterStory[];
  lastOpenedAtById: Record<string, string>;
  successNotice?: string;
  noticeTone?: "success" | "info";
  onSectionChange: (sectionId: GameCenterPrimarySectionId) => void;
  onCategoryChange: (categoryId: GameCenterCategoryId) => void;
  onCompleteEventAction: (eventId: string) => void;
  onCopyInviteToMobile: (activityId: string) => void;
  onOpenInviteToChat: (activityId: string) => void;
  onOpenDeliveredConversation: (activityId: string) => void;
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

function resolveGames(ids: string[], games: GameCenterGame[]) {
  return ids
    .map((id) => getGameCenterGame(id, games))
    .filter((game): game is NonNullable<typeof game> => Boolean(game));
}

export function DesktopGamesWorkspace({
  activeSection,
  activeCategory,
  activeGameId,
  activeInviteActivityId,
  categoryTabs,
  eventActionStatusById,
  events,
  friendActivities,
  friendInviteSentAtByActivityId,
  friendInviteStatusByActivityId,
  games,
  hotRankings,
  lastInviteConversationPathByActivityId,
  lastInviteConversationTitleByActivityId,
  inviteConversationCandidates,
  inviteConversationCandidatesLoading,
  launchCountById,
  newRankings,
  pinnedGameIds,
  primarySections,
  recentGameIds,
  selectedGameId,
  shelves,
  stories,
  lastOpenedAtById,
  successNotice,
  noticeTone = "success",
  onSectionChange,
  onCategoryChange,
  onCompleteEventAction,
  onCopyInviteToMobile,
  onOpenInviteToChat,
  onOpenDeliveredConversation,
  onSendInviteToConversation,
  onInviteFriend,
  onCopyGameToMobile,
  onDismissActiveGame,
  onLaunchGame,
  onSelectGame,
  onTogglePinnedGame,
}: DesktopGamesWorkspaceProps) {
  const localMessageActionState = useLocalChatMessageActionState();
  const selectedGame =
    getGameCenterGame(selectedGameId, games) ?? getGameCenterGame("signal-squad", games);
  const activeInviteActivity = activeInviteActivityId
    ? (friendActivities.find(
        (item) => item.id === activeInviteActivityId,
      ) ?? null)
    : null;
  const activeInviteGame = activeInviteActivity
    ? getGameCenterGame(activeInviteActivity.gameId, games)
    : null;
  const pinnedGames = resolveGames(pinnedGameIds, games);
  const recentGames = resolveGames(recentGameIds, games);
  const mostPlayedGames = [...games]
    .sort(
      (left, right) =>
        (launchCountById[right.id] ?? 0) - (launchCountById[left.id] ?? 0),
    )
    .filter((game) => (launchCountById[game.id] ?? 0) > 0)
    .slice(0, 4);
  const browseGames =
    activeCategory === "featured"
      ? games.slice(0, 6)
      : games.filter((game) => game.category === activeCategory);

  if (!selectedGame) {
    return null;
  }

  const selectedTone = getGameCenterToneStyle(selectedGame.tone);
  const selectedPinned = pinnedGameIds.includes(selectedGame.id);
  const activeSectionMeta =
    primarySections.find((section) => section.id === activeSection) ??
    primarySections[0];
  const selectedSidebarItemClassName =
    "border-[rgba(7,193,96,0.12)] bg-white shadow-[inset_3px_0_0_0_var(--brand-primary),0_8px_18px_rgba(15,23,42,0.04)]";
  const selectedContentCardClassName =
    "shadow-[inset_3px_0_0_0_var(--brand-primary),0_10px_24px_rgba(15,23,42,0.05)]";

  return (
    <div className="flex h-full min-h-0 bg-[color:var(--bg-app)]">
      <aside className="flex w-[284px] shrink-0 flex-col border-r border-[color:var(--border-faint)] bg-[rgba(247,250,250,0.88)]">
        <div className="border-b border-[color:var(--border-faint)] bg-white/78 px-5 py-5 backdrop-blur-xl">
          <div className="text-[11px] font-medium text-[color:var(--text-muted)]">
            Game Center
          </div>
          <div className="mt-2 text-[22px] font-semibold text-[color:var(--text-primary)]">
            游戏中心
          </div>
          <div className="mt-2 text-[13px] leading-6 text-[color:var(--text-secondary)]">
            按微信桌面端频道工作区的逻辑组织推荐、最近玩过、固定常玩和活动位。
          </div>
        </div>

        <div className="min-h-0 space-y-4 overflow-auto bg-[rgba(242,246,245,0.76)] px-4 py-4">
          <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-4 shadow-[var(--shadow-section)]">
            <div className="text-xs text-[color:var(--text-muted)]">
              一级分栏
            </div>
            <div className="mt-3 space-y-2">
              {primarySections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => onSectionChange(section.id)}
                  className={cn(
                    "w-full rounded-[18px] border px-3 py-3 text-left transition",
                    activeSection === section.id
                      ? selectedSidebarItemClassName
                      : "border-[color:var(--border-faint)] bg-[color:var(--surface-console)] hover:bg-white",
                  )}
                >
                  <div className="text-sm font-medium text-[color:var(--text-primary)]">
                    {section.label}
                  </div>
                  <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
                    {section.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-4 shadow-[var(--shadow-section)]">
            <div className="text-xs text-[color:var(--text-muted)]">
              找游戏频道
            </div>
            <div className="mt-3 space-y-2">
              {categoryTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onCategoryChange(tab.id)}
                  className={cn(
                    "w-full rounded-[18px] border px-3 py-3 text-left transition",
                    activeCategory === tab.id
                      ? selectedSidebarItemClassName
                      : "border-[color:var(--border-faint)] bg-[color:var(--surface-console)] hover:bg-white",
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

          <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-4 shadow-[var(--shadow-section)]">
            <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--text-primary)]">
              <Pin size={15} className="text-[color:var(--brand-primary)]" />
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
                          ? selectedSidebarItemClassName
                          : "border-[color:var(--border-faint)] bg-[color:var(--surface-console)] hover:bg-white",
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
                            "rounded-md border px-2 py-1 text-[10px] font-medium",
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
                <div className="rounded-[16px] border border-dashed border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 py-4 text-xs leading-6 text-[color:var(--text-muted)]">
                  从推荐区把常玩的游戏固定到这里，桌面工作区就能更像微信的常驻入口。
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-4 shadow-[var(--shadow-section)]">
            <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--text-primary)]">
              <Clock3
                size={15}
                className="text-[color:var(--brand-primary)]"
              />
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
                      ? selectedSidebarItemClassName
                      : "border-[color:var(--border-faint)] bg-[color:var(--surface-console)]",
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
        <div className="border-b border-[color:var(--border-faint)] bg-white/78 px-6 py-5 backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-[11px] font-medium text-[color:var(--text-muted)]">
                {activeSectionMeta?.label ?? "首页"} / 微信式桌面节奏
              </div>
              <div className="mt-1 text-[20px] font-semibold text-[color:var(--text-primary)]">
                {activeSectionMeta?.label ?? "首页"}：{activeSectionMeta?.description ?? "最近玩过、固定常玩、推荐位和活动位都放进一个工作区"}
              </div>
              <div className="mt-1 text-[12px] leading-6 text-[color:var(--text-muted)]">
                首版先不做小游戏运行容器，点击开始游戏会先把使用状态写回服务端，再承接到当前工作区。
              </div>
            </div>
            {successNotice ? (
              <InlineNotice tone={noticeTone}>{successNotice}</InlineNotice>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-[rgba(255,255,255,0.62)] px-6 py-6">
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
                    <DesktopMetric
                      label="玩家热度"
                      value={selectedGame.playersLabel}
                    />
                    <DesktopMetric
                      label="社交热度"
                      value={selectedGame.friendsLabel}
                    />
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

              {activeSection === "home" || activeSection === "discover" ? (
                <section className="rounded-[22px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-card)]">
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
                  <div className="rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 py-1 text-[11px] font-medium text-[color:var(--text-secondary)]">
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
                          selectedGame.id === game.id && selectedContentCardClassName,
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
                                  "rounded-md border px-2 py-1 text-[10px] font-medium",
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
                              className="rounded-md bg-white/82 px-2.5 py-1 text-[11px] text-[color:var(--text-muted)]"
                            >
                              {tag}
                            </span>
                          ))}
                          {pinned ? (
                            <span className="rounded-md bg-[rgba(7,193,96,0.07)] px-2.5 py-1 text-[11px] text-[color:var(--brand-primary)]">
                              已固定
                            </span>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
                </section>
              ) : null}

              {activeSection === "home" || activeSection === "rankings" ? (
                <div className="grid gap-4 lg:grid-cols-2">
                <DesktopRankingPanel
                  title="热门榜"
                  icon={
                    <Flame
                      size={16}
                      className="text-[color:var(--brand-primary)]"
                    />
                  }
                  entries={hotRankings}
                  games={games}
                  onSelectGame={onSelectGame}
                />
                <DesktopRankingPanel
                  title="新游榜"
                  icon={
                    <Sparkles
                      size={16}
                      className="text-[color:var(--brand-secondary)]"
                    />
                  }
                  entries={newRankings}
                  games={games}
                  onSelectGame={onSelectGame}
                />
                </div>
              ) : null}

              {activeSection === "discover" ? (
                <DesktopShelfPanel
                  shelves={shelves}
                  games={games}
                  pinnedGameIds={pinnedGameIds}
                  onLaunchGame={onLaunchGame}
                  onSelectGame={onSelectGame}
                />
              ) : null}

              {activeSection === "content" ? (
                <DesktopStoryPanel
                  stories={stories}
                  games={games}
                  onSelectGame={onSelectGame}
                />
              ) : null}

              {activeSection === "mine" ? (
                <DesktopMineOverviewPanel
                  pinnedGames={pinnedGames}
                  recentGames={recentGames}
                  launchCountById={launchCountById}
                  lastOpenedAtById={lastOpenedAtById}
                  onSelectGame={onSelectGame}
                />
              ) : null}
            </div>

            <div className="space-y-5">
              {activeSection === "home" || activeSection === "mine" ? (
                <GameCenterSessionPanel
                  game={selectedGame}
                  isActive={activeGameId === selectedGame.id}
                  launchCount={launchCountById[selectedGame.id] ?? 0}
                  lastOpenedAt={lastOpenedAtById[selectedGame.id]}
                  onCopyToMobile={onCopyGameToMobile}
                  onDismiss={
                    activeGameId === selectedGame.id
                      ? onDismissActiveGame
                      : undefined
                  }
                  onLaunch={onLaunchGame}
                />
              ) : null}

              {activeSection === "home" ? (
                <section className="rounded-[22px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-card)]">
                <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--text-primary)]">
                  <UsersRound
                    size={16}
                    className="text-[color:var(--brand-primary)]"
                  />
                  好友在玩
                </div>
                <div className="mt-4 space-y-3">
                  {friendActivities.map((activity) => {
                    const game = getGameCenterGame(activity.gameId, games);
                    if (!game) {
                      return null;
                    }

                    return (
                      <div
                        key={activity.id}
                        className="flex w-full items-start gap-3 rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 py-3 text-left transition hover:bg-white"
                      >
                        <button
                          type="button"
                          onClick={() => onSelectGame(game.id)}
                          className="flex min-w-0 flex-1 items-start gap-3 text-left"
                        >
                          <AvatarChip
                            name={activity.friendName}
                            src={activity.friendAvatar}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium text-[color:var(--text-primary)]">
                                {activity.friendName}
                              </span>
                              <span className="text-xs text-[color:var(--text-muted)]">
                                正在玩 {game.name}
                              </span>
                              {friendInviteStatusByActivityId[activity.id] ? (
                                <span className="rounded-full border border-[rgba(7,193,96,0.12)] bg-[rgba(7,193,96,0.06)] px-2 py-1 text-[10px] text-[color:var(--brand-primary)]">
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
                            {lastInviteConversationTitleByActivityId[
                              activity.id
                            ] ? (
                              <div className="mt-1 text-[11px] text-[color:var(--text-dim)]">
                                最近投递到{" "}
                                {
                                  lastInviteConversationTitleByActivityId[
                                    activity.id
                                  ]
                                }
                              </div>
                            ) : null}
                          </div>
                        </button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => onOpenInviteToChat(activity.id)}
                          className="shrink-0 rounded-xl"
                        >
                          发到聊天
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => onInviteFriend(activity.id)}
                          className="shrink-0 rounded-xl"
                        >
                          {friendInviteStatusByActivityId[activity.id]
                            ? "再邀一次"
                            : "邀请一起玩"}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => onCopyInviteToMobile(activity.id)}
                          className="shrink-0 rounded-xl"
                        >
                          发到手机
                        </Button>
                        {lastInviteConversationPathByActivityId[activity.id] ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              onOpenDeliveredConversation(activity.id)
                            }
                            className="shrink-0 rounded-xl"
                          >
                            回到会话
                          </Button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                </section>
              ) : null}

              {activeSection === "home" ? (
                <section className="rounded-[22px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-card)]">
                <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--text-primary)]">
                  <Gamepad2
                    size={16}
                    className="text-[color:var(--brand-secondary)]"
                  />
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
                    <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-4 py-4">
                      <div className="text-sm font-medium text-[color:var(--text-primary)]">
                        当前邀约
                      </div>
                      <div className="mt-2 text-xs leading-6 text-[color:var(--text-secondary)]">
                        {activeInviteActivity.friendName} 正在玩{" "}
                        {activeInviteGame?.name ?? "当前游戏"}，
                        {activeInviteActivity.status}
                      </div>
                    </div>
                    {inviteConversationCandidates.map((conversation) => (
                      <InviteConversationRow
                        key={conversation.id}
                        activeInviteActivityId={activeInviteActivity.id}
                        conversation={conversation}
                        localMessageActionState={localMessageActionState}
                        onSendInviteToConversation={onSendInviteToConversation}
                      />
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
              ) : null}

              {activeSection === "home" || activeSection === "content" ? (
                <section className="rounded-[22px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-card)]">
                <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--text-primary)]">
                  <Gift
                    size={16}
                    className="text-[color:var(--brand-primary)]"
                  />
                  活动与福利
                </div>
                <div className="mt-4 space-y-3">
                  {events.map((event) => {
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
                                <span className="rounded-md bg-white/84 px-2.5 py-1 text-[10px] text-[color:var(--text-muted)]">
                                  {getGameCenterEventStatusLabel(event)}
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-2 text-xs leading-6 text-[color:var(--text-secondary)]">
                              {event.description}
                            </div>
                            <div
                              className={cn(
                                "mt-2 text-[11px]",
                                tone.softTextClassName,
                              )}
                            >
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
              ) : null}

              {activeSection === "rankings" ? (
                <DesktopLaunchLeaderboardPanel
                  games={mostPlayedGames}
                  launchCountById={launchCountById}
                  lastOpenedAtById={lastOpenedAtById}
                  onSelectGame={onSelectGame}
                />
              ) : null}

              {activeSection === "mine" ? (
                <DesktopLaunchLeaderboardPanel
                  title="我的高频入口"
                  games={mostPlayedGames}
                  launchCountById={launchCountById}
                  lastOpenedAtById={lastOpenedAtById}
                  onSelectGame={onSelectGame}
                />
              ) : null}

              {activeSection === "home" ? (
                <section className="rounded-[22px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-card)]">
                <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--text-primary)]">
                  <Gamepad2
                    size={16}
                    className="text-[color:var(--brand-secondary)]"
                  />
                  首版说明
                </div>
                <div className="mt-3 space-y-3 text-xs leading-6 text-[color:var(--text-secondary)]">
                  <div>
                    点击“开始游戏”会先写入最近玩过和固定常玩状态，确保桌面与移动端入口节奏先成立。
                  </div>
                  <div>
                    后续再补小游戏运行容器、好友组局邀请和真实活动编排，避免这次直接把范围做成平台级工程。
                  </div>
                </div>
                </section>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function DesktopShelfPanel({
  shelves,
  games,
  pinnedGameIds,
  onLaunchGame,
  onSelectGame,
}: {
  shelves: GameCenterShelf[];
  games: GameCenterGame[];
  pinnedGameIds: string[];
  onLaunchGame: (gameId: string) => void | Promise<void>;
  onSelectGame: (gameId: string) => void;
}) {
  return (
    <section className="rounded-[22px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-card)]">
      <div className="text-sm font-medium text-[color:var(--text-primary)]">
        货架式找游戏
      </div>
      <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">
        对齐微信游戏中心的货架浏览逻辑，先按主题货架逛，再决定点进哪个游戏。
      </div>
      <div className="mt-4 space-y-4">
        {shelves.map((shelf) => (
          <div
            key={shelf.id}
            className="rounded-[20px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-4"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-[color:var(--text-primary)]">
                  {shelf.title}
                </div>
                <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">
                  {shelf.description}
                </div>
              </div>
              <div className="rounded-full bg-white px-3 py-1 text-[11px] text-[color:var(--text-secondary)]">
                {shelf.gameIds.length} 个入口
              </div>
            </div>
            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              {resolveGames(shelf.gameIds, games).map((game) => {
                const tone = getGameCenterToneStyle(game.tone);
                return (
                  <article
                    key={`${shelf.id}-${game.id}`}
                    className={cn(
                      "rounded-[20px] border p-4",
                      tone.mutedPanelClassName,
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => onSelectGame(game.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "rounded-md border px-2 py-1 text-[10px] font-medium",
                              tone.badgeClassName,
                            )}
                          >
                            {game.deckLabel}
                          </span>
                          {pinnedGameIds.includes(game.id) ? (
                            <span className="rounded-md bg-[rgba(7,193,96,0.07)] px-2 py-1 text-[10px] text-[color:var(--brand-primary)]">
                              已固定
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-3 text-sm font-semibold text-[color:var(--text-primary)]">
                          {game.name}
                        </div>
                        <div className="mt-1 text-xs leading-6 text-[color:var(--text-secondary)]">
                          {game.description}
                        </div>
                      </button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onLaunchGame(game.id)}
                      >
                        秒开
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function DesktopStoryPanel({
  stories,
  games,
  onSelectGame,
}: {
  stories: GameCenterStory[];
  games: GameCenterGame[];
  onSelectGame: (gameId: string) => void;
}) {
  return (
    <section className="rounded-[22px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-card)]">
      <div className="text-sm font-medium text-[color:var(--text-primary)]">
        看内容
      </div>
      <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">
        给 AI 游戏、第三方上传和角色产游统一留出内容阵地，后续可以继续接攻略、幕后和直播切片。
      </div>
      <div className="mt-4 space-y-3">
        {stories.map((story) => {
          const tone = getGameCenterToneStyle(story.tone);
          const relatedGame = story.relatedGameId
            ? getGameCenterGame(story.relatedGameId, games)
            : null;

          return (
            <article
              key={story.id}
              className={cn("rounded-[24px] border p-4", tone.mutedPanelClassName)}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "rounded-md border px-2.5 py-1 text-[10px] font-medium",
                        tone.badgeClassName,
                      )}
                    >
                      {story.eyebrow}
                    </span>
                    <span className="text-[11px] text-[color:var(--text-muted)]">
                      {formatTimestamp(story.publishedAt)}
                    </span>
                  </div>
                  <div className="mt-3 text-base font-semibold text-[color:var(--text-primary)]">
                    {story.title}
                  </div>
                  <div className="mt-2 text-sm leading-7 text-[color:var(--text-secondary)]">
                    {story.description}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-[color:var(--text-muted)]">
                    <span>{story.authorName}</span>
                    {relatedGame ? (
                      <button
                        type="button"
                        onClick={() => onSelectGame(relatedGame.id)}
                        className="rounded-full bg-white px-3 py-1 text-[11px] text-[color:var(--brand-primary)]"
                      >
                        {relatedGame.name}
                      </button>
                    ) : null}
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => relatedGame && onSelectGame(relatedGame.id)}
                >
                  {story.ctaLabel}
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function DesktopMineOverviewPanel({
  pinnedGames,
  recentGames,
  launchCountById,
  lastOpenedAtById,
  onSelectGame,
}: {
  pinnedGames: GameCenterGame[];
  recentGames: GameCenterGame[];
  launchCountById: Record<string, number>;
  lastOpenedAtById: Record<string, string>;
  onSelectGame: (gameId: string) => void;
}) {
  const totalLaunches = Object.values(launchCountById).reduce(
    (total, count) => total + count,
    0,
  );

  return (
    <section className="rounded-[22px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-card)]">
      <div className="text-sm font-medium text-[color:var(--text-primary)]">
        我的游戏中心
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <DesktopSummaryMetric label="固定常玩" value={`${pinnedGames.length}`} />
        <DesktopSummaryMetric label="最近玩过" value={`${recentGames.length}`} />
        <DesktopSummaryMetric label="累计启动" value={`${totalLaunches}`} />
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <DesktopGameMiniList
          title="固定常玩"
          games={pinnedGames}
          lastOpenedAtById={lastOpenedAtById}
          onSelectGame={onSelectGame}
          emptyText="还没有固定常玩的游戏。"
        />
        <DesktopGameMiniList
          title="最近玩过"
          games={recentGames}
          lastOpenedAtById={lastOpenedAtById}
          onSelectGame={onSelectGame}
          emptyText="还没有最近玩过的游戏。"
        />
      </div>
    </section>
  );
}

function InviteConversationRow({
  activeInviteActivityId,
  conversation,
  localMessageActionState,
  onSendInviteToConversation,
}: {
  activeInviteActivityId: string;
  conversation: ConversationListItem;
  localMessageActionState: ReturnType<typeof useLocalChatMessageActionState>;
  onSendInviteToConversation: (
    activityId: string,
    conversationId: string,
  ) => void;
}) {
  const preview = getConversationPreviewParts(
    conversation,
    localMessageActionState,
  );

  return (
    <div className="flex w-full items-start justify-between gap-3 rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-4 py-4 text-left transition hover:bg-white">
      <button
        type="button"
        onClick={() =>
          onSendInviteToConversation(activeInviteActivityId, conversation.id)
        }
        className="min-w-0 flex-1 text-left"
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm font-medium text-[color:var(--text-primary)]">
            {conversation.title}
          </div>
          <span className="text-[11px] text-[color:var(--text-muted)]">
            {getConversationThreadLabel(conversation)}
          </span>
        </div>
        <div className="mt-1 text-xs leading-6 text-[color:var(--text-secondary)]">
          {preview.prefix}
          {preview.text}
        </div>
        <div className="mt-1 text-[11px] text-[color:var(--text-dim)]">
          {formatConversationTimestamp(conversation.lastActivityAt)}
        </div>
      </button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() =>
          onSendInviteToConversation(activeInviteActivityId, conversation.id)
        }
        className="shrink-0 rounded-xl"
      >
        发邀约
      </Button>
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

function DesktopSummaryMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[20px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-4 py-4">
      <div className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
        {label}
      </div>
      <div className="mt-2 text-lg font-semibold text-[color:var(--text-primary)]">
        {value}
      </div>
    </div>
  );
}

function DesktopGameMiniList({
  title,
  games,
  lastOpenedAtById,
  onSelectGame,
  emptyText,
}: {
  title: string;
  games: GameCenterGame[];
  lastOpenedAtById: Record<string, string>;
  onSelectGame: (gameId: string) => void;
  emptyText: string;
}) {
  return (
    <div className="rounded-[20px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-4">
      <div className="text-sm font-medium text-[color:var(--text-primary)]">
        {title}
      </div>
      <div className="mt-3 space-y-2">
        {games.length ? (
          games.map((game) => (
            <button
              key={`${title}-${game.id}`}
              type="button"
              onClick={() => onSelectGame(game.id)}
              className="flex w-full items-center justify-between rounded-[16px] border border-[color:var(--border-faint)] bg-white px-3 py-3 text-left transition hover:bg-[color:var(--surface-console)]"
            >
              <div>
                <div className="text-sm font-medium text-[color:var(--text-primary)]">
                  {game.name}
                </div>
                <div className="mt-1 text-[11px] text-[color:var(--text-muted)]">
                  {lastOpenedAtById[game.id]
                    ? `最近打开 ${formatConversationTimestamp(lastOpenedAtById[game.id])}`
                    : "暂无打开记录"}
                </div>
              </div>
              <span className="text-[11px] text-[color:var(--text-secondary)]">
                查看
              </span>
            </button>
          ))
        ) : (
          <div className="rounded-[16px] border border-dashed border-[color:var(--border-faint)] bg-white px-3 py-4 text-xs leading-6 text-[color:var(--text-muted)]">
            {emptyText}
          </div>
        )}
      </div>
    </div>
  );
}

function DesktopRankingPanel({
  title,
  icon,
  entries,
  games,
  onSelectGame,
}: {
  title: string;
  icon: ReactNode;
  entries: GameCenterRankingEntry[];
  games: GameCenterGame[];
  onSelectGame: (gameId: string) => void;
}) {
  return (
    <section className="rounded-[22px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--text-primary)]">
        {icon}
        {title}
      </div>
      <div className="mt-4 space-y-3">
        {entries.map((entry) => {
          const game = getGameCenterGame(entry.gameId, games);
          if (!game) {
            return null;
          }

          const tone = getGameCenterToneStyle(game.tone);

          return (
            <button
              key={`${title}-${entry.gameId}`}
              type="button"
              onClick={() => onSelectGame(entry.gameId)}
              className="flex w-full items-start gap-3 rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-4 py-4 text-left transition hover:bg-white"
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
                    <Trophy
                      size={14}
                      className="text-[color:var(--brand-primary)]"
                    />
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

function DesktopLaunchLeaderboardPanel({
  title = "启动热度",
  games,
  launchCountById,
  lastOpenedAtById,
  onSelectGame,
}: {
  title?: string;
  games: GameCenterGame[];
  launchCountById: Record<string, number>;
  lastOpenedAtById: Record<string, string>;
  onSelectGame: (gameId: string) => void;
}) {
  return (
    <section className="rounded-[22px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--text-primary)]">
        <Play size={16} className="text-[color:var(--brand-primary)]" />
        {title}
      </div>
      <div className="mt-4 space-y-3">
        {games.length ? (
          games.map((game, index) => (
            <button
              key={`${title}-${game.id}`}
              type="button"
              onClick={() => onSelectGame(game.id)}
              className="flex w-full items-start gap-3 rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-4 py-4 text-left transition hover:bg-white"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] bg-[rgba(7,193,96,0.08)] text-sm font-semibold text-[color:var(--brand-primary)]">
                {index + 1}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-[color:var(--text-primary)]">
                  {game.name}
                </div>
                <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                  已启动 {launchCountById[game.id] ?? 0} 次
                </div>
                <div className="mt-2 text-xs leading-6 text-[color:var(--text-secondary)]">
                  {lastOpenedAtById[game.id]
                    ? `最近打开 ${formatConversationTimestamp(lastOpenedAtById[game.id])}`
                    : "还没有最近打开记录"}
                </div>
              </div>
            </button>
          ))
        ) : (
          <div className="rounded-[18px] border border-dashed border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-4 py-5 text-xs leading-6 text-[color:var(--text-muted)]">
            还没有启动记录，先从首页或找游戏里打开一局。
          </div>
        )}
      </div>
    </section>
  );
}
