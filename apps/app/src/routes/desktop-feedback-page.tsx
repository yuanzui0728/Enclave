import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSystemStatus } from "@yinjie/contracts";
import {
  AlertCircle,
  Bug,
  ClipboardList,
  Download,
  Gauge,
  Lightbulb,
  MessageSquareText,
  Send,
  Sparkles,
} from "lucide-react";
import {
  Button,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  TextField,
  cn,
} from "@yinjie/ui";
import { DesktopLayoutRequiredState } from "../components/desktop-layout-required-state";
import { InlineNoticeActionButton } from "../components/inline-notice-action-button";
import { DesktopUtilityShell } from "../features/desktop/desktop-utility-shell";
import {
  clearDesktopFeedbackDraft,
  defaultDesktopFeedbackDraft,
  hydrateDesktopFeedbackFromNative,
  pushDesktopFeedbackRecord,
  readDesktopFeedbackDraft,
  readDesktopFeedbackHistory,
  writeDesktopFeedbackDraft,
  type DesktopFeedbackCategory,
  type DesktopFeedbackDraft,
  type DesktopFeedbackPriority,
  type DesktopFeedbackRecord,
} from "../features/desktop/feedback/desktop-feedback-storage";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { formatTimestamp } from "../lib/format";
import { revealSavedFile } from "../runtime/reveal-saved-file";
import { saveGeneratedFile } from "../runtime/save-generated-file";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

const categoryOptions: Array<{
  id: DesktopFeedbackCategory;
  label: string;
  description: string;
  icon: typeof Bug;
}> = [
  {
    id: "bug",
    label: "功能异常",
    description: "功能和预期不一致、页面报错、数据错乱。",
    icon: Bug,
  },
  {
    id: "interaction",
    label: "交互体验",
    description: "导航不顺、信息结构混乱、操作路径别扭。",
    icon: MessageSquareText,
  },
  {
    id: "performance",
    label: "性能问题",
    description: "加载慢、卡顿、输入延迟、工作区切换不稳。",
    icon: Gauge,
  },
  {
    id: "content",
    label: "内容口径",
    description: "文案、频道定义、桌面与微信对齐口径存在偏差。",
    icon: ClipboardList,
  },
  {
    id: "feature",
    label: "能力建议",
    description: "提出下一步应该优先补的真实工作区和交互能力。",
    icon: Lightbulb,
  },
];

const priorityOptions: Array<{
  id: DesktopFeedbackPriority;
  label: string;
}> = [
  { id: "low", label: "低" },
  { id: "medium", label: "中" },
  { id: "high", label: "高" },
];

function areDesktopFeedbackDraftsEqual(
  left: DesktopFeedbackDraft,
  right: DesktopFeedbackDraft,
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function areDesktopFeedbackHistoriesEqual(
  left: DesktopFeedbackRecord[],
  right: DesktopFeedbackRecord[],
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function DesktopFeedbackPage() {
  const isDesktopLayout = useDesktopLayout();
  const runtimeConfig = useAppRuntimeConfig();
  const nativeDesktopFeedback = runtimeConfig.appPlatform === "desktop";
  const ownerName = useWorldOwnerStore((state) => state.username);
  const ownerSignature = useWorldOwnerStore((state) => state.signature);
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [draft, setDraft] = useState<DesktopFeedbackDraft>(() =>
    readDesktopFeedbackDraft(),
  );
  const [history, setHistory] = useState<DesktopFeedbackRecord[]>(() =>
    readDesktopFeedbackHistory(),
  );
  const [notice, setNotice] = useState<{
    message: string;
    tone: "success" | "danger";
    actionLabel?: string;
    onAction?: () => void;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedbackStoreReady, setFeedbackStoreReady] = useState(
    () => !nativeDesktopFeedback,
  );

  const systemStatusQuery = useQuery({
    queryKey: ["desktop-feedback-system-status", baseUrl],
    queryFn: () => getSystemStatus(baseUrl),
    enabled: isDesktopLayout,
  });

  useEffect(() => {
    if (!nativeDesktopFeedback) {
      setFeedbackStoreReady(true);
      return;
    }

    let cancelled = false;
    setFeedbackStoreReady(false);

    async function hydrateFeedbackStore() {
      const store = await hydrateDesktopFeedbackFromNative();
      if (cancelled) {
        return;
      }

      setDraft(store.draft);
      setHistory(store.history);
      setFeedbackStoreReady(true);
    }

    void hydrateFeedbackStore();

    return () => {
      cancelled = true;
    };
  }, [nativeDesktopFeedback]);

  useEffect(() => {
    if (!nativeDesktopFeedback) {
      return;
    }

    let cancelled = false;

    async function syncFeedbackStore() {
      const store = await hydrateDesktopFeedbackFromNative();
      if (cancelled) {
        return;
      }

      setDraft((current) =>
        areDesktopFeedbackDraftsEqual(current, store.draft)
          ? current
          : store.draft,
      );
      setHistory((current) =>
        areDesktopFeedbackHistoriesEqual(current, store.history)
          ? current
          : store.history,
      );
    }

    const handleFocus = () => {
      void syncFeedbackStore();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      void syncFeedbackStore();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [nativeDesktopFeedback]);

  useEffect(() => {
    if (!feedbackStoreReady) {
      return;
    }

    writeDesktopFeedbackDraft(draft);
  }, [draft, feedbackStoreReady]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => setNotice(null), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const diagnosticSummary = useMemo(() => {
    if (!draft.includeSystemSnapshot || !systemStatusQuery.data) {
      return "未附带系统摘要";
    }

    const status = systemStatusQuery.data;
    return [
      `Core API ${status.coreApi.healthy ? "在线" : "异常"}`,
      `数据库${status.database.connected ? "已连接" : "未连接"}`,
      `推理网关${status.inferenceGateway.healthy ? "可用" : "待恢复"}`,
      `世界主人 ${status.worldSurface.ownerCount}/1`,
      `模式 ${status.appMode}`,
    ].join(" · ");
  }, [draft.includeSystemSnapshot, systemStatusQuery.data]);

  const recentCount = history.length;
  const highPriorityCount = history.filter(
    (item) => item.priority === "high",
  ).length;

  if (!isDesktopLayout) {
    return (
      <DesktopLayoutRequiredState
        title="意见反馈当前仅提供桌面布局"
        description="反馈工作区目前只在 Web 桌面布局和桌面壳内启用，移动布局先回到设置继续排查或记录问题。"
        actionLabel="前往设置"
        fallbackTo="/profile/settings"
      />
    );
  }

  return (
    <DesktopUtilityShell
      title="意见反馈"
      subtitle={`${recentCount} 条本地反馈记录，${highPriorityCount} 条高优先级`}
      sidebar={
        <div className="flex h-full min-h-0 flex-col">
          <div className="border-b border-[color:var(--border-faint)] px-4 py-4">
            <div className="text-sm font-medium text-[color:var(--text-primary)]">
              反馈历史
            </div>
            <div className="mt-1 text-xs text-[color:var(--text-muted)]">
              左侧保留本地草稿和已保存记录，便于继续追问题。
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-3">
            <div className="space-y-3">
              <FeedbackStatCard label="最近反馈" value={`${recentCount} 条`} />
              <FeedbackStatCard
                label="高优先级"
                value={`${highPriorityCount} 条`}
              />
              <FeedbackStatCard
                label="当前实例"
                value={ownerName ?? "世界主人"}
              />
            </div>

            <div className="mt-4 rounded-[14px] border border-[color:var(--border-faint)] bg-white p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--text-primary)]">
                <AlertCircle
                  size={16}
                  className="text-[color:var(--brand-primary)]"
                />
                <span>最近反馈</span>
              </div>

              <div className="mt-4 space-y-3">
                {history.length ? (
                  history.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-[12px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-4"
                    >
                      <div className="flex items-center gap-2 text-xs text-[color:var(--text-muted)]">
                        <span>{resolveCategoryLabel(item.category)}</span>
                        <span>·</span>
                        <span>{resolvePriorityLabel(item.priority)}</span>
                      </div>
                      <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">
                        {item.title}
                      </div>
                      <div className="mt-2 line-clamp-3 text-xs leading-5 text-[color:var(--text-secondary)]">
                        {item.detail}
                      </div>
                      <div className="mt-3 text-[11px] text-[color:var(--text-muted)]">
                        {formatTimestamp(item.submittedAt)}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[12px] border border-dashed border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-4 text-sm leading-7 text-[color:var(--text-secondary)]">
                    还没有保存过反馈。先把一个真实问题记下来，后续再接正式提交流。
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      }
      aside={
        <div className="flex h-full min-h-0 flex-col">
          <div className="border-b border-[color:var(--border-faint)] px-5 py-4">
            <div className="text-sm font-medium text-[color:var(--text-primary)]">
              实例上下文
            </div>
            <div className="mt-1 text-xs text-[color:var(--text-muted)]">
              右侧承接当前实例、诊断摘要和系统状态。
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-5">
            <div className="space-y-5">
              <div className="rounded-[14px] border border-[color:var(--border-faint)] bg-white p-4">
                <div className="text-sm font-medium text-[color:var(--text-primary)]">
                  当前上下文
                </div>
                <div className="mt-4 space-y-3">
                  <FeedbackContextRow
                    label="实例地址"
                    value={baseUrl || "未配置"}
                  />
                  <FeedbackContextRow
                    label="运行平台"
                    value={runtimeConfig.appPlatform || "web"}
                  />
                  <FeedbackContextRow
                    label="世界主人"
                    value={ownerName || "世界主人"}
                  />
                  <FeedbackContextRow
                    label="签名"
                    value={ownerSignature || "暂无签名"}
                  />
                </div>
              </div>

              <div className="rounded-[14px] border border-[color:var(--border-faint)] bg-white p-4">
                <div className="text-sm font-medium text-[color:var(--text-primary)]">
                  诊断摘要
                </div>
                <div className="mt-4">
                  {systemStatusQuery.isLoading ? (
                    <LoadingBlock label="正在读取实例状态..." />
                  ) : (
                    <div className="space-y-3">
                      <FeedbackContextRow
                        label="Core API"
                        value={
                          systemStatusQuery.data?.coreApi.healthy
                            ? "在线"
                            : "异常"
                        }
                      />
                      <FeedbackContextRow
                        label="数据库"
                        value={
                          systemStatusQuery.data?.database.connected
                            ? "已连接"
                            : "未连接"
                        }
                      />
                      <FeedbackContextRow
                        label="推理网关"
                        value={
                          systemStatusQuery.data?.inferenceGateway.healthy
                            ? "可用"
                            : "待恢复"
                        }
                      />
                      <FeedbackContextRow
                        label="实例模式"
                        value={systemStatusQuery.data?.appMode ?? "未知"}
                      />
                      <FeedbackContextRow
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
                </div>
              </div>

              <FeedbackStatCard
                label="反馈包摘要"
                value={diagnosticSummary}
                compact
              />
            </div>
          </div>
        </div>
      }
    >
      <div className="p-5">
        {notice ? (
          <InlineNotice
            className="flex items-center justify-between gap-3"
            tone={notice.tone}
          >
            <span>{notice.message}</span>
            {notice.actionLabel && notice.onAction ? (
              <InlineNoticeActionButton
                label={notice.actionLabel}
                onClick={notice.onAction}
              />
            ) : null}
          </InlineNotice>
        ) : null}
        {error ? <InlineNotice tone="info">{error}</InlineNotice> : null}
        {systemStatusQuery.isError &&
        systemStatusQuery.error instanceof Error ? (
          <div className="mt-4">
            <ErrorBlock message={systemStatusQuery.error.message} />
          </div>
        ) : null}

        <section className="mt-4 rounded-[16px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-section)]">
          <div className="text-sm font-medium text-[color:var(--text-primary)]">
            提交反馈
          </div>
          <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
            先把问题描述、复现步骤和期望结果写清楚，再决定后续如何跟进。
          </div>

          <div className="mt-4 space-y-4">
            <div>
              <div className="text-xs tracking-[0.14em] text-[color:var(--text-dim)]">
                问题分类
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {categoryOptions.map((item) => {
                  const Icon = item.icon;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setDraft((current) => ({
                          ...current,
                          category: item.id,
                        }));
                        setError(null);
                      }}
                      className={cn(
                        "rounded-[12px] border p-4 text-left transition",
                        draft.category === item.id
                          ? "border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] shadow-[inset_0_0_0_1px_rgba(7,193,96,0.04)]"
                          : "border-[color:var(--border-faint)] bg-[color:var(--surface-console)] hover:bg-white",
                      )}
                    >
                      <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--text-primary)]">
                        <Icon
                          size={16}
                          className={cn(
                            draft.category === item.id
                              ? "text-[color:var(--brand-primary)]"
                              : "text-[color:var(--text-secondary)]",
                          )}
                        />
                        <span>{item.label}</span>
                      </div>
                      <div className="mt-2 text-xs leading-5 text-[color:var(--text-secondary)]">
                        {item.description}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[1fr_180px]">
              <div>
                <div className="mb-2 text-xs tracking-[0.14em] text-[color:var(--text-dim)]">
                  标题
                </div>
                <TextField
                  value={draft.title}
                  onChange={(event) => {
                    setDraft((current) => ({
                      ...current,
                      title: event.target.value,
                    }));
                    setError(null);
                  }}
                  placeholder="一句话说明问题，例如：桌面壳切回聊天后导航状态错乱"
                />
              </div>

              <div>
                <div className="mb-2 text-xs tracking-[0.14em] text-[color:var(--text-dim)]">
                  优先级
                </div>
                <div className="flex gap-2">
                  {priorityOptions.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setDraft((current) => ({
                          ...current,
                          priority: item.id,
                        }));
                        setError(null);
                      }}
                      className={cn(
                        "flex-1 rounded-[10px] border px-3 py-2 text-xs font-medium transition",
                        draft.priority === item.id
                          ? "border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] text-[color:var(--brand-primary)]"
                          : "border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-console)]",
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <FeedbackTextarea
              label="问题描述"
              placeholder="描述你看到的现象、涉及的页面或入口。"
              value={draft.detail}
              onChange={(value) => {
                setDraft((current) => ({ ...current, detail: value }));
                setError(null);
              }}
            />

            <FeedbackTextarea
              label="复现步骤"
              placeholder="按 1. 2. 3. 描述怎么触发这个问题。"
              value={draft.reproduction}
              onChange={(value) => {
                setDraft((current) => ({
                  ...current,
                  reproduction: value,
                }));
                setError(null);
              }}
            />

            <FeedbackTextarea
              label="期望结果"
              placeholder="说明你希望它变成什么样。"
              value={draft.expected}
              onChange={(value) => {
                setDraft((current) => ({ ...current, expected: value }));
                setError(null);
              }}
            />

            <label className="flex items-start gap-3 rounded-[12px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-4 py-3">
              <input
                type="checkbox"
                checked={draft.includeSystemSnapshot}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    includeSystemSnapshot: event.target.checked,
                  }))
                }
                className="mt-1 h-4 w-4 rounded border-[color:var(--border-faint)] text-[color:var(--brand-primary)]"
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-[color:var(--text-primary)]">
                  附带实例诊断摘要
                </div>
                <div className="mt-1 text-xs leading-5 text-[color:var(--text-secondary)]">
                  当前会附带世界连接、数据库、推理网关和实例模式摘要，不包含敏感消息正文。
                </div>
              </div>
            </label>

            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                onClick={() => void handleSubmitFeedback()}
                className="rounded-[10px] bg-[color:var(--brand-primary)] text-white hover:opacity-95"
              >
                <Send size={15} />
                保存反馈
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void handleCopyFeedbackPackage()}
                className="rounded-[10px] border-[color:var(--border-faint)] bg-white shadow-none hover:bg-[color:var(--surface-console)]"
              >
                <Sparkles size={15} />
                复制反馈包
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void handleSaveFeedbackPackage()}
                className="rounded-[10px] border-[color:var(--border-faint)] bg-white shadow-none hover:bg-[color:var(--surface-console)]"
              >
                <Download size={15} />
                保存反馈包
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setDraft({ ...defaultDesktopFeedbackDraft });
                  clearDesktopFeedbackDraft();
                  setNotice({
                    message: "反馈草稿已清空。",
                    tone: "success",
                  });
                  setError(null);
                }}
                className="rounded-[10px] border-[color:var(--border-faint)] bg-white shadow-none hover:bg-[color:var(--surface-console)]"
              >
                清空草稿
              </Button>
            </div>
          </div>
        </section>
      </div>
    </DesktopUtilityShell>
  );

  async function handleSubmitFeedback() {
    const normalizedTitle = draft.title.trim();
    const normalizedDetail = draft.detail.trim();

    if (!normalizedTitle) {
      setError("请先填写反馈标题。");
      return;
    }

    if (!normalizedDetail) {
      setError("请先补充问题描述。");
      return;
    }

    const nextHistory = pushDesktopFeedbackRecord({
      ...draft,
      title: normalizedTitle,
      detail: normalizedDetail,
      reproduction: draft.reproduction.trim(),
      expected: draft.expected.trim(),
      diagnosticSummary,
    });

    setHistory(nextHistory);
    setDraft({ ...defaultDesktopFeedbackDraft });
    clearDesktopFeedbackDraft();
    setError(null);
    setNotice({
      message: "反馈已保存到本地工作区。",
      tone: "success",
    });
  }

  function buildFeedbackPackage() {
    return [
      `反馈分类：${resolveCategoryLabel(draft.category)}`,
      `优先级：${resolvePriorityLabel(draft.priority)}`,
      `标题：${draft.title.trim() || "未填写"}`,
      `问题描述：${draft.detail.trim() || "未填写"}`,
      `复现步骤：${draft.reproduction.trim() || "未填写"}`,
      `期望结果：${draft.expected.trim() || "未填写"}`,
      `实例地址：${baseUrl || "未配置"}`,
      `运行平台：${runtimeConfig.appPlatform || "web"}`,
      `世界主人：${ownerName || "世界主人"}`,
      `诊断摘要：${diagnosticSummary}`,
    ].join("\n");
  }

  function buildFeedbackPackageFileName() {
    const normalizedTitle =
      draft.title
        .trim()
        .replace(/[\\/:*?"<>|]/g, "-")
        .replace(/\s+/g, "-") || "desktop-feedback";
    const date = new Date().toISOString().slice(0, 10);
    return `${normalizedTitle}-${date}.txt`;
  }

  async function handleCopyFeedbackPackage() {
    const feedbackPackage = buildFeedbackPackage();

    if (
      typeof navigator === "undefined" ||
      !navigator.clipboard ||
      typeof navigator.clipboard.writeText !== "function"
    ) {
      setError("当前环境暂不支持复制反馈包。");
      return;
    }

    try {
      await navigator.clipboard.writeText(feedbackPackage);
      setError(null);
      setNotice({
        message: "反馈包已复制，可直接发给产品或开发继续跟进。",
        tone: "success",
      });
    } catch {
      setError("复制反馈包失败，请稍后重试。");
    }
  }

  async function handleSaveFeedbackPackage() {
    const result = await saveGeneratedFile({
      contents: buildFeedbackPackage(),
      fileName: buildFeedbackPackageFileName(),
      mimeType: "text/plain;charset=utf-8",
      dialogTitle: "保存反馈包",
      kindLabel: "反馈包",
    });

    if (result.status === "cancelled") {
      return;
    }

    const canRevealSavedFile =
      result.status === "saved" && Boolean(result.savedPath?.trim());
    const savedPath = canRevealSavedFile ? result.savedPath!.trim() : null;

    setNotice({
      message: result.message,
      tone: result.status === "failed" ? "danger" : "success",
      actionLabel: canRevealSavedFile ? "打开位置" : undefined,
      onAction: savedPath
        ? () => {
            void revealSavedFile(savedPath).then((revealed) => {
              setNotice({
                message: revealed
                  ? "已打开反馈包所在位置。"
                  : "打开所在位置失败，请稍后再试。",
                tone: revealed ? "success" : "danger",
              });
            });
          }
        : undefined,
    });
    setError(null);
  }
}

function FeedbackTextarea({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <div>
      <div className="mb-2 text-xs tracking-[0.14em] text-[color:var(--text-dim)]">
        {label}
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-h-[116px] w-full rounded-[12px] border border-[color:var(--border-faint)] bg-white px-4 py-3.5 text-sm leading-7 text-[color:var(--text-primary)] outline-none transition placeholder:text-[color:var(--text-dim)] hover:bg-[color:var(--surface-console)] focus:border-[rgba(7,193,96,0.14)]"
      />
    </div>
  );
}

function FeedbackContextRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[12px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-4 py-3">
      <div className="text-xs text-[color:var(--text-muted)]">{label}</div>
      <div className="mt-1 text-sm leading-6 text-[color:var(--text-primary)]">
        {value}
      </div>
    </div>
  );
}

function FeedbackStatCard({
  compact = false,
  label,
  value,
}: {
  compact?: boolean;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[12px] border border-[color:var(--border-faint)] bg-white p-4 shadow-[var(--shadow-soft)]">
      <div className="text-xs text-[color:var(--text-muted)]">{label}</div>
      <div
        className={cn(
          "mt-2 font-medium text-[color:var(--text-primary)]",
          compact ? "text-sm leading-6" : "text-base",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function resolveCategoryLabel(category: DesktopFeedbackCategory) {
  const matched = categoryOptions.find((item) => item.id === category);
  return matched?.label ?? "未分类";
}

function resolvePriorityLabel(priority: DesktopFeedbackPriority) {
  const matched = priorityOptions.find((item) => item.id === priority);
  return matched ? `${matched.label}优先级` : "未标记";
}
