import {
  AppPage,
  AppSection,
  Button,
  InlineNotice,
  cn,
} from "@yinjie/ui";
import { ArrowLeft, Search } from "lucide-react";
import { EmptyState } from "../../components/empty-state";
import { TabPageTopBar } from "../../components/tab-page-top-bar";
import { formatConversationTimestamp } from "../../lib/format";
import {
  featuredMiniProgramIds,
  getMiniProgramEntry,
  getMiniProgramToneStyle,
  getMiniProgramWorkspaceTasks,
  miniProgramCampaigns,
  miniProgramCategoryTabs,
  resolveMiniProgramEntries,
  type MiniProgramCategoryId,
  type MiniProgramEntry,
} from "./mini-programs-data";
import { MiniProgramGlyph } from "./mini-program-glyph";
import { MiniProgramOpenPanel } from "./mini-program-open-panel";

type MobileMiniProgramsWorkspaceProps = {
  activeCategory: MiniProgramCategoryId;
  activeMiniProgramId: string | null;
  completedTaskIdsByMiniProgramId: Record<string, string[]>;
  launchCountById: Record<string, number>;
  lastOpenedAtById: Record<string, string>;
  panelMiniProgramId?: string | null;
  pinnedMiniProgramIds: string[];
  recentMiniProgramIds: string[];
  searchText: string;
  selectedMiniProgramId: string;
  successNotice?: string;
  noticeTone?: "success" | "info";
  visibleMiniPrograms: MiniProgramEntry[];
  onBack: () => void;
  onCategoryChange: (categoryId: MiniProgramCategoryId) => void;
  onDismissActiveMiniProgram: () => void;
  onOpenMiniProgram: (miniProgramId: string) => void;
  onSearchTextChange: (value: string) => void;
  onSelectMiniProgram: (miniProgramId: string) => void;
  onToggleMiniProgramTask: (miniProgramId: string, taskId: string) => void;
  onTogglePinnedMiniProgram: (miniProgramId: string) => void;
};

export function MobileMiniProgramsWorkspace({
  activeCategory,
  activeMiniProgramId,
  completedTaskIdsByMiniProgramId,
  launchCountById,
  lastOpenedAtById,
  panelMiniProgramId = null,
  pinnedMiniProgramIds,
  recentMiniProgramIds,
  searchText,
  selectedMiniProgramId,
  successNotice,
  noticeTone = "success",
  visibleMiniPrograms,
  onBack,
  onCategoryChange,
  onDismissActiveMiniProgram,
  onOpenMiniProgram,
  onSearchTextChange,
  onSelectMiniProgram,
  onToggleMiniProgramTask,
  onTogglePinnedMiniProgram,
}: MobileMiniProgramsWorkspaceProps) {
  const selectedMiniProgram =
    getMiniProgramEntry(selectedMiniProgramId) ??
    getMiniProgramEntry(featuredMiniProgramIds[0]) ??
    visibleMiniPrograms[0];
  const activeMiniProgram = activeMiniProgramId
    ? getMiniProgramEntry(activeMiniProgramId)
    : null;
  const routePanelMiniProgram = panelMiniProgramId
    ? getMiniProgramEntry(panelMiniProgramId)
    : null;
  const panelMiniProgram =
    routePanelMiniProgram ?? activeMiniProgram ?? selectedMiniProgram;
  const panelIsActive = activeMiniProgram?.id === panelMiniProgram.id;
  const panelTasks = getMiniProgramWorkspaceTasks(
    panelMiniProgram.id,
    completedTaskIdsByMiniProgramId[panelMiniProgram.id] ?? [],
  );
  const recentMiniPrograms = resolveMiniProgramEntries(recentMiniProgramIds);
  const pinnedMiniPrograms = resolveMiniProgramEntries(pinnedMiniProgramIds);

  if (!selectedMiniProgram) {
    return null;
  }

  const selectedTone = getMiniProgramToneStyle(selectedMiniProgram.tone);

  return (
    <AppPage className="space-y-0 px-0 pb-0 pt-0">
      <TabPageTopBar
        title="小程序"
        subtitle="最近使用与常用入口"
        titleAlign="center"
        className="mx-0 mt-0 mb-0 border-black/6 bg-[rgba(247,247,247,0.92)] px-3 py-2.5 sm:mx-0 sm:px-3"
        leftActions={
          <Button
            onClick={onBack}
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full border-0 bg-transparent text-[color:var(--text-primary)] hover:bg-black/5"
          >
            <ArrowLeft size={18} />
          </Button>
        }
      >
        <div className="mt-3 space-y-3">
          <label className="relative block">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[color:var(--text-dim)]"
            />
            <input
              type="search"
              value={searchText}
              onChange={(event) => onSearchTextChange(event.target.value)}
              placeholder="搜索小程序、服务或场景"
              className="h-10 w-full rounded-[12px] border border-black/5 bg-white pl-10 pr-12 text-[14px] text-[color:var(--text-primary)] outline-none transition-[background-color,border-color] placeholder:text-[color:var(--text-dim)] focus:border-[rgba(7,193,96,0.22)]"
            />
            {searchText ? (
              <button
                type="button"
                onClick={() => onSearchTextChange("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[color:var(--text-muted)]"
              >
                清空
              </button>
            ) : null}
          </label>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {miniProgramCategoryTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onCategoryChange(tab.id)}
                className={cn(
                  "shrink-0 rounded-full px-4 py-2 text-xs font-medium transition",
                  activeCategory === tab.id
                    ? "bg-[#07c160] text-white"
                    : "border border-black/5 bg-white text-[color:var(--text-secondary)]",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </TabPageTopBar>

      <div className="space-y-3 px-3 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-3">
        {successNotice ? <InlineNotice tone={noticeTone}>{successNotice}</InlineNotice> : null}

        <section
          className={cn(
            "relative overflow-hidden rounded-[24px] p-5 shadow-[var(--shadow-soft)]",
            selectedTone.heroCardClassName,
          )}
        >
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -right-10 top-0 h-36 w-36 rounded-full bg-white/12 blur-3xl" />
            <div className="absolute bottom-0 left-8 h-28 w-28 rounded-full bg-black/10 blur-3xl" />
          </div>
          <div className="relative">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="inline-flex rounded-full border border-white/18 bg-white/12 px-3 py-1 text-[11px] font-medium tracking-[0.18em] text-white/82">
                  {selectedMiniProgram.badge}
                </div>
                <div className="mt-4 text-[28px] font-semibold leading-tight text-white">
                  {selectedMiniProgram.name}
                </div>
                <div className="mt-2 text-sm leading-7 text-white/82">
                  {selectedMiniProgram.slogan}
                </div>
              </div>
              <MiniProgramGlyph
                miniProgram={selectedMiniProgram}
                size="lg"
                className="shrink-0"
              />
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <MobileMetric label="最近状态" value={selectedMiniProgram.serviceLabel} />
              <MobileMetric label="更新" value={selectedMiniProgram.updateNote} />
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {selectedMiniProgram.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-white/18 bg-white/10 px-3 py-1 text-xs text-white/82"
                >
                  {tag}
                </span>
              ))}
            </div>

            <div className="mt-5 flex gap-3">
              <Button
                variant="secondary"
                size="lg"
                onClick={() => onOpenMiniProgram(selectedMiniProgram.id)}
                className="flex-1 border-white/18 bg-white text-[color:var(--text-primary)] hover:bg-white/92"
              >
                打开小程序
              </Button>
              <Button
                variant="secondary"
                size="lg"
                onClick={() => onTogglePinnedMiniProgram(selectedMiniProgram.id)}
                className="border-white/18 bg-white/10 text-white hover:bg-white/18"
              >
                {pinnedMiniProgramIds.includes(selectedMiniProgram.id)
                  ? "已加入"
                  : "加入常用"}
              </Button>
            </div>
          </div>
        </section>

        <MiniProgramOpenPanel
          miniProgram={panelMiniProgram}
          isActive={panelIsActive}
          isPinned={pinnedMiniProgramIds.includes(
            panelMiniProgram.id,
          )}
          launchCount={launchCountById[panelMiniProgram.id] ?? 0}
          lastOpenedAt={lastOpenedAtById[panelMiniProgram.id]}
          tasks={panelTasks}
          compact
          onDismiss={panelIsActive ? onDismissActiveMiniProgram : undefined}
          onOpen={onOpenMiniProgram}
          onToggleTask={onToggleMiniProgramTask}
          onTogglePinned={onTogglePinnedMiniProgram}
        />

        <AppSection className="space-y-4 border-black/5 bg-white shadow-none">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-[color:var(--text-primary)]">
                最近使用
              </div>
              <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">
                模拟微信里最近打开的小程序快捷入口。
              </div>
            </div>
            <div className="text-xs text-[color:var(--text-muted)]">
              {recentMiniPrograms.length} 个
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {recentMiniPrograms.map((miniProgram) => (
              <MiniProgramTile
                key={miniProgram.id}
                miniProgram={miniProgram}
                active={selectedMiniProgram.id === miniProgram.id}
                detail={
                  lastOpenedAtById[miniProgram.id]
                    ? `上次打开 ${formatConversationTimestamp(
                        lastOpenedAtById[miniProgram.id],
                      )}`
                    : "还没有打开过"
                }
                onClick={() => onSelectMiniProgram(miniProgram.id)}
              />
            ))}
          </div>
        </AppSection>

        <AppSection className="space-y-4 border-black/5 bg-white shadow-none">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-[color:var(--text-primary)]">
                我的小程序
              </div>
              <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">
                这里承接微信式固定常用入口。
              </div>
            </div>
            <div className="text-xs text-[color:var(--text-muted)]">
              {pinnedMiniPrograms.length} 个
            </div>
          </div>

          {pinnedMiniPrograms.length ? (
            <div className="space-y-3">
              {pinnedMiniPrograms.map((miniProgram) => (
                <MiniProgramListCard
                  key={miniProgram.id}
                  miniProgram={miniProgram}
                  active={selectedMiniProgram.id === miniProgram.id}
                  pinned
                  lastOpenedAt={lastOpenedAtById[miniProgram.id]}
                  launchCount={launchCountById[miniProgram.id] ?? 0}
                  onOpen={onOpenMiniProgram}
                  onSelect={onSelectMiniProgram}
                  onTogglePinned={onTogglePinnedMiniProgram}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="还没有加入我的小程序"
              description="在推荐卡片或列表里点“加入常用”，这里就会像微信一样沉淀你的固定入口。"
            />
          )}
        </AppSection>

        <AppSection className="space-y-3 border-black/5 bg-white shadow-none">
          <div className="text-sm font-medium text-[color:var(--text-primary)]">
            今日推荐
          </div>
          <div className="space-y-3">
            {miniProgramCampaigns.slice(0, 2).map((campaign) => {
              const tone = getMiniProgramToneStyle(campaign.tone);
              return (
                <div
                  key={campaign.id}
                  className={cn(
                    "rounded-[24px] border px-4 py-4 shadow-[var(--shadow-soft)]",
                    tone.mutedPanelClassName,
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-[color:var(--text-primary)]">
                      {campaign.title}
                    </div>
                    <div
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[10px] font-medium",
                        tone.badgeClassName,
                      )}
                    >
                      {campaign.meta}
                    </div>
                  </div>
                  <div className="mt-2 text-sm leading-7 text-[color:var(--text-secondary)]">
                    {campaign.description}
                  </div>
                </div>
              );
            })}
          </div>
        </AppSection>

        <AppSection className="space-y-4 border-black/5 bg-white shadow-none">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-[color:var(--text-primary)]">
                全部小程序
              </div>
              <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">
                {searchText
                  ? `搜索“${searchText.trim()}”命中 ${visibleMiniPrograms.length} 个结果。`
                  : "按分类浏览当前可用的小程序目录。"}
              </div>
            </div>
            <div className="text-xs text-[color:var(--text-muted)]">
              {visibleMiniPrograms.length} 个
            </div>
          </div>

          {visibleMiniPrograms.length ? (
            <div className="space-y-3">
              {visibleMiniPrograms.map((miniProgram) => (
                <MiniProgramListCard
                  key={miniProgram.id}
                  miniProgram={miniProgram}
                  active={selectedMiniProgram.id === miniProgram.id}
                  pinned={pinnedMiniProgramIds.includes(miniProgram.id)}
                  lastOpenedAt={lastOpenedAtById[miniProgram.id]}
                  launchCount={launchCountById[miniProgram.id] ?? 0}
                  onOpen={onOpenMiniProgram}
                  onSelect={onSelectMiniProgram}
                  onTogglePinned={onTogglePinnedMiniProgram}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="没有匹配的小程序"
              description="换个关键词，或者切回“全部”分类继续浏览。"
            />
          )}
        </AppSection>
      </div>
    </AppPage>
  );
}

function MobileMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-white/18 bg-white/12 px-3 py-3 backdrop-blur-sm">
      <div className="text-[11px] uppercase tracking-[0.14em] text-white/68">
        {label}
      </div>
      <div className="mt-2 text-sm font-medium text-white">{value}</div>
    </div>
  );
}

function MiniProgramTile({
  miniProgram,
  active,
  detail,
  onClick,
}: {
  miniProgram: MiniProgramEntry;
  active: boolean;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-[22px] border px-3 py-3 text-left transition",
        active
          ? "border-[rgba(7,193,96,0.18)] bg-[rgba(243,251,246,0.96)]"
          : "border-[rgba(15,23,42,0.06)] bg-[rgba(248,250,252,0.88)]",
      )}
    >
      <div className="flex items-center gap-3">
        <MiniProgramGlyph miniProgram={miniProgram} size="sm" />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
            {miniProgram.name}
          </div>
          <div className="mt-1 text-[11px] leading-5 text-[color:var(--text-dim)]">
            {detail}
          </div>
        </div>
      </div>
    </button>
  );
}

function MiniProgramListCard({
  miniProgram,
  active,
  pinned,
  lastOpenedAt,
  launchCount,
  onOpen,
  onSelect,
  onTogglePinned,
}: {
  miniProgram: MiniProgramEntry;
  active: boolean;
  pinned: boolean;
  lastOpenedAt?: string;
  launchCount: number;
  onOpen: (miniProgramId: string) => void;
  onSelect: (miniProgramId: string) => void;
  onTogglePinned: (miniProgramId: string) => void;
}) {
  const tone = getMiniProgramToneStyle(miniProgram.tone);

  return (
    <button
      type="button"
      onClick={() => onSelect(miniProgram.id)}
      className={cn(
        "w-full rounded-[24px] border px-4 py-4 text-left shadow-[var(--shadow-soft)] transition",
        active
          ? "border-[rgba(7,193,96,0.18)] bg-[rgba(243,251,246,0.96)]"
          : "border-[rgba(15,23,42,0.06)] bg-[rgba(255,255,255,0.9)]",
      )}
    >
      <div className="flex items-start gap-3">
        <MiniProgramGlyph miniProgram={miniProgram} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
              {miniProgram.name}
            </div>
            <div
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                tone.badgeClassName,
              )}
            >
              {miniProgram.deckLabel}
            </div>
          </div>
          <div className="mt-2 text-sm leading-7 text-[color:var(--text-secondary)]">
            {miniProgram.description}
          </div>
          <div className="mt-2 text-[11px] leading-5 text-[color:var(--text-dim)]">
            {lastOpenedAt
              ? `上次打开 ${formatConversationTimestamp(lastOpenedAt)} · 已打开 ${launchCount} 次`
              : `还没有打开过 · 已加入 ${pinned ? "我的小程序" : "目录"}`}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="primary"
          size="sm"
          onClick={(event) => {
            event.stopPropagation();
            onOpen(miniProgram.id);
          }}
          className="bg-[#07c160] text-white hover:bg-[#06ad56]"
        >
          打开
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={(event) => {
            event.stopPropagation();
            onTogglePinned(miniProgram.id);
          }}
          className="border-black/5 bg-[#f5f5f5]"
        >
          {pinned ? "移出常用" : "加入常用"}
        </Button>
      </div>
    </button>
  );
}
