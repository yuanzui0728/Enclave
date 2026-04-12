import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  generateChannelPost,
  getFeed,
  getSystemStatus,
  type FeedPostListItem,
} from "@yinjie/contracts";
import {
  BadgeCheck,
  Clapperboard,
  Copy,
  MonitorUp,
  RadioTower,
  RefreshCcw,
  Sparkles,
  Wand2,
} from "lucide-react";
import {
  Button,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  TextField,
  cn,
} from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { EmptyState } from "../components/empty-state";
import {
  defaultLiveDraft,
  endLocalLiveSession,
  hydrateLiveCompanionFromNative,
  readLiveDraft,
  readLiveHistory,
  startLocalLiveSession,
  writeLiveDraft,
  type LiveDraft,
  type LiveSessionRecord,
} from "../features/desktop/channels/live-companion-storage";
import { DesktopUtilityShell } from "../features/desktop/desktop-utility-shell";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import {
  pushMobileHandoffRecord,
  resolveMobileHandoffLink,
} from "../features/shell/mobile-handoff-storage";
import { formatTimestamp } from "../lib/format";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

export function LiveCompanionPage() {
  const isDesktopLayout = useDesktopLayout();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const nativeDesktopLiveCompanion = runtimeConfig.appPlatform === "desktop";
  const ownerName = useWorldOwnerStore((state) => state.username);
  const [draft, setDraft] = useState<LiveDraft>(() => readLiveDraft());
  const [liveHistory, setLiveHistory] = useState<LiveSessionRecord[]>(() =>
    readLiveHistory(),
  );
  const [liveStoreReady, setLiveStoreReady] = useState(
    !nativeDesktopLiveCompanion,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const statusQuery = useQuery({
    queryKey: ["desktop-live-companion-status", baseUrl],
    queryFn: () => getSystemStatus(baseUrl),
  });

  const channelsQuery = useQuery({
    queryKey: ["desktop-live-companion-channels", baseUrl],
    queryFn: () => getFeed(1, 8, baseUrl, { surface: "channels" }),
  });

  useEffect(() => {
    if (!nativeDesktopLiveCompanion) {
      return;
    }

    let cancelled = false;

    async function hydrateLiveCompanionStore() {
      const store = await hydrateLiveCompanionFromNative();
      if (cancelled) {
        return;
      }

      setDraft(store.draft);
      setLiveHistory(store.history);
      setLiveStoreReady(true);
    }

    void hydrateLiveCompanionStore();

    return () => {
      cancelled = true;
    };
  }, [nativeDesktopLiveCompanion]);

  useEffect(() => {
    if (!liveStoreReady) {
      return;
    }

    writeLiveDraft(draft);
  }, [draft, liveStoreReady]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => setNotice(null), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const recentPosts = channelsQuery.data?.posts ?? [];
  const activeSession =
    liveHistory.find((item) => item.status === "live") ?? null;
  const preflightChecks = useMemo(
    () => [
      {
        label: "世界实例在线",
        passed: Boolean(statusQuery.data?.coreApi.healthy),
      },
      {
        label: "推理网关可用",
        passed: Boolean(statusQuery.data?.inferenceGateway.healthy),
      },
      {
        label: "已有视频号内容参考",
        passed: recentPosts.length > 0,
      },
      {
        label: "直播标题已准备",
        passed: draft.title.trim().length > 0,
      },
    ],
    [
      draft.title,
      recentPosts.length,
      statusQuery.data?.coreApi.healthy,
      statusQuery.data?.inferenceGateway.healthy,
    ],
  );
  const passedCheckCount = preflightChecks.filter((item) => item.passed).length;

  async function copyLiveToMobile(input: {
    description: string;
    label: string;
  }) {
    const path = "/discover/channels";
    const link = resolveMobileHandoffLink(path);

    if (
      typeof navigator === "undefined" ||
      !navigator.clipboard ||
      typeof navigator.clipboard.writeText !== "function"
    ) {
      setError("当前环境暂不支持复制到手机。");
      return;
    }

    try {
      await navigator.clipboard.writeText(link);
      pushMobileHandoffRecord({
        description: input.description,
        label: input.label,
        path,
      });
      setError(null);
      setNotice(`${input.label} 已复制，可发到手机继续。`);
    } catch {
      setError("复制到手机失败，请稍后重试。");
    }
  }

  if (!isDesktopLayout) {
    return null;
  }

  return (
    <DesktopUtilityShell
      title="直播伴侣"
      subtitle="把开播前准备、状态检查和参考内容收在一起。"
      toolbar={
        <div className="rounded-full border border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] px-3 py-1 text-[11px] font-medium text-[color:var(--brand-primary)]">
          {activeSession ? "直播中" : "待开播"}
        </div>
      }
      sidebarClassName="w-[300px]"
      sidebar={
        <div className="flex h-full min-h-0 flex-col">
          <div className="border-b border-[color:var(--border-faint)] bg-white/74 px-4 py-4 backdrop-blur-xl">
            <div className="text-[15px] font-medium text-[color:var(--text-primary)]">
              直播伴侣
            </div>
            <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
              先收口桌面直播准备、状态检查和本地历史。
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto bg-[rgba(242,246,245,0.76)] px-4 py-4">
            <div className="space-y-3">
              <MetricCard
                label="当前状态"
                value={activeSession ? "直播中" : "待开播"}
              />
              <MetricCard
                label="开播检查"
                value={`${passedCheckCount} / ${preflightChecks.length} 项通过`}
              />
              <MetricCard
                label="最近直播"
                value={
                  liveHistory[0]?.startedAt
                    ? formatTimestamp(liveHistory[0].startedAt)
                    : "暂无记录"
                }
              />
              <MetricCard label="操作者" value={ownerName ?? "世界主人"} />

              <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-4 shadow-[var(--shadow-section)]">
                <div className="text-xs font-medium text-[color:var(--text-muted)]">
                  开播检查清单
                </div>
                <div className="mt-3 space-y-2">
                  {preflightChecks.map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between gap-3 rounded-[12px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 py-2.5"
                    >
                      <div className="text-xs text-[color:var(--text-secondary)]">
                        {item.label}
                      </div>
                      <div
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[10px] font-medium",
                          item.passed
                            ? "bg-[rgba(7,193,96,0.07)] text-[color:var(--brand-primary)]"
                            : "bg-[rgba(239,68,68,0.10)] text-[color:var(--state-danger-text)]",
                        )}
                      >
                        {item.passed ? "通过" : "待处理"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      }
      contentClassName="bg-[rgba(255,255,255,0.62)]"
    >
      <div className="space-y-5 p-5">
        {notice ? (
          <InlineNotice
            tone="success"
            className="border-[color:var(--border-faint)] bg-white"
          >
            {notice}
          </InlineNotice>
        ) : null}
        {error ? (
          <InlineNotice
            tone="info"
            className="border-[color:var(--border-faint)] bg-white"
          >
            {error}
          </InlineNotice>
        ) : null}
          {statusQuery.isError && statusQuery.error instanceof Error ? (
            <ErrorBlock message={statusQuery.error.message} />
          ) : null}
          {channelsQuery.isError && channelsQuery.error instanceof Error ? (
            <ErrorBlock message={channelsQuery.error.message} />
          ) : null}

        <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <section className="rounded-[20px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-section)]">
              <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--text-primary)]">
                <RadioTower
                  size={16}
                  className="text-[color:var(--brand-primary)]"
                />
                <span>开播准备</span>
              </div>
              <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
                先把直播标题、主题、封面钩子和桌面策略准备好，后面接真推流时这层不用再推倒。
              </div>

              <div className="mt-4 space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="mb-2 text-xs font-medium text-[color:var(--text-muted)]">
                      直播标题
                    </div>
                    <TextField
                      value={draft.title}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          title: event.target.value,
                        }))
                      }
                      placeholder="例如：今晚一起看 AI 世界的视频号精选"
                    />
                  </div>
                  <div>
                    <div className="mb-2 text-xs font-medium text-[color:var(--text-muted)]">
                      直播主题
                    </div>
                    <TextField
                      value={draft.topic}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          topic: event.target.value,
                        }))
                      }
                      placeholder="例如：晚间内容共看 / AI 角色导览"
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-xs font-medium text-[color:var(--text-muted)]">
                    封面钩子
                  </div>
                  <TextField
                    value={draft.coverHook}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        coverHook: event.target.value,
                      }))
                    }
                    placeholder="例如：今晚只讲 3 条最值得扩写成直播的 AI 视频"
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <SelectorCard
                    label="直播模式"
                    options={[
                      { id: "solo", label: "单人控台" },
                      { id: "product", label: "产品讲解" },
                      { id: "story", label: "剧情陪看" },
                    ]}
                    value={draft.mode}
                    onChange={(value) =>
                      setDraft((current) => ({
                        ...current,
                        mode: value as LiveDraft["mode"],
                      }))
                    }
                  />
                  <SelectorCard
                    label="推流质量"
                    options={[
                      { id: "standard", label: "标准" },
                      { id: "hd", label: "高清" },
                      { id: "ultra", label: "超清" },
                    ]}
                    value={draft.quality}
                    onChange={(value) =>
                      setDraft((current) => ({
                        ...current,
                        quality: value as LiveDraft["quality"],
                      }))
                    }
                  />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <ToggleCard
                    checked={draft.syncComments}
                    label="同步评论控台"
                    description="保留后续承接弹幕、评论和通知的桌面右栏入口。"
                    onChange={(checked) =>
                      setDraft((current) => ({
                        ...current,
                        syncComments: checked,
                      }))
                    }
                  />
                  <ToggleCard
                    checked={draft.autoClip}
                    label="自动标记切片"
                    description="为后续回放与直播精彩片段整理预留标记位。"
                    onChange={(checked) =>
                      setDraft((current) => ({
                        ...current,
                        autoClip: checked,
                      }))
                    }
                  />
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    onClick={() => {
                      if (!draft.title.trim()) {
                        setError("请先填写直播标题。");
                        return;
                      }

                      const nextHistory = startLocalLiveSession({
                        draft,
                        previous: liveHistory,
                      });
                      setLiveHistory(nextHistory);
                      setError(null);
                      setNotice("直播伴侣已切到直播中状态。");
                    }}
                    disabled={Boolean(activeSession)}
                    className="rounded-xl"
                  >
                    <MonitorUp size={15} />
                    {activeSession ? "直播进行中" : "开始本场直播"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      if (!activeSession) {
                        setError("当前没有进行中的直播。");
                        return;
                      }

                      const nextHistory = endLocalLiveSession(liveHistory);
                      setLiveHistory(nextHistory);
                      setError(null);
                      setNotice("直播已结束，并记录到本地历史。");
                    }}
                    className="rounded-xl"
                  >
                    <Clapperboard size={15} />
                    结束直播
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setDraft({ ...defaultLiveDraft });
                      writeLiveDraft({ ...defaultLiveDraft });
                      setNotice("直播准备草稿已清空。");
                      setError(null);
                    }}
                    className="rounded-xl"
                  >
                    <RefreshCcw size={15} />
                    清空准备
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!draft.title.trim()}
                    onClick={() =>
                      void copyLiveToMobile({
                        description: draft.topic.trim()
                          ? `${draft.title} · ${draft.topic}`
                          : `${draft.title}，切到手机继续处理视频号直播准备。`,
                        label: draft.title.trim() || "直播准备",
                      })
                    }
                    className="rounded-xl"
                  >
                    <Copy size={15} />
                    发准备到手机
                  </Button>
                </div>
              </div>
            </section>

          <section className="space-y-5">
            <div className="rounded-[20px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-section)]">
                <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--text-primary)]">
                  <BadgeCheck
                    size={16}
                    className="text-[color:var(--brand-primary)]"
                  />
                  <span>开播检查</span>
                </div>
                <div className="mt-4 space-y-3">
                  {preflightChecks.map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-4 py-3"
                    >
                      <div className="text-sm text-[color:var(--text-primary)]">
                        {item.label}
                      </div>
                      <div
                        className={cn(
                          "rounded-md px-2.5 py-1 text-[11px] font-medium",
                          item.passed
                            ? "bg-[rgba(7,193,96,0.07)] text-[color:var(--brand-primary)]"
                            : "bg-[rgba(239,68,68,0.10)] text-[color:var(--state-danger-text)]",
                        )}
                      >
                        {item.passed ? "通过" : "待处理"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            <div className="rounded-[20px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-section)]">
                <div className="text-sm font-medium text-[color:var(--text-primary)]">
                  当前实例状态
                </div>
                <div className="mt-4">
                  {statusQuery.isLoading ? (
                    <LoadingBlock label="正在读取状态..." />
                  ) : (
                    <div className="space-y-3">
                      <StatusRow
                        label="Core API"
                        value={
                          statusQuery.data?.coreApi.healthy ? "在线" : "异常"
                        }
                      />
                      <StatusRow
                        label="推理网关"
                        value={
                          statusQuery.data?.inferenceGateway.healthy
                            ? "可用"
                            : "待恢复"
                        }
                      />
                      <StatusRow
                        label="世界模式"
                        value={statusQuery.data?.appMode ?? "未知"}
                      />
                      <StatusRow
                        label="最近快照"
                        value={
                          statusQuery.data?.scheduler.lastWorldSnapshotAt
                            ? formatTimestamp(
                                statusQuery.data.scheduler.lastWorldSnapshotAt,
                              )
                            : "暂无"
                        }
                      />
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>

        <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
          <section className="rounded-[20px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-section)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-[color:var(--text-primary)]">
                    最近视频号内容
                  </div>
                  <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
                    直接从现有视频号内容流里拿直播参考，不和主频道内容割裂。
                  </div>
                </div>
                <Link
                  to="/tabs/channels"
                  className="inline-flex h-9 items-center justify-center rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-4 text-xs font-medium text-[color:var(--text-secondary)] transition hover:bg-white hover:text-[color:var(--text-primary)]"
                >
                  打开视频号
                </Link>
              </div>

              <div className="mt-4 space-y-3">
                {channelsQuery.isLoading ? (
                  <LoadingBlock label="正在读取视频号内容..." />
                ) : recentPosts.length ? (
                  recentPosts.map((post) => (
                    <PostReferenceCard
                      key={post.id}
                      post={post}
                      onUse={() => {
                        setDraft((current) => ({
                          ...current,
                          title:
                            current.title.trim() ||
                            `${post.authorName} 主题直播`,
                          topic:
                            current.topic.trim() || createTopicFromPost(post),
                          coverHook:
                            current.coverHook.trim() ||
                            createCoverHookFromPost(post),
                          referencePostAuthorName: post.authorName,
                          referencePostId: post.id,
                        }));
                        setNotice("已把这条视频号内容带入直播准备草稿。");
                        setError(null);
                      }}
                    />
                  ))
                ) : (
                  <EmptyState
                    title="还没有视频号内容"
                    description="先去视频号生成几条内容，这里才能作为直播参考池。"
                  />
                )}
              </div>
            </section>

          <section className="rounded-[20px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-section)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-[color:var(--text-primary)]">
                    直播记录
                  </div>
                  <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
                    当前先保留桌面本地历史，后面接真直播接口时继续沿用这块时间线。
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    try {
                      await generateChannelPost(baseUrl);
                      await channelsQuery.refetch();
                      setNotice(
                        "已生成一条新的视频号内容，可继续作为直播参考。",
                      );
                      setError(null);
                    } catch (reason) {
                      setError(
                        reason instanceof Error
                          ? reason.message
                          : "生成视频号内容失败。",
                      );
                    }
                  }}
                  className="rounded-xl"
                >
                  <Wand2 size={14} />
                  生成预热内容
                </Button>
              </div>

              <div className="mt-4 space-y-3">
                {liveHistory.length ? (
                  liveHistory.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium text-[color:var(--text-primary)]">
                          {item.title}
                        </div>
                        <span
                          className={cn(
                            "rounded-md px-2.5 py-1 text-[11px] font-medium",
                            item.status === "live"
                              ? "bg-[rgba(239,68,68,0.10)] text-[#b91c1c]"
                              : "bg-[rgba(7,193,96,0.07)] text-[color:var(--brand-primary)]",
                          )}
                        >
                          {item.status === "live" ? "直播中" : "已结束"}
                        </span>
                      </div>
                      <div className="mt-2 text-xs leading-5 text-[color:var(--text-secondary)]">
                        {item.topic || "未填写直播主题"}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[color:var(--text-muted)]">
                        <span>开播 {formatTimestamp(item.startedAt)}</span>
                        <span>模式 {resolveModeLabel(item.mode)}</span>
                        <span>质量 {resolveQualityLabel(item.quality)}</span>
                        {item.endedAt ? (
                          <span>下播 {formatTimestamp(item.endedAt)}</span>
                        ) : null}
                      </div>
                      <div className="mt-3">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            void copyLiveToMobile({
                              description:
                                item.status === "live"
                                  ? `${item.title} 正在直播中，切到手机继续跟进频道表现。`
                                  : `${item.title} 已结束，切到手机继续跟进视频号内容。`,
                              label: item.title,
                            })
                          }
                          className="rounded-xl"
                        >
                          <Copy size={14} />
                          发到手机继续
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[18px] border border-dashed border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5 text-sm leading-7 text-[color:var(--text-secondary)]">
                    还没有直播记录。先准备一场直播并切到“直播中”，这里就会开始积累桌面伴侣历史。
                  </div>
                )}
              </div>
          </section>
        </div>
      </div>
    </DesktopUtilityShell>
  );
}

function SelectorCard({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: Array<{ id: string; label: string }>;
  value: string;
}) {
  return (
    <div>
      <div className="mb-2 text-xs font-medium text-[color:var(--text-muted)]">
        {label}
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={cn(
              "rounded-xl border px-3 py-2 text-xs font-medium transition",
              value === item.id
                ? "border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] text-[color:var(--brand-primary)]"
                : "border-[color:var(--border-faint)] bg-[color:var(--surface-console)] text-[color:var(--text-secondary)] hover:bg-white",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ToggleCard({
  checked,
  description,
  label,
  onChange,
}: {
  checked: boolean;
  description: string;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "rounded-[18px] border px-4 py-4 text-left transition",
        checked
          ? "border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)]"
          : "border-[color:var(--border-faint)] bg-[color:var(--surface-console)]",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-[color:var(--text-primary)]">
          {label}
        </div>
        <span
          className={cn(
            "rounded-md px-2.5 py-1 text-[11px] font-medium",
            checked
              ? "bg-white text-[color:var(--brand-primary)]"
              : "bg-[rgba(15,23,42,0.06)] text-[color:var(--text-secondary)]",
          )}
        >
          {checked ? "开启" : "关闭"}
        </span>
      </div>
      <div className="mt-2 text-xs leading-5 text-[color:var(--text-secondary)]">
        {description}
      </div>
    </button>
  );
}

function PostReferenceCard({
  onUse,
  post,
}: {
  onUse: () => void;
  post: FeedPostListItem;
}) {
  return (
    <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-4">
      <div className="flex items-start gap-3">
        <AvatarChip
          name={post.authorName}
          src={post.authorAvatar}
          size="wechat"
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-[color:var(--text-primary)]">
            {post.authorName}
          </div>
          <div className="mt-1 text-xs text-[color:var(--text-muted)]">
            {formatTimestamp(post.createdAt)} ·{" "}
            {post.mediaType === "video" ? "短片" : "内容卡片"}
          </div>
          <div className="mt-2 line-clamp-3 text-sm leading-6 text-[color:var(--text-secondary)]">
            {post.text}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={onUse} className="rounded-xl">
              <Sparkles size={14} />
              带入直播准备
            </Button>
            <span className="inline-flex items-center rounded-md border border-[color:var(--border-faint)] bg-white px-2.5 py-1 text-[11px] text-[color:var(--text-muted)]">
              {post.commentCount} 评论 · {post.likeCount} 赞
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-4 py-3">
      <div className="text-xs text-[color:var(--text-muted)]">{label}</div>
      <div className="mt-1 text-sm font-medium text-[color:var(--text-primary)]">
        {value}
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-4 shadow-[var(--shadow-section)]">
      <div className="text-xs text-[color:var(--text-muted)]">{label}</div>
      <div className="mt-2 text-sm font-medium leading-6 text-[color:var(--text-primary)]">
        {value}
      </div>
    </div>
  );
}

function createTopicFromPost(post: FeedPostListItem) {
  return post.text.trim().slice(0, 24) || `${post.authorName} 的视频号内容`;
}

function createCoverHookFromPost(post: FeedPostListItem) {
  return `从「${post.authorName}」这条视频号内容展开今晚的直播节奏`;
}

function resolveModeLabel(mode: LiveDraft["mode"]) {
  if (mode === "product") {
    return "产品讲解";
  }

  if (mode === "story") {
    return "剧情陪看";
  }

  return "单人控台";
}

function resolveQualityLabel(quality: LiveDraft["quality"]) {
  if (quality === "standard") {
    return "标准";
  }

  if (quality === "ultra") {
    return "超清";
  }

  return "高清";
}
