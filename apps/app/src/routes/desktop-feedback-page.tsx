import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSystemStatus } from "@yinjie/contracts";
import {
  AlertCircle,
  Bug,
  ClipboardList,
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
import { DesktopEntryShell } from "../features/desktop/desktop-entry-shell";
import {
  clearDesktopFeedbackDraft,
  defaultDesktopFeedbackDraft,
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

export function DesktopFeedbackPage() {
  const isDesktopLayout = useDesktopLayout();
  const runtimeConfig = useAppRuntimeConfig();
  const ownerName = useWorldOwnerStore((state) => state.username);
  const ownerSignature = useWorldOwnerStore((state) => state.signature);
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [draft, setDraft] = useState<DesktopFeedbackDraft>(() =>
    readDesktopFeedbackDraft(),
  );
  const [history, setHistory] = useState<DesktopFeedbackRecord[]>(() =>
    readDesktopFeedbackHistory(),
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const systemStatusQuery = useQuery({
    queryKey: ["desktop-feedback-system-status", baseUrl],
    queryFn: () => getSystemStatus(baseUrl),
  });

  useEffect(() => {
    writeDesktopFeedbackDraft(draft);
  }, [draft]);

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
    return null;
  }

  return (
    <div className="h-full overflow-auto px-6 py-6">
      <DesktopEntryShell
        badge="Feedback"
        title="意见反馈把问题和上下文一起交付"
        description="当前没有正式反馈后端，就先把桌面反馈表单、本地记录和诊断摘要做实。这样提问题时不是一句空话，而是能带着分类、复现步骤和实例上下文一起落下。"
        aside={
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
            <FeedbackStatCard
              label="诊断摘要"
              value={diagnosticSummary}
              compact
            />
          </div>
        }
      >
        <div className="space-y-5">
          {notice ? <InlineNotice tone="success">{notice}</InlineNotice> : null}
          {error ? <InlineNotice tone="info">{error}</InlineNotice> : null}
          {systemStatusQuery.isError &&
          systemStatusQuery.error instanceof Error ? (
            <ErrorBlock message={systemStatusQuery.error.message} />
          ) : null}

          <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
            <section className="rounded-[28px] border border-[color:var(--border-faint)] bg-white/92 p-5 shadow-[var(--shadow-soft)]">
              <div className="text-sm font-medium text-[color:var(--text-primary)]">
                提交反馈
              </div>
              <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
                先把问题说清楚，再决定后面是接
                webhook、正式接口还是更细分的诊断流程。
              </div>

              <div className="mt-4 space-y-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-[color:var(--text-dim)]">
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
                            "rounded-[22px] border p-4 text-left transition",
                            draft.category === item.id
                              ? "border-[rgba(249,115,22,0.24)] bg-[rgba(249,115,22,0.10)]"
                              : "border-[color:var(--border-faint)] bg-[rgba(255,250,244,0.82)] hover:bg-white",
                          )}
                        >
                          <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--text-primary)]">
                            <Icon
                              size={16}
                              className="text-[color:var(--brand-primary)]"
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
                    <div className="mb-2 text-xs uppercase tracking-[0.18em] text-[color:var(--text-dim)]">
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
                    <div className="mb-2 text-xs uppercase tracking-[0.18em] text-[color:var(--text-dim)]">
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
                            "flex-1 rounded-full border px-3 py-2 text-xs font-medium transition",
                            draft.priority === item.id
                              ? "border-[rgba(249,115,22,0.24)] bg-[rgba(249,115,22,0.10)] text-[color:var(--brand-primary)]"
                              : "border-[color:var(--border-faint)] bg-white/90 text-[color:var(--text-secondary)]",
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

                <label className="flex items-start gap-3 rounded-[22px] border border-[color:var(--border-faint)] bg-[rgba(255,250,244,0.82)] px-4 py-3">
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
                    className="rounded-2xl"
                  >
                    <Send size={15} />
                    保存反馈
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void handleCopyFeedbackPackage()}
                    className="rounded-2xl"
                  >
                    <Sparkles size={15} />
                    复制反馈包
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setDraft({ ...defaultDesktopFeedbackDraft });
                      clearDesktopFeedbackDraft();
                      setNotice("反馈草稿已清空。");
                      setError(null);
                    }}
                    className="rounded-2xl"
                  >
                    清空草稿
                  </Button>
                </div>
              </div>
            </section>

            <section className="space-y-5">
              <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-white/92 p-5 shadow-[var(--shadow-soft)]">
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

              <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-white/92 p-5 shadow-[var(--shadow-soft)]">
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

              <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-white/92 p-5 shadow-[var(--shadow-soft)]">
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
                        className="rounded-[22px] border border-[color:var(--border-faint)] bg-[rgba(255,250,244,0.82)] p-4"
                      >
                        <div className="flex items-center gap-2 text-xs text-[color:var(--text-muted)]">
                          <span>{resolveCategoryLabel(item.category)}</span>
                          <span>·</span>
                          <span>{resolvePriorityLabel(item.priority)}</span>
                          <span>·</span>
                          <span>{formatTimestamp(item.submittedAt)}</span>
                        </div>
                        <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">
                          {item.title}
                        </div>
                        <div className="mt-2 line-clamp-3 text-xs leading-5 text-[color:var(--text-secondary)]">
                          {item.detail}
                        </div>
                        <div className="mt-3 text-[11px] leading-5 text-[color:var(--text-muted)]">
                          {item.diagnosticSummary}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[22px] border border-dashed border-[color:var(--border-faint)] bg-[rgba(255,250,244,0.58)] p-5 text-sm leading-7 text-[color:var(--text-secondary)]">
                      还没有保存过反馈。先把一个真实问题记下来，后续再接正式提交流。
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>
      </DesktopEntryShell>
    </div>
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
    setNotice("反馈已保存到本地工作区。");
  }

  async function handleCopyFeedbackPackage() {
    const feedbackPackage = [
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
      setNotice("反馈包已复制，可直接发给产品或开发继续跟进。");
    } catch {
      setError("复制反馈包失败，请稍后重试。");
    }
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
      <div className="mb-2 text-xs uppercase tracking-[0.18em] text-[color:var(--text-dim)]">
        {label}
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-h-[116px] w-full rounded-[20px] border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-3.5 text-sm leading-7 text-[color:var(--text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] outline-none transition-[border-color,background-color,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-standard)] placeholder:text-[color:var(--text-dim)] hover:border-[color:var(--border-subtle)] hover:bg-white focus:border-[color:var(--border-brand)] focus:bg-white focus:shadow-[var(--shadow-focus)]"
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
    <div className="rounded-[20px] border border-[color:var(--border-faint)] bg-[rgba(255,250,244,0.82)] px-4 py-3">
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
    <div className="rounded-[22px] border border-[color:var(--border-faint)] bg-white/88 p-4 shadow-[var(--shadow-soft)]">
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
