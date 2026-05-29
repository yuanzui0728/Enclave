import type { ReactNode } from "react";
import { msg } from "@lingui/macro";
import { useRuntimeTranslator } from "@yinjie/i18n";
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
  panelMiniProgramId?: string | null;
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
  panelMiniProgramId = null,
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
  const t = useRuntimeTranslator();
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
  const showEmptyResults = hasFiltering && !visibleMiniPrograms.length;

  return (
    <div className="relative isolate flex h-full min-h-0 bg-[color:var(--bg-app)]">
      <aside className="flex w-[288px] shrink-0 flex-col border-r border-[color:var(--border-faint)] bg-[color:var(--surface-shell)]">
        <div className="border-b border-[color:var(--border-faint)] bg-white/78 px-5 py-5 backdrop-blur-xl">
          <div className="text-[length:var(--text-eyebrow)] font-medium text-[color:var(--text-muted)]">
            Mini Programs
          </div>
          <div className="mt-2 text-[length:var(--text-section)] font-semibold text-[color:var(--text-primary)]">
            {t(msg`小程序面板`)}
          </div>
          <div className="mt-2 text-[length:var(--text-caption)] leading-6 text-[color:var(--text-secondary)]">
            {t(msg`按微信电脑版工作区节奏，把最近使用、我的小程序、搜索和专题推荐统一收口。`)}
          </div>
        </div>

        <div className="min-h-0 space-y-4 overflow-auto bg-[color:var(--surface-shell)] px-4 py-4">
          <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-4 shadow-[var(--shadow-section)]">
            <label className="relative block">
              <input
                type="search"
                value={searchText}
                onChange={(event) => onSearchTextChange(event.target.value)}
                placeholder={t(msg`搜索小程序、服务和场景`)}
                className="h-11 w-full rounded-[var(--radius-md)] border border-transparent bg-[color:var(--state-info-bg)] px-4 pr-12 text-sm text-[color:var(--text-primary)] outline-none transition-[background-color,border-color] placeholder:text-[color:var(--text-dim)] focus:border-[color:var(--border-faint)] focus:bg-white"
              />
              {searchText ? (
                <button
                  type="button"
                  onClick={() => onSearchTextChange("")}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-[color:var(--text-muted)]"
                >
                  {t(msg`清空`)}
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
                      ? "border-[color-mix(in_srgb,var(--brand-primary)_14%,transparent)] bg-[color-mix(in_srgb,var(--brand-primary)_7%,transparent)]"
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

          <SidebarCard
            title={t(msg`最近使用`)}
            emptyText={t(msg`打开过的小程序会沉淀在这里，形成和微信类似的最近入口。`)}
          >
            {recentMiniPrograms.map((miniProgram) => (
              <SidebarMiniProgramButton
                key={miniProgram.id}
                miniProgram={miniProgram}
                active={selectedMiniProgram.id === miniProgram.id}
                detail={
                  lastOpenedAtById[miniProgram.id]
                    ? t(
                        msg`上次打开 ${formatConversationTimestamp(
                          lastOpenedAtById[miniProgram.id],
                        )}`,
                      )
                    : t(msg`还没有打开过`)
                }
                onClick={() => onSelectMiniProgram(miniProgram.id)}
              />
            ))}
          </SidebarCard>

          <SidebarCard
            title={t(msg`我的小程序`)}
            emptyText={t(msg`点击推荐区的“加入我的小程序”，这里就会形成固定常用入口。`)}
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
        <div className="border-b border-[color:var(--border-faint)] bg-white/78 px-6 py-5 backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-[length:var(--text-eyebrow)] font-medium text-[color:var(--text-muted)]">
                {t(msg`微信式桌面工作区`)}
              </div>
              <div className="mt-1 text-[20px] font-semibold text-[color:var(--text-primary)]">
                {t(msg`最近使用、我的小程序、专题推荐和打开态都放进一个工作区`)}
              </div>
              <div className="mt-1 text-[length:var(--text-caption)] leading-6 text-[color:var(--text-muted)]">
                {searchText
                  ? t(
                      msg`当前搜索“${searchText.trim()}”命中 ${visibleMiniPrograms.length} 个小程序。`,
                    )
                  : t(msg`当前先以轻工作台承接最近任务，并支持把指定小程序接力到手机继续。`)}
              </div>
            </div>
            {successNotice ? <InlineNotice tone={noticeTone}>{successNotice}</InlineNotice> : null}
          </div>
          {launchContext ? (
            <div className="mt-4">
              <InlineNotice tone="info">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm leading-6 text-[color:var(--text-secondary)]">
                    {t(
                      msg`正在从“${launchContext.sourceGroupName}”打开群接龙，可以边看群聊边处理报名和回填。`,
                    )}
                  </div>
                  {onReturnToGroup ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={onReturnToGroup}
                      className="shrink-0 rounded-xl"
                    >
                      {t(msg`返回群聊`)}
                    </Button>
                  ) : null}
                </div>
              </InlineNotice>
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-[rgba(255,255,255,0.62)] px-6 py-6">
          {showEmptyResults ? (
            <div className="rounded-[22px] border border-[color:var(--border-faint)] bg-white p-8 shadow-[var(--shadow-card)]">
              <EmptyState
                title={t(msg`没有匹配的小程序`)}
                description={
                  searchText.trim()
                    ? t(
                        msg`当前搜索“${searchText.trim()}”没有命中结果，试试换个关键词或切回全部分类。`,
                      )
                    : t(msg`当前分类下还没有可展示的小程序，切换到其他分类看看。`)
                }
              />
            </div>
          ) : (
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
                      <div className="inline-flex rounded-full border border-white/18 bg-white/12 px-3 py-1 text-[length:var(--text-eyebrow)] font-medium tracking-[0.18em] text-white/82">
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
                    <DesktopMetric
                      label={t(msg`最近状态`)}
                      value={selectedMiniProgram.serviceLabel}
                    />
                    <DesktopMetric
                      label={t(msg`更新`)}
                      value={selectedMiniProgram.updateNote}
                    />
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
                      {t(msg`打开小程序`)}
                    </Button>
                    <Button
                      variant="secondary"
                      size="lg"
                      onClick={() => onTogglePinnedMiniProgram(selectedMiniProgram.id)}
                      className="border-white/18 bg-white/10 text-white hover:bg-white/18"
                    >
                      {pinnedMiniProgramIds.includes(selectedMiniProgram.id)
                        ? t(msg`移出我的小程序`)
                        : t(msg`加入我的小程序`)}
                    </Button>
                  </div>
                </div>
              </article>

              <section className="rounded-[22px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-card)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-[color:var(--text-primary)]">
                      {t(msg`最近使用`)}
                    </div>
                    <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">
                      {t(msg`桌面端优先给出最近打开的小程序，形成类似微信面板的稳定回访入口。`)}
                    </div>
                  </div>
                  <div className="text-xs text-[color:var(--text-muted)]">
                    {t(msg`${recentMiniPrograms.length} 个`)}
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
                          ? t(
                              msg`上次打开 ${formatConversationTimestamp(
                                lastOpenedAtById[miniProgram.id],
                              )}`,
                            )
                          : t(msg`还没有打开过`)
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
                  className="rounded-[22px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-card)]"
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
                      {t(msg`${shelf.miniPrograms.length} 个`)}
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
                isActive={panelIsActive}
                isPinned={pinnedMiniProgramIds.includes(
                  panelMiniProgram.id,
                )}
                launchCount={launchCountById[panelMiniProgram.id] ?? 0}
                lastOpenedAt={lastOpenedAtById[panelMiniProgram.id]}
                tasks={panelTasks}
                onDismiss={panelIsActive ? onDismissActiveMiniProgram : undefined}
                onCopyToMobile={onCopyMiniProgramToMobile}
                onOpen={onOpenMiniProgram}
                onToggleTask={onToggleMiniProgramTask}
                onTogglePinned={onTogglePinnedMiniProgram}
              />

              {launchContext && panelMiniProgram.id === "group-relay" ? (
                <section className="rounded-[22px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-card)]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-[color:var(--text-primary)]">
                        {t(msg`回填到原群聊`)}
                      </div>
                      <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">
                        {t(
                          msg`把当前接龙进度同步回“${launchContext.sourceGroupName}”，减少群成员反复追问。`,
                        )}
                      </div>
                    </div>
                    <div className="rounded-full border border-[color-mix(in_srgb,var(--brand-primary)_14%,transparent)] bg-[color-mix(in_srgb,var(--brand-primary)_7%,transparent)] px-3 py-1 text-[length:var(--text-eyebrow)] font-medium text-[color:var(--brand-primary)]">
                      {t(msg`群接龙闭环`)}
                    </div>
                  </div>

                  <div className="mt-4 rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-4">
                    <div className="text-[length:var(--text-eyebrow)] font-medium text-[color:var(--text-muted)]">
                      {t(msg`发送预览`)}
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
                      {relaySummaryPending
                        ? t(msg`回填中...`)
                        : t(msg`一键回填到群聊`)}
                    </Button>
                    <div className="text-xs leading-6 text-[color:var(--text-muted)]">
                      {t(msg`先用固定文案把工作台状态发回群聊，后续再补真实接龙结果卡片。`)}
                    </div>
                  </div>
                </section>
              ) : null}

              <section className="rounded-[22px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-card)]">
                <div className="text-sm font-medium text-[color:var(--text-primary)]">
                  {t(msg`今日推荐`)}
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

              <section className="rounded-[22px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-card)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-[color:var(--text-primary)]">
                      {t(msg`浏览目录`)}
                    </div>
                    <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">
                      {searchText
                        ? t(msg`当前结果按搜索和分类筛过。`)
                        : t(msg`这里承接桌面端完整小程序目录。`)}
                    </div>
                  </div>
                  <div className="text-xs text-[color:var(--text-muted)]">
                    {t(msg`${visibleMiniPrograms.length} 个`)}
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
                    title={t(msg`没有匹配的小程序`)}
                    description={t(msg`换个关键词，或者切回全部分类继续浏览。`)}
                  />
                )}
                </section>
              </div>
            </div>
          )}
        </div>
      </section>
      <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[3px]">
        <div className="rounded-2xl border border-[color:var(--border-faint)] bg-white/95 px-8 py-6 text-center shadow-[var(--shadow-card)]">
          <div className="text-lg font-semibold text-[color:var(--text-primary)]">
            {t(msg`功能开发中`)}
          </div>
          <div className="mt-2 text-sm text-[color:var(--text-secondary)]">
            {t(msg`敬请期待`)}
          </div>
        </div>
      </div>
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
    <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-4 shadow-[var(--shadow-section)]">
      <div className="text-sm font-medium text-[color:var(--text-primary)]">
        {title}
      </div>
      <div className="mt-3 space-y-2">
        {hasChildren ? (
          children
        ) : (
          <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 py-4 text-xs leading-6 text-[color:var(--text-muted)]">
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
          ? "border-[color-mix(in_srgb,var(--brand-primary)_14%,transparent)] bg-[color-mix(in_srgb,var(--brand-primary)_7%,transparent)]"
          : "border-[color:var(--border-faint)] bg-[color:var(--surface-console)] hover:bg-white",
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
      <div className="text-[length:var(--text-eyebrow)] uppercase tracking-[0.14em] text-white/68">
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
  const t = useRuntimeTranslator();
  const tone = getMiniProgramToneStyle(miniProgram.tone);

  return (
    <button
      type="button"
      onClick={() => onSelect(miniProgram.id)}
      className={cn(
        "rounded-[var(--radius-xl)] border px-4 py-4 text-left transition",
        active
          ? tone.mutedPanelClassName
          : "border-[color:var(--border-faint)] bg-[color:var(--surface-console)] hover:bg-white",
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
          {t(msg`打开`)}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={(event) => {
            event.stopPropagation();
            onTogglePinned(miniProgram.id);
          }}
          className="border-[color:var(--border-faint)] bg-white shadow-none hover:bg-[color:var(--surface-console)]"
        >
          {pinned ? t(msg`移出常用`) : t(msg`加入常用`)}
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
  const t = useRuntimeTranslator();
  const tone = getMiniProgramToneStyle(miniProgram.tone);

  return (
    <button
      type="button"
      onClick={() => onSelect(miniProgram.id)}
      className={cn(
        "w-full rounded-[22px] border px-4 py-4 text-left transition",
        active
          ? tone.mutedPanelClassName
          : "border-[color:var(--border-faint)] bg-[color:var(--surface-console)] hover:bg-white",
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
          <div className="mt-2 text-[length:var(--text-eyebrow)] leading-5 text-[color:var(--text-dim)]">
            {lastOpenedAt
              ? t(
                  msg`上次打开 ${formatConversationTimestamp(lastOpenedAt)} · 已打开 ${launchCount} 次`,
                )
              : pinned
                ? t(msg`还没有打开过 · 当前已加入我的小程序`)
                : t(msg`还没有打开过 · 当前仅在目录中`)}
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
          {t(msg`打开`)}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={(event) => {
            event.stopPropagation();
            onTogglePinned(miniProgram.id);
          }}
          className="border-[color:var(--border-faint)] bg-white shadow-none hover:bg-[color:var(--surface-console)]"
        >
          {pinned ? t(msg`移出常用`) : t(msg`加入常用`)}
        </Button>
      </div>
    </button>
  );
}
