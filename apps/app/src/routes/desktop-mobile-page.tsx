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
  CheckCircle2,
  Copy,
  RefreshCw,
  Smartphone,
  Wifi,
} from "lucide-react";
import { Button, ErrorBlock, InlineNotice, LoadingBlock } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { EmptyState } from "../components/empty-state";
import { DesktopEntryShell } from "../features/desktop/desktop-entry-shell";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import {
  formatConversationTimestamp,
  formatTimestamp,
  parseTimestamp,
} from "../lib/format";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

type MobileHandoffRecord = {
  id: string;
  label: string;
  description: string;
  path: string;
  sentAt: string;
};

type QuickEntry = {
  id: string;
  label: string;
  description: string;
  to: string;
};

const MOBILE_HANDOFF_STORAGE_KEY = "yinjie-desktop-mobile-handoff-history";
const MAX_HANDOFF_RECORDS = 8;

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
                            item.type === "group"
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
            <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--text-primary)]">
              <CheckCircle2
                size={16}
                className="text-[color:var(--brand-primary)]"
              />
              <span>最近发往手机</span>
            </div>
            <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
              当前版本先记录桌面已经发出的手机接力链接，后续接真设备状态时可以直接沿用这块列表。
            </div>

            <div className="mt-4 space-y-3">
              {handoffHistory.length ? (
                handoffHistory.map((item) => (
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
  const link =
    typeof window === "undefined" ? path : `${window.location.origin}${path}`;

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
    const nextHistory = writeMobileHandoffHistory({
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

function readMobileHandoffHistory() {
  if (typeof window === "undefined") {
    return [] as MobileHandoffRecord[];
  }

  const raw = window.localStorage.getItem(MOBILE_HANDOFF_STORAGE_KEY);
  if (!raw) {
    return [] as MobileHandoffRecord[];
  }

  try {
    const parsed = JSON.parse(raw) as MobileHandoffRecord[];
    if (!Array.isArray(parsed)) {
      return [] as MobileHandoffRecord[];
    }

    return parsed.filter(
      (item) =>
        typeof item?.id === "string" &&
        typeof item?.label === "string" &&
        typeof item?.description === "string" &&
        typeof item?.path === "string" &&
        typeof item?.sentAt === "string",
    );
  } catch {
    return [] as MobileHandoffRecord[];
  }
}

function writeMobileHandoffHistory(input: {
  description: string;
  label: string;
  path: string;
}) {
  if (typeof window === "undefined") {
    return [] as MobileHandoffRecord[];
  }

  const nextRecord: MobileHandoffRecord = {
    id: `mobile-handoff-${input.path}`,
    label: input.label,
    description: input.description,
    path: input.path,
    sentAt: new Date().toISOString(),
  };

  const nextHistory = [
    nextRecord,
    ...readMobileHandoffHistory().filter((item) => item.path !== input.path),
  ].slice(0, MAX_HANDOFF_RECORDS);

  window.localStorage.setItem(
    MOBILE_HANDOFF_STORAGE_KEY,
    JSON.stringify(nextHistory),
  );

  return nextHistory;
}
