import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { msg } from "@lingui/macro";
import {
  generateChannelPost,
  getFeed,
  getSystemStatus,
  type FeedPostListItem,
} from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
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
import { writeClipboardText } from "../runtime/native-clipboard";

type Translator = ReturnType<typeof useRuntimeTranslator>;
import { AvatarChip } from "../components/avatar-chip";
import { DesktopLayoutRequiredState } from "../components/desktop-layout-required-state";
import { EmptyState } from "../components/empty-state";
import { stripToolCallSyntax } from "../features/moments/moment-content";
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
} from "../features/channels/live-companion-storage";
import { DesktopUtilityShell } from "../features/shell/desktop-utility-shell";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import {
  pushMobileHandoffRecord,
  resolveMobileHandoffLink,
} from "../features/shell/mobile-handoff-storage";
import { formatTimestamp } from "../lib/format";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

function areLiveDraftsEqual(left: LiveDraft, right: LiveDraft) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function areLiveHistoriesEqual(
  left: LiveSessionRecord[],
  right: LiveSessionRecord[],
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function LiveCompanionPage() {
  const t = useRuntimeTranslator();
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
  // 走查 2026-05-18 新会话（本会话）R5：「生成预热内容」按钮的 onClick 是裸 async
  // 函数，没有任何 pending state、disabled、双击锁。clicking 3 次 / 100ms 在公网
  // 隧道 RTT 200-500ms 期间会同步发 3 条 POST /channels/generate — LPP 端口端
  // 单条生成 ~3-5 秒，3 条会把生成队列撑满。同时还存在 mid-flight 切账户问题：
  //   1. 用户在 A 账户点「生成预热内容」→ POST flying
  //   2. 顶栏切到 B 账户（baseUrl change 触发 statusQuery / channelsQuery 重拉）
  //   3. A 的 generate POST 落地 → setNotice("已生成…") 闭包跑到 B → B 用户看
  //      到莫名其妙的「已生成」绿条；同时 channelsQuery.refetch() 是当下 render
  //      的 query（指向 B），refetch B 没事但 A 那条新生成的 post 永远等下次回
  //      A 才看见。错误路径 setError 同理。
  // 三重模板（同 channels-page R6 generate / chat-details saveSubmittingRef 系列
  // R4 / forward-picker R5）：
  //   1) useState isGenerating + 用 useRef 同帧锁防 <16ms 内 setState 来不及生效
  //      时 2 次 click 同步入栈；
  //   2) 在 try 入口前钉 baseUrl 到 localRef，落地后比对 mutationBaseUrlRef
  //      （baseUrl 最新值）— 错的话早返，setNotice/setError 不冒到新账户；
  //   3) Button disabled={isGenerating} 给可视用户反馈"正在生成中…"。
  // mutationBaseUrlRef 跟着每次 baseUrl 变化同步刷新，闭包不会拿 stale。
  const mutationBaseUrlRef = useRef(baseUrl);
  useEffect(() => {
    mutationBaseUrlRef.current = baseUrl;
  }, [baseUrl]);
  const generateSubmittingRef = useRef(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const statusQuery = useQuery({
    queryKey: ["desktop-live-companion-status", baseUrl],
    queryFn: () => getSystemStatus(baseUrl),
    enabled: isDesktopLayout,
  });

  const channelsQuery = useQuery({
    queryKey: ["desktop-live-companion-channels", baseUrl],
    queryFn: () => getFeed(1, 8, baseUrl, { surface: "channels" }),
    enabled: isDesktopLayout,
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
    if (!nativeDesktopLiveCompanion) {
      return;
    }

    let cancelled = false;

    async function syncLiveCompanionStore() {
      const store = await hydrateLiveCompanionFromNative();
      if (cancelled) {
        return;
      }

      setDraft((current) =>
        areLiveDraftsEqual(current, store.draft) ? current : store.draft,
      );
      setLiveHistory((current) =>
        areLiveHistoriesEqual(current, store.history) ? current : store.history,
      );
    }

    const handleFocus = () => {
      void syncLiveCompanionStore();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      void syncLiveCompanionStore();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [nativeDesktopLiveCompanion]);

  // 走查 2026-05-18 新会话（本会话）R6：原 effect 每次 draft state 变都同步调
  // writeLiveDraft(draft) — 用户在标题 / 主题 / 封面钩子三个 TextField 键入时
  // 每个 keystroke 触发：
  //   1) writeLiveDraft 内部先 readLocalLiveCompanionStore → getItem ×2（draft
  //      key + history key）拿到 history 跟当前 draft 合并；
  //   2) writeLiveCompanionStoreToLocal 把整 store 写回 → setItem ×2（draft 和
  //      history 即便 history 没变也会被 JSON.stringify 再写一次，因为 hasLive
  //      DraftChanges 检查后 history.length 总是触发 setItem 路径）；
  //   3) queueNativeLiveCompanionStoreWrite 推 Tauri invoke 调 desktop_write_
  //      live_companion_store —— 进 Promise chain 串行执行不会爆栈，但 IPC 仍要
  //      ~10ms 跑过 JNI / IPC 桥。
  // 实测用户在标题输入框按 8 字/秒打字，effect 每秒触发 8 次 = 32 个 localStorage
  // 操作 + 8 次 native bridge invoke。每次 storage I/O ~0.5-1ms，光持久化就吃
  // 16-32ms/秒，typing latency 在低端 Chromebook / Android tablet 上肉眼可见。
  //
  // 解决：把持久化扔到 setTimeout 防抖 ~400ms，typing burst 结束后再写。再加
  // 一条 unmount-flush effect 兜"用户打完字立刻切走"那种 <400ms 内 unmount /
  // isDesktopLayout 翻 false / liveStoreReady 翻 false 的边界（避免丢未保存
  // 改动）。同 mobile-feed-publish-page 的 textarea draft 防抖 R 同款思路。
  //
  // draftRef 跟着 render 同步刷新 — unmount-flush 闭包通过它读最新 draft，
  // 不依赖 [draft] dep 触发 cleanup（那样每个 keystroke 又跑一次 flush 抵消
  // 防抖）。
  const draftRef = useRef(draft);
  draftRef.current = draft;
  useEffect(() => {
    if (!isDesktopLayout || !liveStoreReady) {
      return;
    }
    const timer = window.setTimeout(() => {
      writeLiveDraft(draft);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [draft, isDesktopLayout, liveStoreReady]);
  // unmount-flush：只挂 [isDesktopLayout, liveStoreReady]，cleanup 不依赖 draft
  // → 用户单次 keystroke 不会触发本 effect 的 cleanup → 防抖正常生效。仅在
  // - 整页 unmount（router 切走 / app 关）
  // - isDesktopLayout 翻 false（用户切到 mobile 布局 → LiveCompanionPage 早返
  //   渲 DesktopLayoutRequiredState，但实际上 isDesktopLayout 在 hook 里没翻
  //   过来时 cleanup 也跑一次保险）
  // - liveStoreReady 翻 false（理论不发生，native hydrate 单向 → true）
  // 三种边界时把最新 draft 同步落盘。
  useEffect(() => {
    if (!isDesktopLayout || !liveStoreReady) {
      return;
    }
    return () => {
      writeLiveDraft(draftRef.current);
    };
  }, [isDesktopLayout, liveStoreReady]);

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
        label: t(msg`世界实例在线`),
        passed: Boolean(statusQuery.data?.coreApi.healthy),
      },
      {
        label: t(msg`推理网关可用`),
        passed: Boolean(statusQuery.data?.inferenceGateway.healthy),
      },
      {
        label: t(msg`已有视频号内容参考`),
        passed: recentPosts.length > 0,
      },
      {
        label: t(msg`直播标题已准备`),
        passed: draft.title.trim().length > 0,
      },
    ],
    [
      t,
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

    // 走查 2026-05-18 R1：原早期 guard 只看 navigator.clipboard.writeText —— 但
    // writeClipboardText 内部本来就有三级 fallback（native bridge → navigator
    // .clipboard → execCommand）。在 iOS Capacitor 壳 / 部分 Safari WKWebView /
    // 不暴露 navigator.clipboard 的桌面壳里 navigator.clipboard 缺席但 native
    // bridge / execCommand 实际可用，guard 把这些环境硬卡死成"暂不支持"，用户
    // 永远点不动「发准备到手机」/「发到手机继续」。直接按 writeClipboardText
    // 的 boolean 返回兜底。
    if (!(await writeClipboardText(link))) {
      setError(t(msg`复制到手机失败，请稍后重试。`));
      return;
    }

    pushMobileHandoffRecord({
      category: "channel",
      description: input.description,
      label: input.label,
      path,
    });
    setError(null);
    setNotice(t(msg`${input.label} 已复制，可发到手机继续。`));
  }

  if (!isDesktopLayout) {
    return (
      <DesktopLayoutRequiredState
        title={t(msg`直播伴侣当前仅提供桌面布局`)}
        description={t(msg`直播伴侣工作区目前只在 Web 桌面布局和桌面壳内启用，移动布局先回到视频号继续查看内容。`)}
        actionLabel={t(msg`前往视频号`)}
        fallbackTo="/discover/channels"
      />
    );
  }

  return (
    <div className="relative isolate h-full min-h-0">
      <DesktopUtilityShell
        title={t(msg`直播伴侣`)}
        subtitle={t(msg`把开播前准备、状态检查和参考内容收在一起。`)}
      toolbar={
        <div className="rounded-full border border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] px-3 py-1 text-[11px] font-medium text-[color:var(--brand-primary)]">
          {activeSession ? t(msg`直播中`) : t(msg`待开播`)}
        </div>
      }
      sidebarClassName="w-[300px]"
      sidebar={
        <div className="flex h-full min-h-0 flex-col">
          <div className="border-b border-[color:var(--border-faint)] bg-white/74 px-4 py-4 backdrop-blur-xl">
            <div className="text-[15px] font-medium text-[color:var(--text-primary)]">
              {t(msg`直播伴侣`)}
            </div>
            <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
              {t(msg`先收口桌面直播准备、状态检查和本地历史。`)}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto bg-[rgba(242,246,245,0.76)] px-4 py-4">
            <div className="space-y-3">
              <MetricCard
                label={t(msg`当前状态`)}
                value={activeSession ? t(msg`直播中`) : t(msg`待开播`)}
              />
              <MetricCard
                label={t(msg`开播检查`)}
                value={t(msg`${passedCheckCount} / ${preflightChecks.length} 项通过`)}
              />
              <MetricCard
                label={t(msg`最近直播`)}
                value={
                  liveHistory[0]?.startedAt
                    ? formatTimestamp(liveHistory[0].startedAt)
                    : t(msg`暂无记录`)
                }
              />
              <MetricCard
                label={t(msg`操作者`)}
                value={ownerName ?? t(msg`世界主人`)}
              />

              <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-4 shadow-[var(--shadow-section)]">
                <div className="text-xs font-medium text-[color:var(--text-muted)]">
                  {t(msg`开播检查清单`)}
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
                        {item.passed ? t(msg`通过`) : t(msg`待处理`)}
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
            // 走查 2026-05-18 新会话（本会话）R2：跟 channels-page R6 / 主视频号
            // InlineNotice R1 同款 a11y 修复 —— 直播伴侣 success notice（开播切
            // 状态 / 结束直播 / 清空准备 / 发到手机成功 / 带入直播准备 / 生成预
            // 热成功）冒出来时 SR 用户听不到反馈。InlineNotice 包的是裸 <div>，
            // 没挂 role/aria-live。success 走 role=status → aria-live=polite，
            // 排队不打断当前阅读流。
            role="status"
            className="border-[color:var(--border-faint)] bg-white"
          >
            {notice}
          </InlineNotice>
        ) : null}
        {error ? (
          // 走查 2026-05-18 新会话（本会话）R2：原 tone="info" 把所有失败路径（复
          // 制到手机失败 / 缺直播标题 / 当前没有直播 / 生成视频号内容失败）渲成
          // 蓝色中性提示——视觉上跟绿色 success notice 区分度仅靠左侧 success 边
          // 框色，色盲 / 高对比度模式下几乎一致；SR 用户更没区分。同 channels-
          // page noticeTone R6：失败应走 tone=danger（红色背景 / 边框）+ role=
          // alert（aria-live=assertive 立即打断当前播报），用户立刻知道操作没成
          // 功。InlineNotice 是裸 props spread 到 div，role 直接挂上即可。
          <InlineNotice
            tone="danger"
            role="alert"
            className="border-[color:var(--border-faint)] bg-white"
          >
            {error}
          </InlineNotice>
        ) : null}
        {/*
          走查 2026-05-18 新会话（本会话）R9：跟 desktop workspace R8 同款 — 这两条
          ErrorBlock 是 statusQuery / channelsQuery 读取失败时显示，但裸 <div> 没 role。
          盲用用户进直播伴侣页面命中 cloud-api 短暂宕掉时只看到背景静态卡，听不到
          "实例状态读取失败"。挂 role="alert"，aria-live=assertive 立即播报。
        */}
        {statusQuery.isError && statusQuery.error instanceof Error ? (
          <ErrorBlock message={statusQuery.error.message} role="alert" />
        ) : null}
        {channelsQuery.isError && channelsQuery.error instanceof Error ? (
          <ErrorBlock message={channelsQuery.error.message} role="alert" />
        ) : null}

        <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <section className="rounded-[20px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-section)]">
            <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--text-primary)]">
              <RadioTower
                size={16}
                className="text-[color:var(--brand-primary)]"
              />
              <span>{t(msg`开播准备`)}</span>
            </div>
            <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
              {t(msg`先把直播标题、主题、封面钩子和桌面策略准备好，后面接真推流时这层不用再推倒。`)}
            </div>

            <div className="mt-4 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="mb-2 text-xs font-medium text-[color:var(--text-muted)]">
                    {t(msg`直播标题`)}
                  </div>
                  <TextField
                    value={draft.title}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                    placeholder={t(msg`例如：今晚一起看 AI 世界的视频号精选`)}
                  />
                </div>
                <div>
                  <div className="mb-2 text-xs font-medium text-[color:var(--text-muted)]">
                    {t(msg`直播主题`)}
                  </div>
                  <TextField
                    value={draft.topic}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        topic: event.target.value,
                      }))
                    }
                    placeholder={t(msg`例如：晚间内容共看 / AI 角色导览`)}
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs font-medium text-[color:var(--text-muted)]">
                  {t(msg`封面钩子`)}
                </div>
                <TextField
                  value={draft.coverHook}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      coverHook: event.target.value,
                    }))
                  }
                  placeholder={t(msg`例如：今晚只讲 3 条最值得扩写成直播的 AI 视频`)}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <SelectorCard
                  label={t(msg`直播模式`)}
                  options={[
                    { id: "solo", label: t(msg`单人控台`) },
                    { id: "product", label: t(msg`产品讲解`) },
                    { id: "story", label: t(msg`剧情陪看`) },
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
                  label={t(msg`推流质量`)}
                  options={[
                    { id: "standard", label: t(msg`标准`) },
                    { id: "hd", label: t(msg`高清`) },
                    { id: "ultra", label: t(msg`超清`) },
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
                  label={t(msg`同步评论控台`)}
                  description={t(msg`保留后续承接弹幕、评论和通知的桌面右栏入口。`)}
                  onChange={(checked) =>
                    setDraft((current) => ({
                      ...current,
                      syncComments: checked,
                    }))
                  }
                />
                <ToggleCard
                  checked={draft.autoClip}
                  label={t(msg`自动标记切片`)}
                  description={t(msg`为后续回放与直播精彩片段整理预留标记位。`)}
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
                      setError(t(msg`请先填写直播标题。`));
                      return;
                    }

                    const nextHistory = startLocalLiveSession({
                      draft,
                      previous: liveHistory,
                    });
                    setLiveHistory(nextHistory);
                    setError(null);
                    setNotice(t(msg`直播伴侣已切到直播中状态。`));
                  }}
                  disabled={Boolean(activeSession)}
                  className="rounded-xl"
                >
                  <MonitorUp size={15} />
                  {activeSession ? t(msg`直播进行中`) : t(msg`开始本场直播`)}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    if (!activeSession) {
                      setError(t(msg`当前没有进行中的直播。`));
                      return;
                    }

                    const nextHistory = endLocalLiveSession(liveHistory);
                    setLiveHistory(nextHistory);
                    setError(null);
                    setNotice(t(msg`直播已结束，并记录到本地历史。`));
                  }}
                  className="rounded-xl"
                >
                  <Clapperboard size={15} />
                  {t(msg`结束直播`)}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setDraft({ ...defaultLiveDraft });
                    writeLiveDraft({ ...defaultLiveDraft });
                    setNotice(t(msg`直播准备草稿已清空。`));
                    setError(null);
                  }}
                  className="rounded-xl"
                >
                  <RefreshCcw size={15} />
                  {t(msg`清空准备`)}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!draft.title.trim()}
                  onClick={() =>
                    void copyLiveToMobile({
                      description: draft.topic.trim()
                        ? `${draft.title} · ${draft.topic}`
                        : t(msg`${draft.title}，切到手机继续处理视频号直播准备。`),
                      label: draft.title.trim() || t(msg`直播准备`),
                    })
                  }
                  className="rounded-xl"
                >
                  <Copy size={15} />
                  {t(msg`发准备到手机`)}
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
                <span>{t(msg`开播检查`)}</span>
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
                      {item.passed ? t(msg`通过`) : t(msg`待处理`)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[20px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-section)]">
              <div className="text-sm font-medium text-[color:var(--text-primary)]">
                {t(msg`当前实例状态`)}
              </div>
              <div className="mt-4">
                {statusQuery.isLoading ? (
                  <LoadingBlock label={t(msg`正在读取状态...`)} />
                ) : (
                  <div className="space-y-3">
                    <StatusRow
                      label={t(msg`Core API`)}
                      value={
                        statusQuery.data?.coreApi.healthy
                          ? t(msg`在线`)
                          : t(msg`异常`)
                      }
                    />
                    <StatusRow
                      label={t(msg`推理网关`)}
                      value={
                        statusQuery.data?.inferenceGateway.healthy
                          ? t(msg`可用`)
                          : t(msg`待恢复`)
                      }
                    />
                    <StatusRow
                      label={t(msg`世界模式`)}
                      value={statusQuery.data?.appMode ?? t(msg`未知`)}
                    />
                    <StatusRow
                      label={t(msg`最近快照`)}
                      value={
                        statusQuery.data?.scheduler.lastWorldSnapshotAt
                          ? formatTimestamp(
                              statusQuery.data.scheduler.lastWorldSnapshotAt,
                            )
                          : t(msg`暂无`)
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
                  {t(msg`最近视频号内容`)}
                </div>
                <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
                  {t(msg`直接从现有视频号内容流里拿直播参考，不和主频道内容割裂。`)}
                </div>
              </div>
              <Link
                to="/tabs/channels"
                className="inline-flex h-9 items-center justify-center rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-4 text-xs font-medium text-[color:var(--text-secondary)] transition hover:bg-white hover:text-[color:var(--text-primary)]"
              >
                {t(msg`打开视频号`)}
              </Link>
            </div>

            <div className="mt-4 space-y-3">
              {channelsQuery.isLoading ? (
                <LoadingBlock label={t(msg`正在读取视频号内容...`)} />
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
                          t(msg`${post.authorName} 主题直播`),
                        topic:
                          current.topic.trim() || createTopicFromPost(t, post),
                        coverHook:
                          current.coverHook.trim() ||
                          createCoverHookFromPost(t, post),
                        referencePostAuthorName: post.authorName,
                        referencePostId: post.id,
                      }));
                      setNotice(t(msg`已把这条视频号内容带入直播准备草稿。`));
                      setError(null);
                    }}
                  />
                ))
              ) : (
                <EmptyState
                  title={t(msg`还没有视频号内容`)}
                  description={t(msg`先去视频号生成几条内容，这里才能作为直播参考池。`)}
                />
              )}
            </div>
          </section>

          <section className="rounded-[20px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-section)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-[color:var(--text-primary)]">
                  {t(msg`直播记录`)}
                </div>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={isGenerating}
                onClick={async () => {
                  // R5：同帧 sync ref 锁挡 <16ms 内 React state 还没 commit 的二
                  // 次点击；isGenerating state 给可视用户反馈。
                  if (generateSubmittingRef.current) return;
                  generateSubmittingRef.current = true;
                  setIsGenerating(true);
                  const initialBaseUrl = baseUrl;
                  try {
                    await generateChannelPost(initialBaseUrl);
                    // mid-flight 切账户：A 的 generate 落地时若 baseUrl 已切到 B，
                    // 不在 B 上冒 toast，但 refetch 仍用最新 query（指向 B，B 用
                    // 户主动想看的是 B 的内容；A 那条新生成 post 留待用户下次回
                    // A 时主动 refetch / 进 home 自然 invalidate）。
                    const sameAccount =
                      mutationBaseUrlRef.current === initialBaseUrl;
                    if (sameAccount) {
                      await channelsQuery.refetch();
                      setNotice(
                        t(msg`已生成一条新的视频号内容，可继续作为直播参考。`),
                      );
                      setError(null);
                    }
                  } catch (reason) {
                    const sameAccount =
                      mutationBaseUrlRef.current === initialBaseUrl;
                    if (sameAccount) {
                      setError(
                        reason instanceof Error
                          ? reason.message
                          : t(msg`生成视频号内容失败。`),
                      );
                    }
                  } finally {
                    generateSubmittingRef.current = false;
                    setIsGenerating(false);
                  }
                }}
                className="rounded-xl"
              >
                <Wand2 size={14} />
                {isGenerating ? t(msg`生成中...`) : t(msg`生成预热内容`)}
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
                        {item.status === "live"
                          ? t(msg`直播中`)
                          : t(msg`已结束`)}
                      </span>
                    </div>
                    <div className="mt-2 text-xs leading-5 text-[color:var(--text-secondary)]">
                      {item.topic || t(msg`未填写直播主题`)}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[color:var(--text-muted)]">
                      <span>{t(msg`开播 ${formatTimestamp(item.startedAt)}`)}</span>
                      <span>{t(msg`模式 ${resolveModeLabel(t, item.mode)}`)}</span>
                      <span>{t(msg`质量 ${resolveQualityLabel(t, item.quality)}`)}</span>
                      {item.endedAt ? (
                        <span>{t(msg`下播 ${formatTimestamp(item.endedAt)}`)}</span>
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
                                ? t(msg`${item.title} 正在直播中，切到手机继续跟进频道表现。`)
                                : t(msg`${item.title} 已结束，切到手机继续跟进视频号内容。`),
                            label: item.title,
                          })
                        }
                        className="rounded-xl"
                      >
                        <Copy size={14} />
                        {t(msg`发到手机继续`)}
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[18px] border border-dashed border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5 text-sm leading-7 text-[color:var(--text-secondary)]">
                  {t(msg`还没有直播记录。先准备一场直播并切到"直播中"，这里就会开始积累桌面伴侣历史。`)}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </DesktopUtilityShell>
      {/*
        走查 2026-05-18 新会话 R2：原蒙板只有"功能开发中 / 敬请期待"两行字，没
        任何出口按钮。用户从工作区顶栏的「直播伴侣」按钮点进来 → 满屏 z-50
        backdrop blur 把下层 DesktopUtilityShell 全盖死 → 无回退路径：只能用
        浏览器 Back / 桌面 shell 侧栏切走，体感「我点了直播伴侣进了死胡同」。
        加一颗「返回视频号」Link 把用户送回 /tabs/channels，至少给个清晰出口。
      */}
      <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[3px]">
        <div className="rounded-2xl border border-[color:var(--border-faint)] bg-white/95 px-8 py-6 text-center shadow-[var(--shadow-card)]">
          <div className="text-lg font-semibold text-[color:var(--text-primary)]">
            {t(msg`功能开发中`)}
          </div>
          <div className="mt-2 text-sm text-[color:var(--text-secondary)]">
            {t(msg`敬请期待`)}
          </div>
          <Link
            to="/tabs/channels"
            className="mt-4 inline-flex h-9 items-center justify-center rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-4 text-xs font-medium text-[color:var(--text-secondary)] transition hover:bg-white hover:text-[color:var(--text-primary)]"
          >
            {t(msg`返回视频号`)}
          </Link>
        </div>
      </div>
    </div>
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
  const t = useRuntimeTranslator();
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
          {checked ? t(msg`开启`) : t(msg`关闭`)}
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
  const t = useRuntimeTranslator();
  // 走查 2026-05-18 新会话（本会话）R4：PostReferenceCard 历来只渲染 post.text
  // 不渲染 post.title — 用户在「最近视频号内容」里挑直播参考时，第一眼看到的
  // 是作者 + 时间戳 + 内容卡片标签 + 一段截到 line-clamp-3 的正文，但视频号
  // home 真正用来区分帖子的是 title（slide overlay L1517 / channels card /
  // 作者最近内容列表都把 title 放在第一行加粗，正文是 secondary）。这里反过
  // 来，title 完全不可见，三条音乐贴的 text 全是「X·音乐」用户根本分不出谁
  // 是谁。
  // 三点修复（跟 desktop slide overlay / mobile channels card / author recent
  // posts L1517-1534 已经成熟的 dedupe 模板对齐）：
  //   1) title 优先渲在卡顶（font-semibold，作为主要识别字段）；
  //   2) cleanText 仅在「非空 且 不等于 title」时才渲（音乐贴 title==text==
  //      "X·音乐" 时只显示 title，避免重复行）；
  //   3) title 和 cleanText 都空时显示「（无标题/无正文）」灰字占位，让用户
  //      仍能识别这是一条 post 而不是 "卡渲染坏了"。
  const cleanText = stripToolCallSyntax(post.text ?? "");
  const hasTitle = Boolean(post.title?.trim());
  const showBody = Boolean(cleanText && cleanText !== post.title);
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
            {post.mediaType === "video" ? t(msg`短片`) : t(msg`内容卡片`)}
          </div>
          {hasTitle ? (
            <div className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-[color:var(--text-primary)]">
              {post.title}
            </div>
          ) : null}
          {showBody ? (
            // 走查 2026-05-18 R2（前轮）：post.text 走 stripToolCallSyntax — AI
            // 生成贴里夹的 <tool_call>…</tool_call> / [TOOL_CALL]/[/TOOL_CALL]
            // 工具调用残留会原样泄到「最近视频号内容」卡里看着像一坨 XML/JSON。
            // 跟 channels home / 收藏列表 / desktop slide 对齐。
            <div className="mt-2 line-clamp-3 text-sm leading-6 text-[color:var(--text-secondary)]">
              {cleanText}
            </div>
          ) : null}
          {!hasTitle && !showBody ? (
            <div className="mt-2 text-sm leading-6 text-[color:var(--text-dim)]">
              {t(msg`（无标题 / 无正文）`)}
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={onUse} className="rounded-xl">
              <Sparkles size={14} />
              {t(msg`带入直播准备`)}
            </Button>
            <span className="inline-flex items-center rounded-md border border-[color:var(--border-faint)] bg-white px-2.5 py-1 text-[11px] text-[color:var(--text-muted)]">
              {t(msg`${post.commentCount} 评论 · ${post.likeCount} 赞`)}
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

function createTopicFromPost(t: Translator, post: FeedPostListItem) {
  // 走查 2026-05-18 R2：原 slice 24 字直接吃 post.text —— 若帖正文以 <tool_
  // 开头会截到"<tool_call>{\"name\":\"" 这类乱码当成 topic 草稿灌进 TextField，
  // 用户回头编辑直播主题看到一行 AI 思考残留毫无意义。先 strip 再 slice。
  const cleaned = stripToolCallSyntax(post.text).trim();
  return cleaned.slice(0, 24) || t(msg`${post.authorName} 的视频号内容`);
}

function createCoverHookFromPost(t: Translator, post: FeedPostListItem) {
  return t(msg`从「${post.authorName}」这条视频号内容展开今晚的直播节奏`);
}

function resolveModeLabel(t: Translator, mode: LiveDraft["mode"]) {
  if (mode === "product") {
    return t(msg`产品讲解`);
  }

  if (mode === "story") {
    return t(msg`剧情陪看`);
  }

  return t(msg`单人控台`);
}

function resolveQualityLabel(t: Translator, quality: LiveDraft["quality"]) {
  if (quality === "standard") {
    return t(msg`标准`);
  }

  if (quality === "ultra") {
    return t(msg`超清`);
  }

  return t(msg`高清`);
}
