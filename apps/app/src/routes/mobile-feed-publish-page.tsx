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
import { buildFeedRouteHash } from "../features/feed/feed-route-state";
import { parseMobileFeedPublishRouteState } from "../features/feed/mobile-feed-publish-route-state";
import {
  publishFeedComposeDraft,
  useMomentComposeDraft,
  type MomentImageDraft,
  type MomentVideoDraft,
} from "../features/moments/moment-compose-media";
import { isDesktopOnlyPath, navigateBackOrFallback } from "../lib/history-back";
import { describeRequestError } from "../lib/request-error";
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
  // 走查移动端发现-发布广场动态 Round 1：handlePickImages / handleVideoFileSelected
  // 原本写的 `startBaseUrl !== baseUrl` gate 全是 closure 自比自的 dead code——
  // 两个 baseUrl 都是同一份 render 抓的常量，永远相等。意图是「mid-flight 切账户
  // 时把旧账户选的图/视频拦下不要塞进新账户的 draft」，实际拦不住：
  //   1. A 账户点「添加视频」→ picker / 视频元数据 + 封面生成 1-30s
  //   2. 用户中途切到 B 账户 → 下面 reset effect 跑：resetComposeDraft 清空、
  //      pickInflightRef / isMediaPreparing 都释放掉
  //   3. ~30s 后 await composeDraft.replaceVideoFile 落地 → 内部 setVideoDraft 把
  //      A 选的视频塞进 B 的 draft，B 进发表页突然看到一段自己没传过的视频
  // 用 baseUrlRef 拿最新值（不会被旧 closure 锁住），handler 在 await 后用
  // `startBaseUrl === baseUrlRef.current` 判断；hook 那边新加的 shouldCommit
  // option 在 hook 内部 setState 之前再判一次，把 await 内部那段窗口也兜住。
  const baseUrlRef = useRef(baseUrl);
  useEffect(() => {
    baseUrlRef.current = baseUrl;
  }, [baseUrl]);
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
  // 走查新 Round 1：跟 mobile-moments-publish-page R4 对齐——handlePickImages /
  // handleVideoFileSelected 必须同步上锁。原生 picker 关闭到 setImageDrafts /
  // setVideoDraft commit 之间窗口（图片 50-200ms、视频解码 + 封面生成 1-30s）
  // 用户重复点 +：
  //   - 两条 addImageFiles 各自读到的 imageDraftsRef.current 都是老值（useEffect
  //     写 ref 要等 commit），两批 remainingSlots 都按 9 - oldLength 算 →
  //     setImageDrafts 函数式更新合并后总数超 9，UI 显示越界，publish 时服务端
  //     FEED_IMAGES_TOO_MANY 拒掉，体感"选了图发不出去"
  //   - 两条 replaceVideoFile 并发跑：先完成的 setVideoDraft(A)，后完成的
  //     setVideoDraft(B) → A 的封面 URL 和 video URL 永久 orphan（hook unmount
  //     时 cleanup 只 release 当前 state 里的那份）
  // 跟 submittingRef 同模式同步赋值，第一次 click 翻 true 后同帧/同窗口的后续
  // click 全部早返。
  const pickInflightRef = useRef(false);
  // 走查新 Round 2：媒体处理中（addImageFiles / replaceVideoFile）publish 按钮、
  // + 加号按钮都得视觉禁掉。pickInflightRef 是同步 gate，只挡 pickImages 自身
  // 重入；publish 按钮 / 媒体按钮的 disabled 走 React props，必须有能触发 re-
  // render 的 state。慢路径下用户最容易踩：
  //   1. 用户已敲文字 "今天去爬山" → 文本 hasContent=true
  //   2. 用户点「添加视频」→ picker 关闭 → replaceVideoFile 开始解码 + 封面生成
  //   3. 解码 15-30s 期间用户看着 publish 按钮亮着，又看了眼觉得"该好了吧"
  //      → 点发表
  //   4. composeDraft.videoDraft 此时还是 null（setVideoDraft 还没 commit）→
  //      publish 飞出去**没有视频**，用户在广场上看到自己发了一条纯文本帖子
  //      但他记忆中明明加了视频，体感是"视频丢了"
  // 同理图片：用户连选 9 张大图，addImageFiles 解码 ~500ms 期间发表，飞出去
  // 不带图片。
  // isMediaPreparing state 在 handler 入口翻 true、finally 翻 false，把 publish
  // 按钮 / 媒体按钮一起按禁用对齐 isPending 的视觉。
  const [isMediaPreparing, setIsMediaPreparing] = useState(false);

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
    onMutate: () => {
      // 走查新 Round 3：跟 mobile-moments-publish-page R7 对齐——开始 mutation 之
      // 前必须清掉 mediaError。InlineNotice 渲染走的是 `mediaError ?? mutation.
      // error`，mediaError 优先。用户路径：
      //   1. 点「添加视频」→ video metadata 超时 / HEVC 解码不支持 → mediaError
      //      = "视频解析超时，请换一个文件再试。"
      //   2. 用户改主意，只发纯文字，敲完字点「发表」
      //   3. publish 因网络抖 / 服务端 5xx 失败 → mutation.isError=true，但 mediaError
      //      还挂着
      //   4. 红条里挂着旧的"视频解析超时"文案，但用户根本没在传视频，体感是
      //      "提示错的 / 点了发表没反应"
      // mediaError 是 picker 链路的错，进入 publish 链路就应作废。
      composeDraft.setMediaError(null);
      return { mutationBaseUrl: baseUrl };
    },
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
    // 新一轮走查 Round 2：submittingRef 是同步防双击锁，A 账户点完「发表」时翻
    // true，靠 createMutation.mutate 的 per-call onSettled 在请求落地时翻回 false。
    // mid-flight 切到 B 账户时 createMutation.reset() 只清 UI 状态、不取消 in-flight
    // 请求 → A 的 onSettled 仍会在 ~5s 后翻回 false，但中间这段窗口 B 重新输入
    // 完想发表时被这条 ref 同步锁早返，按钮看着可点（hasContent=true / isPending
    // =false），但 onClick 第一行 `if (submittingRef.current) return;` 直接咽掉，
    // 用户视感是"按了发表完全没反应"。切账户当作"上一次提交已经跟当前用户无关"，
    // 同步把锁拨回 false，让 B 第一次点能立刻飞。
    submittingRef.current = false;
    // 走查新一轮 R4：A 账户 in-flight pick handler 还在跑时切到 B，pickInflightRef
    // 和 isMediaPreparing 是同一份共享 state，不释放的话：
    //   - B 无法新开 pick 流程（pickInflightRef=true 直接早返）
    //   - B 的发表按钮一直被 isMediaPreparing=true 禁用
    // A 的 handler 在 finally 里改成 `startBaseUrl === baseUrl` 才操作 refs，
    // 切走了就什么都不做，避免反过来把 B 自己设的锁 trample 掉。
    pickInflightRef.current = false;
    setIsMediaPreparing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl, resetComposeDraft]);

  // 走查新一轮 R5：跟 mobile-moments-publish-page R3 对齐——desktop layout redirect
  // 要 preserve safeReturnPath / safeReturnHash。用户在 mobile publish 中途 resize
  // 到桌面 → desktop feed workspace 应该能拿到用户原本从哪进来的，否则用户进了
  // 桌面 feed 后想退回原页面只能靠浏览器 back（链路里没了"返回上一页"按钮）。
  useEffect(() => {
    if (!isDesktopLayout) {
      return;
    }

    void navigate({
      to: "/tabs/feed",
      hash:
        buildFeedRouteHash({
          returnPath: safeReturnPath,
          returnHash: safeReturnHash,
        }) ?? undefined,
      replace: true,
    });
  }, [isDesktopLayout, navigate, safeReturnPath, safeReturnHash]);

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

  // 走查新一轮 R4：handlePickImages / handleVideoFileSelected 的 await 期间最长
  // 可能挂 1-30s（原生 picker + 图片解码 / 视频元数据 + 封面生成）。慢路径下用
  // 户在 A 账户解码视频中切到 B 账户：
  //   1. baseUrl 变 → 上面那条 reset effect 跑 resetComposeDraft 等，新加的两行
  //      也把 pickInflightRef / isMediaPreparing 释放掉
  //   2. 15-30s 后 await composeDraft.replaceVideoFile 落地，handler 检查
  //      startBaseUrl !== baseUrl → 早返；不调 hook 的 setVideoDraft，旧账户的
  //      视频不会塞进新账户的 draft
  //   3. A 的 finally 用 `startBaseUrl === baseUrl` 守 — 切走了就什么都不做，
  //      避免把 B 自己新设的 pickInflightRef=true / isMediaPreparing=true 又
  //      trample 回 false（B 可能正在自己加图，依赖这俩锁挡同帧重入）
  // composeDraft.addImageFiles / replaceVideoFile 内部 setState 落地无法外部
  // 拦截，所以 gate 必须在 await 之前——await pickImageFiles 完成后立刻判一次，
  // 切走了就连 addImageFiles 这一步都不调。
  async function handlePickImages() {
    if (pickInflightRef.current) return;
    pickInflightRef.current = true;
    setIsMediaPreparing(true);
    // 走查再一轮 R2：上一次 picker 失败留下的 mediaError，用户点"添加图片"
    // 重选 → 打开 picker → 用户**取消**（没勾任何图）→ pickImageFiles 返回
    // []，addImageFiles 没机会跑（addImageFiles 内部才清 mediaError），mediaError
    // 红条挂着原来"图片选择失败"的文案，用户没失败也没选成功，看着像悬而未决。
    // 在 picker 触发前主动清——用户点 + 号 = 明确表示"我要重来"。
    composeDraft.setMediaError(null);
    const startBaseUrl = baseUrlRef.current;
    try {
      // 跟 mobile-moments-publish-page R4 对齐：把剩余可用槽位传给原生 picker，
      // PHPicker / PickVisualMedia 拿到 limit 后会在系统选图 UI 上限制最多可勾
      // 数量，避免用户已选 5 张时原生界面仍允许勾 9 张 → 回到 addImageFiles 被
      // "还可以继续添加 4 张" 拒掉、勾的图白选。
      const remainingSlots = Math.max(
        0,
        9 - composeDraft.imageDrafts.length,
      );
      const files = await pickImageFiles({
        multiple: true,
        limit: remainingSlots > 0 ? remainingSlots : undefined,
      });
      if (files.length === 0) {
        return;
      }
      // picker close 到这里是 mid-flight 切账户最大的窗口（原生 picker 显示期间
      // 用户切账户也算）；切走了就不要把旧账户选的图塞进新账户的 draft。
      // baseUrlRef 始终是最新值，不会被 closure 冻在 handler 创建时那一帧。
      if (startBaseUrl !== baseUrlRef.current) {
        return;
      }
      // hook 内部 createMomentImageDrafts decode 期间（每张 ~50ms）仍然可能切账户；
      // shouldCommit 在 hook 真正 setImageDrafts 之前再判一次，切走了就 release
      // 刚 decode 出来的 preview URL、不让图片塞进新账户 draft。
      // 走查 Round 5：同时也要兜 unmount——用户在 decode 期间点 back 弹放弃发表
      // 并 confirm，整页 unmount，hook 的 cleanup 只 release imageDraftsRef.current
      // 里已经 commit 的那批；nextDrafts 还没 commit → 走 setImageDrafts 进 React
      // 队列被 silently ignored（unmounted），preview URL 永久 orphan，反复进 publish
      // 选大批图再退出会慢慢吃内存。把 isMountedRef 一起 gate 进去，shouldCommit=false
      // → hook 自己 release nextDrafts。
      await composeDraft.addImageFiles(files, {
        shouldCommit: () =>
          startBaseUrl === baseUrlRef.current && isMountedRef.current,
      });
    } catch (error) {
      // 切账户后旧账户的错误条不该弹到新账户的 toolbar——B 没碰 picker，看到
      // 「图片选择失败」红条会以为是 B 自己点的。
      if (startBaseUrl !== baseUrlRef.current) {
        return;
      }
      composeDraft.setMediaError(
        describeRequestError(error, t(msg`图片选择失败，请稍后重试。`)),
      );
    } finally {
      // 只在 baseUrl 没切走时才清自己设的锁；切走的话 reset effect 已经释放过
      // pickInflightRef / isMediaPreparing，B 此时可能已经开了自己的 pick 链路，
      // 这里再 set false 会把 B 自己的锁 trample 掉。
      if (startBaseUrl === baseUrlRef.current) {
        pickInflightRef.current = false;
        setIsMediaPreparing(false);
      }
    }
  }

  async function handleVideoFileSelected(file: File | null) {
    if (pickInflightRef.current) return;
    pickInflightRef.current = true;
    setIsMediaPreparing(true);
    const startBaseUrl = baseUrlRef.current;
    try {
      // replaceVideoFile 内部 await createMomentVideoDraft（视频元数据 + 封面生成
      // 1-30s）期间用户最可能切账户。shouldCommit 在 hook setVideoDraft 之前再判
      // 一次，切走了就 release 刚生成的 poster/preview URL、不让旧账户的视频塞
      // 进新账户 draft。
      // 走查 Round 5：同时兜 unmount 路径——15-30s 解码窗口里用户点 back 弹放弃
      // 发表 confirm 后整页 unmount，hook 的 useEffect cleanup 只 release
      // videoDraftRef.current 里已 commit 的那一份；nextDraft 还在 await 里没 commit
      // → 后续 setVideoDraft 被 React silently ignored（unmounted），但 nextDraft
      // 的 previewUrl + posterPreviewUrl（封面 jpeg，多 MB）永久 orphan，反复进
      // publish 选大视频再 back 会让 blob: 池一路涨。把 isMountedRef 一起 gate 进
      // shouldCommit，hook 内部直接 release nextDraft 兜底。
      await composeDraft.replaceVideoFile(file, {
        shouldCommit: () =>
          startBaseUrl === baseUrlRef.current && isMountedRef.current,
      });
    } catch (error) {
      if (startBaseUrl !== baseUrlRef.current) {
        return;
      }
      composeDraft.setMediaError(
        describeRequestError(error, t(msg`视频选择失败，请稍后重试。`)),
      );
    } finally {
      if (startBaseUrl === baseUrlRef.current) {
        pickInflightRef.current = false;
        setIsMediaPreparing(false);
      }
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
        className="mx-0 mb-0 mt-0 border-b border-[color:var(--border-faint)] bg-[rgba(250, 245, 237,0.96)] px-4 pb-1.5 pt-1.5 text-[color:var(--text-primary)] shadow-none"
        leftActions={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full border-0 bg-transparent text-[color:var(--text-primary)] active:bg-black/[0.05]"
            onClick={handleBack}
            // 走查再一轮 R1：跟 statusBackLabel 视觉文案对齐——safeReturnPath 存在
            // 时返回去的是用户原本进来的路径（角色详情 / 通讯录等），不是广场。
            // 原版 aria-label 死写"返回广场"，SR 用户听到的语义跟实际行为不符；
            // safeReturnPath 切换时视觉按钮文案已经从"返回广场"变"返回上一页"，
            // aria-label 也按一样的规则切。
            aria-label={statusBackLabel}
          >
            <ArrowLeft size={17} aria-hidden="true" />
          </Button>
        }
        rightActions={
          <button
            type="button"
            onClick={() => {
              if (submittingRef.current) return;
              if (!composeDraft.hasContent || createMutation.isPending) return;
              // 走查新 Round 2：媒体处理中也不让发表——见 isMediaPreparing 注释。
              // 用户点「添加视频」后 15-30s 解码 + 封面生成窗口里 publish 按钮看着
              // 亮的，没这条 gate 用户敲完文字就点发表，飞出去 composeDraft.videoDraft
              // 还是 null（setVideoDraft 没 commit），post 落地不带视频，用户在广场
              // 看到一条没视频的纯文本帖，记忆错位。
              if (pickInflightRef.current) return;
              submittingRef.current = true;
              // 走查本轮 R1（防御）：和 moments-publish R1 (73e80ac8c) 同款 try-catch ——
              // createMutation.mutate() 万一同步抛错（react-query v5 不会，但未来 wrapper
              // / mutationFn 引入同步抛锁），onSettled 不会跑 → submittingRef 永远卡 true，
              // 用户后续在同张 publish 页上点「发表」全被 ref guard 早返"假死"，看着按钮
              // 亮的但 onClick 第一行就 return，只能整页刷新。
              try {
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
              } catch (mutateError) {
                submittingRef.current = false;
                throw mutateError;
              }
            }}
            disabled={
              !composeDraft.hasContent ||
              createMutation.isPending ||
              isMediaPreparing
            }
            className={cn(
              "h-9 rounded-full px-3 text-[15px] font-medium transition",
              composeDraft.hasContent &&
                !createMutation.isPending &&
                !isMediaPreparing
                ? "bg-[#f59e0b] text-[#3b2206] active:opacity-90"
                : "text-[color:var(--text-dim)]",
            )}
          >
            {createMutation.isPending
              ? t(msg`发表中`)
              : isMediaPreparing
                ? t(msg`处理中`)
                : t(msg`发表`)}
          </button>
        }
      />

      <div className="space-y-3 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] pt-3">
        {composeDraft.mediaError ||
        (createMutation.isError && createMutation.error instanceof Error) ? (
          <InlineNotice
            // 走查新一轮 R1：跟 mobile-moments-publish-page R3 对齐——这条 notice 显
            // 示的是错误信息（mediaError / publish failure），原 tone="info" 用蓝色
            // 提示样式，语义错位（错误用 info 看着像中性提示）、视觉无法吸引注意
            // （蓝色不如红色显眼），SR 用户也错过。换 danger tone + role="alert"，
            // 让 assertive 立即朗读，用户按"发表"后 5s 无响应、textarea 又锁了
            // readOnly 时不会完全不知道为啥失败。
            tone="danger"
            role="alert"
            className="rounded-[16px] border border-[color:var(--border-danger)] bg-[color:var(--state-danger-bg)] px-3 py-2 text-[12px] shadow-none"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 flex-1">
                {composeDraft.mediaError ??
                  (createMutation.error instanceof Error
                    ? describeRequestError(createMutation.error)
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
              // 走查新一轮 R2 (a11y)：跟 mobile-moments-publish-page R1 对齐——
              // placeholder 只在 textarea 为空时 SR 才能读到，用户一旦开始打字
              // placeholder 消失 → 屏幕阅读器再 enumerate 这个字段时只播报
              // "edit textarea"。顶栏 title 虽然是 "发表广场动态"，但 SR 不会
              // 把它跟当前 textarea 自动关联起来。挂 aria-label 后即使打字状态
              // 也能听到"广场动态正文"。
              aria-label={t(msg`广场动态正文`)}
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
                  // 走查 Round 3：publish 飞行期间禁掉 X 移除按钮。否则用户在
                  // isPending 5s 慢请求里点 X 拔掉一张图，composeDraft.imageDrafts
                  // 引用变 → onSuccess 的 draftStillMatchesPublish 比对假成 false
                  // → 跳过 reset+navigate，用户卡在 publish 页没有任何反馈（textarea
                  // 已 readOnly + 媒体没了 + 没回到广场），但服务端实际已按原始
                  // imageDrafts 入库了 9 张图，用户记忆与广场现实错位。textarea
                  // 已 readOnly、+ 按钮已 disabled，这条是漏的最后一个入口。
                  removalDisabled={createMutation.isPending}
                />
              </div>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={
                  !composeDraft.canAddImages ||
                  createMutation.isPending ||
                  isMediaPreparing
                }
                className="h-9 rounded-full border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] px-3 text-[11px]"
                onClick={() => {
                  void handlePickImages();
                }}
              >
                <ImagePlus size={14} aria-hidden="true" className="mr-1" />
                {t(msg`添加图片`)}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={
                  !composeDraft.canAddVideo ||
                  createMutation.isPending ||
                  isMediaPreparing
                }
                className="h-9 rounded-full border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] px-3 text-[11px]"
                onClick={() => {
                  // 走查再一轮 R2：跟"添加图片"对齐——上一次视频解码失败 / 超时
                  // 留下 mediaError 红条，用户点"添加视频"重选时若 picker 被取消
                  // （cancel 不触发 onChange，handleVideoFileSelected 不跑，
                  // replaceVideoFile 里的 setMediaError(null) 也不跑），红条挂着
                  // 老的"视频解析超时"提示，悬而未决。点 + 号 = 明确表示重来，
                  // 在打开 picker 前主动清。
                  composeDraft.setMediaError(null);
                  videoInputRef.current?.click();
                }}
              >
                <Video size={14} aria-hidden="true" className="mr-1" />
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
            <span className="rounded-full bg-[rgba(245, 158, 11,0.12)] px-3 py-1 text-[11px] font-medium text-[#f59e0b]">
              {t(msg`公开可见`)}
            </span>
          </div>
          <div className="border-t border-[rgba(15,23,42,0.06)] px-4 py-3 text-[11px] leading-5 text-[color:var(--text-muted)]">
            {t(msg`图片最多 9 张，视频当前支持 1 条且不超过 5 分钟，暂不支持图片和视频混发。`)}
          </div>
        </section>
      </div>

      {discardConfirmOpen ? (
        // 走查新一轮 R3 (a11y)：跟 mobile-moments-publish-page exit-sheet 对齐——
        // 原 wrapper 是裸 div，SR 用户无法识别这是个 modal，焦点也不会被锁定。
        // 挂 role="dialog" + aria-modal="true" + aria-label="放弃发表"，让 SR 一进
        // 来就读出对话框语义；浏览器/AT 收到 aria-modal=true 后会把焦点圈在内
        // 部，Tab 不会逃到底层 publish 页的 textarea/按钮上去。
        // 走查本轮 R2 (a11y)：aria-labelledby + aria-describedby 指向可见的标题
        // 和描述文本，autoFocus 命中「继续编辑」时 SR 用户能依次听到「放弃发表
        // dialog → 返回会丢失已编辑的文字与媒体... → 继续编辑 button」，拿到完
        // 整决策上下文；原本只挂 aria-label="放弃发表" 时 SR 跳到 focused button
        // 就只读到"继续编辑 button"，描述里那句"返回会丢失"完全错过，盲用户根本
        // 不知道按"放弃"会丢什么。
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="discard-confirm-title"
          aria-describedby="discard-confirm-description"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(17,24,39,0.32)] p-6 backdrop-blur-[3px]"
        >
          <button
            type="button"
            aria-label={t(msg`关闭提示`)}
            onClick={() => setDiscardConfirmOpen(false)}
            className="absolute inset-0"
          />
          <div className="relative w-[min(320px,calc(100vw-2rem))] overflow-hidden rounded-[18px] bg-white shadow-[var(--shadow-overlay)]">
            <div className="px-6 pb-3 pt-6 text-center">
              <div
                id="discard-confirm-title"
                className="text-[16px] font-medium text-[color:var(--text-primary)]"
              >
                {t(msg`放弃发表`)}
              </div>
              <div
                id="discard-confirm-description"
                className="mt-2 text-[13px] leading-6 text-[color:var(--text-muted)]"
              >
                {t(msg`返回会丢失已编辑的文字与媒体，确定不发布吗？`)}
              </div>
            </div>
            <div className="grid grid-cols-2 border-t border-[color:var(--border-faint)]">
              {/*
                走查本轮 R1 (a11y)：autoFocus 在「继续编辑」（左侧、安全动作）—— modal
                打开时焦点原本停在 topbar 返回按钮上（已被 modal backdrop 盖住），SR
                用户拿到 role=dialog 通知后 enumerate 还要 Tab N 次才能到达可操作按钮；
                键盘用户按 Enter 也只命中已隐藏的 topbar 按钮无反应。iOS 系统弹窗 /
                macOS 警告框惯例：默认焦点落在安全动作（继续编辑 = 不丢内容）而不是
                破坏性动作（放弃），用户误按 Enter 时不会丢草稿。和 ESC 关闭路径同
                对齐——让"继续编辑"在键盘 & SR 链路下都成为最直接的默认。
              */}
              <button
                type="button"
                onClick={() => setDiscardConfirmOpen(false)}
                autoFocus
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
