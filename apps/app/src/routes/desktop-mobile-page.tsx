import type { Dispatch, SetStateAction } from "react";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  getConversations,
  getSystemStatus,
  listOfficialAccounts,
  type ConversationListItem,
  type OfficialAccountSummary,
} from "@yinjie/contracts";
import {
  ArrowUpRight,
  Blocks,
  CheckCircle2,
  Copy,
  RefreshCw,
  RadioTower,
  Smartphone,
  Wifi,
} from "lucide-react";
import { Button, ErrorBlock, InlineNotice, LoadingBlock } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { EmptyState } from "../components/empty-state";
import {
  readLiveDraft,
  readLiveHistory,
  type LiveSessionRecord,
} from "../features/desktop/channels/live-companion-storage";
import {
  getMiniProgramEntry,
  getMiniProgramWorkspaceTasks,
  resolveMiniProgramEntries,
  type MiniProgramEntry,
} from "../features/mini-programs/mini-programs-data";
import { readMiniProgramsState } from "../features/mini-programs/mini-programs-storage";
import { DesktopEntryShell } from "../features/desktop/desktop-entry-shell";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import {
  pushMobileHandoffRecord,
  readMobileHandoffHistory,
  resolveMobileHandoffLink,
  type MobileHandoffRecord,
} from "../features/shell/mobile-handoff-storage";
import {
  formatConversationTimestamp,
  formatTimestamp,
  parseTimestamp,
} from "../lib/format";
import { isPersistedGroupConversation } from "../lib/conversation-route";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

type QuickEntry = {
  id: string;
  label: string;
  description: string;
  to: string;
};

type MobileHandoffCategory =
  | "messages"
  | "official"
  | "mini_program"
  | "channel"
  | "shortcut"
  | "other";

const mobileHandoffCategoryMeta: Array<{
  id: MobileHandoffCategory;
  label: string;
  description: string;
}> = [
  {
    id: "messages",
    label: "消息",
    description: "单聊、群聊和消息列表入口。",
  },
  {
    id: "official",
    label: "公众号",
    description: "公众号主页和文章阅读入口。",
  },
  {
    id: "mini_program",
    label: "小程序",
    description: "小程序工作台和最近使用入口。",
  },
  {
    id: "channel",
    label: "视频号 / 直播",
    description: "频道内容和直播接力入口。",
  },
  {
    id: "shortcut",
    label: "快捷入口",
    description: "通讯录、发现、设置等全局入口。",
  },
  {
    id: "other",
    label: "其他",
    description: "未归入主链路的补充接力入口。",
  },
];

const quickEntries: QuickEntry[] = [
  {
    id: "chat",
    label: "消息",
    description: "回到手机端消息列表，继续处理最近会话。",
    to: "/tabs/chat",
  },
  {
    id: "contacts",
    label: "通讯录",
    description: "在手机端继续查看联系人、星标朋友和公众号入口。",
    to: "/tabs/contacts",
  },
  {
    id: "discover",
    label: "发现",
    description: "切回手机端发现页，继续进入朋友圈与广场动态。",
    to: "/tabs/discover",
  },
  {
    id: "settings",
    label: "设置",
    description: "把资料编辑、API Key 和世界配置切到手机端继续处理。",
    to: "/profile/settings",
  },
];

export function DesktopMobilePage() {
  const isDesktopLayout = useDesktopLayout();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const ownerName = useWorldOwnerStore((state) => state.username);
  const ownerAvatar = useWorldOwnerStore((state) => state.avatar);
  const ownerSignature = useWorldOwnerStore((state) => state.signature);
  const [notice, setNotice] = useState<string | null>(null);
  const [handoffHistory, setHandoffHistory] = useState<MobileHandoffRecord[]>(
    () => readMobileHandoffHistory(),
  );
  const [liveDraft, setLiveDraft] = useState(() => readLiveDraft());
  const [liveHistory, setLiveHistory] = useState<LiveSessionRecord[]>(() =>
    readLiveHistory(),
  );
  const [miniProgramsState, setMiniProgramsState] = useState(() =>
    readMiniProgramsState(),
  );

  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
  });

  const officialAccountsQuery = useQuery({
    queryKey: ["app-official-accounts", baseUrl],
    queryFn: () => listOfficialAccounts(baseUrl),
  });

  const systemStatusQuery = useQuery({
    queryKey: ["desktop-mobile-system-status", baseUrl],
    queryFn: () => getSystemStatus(baseUrl),
  });

  const recentConversations = useMemo(
    () =>
      [...(conversationsQuery.data ?? [])]
        .sort(
          (left, right) =>
            (parseTimestamp(right.lastActivityAt) ?? 0) -
            (parseTimestamp(left.lastActivityAt) ?? 0),
        )
        .slice(0, 4),
    [conversationsQuery.data],
  );

  const recentArticles = useMemo(
    () =>
      (officialAccountsQuery.data ?? [])
        .filter((account) => account.recentArticle)
        .sort(
          (left, right) =>
            (parseTimestamp(right.recentArticle?.publishedAt) ?? 0) -
            (parseTimestamp(left.recentArticle?.publishedAt) ?? 0),
        )
        .slice(0, 4),
    [officialAccountsQuery.data],
  );
  const activeLiveSession =
    liveHistory.find((item) => item.status === "live") ?? null;
  const activeMiniProgram = miniProgramsState.activeMiniProgramId
    ? getMiniProgramEntry(miniProgramsState.activeMiniProgramId)
    : null;
  const recentMiniPrograms = resolveMiniProgramEntries(
    miniProgramsState.recentMiniProgramIds,
  ).slice(0, 4);

  const syncTimestamp = useMemo(() => {
    const candidates = [
      systemStatusQuery.data?.scheduler.lastWorldSnapshotAt,
      systemStatusQuery.data?.inferenceGateway.lastSuccessAt,
      recentConversations[0]?.lastActivityAt,
      recentArticles[0]?.recentArticle?.publishedAt,
    ]
      .map((value) => parseTimestamp(value))
      .filter((value): value is number => value !== null);

    if (!candidates.length) {
      return null;
    }

    return new Date(Math.max(...candidates)).toISOString();
  }, [recentArticles, recentConversations, systemStatusQuery.data]);

  const connectedLabel = systemStatusQuery.data?.coreApi.healthy
    ? "已连接"
    : "待检查";
  const syncLabel = syncTimestamp ? formatTimestamp(syncTimestamp) : "暂无记录";
  const handoffLabel = handoffHistory[0]
    ? formatTimestamp(handoffHistory[0].sentAt)
    : "还没有发送记录";
  const groupedHandoffHistory = useMemo(
    () =>
      mobileHandoffCategoryMeta
        .map((group) => ({
          ...group,
          items: handoffHistory.filter(
            (item) => resolveMobileHandoffCategory(item) === group.id,
          ),
        }))
        .filter((group) => group.items.length),
    [handoffHistory],
  );

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => setNotice(null), 2200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  if (!isDesktopLayout) {
    return null;
  }

  return (
    <div className="h-full overflow-auto px-6 py-6">
      <DesktopEntryShell
        badge="Mobile"
        title="手机接力把桌面内容带到移动端"
        description="手机入口先收口真实的跨端继续能力：用当前远程世界的会话、公众号和系统状态做面板内容，再把目标链接复制给手机端继续查看。"
        aside={
          <div className="space-y-4">
            <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-white/90 p-5 shadow-[var(--shadow-soft)]">
              <div className="flex items-center gap-4">
                <AvatarChip
                  name={ownerName ?? "世界主人"}
                  src={ownerAvatar}
                  size="xl"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-[color:var(--text-primary)]">
                    {ownerName ?? "世界主人"}
                  </div>
                  <div className="mt-1 line-clamp-2 text-xs leading-5 text-[color:var(--text-secondary)]">
                    {ownerSignature?.trim() || "这台桌面端正在承接你的世界。"}
                  </div>
                </div>
              </div>
            </div>

            <MetricCard label="连接状态" value={connectedLabel} />
            <MetricCard label="最近同步" value={syncLabel} />
            <MetricCard label="最近接力" value={handoffLabel} />
          </div>
        }
      >
        <div className="space-y-5">
          {notice ? <InlineNotice tone="success">{notice}</InlineNotice> : null}

          {conversationsQuery.isError &&
          conversationsQuery.error instanceof Error ? (
            <ErrorBlock message={conversationsQuery.error.message} />
          ) : null}
          {officialAccountsQuery.isError &&
          officialAccountsQuery.error instanceof Error ? (
            <ErrorBlock message={officialAccountsQuery.error.message} />
          ) : null}
          {systemStatusQuery.isError &&
          systemStatusQuery.error instanceof Error ? (
            <ErrorBlock message={systemStatusQuery.error.message} />
          ) : null}

          <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
            <section className="rounded-[28px] border border-[color:var(--border-faint)] bg-white/92 p-5 shadow-[var(--shadow-soft)]">
              <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--text-primary)]">
                <Smartphone
                  size={16}
                  className="text-[color:var(--brand-primary)]"
                />
                <span>手机入口</span>
              </div>
              <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
                常用手机端入口先固定在这里，点击即可复制深链接，发到手机后继续浏览。
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {quickEntries.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-[22px] border border-[color:var(--border-faint)] bg-[rgba(255,250,244,0.84)] p-4"
                  >
                    <div className="text-sm font-medium text-[color:var(--text-primary)]">
                      {item.label}
                    </div>
                    <div className="mt-2 text-xs leading-5 text-[color:var(--text-secondary)]">
                      {item.description}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() =>
                          void handleCopyHandoff({
                            description: item.description,
                            label: item.label,
                            path: item.to,
                            setHistory: setHandoffHistory,
                            setNotice,
                          })
                        }
                        className="rounded-full"
                      >
                        <Copy size={14} />
                        复制到手机
                      </Button>
                      <Link
                        to={item.to as never}
                        className="inline-flex h-9 items-center justify-center rounded-full border border-[color:var(--border-faint)] px-4 text-xs font-medium text-[color:var(--text-secondary)] transition hover:text-[color:var(--text-primary)]"
                      >
                        桌面打开
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[28px] border border-[color:var(--border-faint)] bg-white/92 p-5 shadow-[var(--shadow-soft)]">
              <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--text-primary)]">
                <Wifi size={16} className="text-[color:var(--brand-primary)]" />
                <span>同步概览</span>
              </div>
              <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
                这里不新造设备接口，先用当前世界的真实运行状态来判断手机接力是否值得继续。
              </div>

              {systemStatusQuery.isLoading ? (
                <div className="mt-4">
                  <LoadingBlock label="正在检查同步状态..." />
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  <StatusRow
                    label="Core API"
                    value={
                      systemStatusQuery.data?.coreApi.healthy
                        ? "世界在线"
                        : "连接异常"
                    }
                  />
                  <StatusRow
                    label="数据库"
                    value={
                      systemStatusQuery.data?.database.connected
                        ? "已连接"
                        : "未连接"
                    }
                  />
                  <StatusRow
                    label="推理网关"
                    value={
                      systemStatusQuery.data?.inferenceGateway.healthy
                        ? "可用"
                        : "待恢复"
                    }
                  />
                  <StatusRow
                    label="世界主人"
                    value={`${systemStatusQuery.data?.worldSurface.ownerCount ?? 0} / 1`}
                  />
                  <StatusRow
                    label="最近快照"
                    value={
                      systemStatusQuery.data?.scheduler.lastWorldSnapshotAt
                        ? formatTimestamp(
                            systemStatusQuery.data.scheduler
                              .lastWorldSnapshotAt,
                          )
                        : "暂无"
                    }
                  />
                </div>
              )}
            </section>
          </div>

          <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
            <section className="rounded-[28px] border border-[color:var(--border-faint)] bg-white/92 p-5 shadow-[var(--shadow-soft)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-[color:var(--text-primary)]">
                    最近会话
                  </div>
                  <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
                    先按最近活跃会话做接力，桌面和手机之间切换会更顺。
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void conversationsQuery.refetch()}
                  className="rounded-full"
                >
                  <RefreshCw size={14} />
                  刷新
                </Button>
              </div>

              <div className="mt-4 space-y-3">
                {conversationsQuery.isLoading ? (
                  <LoadingBlock label="正在读取会话..." />
                ) : recentConversations.length ? (
                  recentConversations.map((item) => (
                    <RecentConversationRow
                      key={item.id}
                      item={item}
                      onCopy={() =>
                        void handleCopyHandoff({
                          description:
                            item.lastMessage?.text ||
                            "继续查看这段会话的最新消息。",
                          label: item.title,
                          path:
                            isPersistedGroupConversation(item)
                              ? `/group/${item.id}`
                              : `/chat/${item.id}`,
                          setHistory: setHandoffHistory,
                          setNotice,
                        })
                      }
                    />
                  ))
                ) : (
                  <EmptyState
                    title="还没有最近会话"
                    description="先回消息里产生一些对话，这里就会开始出现手机接力入口。"
                  />
                )}
              </div>
            </section>

            <section className="rounded-[28px] border border-[color:var(--border-faint)] bg-white/92 p-5 shadow-[var(--shadow-soft)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-[color:var(--text-primary)]">
                    最近公众号内容
                  </div>
                  <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
                    公众号阅读在手机上更顺手，这里直接复制最近文章或账号主页。
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void officialAccountsQuery.refetch()}
                  className="rounded-full"
                >
                  <RefreshCw size={14} />
                  刷新
                </Button>
              </div>

              <div className="mt-4 space-y-3">
                {officialAccountsQuery.isLoading ? (
                  <LoadingBlock label="正在读取公众号..." />
                ) : recentArticles.length ? (
                  recentArticles.map((account) => (
                    <RecentArticleRow
                      key={account.id}
                      account={account}
                      onCopyAccount={() =>
                        void handleCopyHandoff({
                          description: "继续查看账号资料与最近推送。",
                          label: `${account.name} 主页`,
                          path: `/official-accounts/${account.id}`,
                          setHistory: setHandoffHistory,
                          setNotice,
                        })
                      }
                      onCopyArticle={() =>
                        void handleCopyHandoff({
                          description:
                            account.recentArticle?.summary ||
                            "继续阅读这篇公众号文章。",
                          label: account.recentArticle?.title ?? account.name,
                          path: `/official-accounts/articles/${account.recentArticle?.id}`,
                          setHistory: setHandoffHistory,
                          setNotice,
                        })
                      }
                    />
                  ))
                ) : (
                  <EmptyState
                    title="还没有最近文章"
                    description="等公众号有推送后，这里会直接出现可接力到手机的阅读入口。"
                  />
                )}
              </div>
            </section>
          </div>

          <section className="rounded-[28px] border border-[color:var(--border-faint)] bg-white/92 p-5 shadow-[var(--shadow-soft)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--text-primary)]">
                  <Blocks
                    size={16}
                    className="text-[color:var(--brand-primary)]"
                  />
                  <span>小程序接力</span>
                </div>
                <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
                  桌面小程序面板里的当前工作台和最近使用，会从这里直接发到手机继续。
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  to="/tabs/mini-programs"
                  className="inline-flex h-9 items-center justify-center rounded-full border border-[color:var(--border-faint)] px-4 text-xs font-medium text-[color:var(--text-secondary)] transition hover:text-[color:var(--text-primary)]"
                >
                  打开小程序面板
                </Link>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const nextMiniProgramsState = readMiniProgramsState();
                    setMiniProgramsState(nextMiniProgramsState);
                    setNotice(
                      nextMiniProgramsState.activeMiniProgramId
                        ? "已刷新小程序接力内容。"
                        : "小程序面板里还没有可同步到手机的最近使用。",
                    );
                  }}
                  className="rounded-full"
                >
                  <RefreshCw size={14} />
                  刷新
                </Button>
              </div>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
              <div className="rounded-[22px] border border-[color:var(--border-faint)] bg-[rgba(255,250,244,0.82)] p-4">
                <div className="text-sm font-medium text-[color:var(--text-primary)]">
                  当前小程序工作台
                </div>
                {activeMiniProgram ? (
                  <MiniProgramHandoffCard
                    miniProgram={activeMiniProgram}
                    launchCount={
                      miniProgramsState.launchCountById[activeMiniProgram.id] ??
                      0
                    }
                    lastOpenedAt={
                      miniProgramsState.lastOpenedAtById[activeMiniProgram.id]
                    }
                    completedTaskCount={
                      getMiniProgramWorkspaceTasks(
                        activeMiniProgram.id,
                        miniProgramsState.completedTaskIdsByMiniProgramId[
                          activeMiniProgram.id
                        ] ?? [],
                      ).filter((task) => task.completed).length
                    }
                    totalTaskCount={
                      getMiniProgramWorkspaceTasks(
                        activeMiniProgram.id,
                        miniProgramsState.completedTaskIdsByMiniProgramId[
                          activeMiniProgram.id
                        ] ?? [],
                      ).length
                    }
                    pinned={miniProgramsState.pinnedMiniProgramIds.includes(
                      activeMiniProgram.id,
                    )}
                    buttonLabel="发当前工作台到手机"
                    onCopy={() =>
                      void handleCopyHandoff({
                        description: `${activeMiniProgram.name} 的当前工作台，带上最近使用和本地待办上下文。`,
                        label: `${activeMiniProgram.name} 接力`,
                        path: `/discover/mini-programs?miniProgram=${activeMiniProgram.id}`,
                        setHistory: setHandoffHistory,
                        setNotice,
                      })
                    }
                  />
                ) : (
                  <div className="mt-4">
                    <EmptyState
                      title="还没有当前小程序"
                      description="先在桌面小程序面板里打开一个入口，这里就会出现可接力到手机的工作台。"
                    />
                  </div>
                )}
              </div>

              <div className="rounded-[22px] border border-[color:var(--border-faint)] bg-[rgba(255,250,244,0.82)] p-4">
                <div className="text-sm font-medium text-[color:var(--text-primary)]">
                  最近使用小程序
                </div>
                <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
                  最近在桌面打开过的小程序，会直接形成手机继续入口。
                </div>

                <div className="mt-4 space-y-3">
                  {recentMiniPrograms.length ? (
                    recentMiniPrograms.map((miniProgram) => (
                      <MiniProgramHandoffCard
                        key={miniProgram.id}
                        miniProgram={miniProgram}
                        launchCount={
                          miniProgramsState.launchCountById[miniProgram.id] ?? 0
                        }
                        lastOpenedAt={
                          miniProgramsState.lastOpenedAtById[miniProgram.id]
                        }
                        completedTaskCount={
                          getMiniProgramWorkspaceTasks(
                            miniProgram.id,
                            miniProgramsState.completedTaskIdsByMiniProgramId[
                              miniProgram.id
                            ] ?? [],
                          ).filter((task) => task.completed).length
                        }
                        totalTaskCount={
                          getMiniProgramWorkspaceTasks(
                            miniProgram.id,
                            miniProgramsState.completedTaskIdsByMiniProgramId[
                              miniProgram.id
                            ] ?? [],
                          ).length
                        }
                        pinned={miniProgramsState.pinnedMiniProgramIds.includes(
                          miniProgram.id,
                        )}
                        buttonLabel="发到手机继续"
                        onCopy={() =>
                          void handleCopyHandoff({
                            description: `${miniProgram.name} 的当前工作台，带上最近使用和本地待办上下文。`,
                            label: `${miniProgram.name} 接力`,
                            path: `/discover/mini-programs?miniProgram=${miniProgram.id}`,
                            setHistory: setHandoffHistory,
                            setNotice,
                          })
                        }
                      />
                    ))
                  ) : (
                    <EmptyState
                      title="还没有最近小程序"
                      description="先在桌面小程序面板里打开几个入口，这里就会开始出现可接力到手机的最近记录。"
                    />
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-[color:var(--border-faint)] bg-white/92 p-5 shadow-[var(--shadow-soft)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--text-primary)]">
                  <RadioTower
                    size={16}
                    className="text-[color:var(--brand-primary)]"
                  />
                  <span>直播接力</span>
                </div>
                <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
                  桌面直播伴侣里的准备稿和最近直播记录，会优先从这里发到手机继续跟进。
                </div>
              </div>
              <Link
                to="/desktop/channels/live-companion"
                className="inline-flex h-9 items-center justify-center rounded-full border border-[color:var(--border-faint)] px-4 text-xs font-medium text-[color:var(--text-secondary)] transition hover:text-[color:var(--text-primary)]"
              >
                打开直播伴侣
              </Link>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
              <div className="rounded-[22px] border border-[color:var(--border-faint)] bg-[rgba(255,250,244,0.82)] p-4">
                <div className="text-sm font-medium text-[color:var(--text-primary)]">
                  当前直播准备
                </div>
                <div className="mt-2 text-xs leading-5 text-[color:var(--text-secondary)]">
                  {liveDraft.title.trim()
                    ? `${liveDraft.title} · ${liveDraft.topic || "未填写主题"}`
                    : "直播伴侣里还没有填写准备稿。"}
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[color:var(--text-muted)]">
                  <span>模式 {resolveLiveModeLabel(liveDraft.mode)}</span>
                  <span>质量 {resolveLiveQualityLabel(liveDraft.quality)}</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={!liveDraft.title.trim()}
                    onClick={() =>
                      void handleCopyHandoff({
                        description: liveDraft.topic.trim()
                          ? `${liveDraft.title} · ${liveDraft.topic}`
                          : `${liveDraft.title}，在手机上继续直播准备与内容导流。`,
                        label: liveDraft.title.trim() || "直播准备",
                        path: "/tabs/channels",
                        setHistory: setHandoffHistory,
                        setNotice,
                      })
                    }
                    className="rounded-full"
                  >
                    <Copy size={14} />
                    发准备到手机
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const nextLiveDraft = readLiveDraft();
                      const nextLiveHistory = readLiveHistory();
                      setLiveDraft(nextLiveDraft);
                      setLiveHistory(nextLiveHistory);
                      setNotice(
                        nextLiveHistory[0]?.title || nextLiveDraft.title.trim()
                          ? "已刷新直播接力内容。"
                          : "直播伴侣还没有可同步到手机的内容。",
                      );
                    }}
                    className="rounded-full"
                  >
                    <RefreshCw size={14} />
                    刷新直播状态
                  </Button>
                </div>
              </div>

              <div className="rounded-[22px] border border-[color:var(--border-faint)] bg-[rgba(255,250,244,0.82)] p-4">
                <div className="text-sm font-medium text-[color:var(--text-primary)]">
                  最近直播状态
                </div>
                <div className="mt-2 text-xs leading-5 text-[color:var(--text-secondary)]">
                  {activeLiveSession
                    ? `${activeLiveSession.title} 正在直播，可在手机端继续关注频道动线。`
                    : liveHistory[0]
                      ? `${liveHistory[0].title} 已结束，可在手机端继续做频道跟进。`
                      : "还没有直播记录。"}
                </div>
                <div className="mt-3 text-[11px] text-[color:var(--text-muted)]">
                  {activeLiveSession
                    ? `开播于 ${formatTimestamp(activeLiveSession.startedAt)}`
                    : liveHistory[0]?.startedAt
                      ? `最近开播于 ${formatTimestamp(liveHistory[0].startedAt)}`
                      : "先在直播伴侣里启动一场直播。"}
                </div>
                <div className="mt-4">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!activeLiveSession && !liveHistory[0]}
                    onClick={() =>
                      void handleCopyHandoff({
                        description: activeLiveSession
                          ? `${activeLiveSession.title} 正在直播中，切到手机端继续查看频道表现。`
                          : `${liveHistory[0]?.title ?? "最近直播"} 已结束，切到手机端继续跟进频道内容。`,
                        label:
                          activeLiveSession?.title ??
                          liveHistory[0]?.title ??
                          "最近直播",
                        path: "/tabs/channels",
                        setHistory: setHandoffHistory,
                        setNotice,
                      })
                    }
                    className="rounded-full"
                  >
                    <ArrowUpRight size={14} />
                    发直播状态到手机
                  </Button>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-[color:var(--border-faint)] bg-white/92 p-5 shadow-[var(--shadow-soft)]">
            <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--text-primary)]">
              <CheckCircle2
                size={16}
                className="text-[color:var(--brand-primary)]"
              />
              <span>最近发往手机</span>
            </div>
            <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
              当前把手机接力记录按内容类型拆开，方便区分消息、公众号、小程序和直播链路。
            </div>

            <div className="mt-4 space-y-5">
              {groupedHandoffHistory.length ? (
                groupedHandoffHistory.map((group) => (
                  <section key={group.id} className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-[color:var(--text-primary)]">
                          {group.label}
                        </div>
                        <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
                          {group.description}
                        </div>
                      </div>
                      <div className="rounded-full bg-[rgba(255,138,61,0.08)] px-3 py-1 text-[11px] font-medium text-[color:var(--brand-primary)]">
                        {group.items.length} 条
                      </div>
                    </div>

                    {group.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-start justify-between gap-4 rounded-[22px] border border-[color:var(--border-faint)] bg-[rgba(255,250,244,0.82)] p-4"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-[color:var(--text-primary)]">
                            {item.label}
                          </div>
                          <div className="mt-1 line-clamp-2 text-xs leading-5 text-[color:var(--text-secondary)]">
                            {item.description}
                          </div>
                          <div className="mt-2 text-[11px] text-[color:var(--text-muted)]">
                            {formatTimestamp(item.sentAt)}
                          </div>
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            void handleCopyHandoff({
                              description: item.description,
                              label: item.label,
                              path: item.path,
                              setHistory: setHandoffHistory,
                              setNotice,
                            })
                          }
                          className="rounded-full"
                        >
                          再发一次
                        </Button>
                      </div>
                    ))}
                  </section>
                ))
              ) : (
                <EmptyState
                  title="还没有手机接力记录"
                  description="先从上面的入口或最近内容复制一个深链接，这里就会开始记录。"
                />
              )}
            </div>
          </section>
        </div>
      </DesktopEntryShell>
    </div>
  );
}

function RecentConversationRow({
  item,
  onCopy,
}: {
  item: ConversationListItem;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-[22px] border border-[color:var(--border-faint)] bg-[rgba(255,250,244,0.82)] p-4">
      <div className="flex items-start gap-3">
        <AvatarChip name={item.title} size="wechat" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-[color:var(--text-primary)]">
            {item.title}
          </div>
          <div className="mt-1 text-xs text-[color:var(--text-muted)]">
            {item.type === "group" ? "群聊" : "单聊"} ·{" "}
            {formatConversationTimestamp(item.lastActivityAt)}
          </div>
          <div className="mt-2 line-clamp-2 text-sm leading-6 text-[color:var(--text-secondary)]">
            {item.lastMessage?.text || "继续查看这段会话的最新消息。"}
          </div>
          <div className="mt-3">
            <Button size="sm" onClick={onCopy} className="rounded-full">
              <Copy size={14} />
              发到手机继续
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RecentArticleRow({
  account,
  onCopyAccount,
  onCopyArticle,
}: {
  account: OfficialAccountSummary;
  onCopyAccount: () => void;
  onCopyArticle: () => void;
}) {
  if (!account.recentArticle) {
    return null;
  }

  return (
    <div className="rounded-[22px] border border-[color:var(--border-faint)] bg-[rgba(255,250,244,0.82)] p-4">
      <div className="flex items-start gap-3">
        <AvatarChip name={account.name} src={account.avatar} size="wechat" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-[color:var(--text-primary)]">
            {account.recentArticle.title}
          </div>
          <div className="mt-1 text-xs text-[color:var(--text-muted)]">
            {account.name} ·{" "}
            {formatTimestamp(account.recentArticle.publishedAt)}
          </div>
          <div className="mt-2 line-clamp-2 text-sm leading-6 text-[color:var(--text-secondary)]">
            {account.recentArticle.summary}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={onCopyArticle} className="rounded-full">
              <Copy size={14} />
              发文章到手机
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={onCopyAccount}
              className="rounded-full"
            >
              <ArrowUpRight size={14} />
              发主页到手机
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniProgramHandoffCard({
  miniProgram,
  launchCount,
  lastOpenedAt,
  completedTaskCount,
  totalTaskCount,
  pinned,
  buttonLabel,
  onCopy,
}: {
  miniProgram: MiniProgramEntry;
  launchCount: number;
  lastOpenedAt?: string;
  completedTaskCount: number;
  totalTaskCount: number;
  pinned: boolean;
  buttonLabel: string;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-[22px] border border-[color:var(--border-faint)] bg-white/86 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-[color:var(--text-primary)]">
            {miniProgram.name}
          </div>
          <div className="mt-1 text-xs text-[color:var(--text-muted)]">
            {miniProgram.deckLabel}
            {pinned ? " · 已加入我的小程序" : ""}
          </div>
        </div>
        <div className="rounded-full bg-[rgba(255,138,61,0.08)] px-2.5 py-1 text-[10px] text-[color:var(--brand-primary)]">
          {launchCount} 次
        </div>
      </div>

      <div className="mt-2 text-xs leading-6 text-[color:var(--text-secondary)]">
        {miniProgram.openHint}
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[color:var(--text-muted)]">
        <span>
          待办 {completedTaskCount}/{totalTaskCount}
        </span>
        <span>
          {lastOpenedAt
            ? `上次打开 ${formatConversationTimestamp(lastOpenedAt)}`
            : "还没有打开过"}
        </span>
      </div>

      <div className="mt-4">
        <Button size="sm" onClick={onCopy} className="rounded-full">
          <Copy size={14} />
          {buttonLabel}
        </Button>
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-[color:var(--border-faint)] bg-white/88 p-4 shadow-[var(--shadow-soft)]">
      <div className="text-xs text-[color:var(--text-muted)]">{label}</div>
      <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">
        {value}
      </div>
    </div>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[20px] border border-[color:var(--border-faint)] bg-[rgba(255,250,244,0.82)] px-4 py-3">
      <div className="text-xs text-[color:var(--text-muted)]">{label}</div>
      <div className="text-sm font-medium text-[color:var(--text-primary)]">
        {value}
      </div>
    </div>
  );
}

function resolveLiveModeLabel(mode: LiveSessionRecord["mode"]) {
  if (mode === "product") {
    return "产品讲解";
  }

  if (mode === "story") {
    return "剧情陪看";
  }

  return "单人控台";
}

function resolveLiveQualityLabel(quality: LiveSessionRecord["quality"]) {
  if (quality === "standard") {
    return "标准";
  }

  if (quality === "ultra") {
    return "超清";
  }

  return "高清";
}

function resolveMobileHandoffCategory(
  item: MobileHandoffRecord,
): MobileHandoffCategory {
  if (
    item.path === "/tabs/chat" ||
    item.path.startsWith("/chat/") ||
    item.path.startsWith("/group/")
  ) {
    return "messages";
  }

  if (item.path.startsWith("/official-accounts")) {
    return "official";
  }

  if (
    item.path === "/tabs/mini-programs" ||
    item.path.startsWith("/discover/mini-programs")
  ) {
    return "mini_program";
  }

  if (item.path === "/tabs/channels" || item.path.startsWith("/desktop/channels")) {
    return "channel";
  }

  if (
    item.path === "/tabs/contacts" ||
    item.path === "/tabs/discover" ||
    item.path === "/profile/settings"
  ) {
    return "shortcut";
  }

  return "other";
}

async function handleCopyHandoff({
  description,
  label,
  path,
  setHistory,
  setNotice,
}: {
  description: string;
  label: string;
  path: string;
  setHistory: Dispatch<SetStateAction<MobileHandoffRecord[]>>;
  setNotice: Dispatch<SetStateAction<string | null>>;
}) {
  const link = resolveMobileHandoffLink(path);

  if (
    typeof navigator === "undefined" ||
    !navigator.clipboard ||
    typeof navigator.clipboard.writeText !== "function"
  ) {
    setNotice("当前环境暂不支持复制手机接力链接。");
    return;
  }

  try {
    await navigator.clipboard.writeText(link);
    const nextHistory = pushMobileHandoffRecord({
      description,
      label,
      path,
    });
    setHistory(nextHistory);
    setNotice(`${label} 已复制到剪贴板，可发送到手机继续。`);
  } catch {
    setNotice("复制失败，请稍后重试。");
  }
}
