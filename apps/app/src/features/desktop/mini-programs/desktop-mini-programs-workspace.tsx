import type { ReactNode } from "react";
import { Button, InlineNotice, cn } from "@yinjie/ui";
import { EmptyState } from "../../../components/empty-state";
import { formatConversationTimestamp } from "../../../lib/format";
import {
  featuredMiniProgramIds,
  getMiniProgramEntry,
  getMiniProgramToneStyle,
  getMiniProgramWorkspaceTasks,
  miniProgramCampaigns,
  miniProgramCategoryTabs,
  miniProgramShelves,
  resolveMiniProgramEntries,
  type MiniProgramCategoryId,
  type MiniProgramEntry,
} from "../../mini-programs/mini-programs-data";
import { MiniProgramGlyph } from "../../mini-programs/mini-program-glyph";
import { MiniProgramOpenPanel } from "../../mini-programs/mini-program-open-panel";

type DesktopMiniProgramsWorkspaceProps = {
  activeCategory: MiniProgramCategoryId;
  activeMiniProgramId: string | null;
  completedTaskIdsByMiniProgramId: Record<string, string[]>;
  launchCountById: Record<string, number>;
  lastOpenedAtById: Record<string, string>;
  pinnedMiniProgramIds: string[];
  recentMiniProgramIds: string[];
  searchText: string;
  selectedMiniProgramId: string;
  successNotice?: string;
  noticeTone?: "success" | "info";
  visibleMiniPrograms: MiniProgramEntry[];
  onCategoryChange: (categoryId: MiniProgramCategoryId) => void;
  onCopyMiniProgramToMobile: (miniProgramId: string) => void;
  onDismissActiveMiniProgram: () => void;
  onOpenMiniProgram: (miniProgramId: string) => void;
  onSearchTextChange: (value: string) => void;
  onSelectMiniProgram: (miniProgramId: string) => void;
  onToggleMiniProgramTask: (miniProgramId: string, taskId: string) => void;
  onTogglePinnedMiniProgram: (miniProgramId: string) => void;
  launchContext?: {
    sourceGroupId: string;
    sourceGroupName: string;
  } | null;
  relaySummaryMessage?: string;
  relaySummaryPending?: boolean;
  onReturnToGroup?: () => void;
  onSendRelaySummaryToGroup?: () => void;
};

export function DesktopMiniProgramsWorkspace({
  activeCategory,
  activeMiniProgramId,
  completedTaskIdsByMiniProgramId,
  launchCountById,
  lastOpenedAtById,
  pinnedMiniProgramIds,
  recentMiniProgramIds,
  searchText,
  selectedMiniProgramId,
  successNotice,
  noticeTone = "success",
  visibleMiniPrograms,
  onCategoryChange,
  onCopyMiniProgramToMobile,
  onDismissActiveMiniProgram,
  onOpenMiniProgram,
  onSearchTextChange,
  onSelectMiniProgram,
  onToggleMiniProgramTask,
  onTogglePinnedMiniProgram,
  launchContext = null,
  relaySummaryMessage = "",
  relaySummaryPending = false,
  onReturnToGroup,
  onSendRelaySummaryToGroup,
}: DesktopMiniProgramsWorkspaceProps) {
  const selectedMiniProgram =
    getMiniProgramEntry(selectedMiniProgramId) ??
    getMiniProgramEntry(featuredMiniProgramIds[0]) ??
    visibleMiniPrograms[0];
  const activeMiniProgram = activeMiniProgramId
    ? getMiniProgramEntry(activeMiniProgramId)
    : null;
  const panelMiniProgram = activeMiniProgram ?? selectedMiniProgram;
  const panelTasks = getMiniProgramWorkspaceTasks(
    panelMiniProgram.id,
    completedTaskIdsByMiniProgramId[panelMiniProgram.id] ?? [],
  );
  const recentMiniPrograms = resolveMiniProgramEntries(recentMiniProgramIds);
  const pinnedMiniPrograms = resolveMiniProgramEntries(pinnedMiniProgramIds);
  const visibleIds = new Set(visibleMiniPrograms.map((item) => item.id));
  const hasFiltering = Boolean(searchText.trim()) || activeCategory !== "all";
  const shelves = miniProgramShelves
    .map((shelf) => ({
      ...shelf,
      miniPrograms: resolveMiniProgramEntries(shelf.miniProgramIds).filter(
        (miniProgram) =>
          !hasFiltering || visibleIds.has(miniProgram.id),
      ),
    }))
    .filter((shelf) => shelf.miniPrograms.length);

  if (!selectedMiniProgram) {
    return null;
  }

  const selectedTone = getMiniProgramToneStyle(selectedMiniProgram.tone);

  return (
    <div className="flex h-full min-h-0 bg-[#f5f5f5]">
      <aside className="flex w-[288px] shrink-0 flex-col border-r border-black/6 bg-[#f7f7f7]">
        <div className="border-b border-black/6 px-5 py-5">
          <div className="text-[11px] font-medium text-[color:var(--text-muted)]">
            Mini Programs
          </div>
          <div className="mt-2 text-[22px] font-semibold text-[color:var(--text-primary)]">
            小程序面板
          </div>
          <div className="mt-2 text-[13px] leading-6 text-[color:var(--text-secondary)]">
            按微信电脑版工作区节奏，把最近使用、我的小程序、搜索和专题推荐统一收口。
          </div>
        </div>

        <div className="min-h-0 space-y-4 overflow-auto px-4 py-4">
          <div className="rounded-[18px] border border-black/6 bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
            <label className="relative block">
              <input
                type="search"
                value={searchText}
                onChange={(event) => onSearchTextChange(event.target.value)}
                placeholder="搜索小程序、服务和场景"
                className="h-11 w-full rounded-[16px] border border-transparent bg-[rgba(248,250,252,0.88)] px-4 pr-12 text-sm text-[color:var(--text-primary)] outline-none transition-[background-color,border-color] placeholder:text-[color:var(--text-dim)] focus:border-[color:var(--border-faint)] focus:bg-white"
              />
              {searchText ? (
                <button
                  type="button"
                  onClick={() => onSearchTextChange("")}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-[color:var(--text-muted)]"
                >
                  清空
                </button>
              ) : null}
            </label>

            <div className="mt-4 space-y-2">
              {miniProgramCategoryTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onCategoryChange(tab.id)}
                  className={cn(
                    "w-full rounded-[18px] border px-3 py-3 text-left transition",
                    activeCategory === tab.id
                      ? "border-[#b7e4c7] bg-[#edf8f0]"
                      : "border-black/6 bg-[#f8f8f8] hover:bg-white",
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

          <SidebarCard
            title="最近使用"
            emptyText="打开过的小程序会沉淀在这里，形成和微信类似的最近入口。"
          >
            {recentMiniPrograms.map((miniProgram) => (
              <SidebarMiniProgramButton
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
          </SidebarCard>

          <SidebarCard
            title="我的小程序"
            emptyText="点击推荐区的“加入我的小程序”，这里就会形成固定常用入口。"
          >
            {pinnedMiniPrograms.map((miniProgram) => (
              <SidebarMiniProgramButton
                key={miniProgram.id}
                miniProgram={miniProgram}
                active={selectedMiniProgram.id === miniProgram.id}
                detail={miniProgram.deckLabel}
                onClick={() => onSelectMiniProgram(miniProgram.id)}
              />
            ))}
          </SidebarCard>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-black/6 bg-[#f7f7f7] px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-[11px] font-medium text-[color:var(--text-muted)]">
                微信式桌面工作区
              </div>
              <div className="mt-1 text-[20px] font-semibold text-[color:var(--text-primary)]">
                最近使用、我的小程序、专题推荐和打开态都放进一个工作区
              </div>
              <div className="mt-1 text-[12px] leading-6 text-[color:var(--text-muted)]">
                {searchText
                  ? `当前搜索“${searchText.trim()}”命中 ${visibleMiniPrograms.length} 个小程序。`
                  : "当前先以轻工作台承接最近任务，并支持把指定小程序接力到手机继续。"}
              </div>
            </div>
            {successNotice ? <InlineNotice tone={noticeTone}>{successNotice}</InlineNotice> : null}
          </div>
          {launchContext ? (
            <div className="mt-4">
              <InlineNotice tone="info">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm leading-6 text-[color:var(--text-secondary)]">
                    正在从“{launchContext.sourceGroupName}”打开群接龙，可以边看群聊边处理报名和回填。
                  </div>
                  {onReturnToGroup ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={onReturnToGroup}
                      className="shrink-0 rounded-xl"
                    >
                      返回群聊
                    </Button>
                  ) : null}
                </div>
              </InlineNotice>
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-6 py-6">
          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.92fr]">
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
                        {selectedMiniProgram.heroLabel}
                      </div>
                      <div className="mt-4 text-[32px] font-semibold tracking-[0.02em]">
                        {selectedMiniProgram.name}
                      </div>
                      <div className="mt-2 max-w-2xl text-sm leading-7 text-white/82">
                        {selectedMiniProgram.description}
                      </div>
                    </div>
                    <MiniProgramGlyph
                      miniProgram={selectedMiniProgram}
                      size="lg"
                      className="shrink-0"
                    />
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <DesktopMetric label="最近状态" value={selectedMiniProgram.serviceLabel} />
                    <DesktopMetric label="更新" value={selectedMiniProgram.updateNote} />
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

                  <div className="mt-6 flex flex-wrap gap-3">
                    <Button
                      variant="secondary"
                      size="lg"
                      onClick={() => onOpenMiniProgram(selectedMiniProgram.id)}
                      className="border-white/18 bg-white text-[color:var(--text-primary)] hover:bg-white/92"
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
                        ? "移出我的小程序"
                        : "加入我的小程序"}
                    </Button>
                  </div>
                </div>
              </article>

              <section className="rounded-[22px] border border-black/6 bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-[color:var(--text-primary)]">
                      最近使用
                    </div>
                    <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">
                      桌面端优先给出最近打开的小程序，形成类似微信面板的稳定回访入口。
                    </div>
                  </div>
                  <div className="text-xs text-[color:var(--text-muted)]">
                    {recentMiniPrograms.length} 个
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {recentMiniPrograms.map((miniProgram) => (
                    <MiniProgramGridCard
                      key={miniProgram.id}
                      miniProgram={miniProgram}
                      active={selectedMiniProgram.id === miniProgram.id}
                      pinned={pinnedMiniProgramIds.includes(miniProgram.id)}
                      detail={
                        lastOpenedAtById[miniProgram.id]
                          ? `上次打开 ${formatConversationTimestamp(
                              lastOpenedAtById[miniProgram.id],
                            )}`
                          : "还没有打开过"
                      }
                      onOpen={onOpenMiniProgram}
                      onSelect={onSelectMiniProgram}
                      onTogglePinned={onTogglePinnedMiniProgram}
                    />
                  ))}
                </div>
              </section>

              {shelves.map((shelf) => (
                <section
                  key={shelf.id}
                  className="rounded-[22px] border border-black/6 bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.05)]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-[color:var(--text-primary)]">
                        {shelf.title}
                      </div>
                      <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">
                        {shelf.description}
                      </div>
                    </div>
                    <div className="text-xs text-[color:var(--text-muted)]">
                      {shelf.miniPrograms.length} 个
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {shelf.miniPrograms.map((miniProgram) => (
                      <MiniProgramGridCard
                        key={miniProgram.id}
                        miniProgram={miniProgram}
                        active={selectedMiniProgram.id === miniProgram.id}
                        pinned={pinnedMiniProgramIds.includes(miniProgram.id)}
                        detail={miniProgram.description}
                        onOpen={onOpenMiniProgram}
                        onSelect={onSelectMiniProgram}
                        onTogglePinned={onTogglePinnedMiniProgram}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <div className="space-y-6">
              <MiniProgramOpenPanel
                miniProgram={panelMiniProgram}
                isActive={Boolean(activeMiniProgram)}
                isPinned={pinnedMiniProgramIds.includes(
                  panelMiniProgram.id,
                )}
                launchCount={launchCountById[panelMiniProgram.id] ?? 0}
                lastOpenedAt={lastOpenedAtById[panelMiniProgram.id]}
                tasks={panelTasks}
                onDismiss={activeMiniProgram ? onDismissActiveMiniProgram : undefined}
                onCopyToMobile={onCopyMiniProgramToMobile}
                onOpen={onOpenMiniProgram}
                onToggleTask={onToggleMiniProgramTask}
                onTogglePinned={onTogglePinnedMiniProgram}
              />

              {launchContext && panelMiniProgram.id === "group-relay" ? (
                <section className="rounded-[22px] border border-black/6 bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-[color:var(--text-primary)]">
                        回填到原群聊
                      </div>
                      <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">
                        把当前接龙进度同步回“{launchContext.sourceGroupName}”，减少群成员反复追问。
                      </div>
                    </div>
                    <div className="rounded-md bg-[#eaf8ef] px-3 py-1 text-[11px] font-medium text-[#15803d]">
                      群接龙闭环
                    </div>
                  </div>

                  <div className="mt-4 rounded-[18px] border border-black/6 bg-[#f7f7f7] p-4">
                    <div className="text-[11px] font-medium text-[color:var(--text-muted)]">
                      发送预览
                    </div>
                    <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-sm leading-7 text-[color:var(--text-secondary)]">
                      {relaySummaryMessage}
                    </pre>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Button
                      variant="primary"
                      onClick={onSendRelaySummaryToGroup}
                      disabled={relaySummaryPending || !onSendRelaySummaryToGroup}
                    >
                      {relaySummaryPending ? "回填中..." : "一键回填到群聊"}
                    </Button>
                    <div className="text-xs leading-6 text-[color:var(--text-muted)]">
                      先用固定文案把工作台状态发回群聊，后续再补真实接龙结果卡片。
                    </div>
                  </div>
                </section>
              ) : null}

              <section className="rounded-[22px] border border-black/6 bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
                <div className="text-sm font-medium text-[color:var(--text-primary)]">
                  今日推荐
                </div>
                <div className="mt-4 space-y-3">
                  {miniProgramCampaigns.map((campaign) => {
                    const tone = getMiniProgramToneStyle(campaign.tone);
                    return (
                      <div
                        key={campaign.id}
                        className={cn(
                          "rounded-[22px] border px-4 py-4",
                          tone.mutedPanelClassName,
                        )}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-medium text-[color:var(--text-primary)]">
                            {campaign.title}
                          </div>
                          <div
                            className={cn(
                              "rounded-md border px-2.5 py-1 text-[10px] font-medium",
                              tone.badgeClassName,
                            )}
                          >
                            {campaign.meta}
                          </div>
                        </div>
                        <div className="mt-2 text-sm leading-7 text-[color:var(--text-secondary)]">
                          {campaign.description}
                        </div>
                        <div className="mt-3 text-xs text-[color:var(--text-muted)]">
                          {campaign.ctaLabel}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-[22px] border border-black/6 bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-[color:var(--text-primary)]">
                      浏览目录
                    </div>
                    <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">
                      {searchText
                        ? "当前结果按搜索和分类筛过。"
                        : "这里承接桌面端完整小程序目录。"}
                    </div>
                  </div>
                  <div className="text-xs text-[color:var(--text-muted)]">
                    {visibleMiniPrograms.length} 个
                  </div>
                </div>

                {visibleMiniPrograms.length ? (
                  <div className="mt-4 space-y-3">
                    {visibleMiniPrograms.map((miniProgram) => (
                      <MiniProgramListRow
                        key={miniProgram.id}
                        miniProgram={miniProgram}
                        active={selectedMiniProgram.id === miniProgram.id}
                        pinned={pinnedMiniProgramIds.includes(miniProgram.id)}
                        launchCount={launchCountById[miniProgram.id] ?? 0}
                        lastOpenedAt={lastOpenedAtById[miniProgram.id]}
                        onOpen={onOpenMiniProgram}
                        onSelect={onSelectMiniProgram}
                        onTogglePinned={onTogglePinnedMiniProgram}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="没有匹配的小程序"
                    description="换个关键词，或者切回全部分类继续浏览。"
                  />
                )}
              </section>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function SidebarCard({
  title,
  emptyText,
  children,
}: {
  title: string;
  emptyText: string;
  children: ReactNode;
}) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);

  return (
    <div className="rounded-[18px] border border-black/6 bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
      <div className="text-sm font-medium text-[color:var(--text-primary)]">
        {title}
      </div>
      <div className="mt-3 space-y-2">
        {hasChildren ? (
          children
        ) : (
          <div className="rounded-[16px] border border-dashed border-black/8 bg-[#f8f8f8] px-3 py-4 text-xs leading-6 text-[color:var(--text-muted)]">
            {emptyText}
          </div>
        )}
      </div>
    </div>
  );
}

function SidebarMiniProgramButton({
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
        "flex w-full items-center gap-3 rounded-[18px] border px-3 py-3 text-left transition",
        active
          ? "border-[#b7e4c7] bg-[#edf8f0]"
          : "border-black/6 bg-[#f8f8f8] hover:bg-white",
      )}
    >
      <MiniProgramGlyph miniProgram={miniProgram} size="sm" />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
          {miniProgram.name}
        </div>
        <div className="mt-1 text-xs text-[color:var(--text-muted)]">{detail}</div>
      </div>
    </button>
  );
}

function DesktopMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-white/18 bg-white/12 px-4 py-4 backdrop-blur-sm">
      <div className="text-[11px] uppercase tracking-[0.14em] text-white/68">
        {label}
      </div>
      <div className="mt-2 text-sm font-medium text-white">{value}</div>
    </div>
  );
}

function MiniProgramGridCard({
  miniProgram,
  active,
  pinned,
  detail,
  onOpen,
  onSelect,
  onTogglePinned,
}: {
  miniProgram: MiniProgramEntry;
  active: boolean;
  pinned: boolean;
  detail: string;
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
        "rounded-[24px] border px-4 py-4 text-left transition",
        active
          ? tone.mutedPanelClassName
          : "border-black/6 bg-[#f8f8f8] hover:bg-white",
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
                "rounded-md border px-2 py-0.5 text-[10px] font-medium",
                tone.badgeClassName,
              )}
            >
              {miniProgram.deckLabel}
            </div>
          </div>
          <div className="mt-2 text-sm leading-7 text-[color:var(--text-secondary)]">
            {detail}
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
          className="border-white/80 bg-white/84"
        >
          {pinned ? "移出常用" : "加入常用"}
        </Button>
      </div>
    </button>
  );
}

function MiniProgramListRow({
  miniProgram,
  active,
  pinned,
  launchCount,
  lastOpenedAt,
  onOpen,
  onSelect,
  onTogglePinned,
}: {
  miniProgram: MiniProgramEntry;
  active: boolean;
  pinned: boolean;
  launchCount: number;
  lastOpenedAt?: string;
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
        "w-full rounded-[22px] border px-4 py-4 text-left transition",
        active
          ? tone.mutedPanelClassName
          : "border-black/6 bg-[#f8f8f8] hover:bg-white",
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
                "rounded-md border px-2 py-0.5 text-[10px] font-medium",
                tone.badgeClassName,
              )}
            >
              {miniProgram.deckLabel}
            </div>
          </div>
          <div className="mt-2 text-sm leading-7 text-[color:var(--text-secondary)]">
            {miniProgram.slogan}
          </div>
          <div className="mt-2 text-[11px] leading-5 text-[color:var(--text-dim)]">
            {lastOpenedAt
              ? `上次打开 ${formatConversationTimestamp(lastOpenedAt)} · 已打开 ${launchCount} 次`
              : `还没有打开过 · 当前${pinned ? "已加入我的小程序" : "仅在目录中"}`}
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
          className="border-white/80 bg-white/84"
        >
          {pinned ? "移出常用" : "加入常用"}
        </Button>
      </div>
    </button>
  );
}
