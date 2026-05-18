import { useEffect, useMemo, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import {
  type InfiniteData,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { FeedListResponse } from "@yinjie/contracts";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, ImagePlus, Video } from "lucide-react";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { AppPage, Button, InlineNotice, TextAreaField, cn } from "@yinjie/ui";
import { MomentComposeMediaPreview } from "../components/moment-compose-media-preview";
import { RouteRedirectState } from "../components/route-redirect-state";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { storeFeedPublishFlash } from "../features/feed/feed-publish-flash";
import { parseMobileFeedPublishRouteState } from "../features/feed/mobile-feed-publish-route-state";
import {
  publishFeedComposeDraft,
  useMomentComposeDraft,
  type MomentImageDraft,
  type MomentVideoDraft,
} from "../features/moments/moment-compose-media";
import { isDesktopOnlyPath, navigateBackOrFallback } from "../lib/history-back";
import { registerAndroidBackInterceptor } from "../runtime/android-back-button";
import { pickImageFiles } from "../runtime/native-image-picker";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

const t = translateRuntimeMessage;

export function MobileFeedPublishPage() {
  const isDesktopLayout = useDesktopLayout();
  const navigate = useNavigate();
  const hash = useRouterState({
    select: (state) => state.location.hash,
  });
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const composeDraft = useMomentComposeDraft();
  const routeState = useMemo(
    () => parseMobileFeedPublishRouteState(hash),
    [hash],
  );
  const safeReturnPath =
    routeState.returnPath && !isDesktopOnlyPath(routeState.returnPath)
      ? routeState.returnPath
      : undefined;
  const safeReturnHash = safeReturnPath ? routeState.returnHash : undefined;
  const statusBackLabel = safeReturnPath ? t(msg`返回上一页`) : t(msg`返回广场`);
  const resetComposeDraft = composeDraft.reset;
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);

  // 走查新 Round 1：handleBack 在 createMutation.isPending=true 时直接 performBack，
  // 整个 publish 页就 unmount 了。react-query 的 useMutation 不会跟着 unmount
  // 取消请求 — 5s 慢网下用户 back 出来去了 /tabs/discover / 别的 tab 阅读，
  // 5s 后 onSuccess 仍然跑 `navigate({to: safeReturnPath ?? "/discover/feed",
  // replace:true})`，把用户从他们正在看的内容硬拽回广场。draftStillMatchesPublish
  // snapshot 只防"用户重开 publish 页改了草稿"那一支，没防"用户已经离开 publish
  // 页"那一支（composeDraft.text 仍 === input.text，因为没人 reset 过）。
  // ref 跟踪 mount 状态，unmount 后只静默写 flash + cache，不再去抢路由。
  // 注意：React.StrictMode dev 下 effect 会跑两次（mount → cleanup → mount）。
  // 必须每次 mount body 都把 ref=true 拨回去，否则第一次 strict mode cleanup
  // 把它打成 false 后第二次 mount 不再恢复 → 整个 publish 流程下来 onSuccess
  // 永远认为 unmount 不 navigate，用户卡在 publish 页发完帖不会自动回广场。
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  // 走查再 Round 4：同步防双击锁——React 的 disabled 属性靠下一次 commit 才生效，
  // 同帧里 closure 抓的 isPending 也是上一次 render 的常量值；用户连点 5 次「发
  // 表」会同步通过 5 次（mobile-moments-publish-page 实测：5 个 POST 全飞，2 个
  // 被服务端 429 砍掉，剩下 3 个真入库 → 广场出 3 条重复 post）。submittingRef
  // 同步赋值，第一次 click 翻 true 后同帧的所有后续 click 都被早返兜住。跟
  // mobile-moments-publish-page 的同步锁 (commit c0a87bbb 之前更早的 fix) 对齐。
  const submittingRef = useRef(false);

  const createMutation = useMutation({
    // 再走查 R1：mutationFn 之前直接闭包读 composeDraft.* 字段，onSuccess 无脑
    // 调 composeDraft.reset() + navigate(/discover/feed)。慢网下用户路径：
    //   1. 输入 "A"，点发表。mutation 飞 5s 慢请求。
    //   2. 用户在 isPending 期间点返回 — handleBack 看 isPending 直接 performBack，
    //      整个 publish 页 unmount，用户回到 /discover/feed。
    //   3. 用户重开 publish 页（PenSquare）。mount effect (L114) 把 composeDraft
    //      reset 一遍 → text="". 用户输入新内容 "B" 准备重发。
    //   4. 第 5s "A" 的 mutation onSuccess 跑回来：
    //      a. composeDraft.reset() → "B" 草稿被抹掉
    //      b. navigate(/discover/feed) → 把用户从 publish 页上弹走
    //      用户 "B" 凭空消失 + 莫名其妙被踢回广场。
    // 与 discover-feed-page createMutation R1 同模式：把 mutate-time 的 draft
    // 当 variables 传进 onSuccess；只有 draft 仍然是那份 snapshot 才 reset +
    // navigate（说明这次成功对应的是用户当前正在 publish 的内容），动了就
    // 静默写 flash + 写 cache，不碰用户新草稿、不抢路由。
    mutationFn: (input: {
      text: string;
      imageDrafts: MomentImageDraft[];
      videoDraft: MomentVideoDraft | null;
    }) =>
      publishFeedComposeDraft({
        text: input.text,
        imageDrafts: input.imageDrafts,
        videoDraft: input.videoDraft,
        baseUrl,
      }),
    // 走查 Round 2：跟 discover-feed-page createMutation R10 (b9d6a116 之前的
    // R10 链路) 对齐，钉 mutationBaseUrl 防 mid-flight 切账户。慢网下用户路径：
    //   1. A 账户点发表 → mutation 飞 5s
    //   2. 第 2s A logout / 切到 B 账户 → world-owner-store.baseUrl 翻成 B
    //   3. 第 5s 服务端（仍由 A 的 baseUrl 命中）回 newPost；react-query 从
    //      "最新一次 render 的 options" 拿 onSuccess，闭包里 baseUrl 已经是 B。
    //      旧实现：
    //        a. storeFeedPublishFlash() 全局 sessionStorage 写一条"广场动态已
    //           发布"。下一次 B 进 /discover/feed 时 consumeFeedPublishFlash
    //           弹给 B —— B 看着像自己发了，但 B 啥也没发。
    //        b. setQueryData(["app-feed-paged", B], ...) 把 A 的 newPost
    //           prepend 到 B 的 cache 头部，B 进广场首屏闪一条不属于自己的
    //           post 再被 invalidate refetch 矫正掉，肉眼可见的脏闪。
    //        c. setQueryData(["app-feed", B], ...) 同上。
    //        d. invalidateQueries(["app-feed", B]) / ["app-feed-paged", B]
    //           逼 B 当前活跃的广场 query 立刻重拉。
    //   onMutate 把当前 baseUrl 钉进 context，cache 写按 mutationBaseUrl（A）走
    //   保证用户回 A 时第一帧能看到刚发的 post；flash / navigate / composeDraft
    //   .reset() 这些"对当前用户的 UI 反馈"只在 mutationBaseUrl===当前 baseUrl
    //   时才做，切走了静默。
    onMutate: () => ({ mutationBaseUrl: baseUrl }),
    onSuccess: (newPost, input, context) => {
      const mutationBaseUrl = context?.mutationBaseUrl ?? baseUrl;
      // 把新 post prepend 到 paged 头部 + 平铺 flat cache，跳到 /discover/feed 时立刻可见，
      // 不必等后台 refetch；同时砍回 page 1，避免发布后分页边界重复。
      const newListItem = { ...newPost, commentsPreview: [] };
      queryClient.setQueryData<InfiniteData<FeedListResponse>>(
        ["app-feed-paged", mutationBaseUrl],
        (current) =>
          current && current.pages.length > 0
            ? {
                pages: [
                  {
                    ...current.pages[0]!,
                    posts: [newListItem, ...current.pages[0]!.posts],
                    total: current.pages[0]!.total + 1,
                  },
                ],
                pageParams: current.pageParams.slice(0, 1),
              }
            : current,
      );
      queryClient.setQueryData<FeedListResponse>(
        ["app-feed", mutationBaseUrl],
        (current) =>
          current
            ? {
                posts: [newListItem, ...current.posts],
                total: current.total + 1,
              }
            : current,
      );
      // fire-and-forget：原来 await refetch 让"发表中"按钮多卡 600ms+。
      void queryClient.invalidateQueries({
        queryKey: ["app-feed", mutationBaseUrl],
      });
      void queryClient.invalidateQueries({
        queryKey: ["app-feed-paged", mutationBaseUrl],
      });
      // discover-feed-page createMutation R4 已经把 ["app-feed-post"] 这条
      // 没意义的 invalidate 删了——"新发了一条 post"对任何 *已存在* post 的
      // detail cache 都没影响，只会逼桌面 workspace / channels-page 当前选中
      // 的 detail useQuery 做一次毫无意义的 refetch（200-500ms 一发）。
      // 本路径同模式，跟着拿掉。

      // mid-flight 切账户后剩下的 UI / state 反馈都跟当前账户体验有关，全部静默：
      //   - flash 不写到全局 sessionStorage 让 B 进广场看到 A 的成功提示；
      //   - composeDraft.reset() 不动 B 的草稿状态；
      //   - navigate 不把 B 从他们正在看的页面踹回广场。
      const accountStillMatches = mutationBaseUrl === baseUrl;
      if (!accountStillMatches) {
        return;
      }
      storeFeedPublishFlash(t(msg`广场动态已发布，世界居民公开可见。`));
      const draftStillMatchesPublish =
        composeDraft.text === input.text &&
        composeDraft.imageDrafts === input.imageDrafts &&
        composeDraft.videoDraft === input.videoDraft;
      if (!draftStillMatchesPublish) {
        return;
      }
      composeDraft.reset();
      // 组件已经 unmount（用户 back 出去看别的）就不要再 navigate 把他们拽回广场。
      // flash 已经写了，下次他们自然进 /discover/feed 时就能看到成功提示；
      // cache 也已经 prepend，那一刻无缝看到新 post。
      if (!isMountedRef.current) {
        return;
      }
      void navigate({
        to: safeReturnPath ?? "/discover/feed",
        ...(safeReturnHash ? { hash: safeReturnHash } : {}),
        replace: true,
      });
    },
  });

  useEffect(() => {
    resetComposeDraft();
    // 走查 Round 4：切账户后旧账户的 createMutation.isError 状态会被旧 render 闭
    // 包带到新账户，publish 页一打开就顶着一条「发布失败 · {error.message}」红
    // 色 InlineNotice，但新账户什么都没做。跟 discover-feed-page R11 同模式：
    // mutation.reset() 只清 UI 状态、不取消 in-flight 请求，即使 mid-flight 切
    // 账户也安全——前面 Round 2 的 onSuccess 已经按 mutationBaseUrl gate 住，
    // 切走后的 success/error 反馈也不会落到新账户身上。
    createMutation.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl, resetComposeDraft]);

  useEffect(() => {
    if (!isDesktopLayout) {
      return;
    }

    void navigate({
      to: "/tabs/feed",
      replace: true,
    });
  }, [isDesktopLayout, navigate]);

  // ESC 关闭「放弃发表」确认弹窗（和 farm 的 sheet/modal 处理对齐）。
  // 走查 R5：原版只看 `event.key === "Escape"`，但用户在文案 textarea 里
  // 中文输入时按 ESC 想关 IME 候选窗（系统行为），keydown 一样冒到 window
  // 上命中这条 handler 把 modal 关掉 → handleBack 再次触发就直接 performBack
  // 把草稿丢了。WeChatCommentBar / desktop-feed-compose-panel R1 都已经按
  // event.isComposing / keyCode===229 双判定兜过 IME，这里也补上保持一致。
  useEffect(() => {
    if (!discardConfirmOpen) {
      return;
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (event.isComposing || event.keyCode === 229) return;
      setDiscardConfirmOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [discardConfirmOpen]);

  // 原生壳 Back 键在 confirm modal 打开时只关 modal，不让 history.back
  // 把用户从 publish 直接弹回（甚至 minimize 到桌面）。
  useEffect(() => {
    if (!discardConfirmOpen) {
      return;
    }
    return registerAndroidBackInterceptor((event) => {
      event.preventDefault();
      setDiscardConfirmOpen(false);
      return true;
    });
  }, [discardConfirmOpen]);

  // 新一轮走查 Round 5：左上角返回按钮（handleBack）在 hasContent 时会弹
  // 「放弃发表」确认条；Android 硬件 Back 键 / 系统手势 back 只在 discard
  // 确认 modal 已打开时被拦截（上面那条 effect）。modal 没打开时 Android
  // back 走 history.back —— hasContent=true 时用户已经敲了一长段文案 / 加
  // 了 9 张图，Android back 不经确认直接弹回广场，复选 input 都没出来，
  // 草稿（虽然在 hook state 里活着）实际上看不见因为页 unmount → useMomentComposeDraft
  // 的 cleanup 会 release imageDrafts / videoDraft（object URL）；正文 text
  // 是字符串没单独释放但 hook unmount 后 state 一并丢，下次再开页是新的
  // 空 draft，等同于"用户被原生 back 偷走了内容"。
  // 跟 ESC handler / topbar 返回按钮对齐：hasContent 且不在 publish 飞行中
  // 时，Android back 转去打开 discard confirmation，让用户主动选「放弃」
  // 才走 performBack；mutation pending 时不拦让用户随时跑路（onSuccess 有
  // isMountedRef 守卫不会硬把人拽回来）。
  useEffect(() => {
    if (discardConfirmOpen) return;
    if (!composeDraft.hasContent) return;
    if (createMutation.isPending) return;
    return registerAndroidBackInterceptor((event) => {
      event.preventDefault();
      setDiscardConfirmOpen(true);
      return true;
    });
  }, [
    discardConfirmOpen,
    composeDraft.hasContent,
    createMutation.isPending,
  ]);

  function performBack() {
    navigateBackOrFallback(
      () => {
        if (safeReturnPath) {
          void navigate({
            to: safeReturnPath,
            ...(safeReturnHash ? { hash: safeReturnHash } : {}),
          });
          return;
        }

        void navigate({ to: "/discover/feed" });
      },
      safeReturnPath ?? "/discover/feed",
    );
  }

  function handleBack() {
    if (composeDraft.hasContent && !createMutation.isPending) {
      setDiscardConfirmOpen(true);
      return;
    }
    performBack();
  }

  function handleConfirmDiscard() {
    setDiscardConfirmOpen(false);
    composeDraft.reset();
    performBack();
  }

  async function handlePickImages() {
    try {
      const files = await pickImageFiles({ multiple: true });
      if (files.length === 0) {
        return;
      }
      await composeDraft.addImageFiles(files);
    } catch (error) {
      composeDraft.setMediaError(
        error instanceof Error ? error.message : t(msg`图片选择失败，请稍后重试。`),
      );
    }
  }

  async function handleVideoFileSelected(file: File | null) {
    try {
      await composeDraft.replaceVideoFile(file);
    } catch (error) {
      composeDraft.setMediaError(
        error instanceof Error ? error.message : t(msg`视频选择失败，请稍后重试。`),
      );
    }
  }

  if (isDesktopLayout) {
    return (
      <RouteRedirectState
        title={t(msg`正在回到桌面广场`)}
        description={t(msg`发广场动态在桌面布局里已经并入广场工作区，这里会自动带你返回桌面入口。`)}
        loadingLabel={t(msg`正在打开广场...`)}
      />
    );
  }

  return (
    <AppPage className="space-y-0 bg-[#f2f2f2] px-0 py-0">
      <TabPageTopBar
        title={t(msg`发表广场动态`)}
        titleAlign="center"
        className="mx-0 mb-0 mt-0 border-b border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.96)] px-4 pb-1.5 pt-1.5 text-[color:var(--text-primary)] shadow-none"
        leftActions={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full border-0 bg-transparent text-[color:var(--text-primary)] active:bg-black/[0.05]"
            onClick={handleBack}
            aria-label={t(msg`返回广场`)}
          >
            <ArrowLeft size={17} />
          </Button>
        }
        rightActions={
          <button
            type="button"
            onClick={() => {
              if (submittingRef.current) return;
              if (!composeDraft.hasContent || createMutation.isPending) return;
              submittingRef.current = true;
              createMutation.mutate(
                {
                  // 把 mutate-time 的 draft snapshot 当 variables 传进去 ——
                  // 见上方 createMutation 注释。
                  text: composeDraft.text,
                  imageDrafts: composeDraft.imageDrafts,
                  videoDraft: composeDraft.videoDraft,
                },
                {
                  onSettled: () => {
                    submittingRef.current = false;
                  },
                },
              );
            }}
            disabled={!composeDraft.hasContent || createMutation.isPending}
            className={cn(
              "h-9 rounded-full px-3 text-[15px] font-medium transition",
              composeDraft.hasContent && !createMutation.isPending
                ? "bg-[#07c160] text-white active:opacity-90"
                : "text-[color:var(--text-dim)]",
            )}
          >
            {createMutation.isPending ? t(msg`发表中`) : t(msg`发表`)}
          </button>
        }
      />

      <div className="space-y-3 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] pt-3">
        {composeDraft.mediaError ||
        (createMutation.isError && createMutation.error instanceof Error) ? (
          <InlineNotice
            tone="info"
            className="rounded-[16px] border border-[color:var(--border-faint)] bg-white px-3 py-2 text-[12px] shadow-none"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 flex-1">
                {composeDraft.mediaError ??
                  (createMutation.error instanceof Error
                    ? createMutation.error.message
                    : "")}
              </span>
              <button
                type="button"
                onClick={handleBack}
                className="shrink-0 rounded-full border border-[rgba(15,23,42,0.08)] bg-white px-2 py-0.5 text-[10px] font-medium text-[color:var(--text-secondary)]"
              >
                {statusBackLabel}
              </button>
            </div>
          </InlineNotice>
        ) : null}

        <section className="overflow-hidden rounded-[24px] border border-[rgba(0,0,0,0.05)] bg-white shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
          <div className="border-b border-[rgba(15,23,42,0.06)] px-4 py-3">
            <div className="text-[14px] font-medium text-[color:var(--text-primary)]">
              {t(msg`这一刻`)}
            </div>
            <div className="mt-1 text-[11px] leading-5 text-[color:var(--text-muted)]">
              {t(msg`发到广场后，世界里的居民都可能看到、点赞，甚至继续接话。`)}
            </div>
          </div>

          <div className="px-4 pb-4 pt-3">
            <TextAreaField
              value={composeDraft.text}
              onChange={(event) => composeDraft.setText(event.target.value)}
              placeholder={t(msg`写点想让世界居民都能看到的内容...`)}
              // R2 走查：跟后端 MAX_FEED_TEXT_LENGTH=2000 对齐的软上限，超出由
              // 后端 FEED_TEXT_TOO_LONG 兜底；UI 卡完用户不会再误传几 MB 长文
              // 把 SocialPostCard 撑爆。
              maxLength={2000}
              // 走查 Round 3：跟 mobile-moments-publish-page R2 (c1578083) 同坑—
              // mutationFn 闭包读"按下发表"那一刻的 composeDraft.text 快照，
              // pending 期间用户继续往输入框敲下的内容并不会跟着发出去；
              // onSuccess 若发现 draftStillMatchesPublish === false（Round 1 已加
              // 的 snapshot 校验）会跳过 reset+navigate 留下用户新内容当草稿—
              // 但用户视感是"我发了一条完整的话，怎么只发了前半段"。
              // X 移除图/视频按钮和发表按钮都已经按 isPending 禁用，textarea 是
              // 唯一漏网；readOnly 比 disabled 更合适，disabled 会把已敲内容置
              // 灰看起来像出错，readOnly 视觉一致、又能让 IME 把候选窗压下去。
              readOnly={createMutation.isPending}
              className="min-h-[11rem] resize-none rounded-[18px] border-0 bg-[color:var(--surface-console)] px-4 py-3.5 text-[16px] leading-7 shadow-none"
              autoFocus
            />

            {composeDraft.imageDrafts.length > 0 || composeDraft.videoDraft ? (
              <div className="mt-3">
                <MomentComposeMediaPreview
                  imageDrafts={composeDraft.imageDrafts}
                  videoDraft={composeDraft.videoDraft}
                  onRemoveImage={(id) => composeDraft.removeImageDraft(id)}
                  onRemoveVideo={() => composeDraft.clearVideoDraft()}
                  variant="mobile"
                />
              </div>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={
                  !composeDraft.canAddImages || createMutation.isPending
                }
                className="h-9 rounded-full border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] px-3 text-[11px]"
                onClick={() => {
                  void handlePickImages();
                }}
              >
                <ImagePlus size={14} className="mr-1" />
                {t(msg`添加图片`)}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!composeDraft.canAddVideo || createMutation.isPending}
                className="h-9 rounded-full border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] px-3 text-[11px]"
                onClick={() => videoInputRef.current?.click()}
              >
                <Video size={14} className="mr-1" />
                {composeDraft.videoDraft ? t(msg`更换视频`) : t(msg`添加视频`)}
              </Button>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[24px] border border-[rgba(0,0,0,0.05)] bg-white shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="text-[13px] font-medium text-[color:var(--text-primary)]">
                {t(msg`谁可以看`)}
              </div>
              <div className="mt-1 text-[11px] text-[color:var(--text-muted)]">
                {t(msg`当前发布到广场`)}
              </div>
            </div>
            <span className="rounded-full bg-[rgba(7,193,96,0.12)] px-3 py-1 text-[11px] font-medium text-[#07c160]">
              {t(msg`公开可见`)}
            </span>
          </div>
          <div className="border-t border-[rgba(15,23,42,0.06)] px-4 py-3 text-[11px] leading-5 text-[color:var(--text-muted)]">
            {t(msg`图片最多 9 张，视频当前支持 1 条且不超过 5 分钟，暂不支持图片和视频混发。`)}
          </div>
        </section>
      </div>

      {discardConfirmOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(17,24,39,0.32)] p-6 backdrop-blur-[3px]">
          <button
            type="button"
            aria-label={t(msg`关闭提示`)}
            onClick={() => setDiscardConfirmOpen(false)}
            className="absolute inset-0"
          />
          <div className="relative w-[min(320px,calc(100vw-2rem))] overflow-hidden rounded-[18px] bg-white shadow-[var(--shadow-overlay)]">
            <div className="px-6 pb-3 pt-6 text-center">
              <div className="text-[16px] font-medium text-[color:var(--text-primary)]">
                {t(msg`放弃发表`)}
              </div>
              <div className="mt-2 text-[13px] leading-6 text-[color:var(--text-muted)]">
                {t(msg`返回会丢失已编辑的文字与媒体，确定不发布吗？`)}
              </div>
            </div>
            <div className="grid grid-cols-2 border-t border-[color:var(--border-faint)]">
              <button
                type="button"
                onClick={() => setDiscardConfirmOpen(false)}
                className="border-r border-[color:var(--border-faint)] py-3 text-[15px] text-[color:var(--text-secondary)] active:bg-black/[0.04]"
              >
                {t(msg`继续编辑`)}
              </button>
              <button
                type="button"
                onClick={handleConfirmDiscard}
                className="py-3 text-[15px] font-medium text-[#fa5151] active:bg-black/[0.04]"
              >
                {t(msg`放弃`)}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(event) => {
          void handleVideoFileSelected(event.currentTarget.files?.[0] ?? null);
          event.currentTarget.value = "";
        }}
      />
    </AppPage>
  );
}
