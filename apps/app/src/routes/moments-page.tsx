import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { msg } from "@lingui/macro";
import { ArrowLeft, Camera } from "lucide-react";
import {
  addMomentComment,
  deleteMoment,
  getBlockedCharacters,
  getMomentsPage,
  isApiRequestError,
  toggleMomentLike,
  type Moment,
  type MomentComment,
  type MomentLike,
  type MomentsPageResponse,
} from "@yinjie/contracts";
import { translateAppErrorCode } from "../lib/error-translate";
import type { MessageDescriptor } from "@lingui/core";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { AppPage, Button, InlineNotice } from "@yinjie/ui";
import { RouteRedirectState } from "../components/route-redirect-state";
import { MomentShareCardModal } from "../components/moment-share-card-modal";
import { WeChatActionBubble } from "../components/wechat-action-bubble";
import {
  WeChatCommentBar,
  type WeChatCommentBarReplyTarget,
} from "../components/wechat-comment-bar";
import { WeChatMomentCard } from "../components/wechat-moment-card";
import { WeChatMomentsCover } from "../components/wechat-moments-cover";
import { usePullToRefresh } from "../features/moments/use-pull-to-refresh";
import {
  hydrateDesktopFavoritesFromNative,
  readDesktopFavorites,
  removeDesktopFavorite,
  upsertDesktopFavorite,
} from "../features/favorites/favorites-storage";
import { buildCharacterDetailRouteHash } from "../features/contacts/character-detail-route-state";
import { buildDesktopFriendMomentsRouteHash } from "../features/moments/friend-moments-route-state";
import { buildMobileFriendMomentsRouteHash } from "../features/moments/mobile-friend-moments-route-state";
import { buildMobileMomentsPublishRouteHash } from "../features/moments/mobile-moments-publish-route-state";
import {
  buildDesktopMomentsRouteHash,
  parseDesktopMomentsRouteState,
} from "../features/moments/moments-route-state";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { registerAndroidBackInterceptor } from "../runtime/android-back-button";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { consumeMomentPublishFlash } from "../features/moments/moment-publish-flash";
import {
  publishMomentComposeDraft,
  useMomentComposeDraft,
  type MomentImageDraft,
  type MomentVideoDraft,
} from "../features/moments/moment-compose-media";
import { useOptimisticMomentLikeHandlers } from "../features/moments/use-optimistic-like";
import {
  getMomentSummaryText,
  stripToolCallSyntax,
} from "../features/moments/moment-content";
import { formatTimestamp } from "../lib/format";
import { isDesktopOnlyPath, navigateBackOrFallback } from "../lib/history-back";
import { normalizePathname } from "../lib/normalize-pathname";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

// 走查 R1（本轮）：朋友圈页 mutation/query 失败时多处把 raw error.message 直接
// 透到 props（commentErrorMessage / composeErrorMessage / deleteErrorMessage /
// loadErrorMessage / likeErrorMessage / errors[]）—— 这些 message 是 server
// AppError 的 legacyMessage（始终中文），非 zh-CN locale 用户拿到的就是裸中文。
// 统一走 translateAppErrorCode 命中 i18n 字典，miss 才回退 raw。和 profile-moments
// resolveMomentsErrorMessage 同模板。
function resolveMomentsErrorMessage(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  if (isApiRequestError(error)) {
    return translateAppErrorCode(error) ?? error.message;
  }
  return error.message;
}

const DesktopMomentsWorkspace = lazy(async () => {
  const mod =
    await import("../features/desktop/moments/desktop-moments-workspace");
  return { default: mod.DesktopMomentsWorkspace };
});

const DesktopMessageAvatarPopover = lazy(async () => {
  const mod = await import("../features/chat/message-avatar-popover-shell");
  return { default: mod.DesktopMessageAvatarPopover };
});

export function MomentsPage() {
  const t = useRuntimeTranslator();
  const isDesktopLayout = useDesktopLayout();
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const hash = useRouterState({
    select: (state) => state.location.hash,
  });
  const queryClient = useQueryClient();
  const ownerId = useWorldOwnerStore((state) => state.id);
  const ownerAvatar = useWorldOwnerStore((state) => state.avatar);
  const ownerUsername = useWorldOwnerStore((state) => state.username);
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const nativeDesktopFavorites = runtimeConfig.appPlatform === "desktop";
  const normalizedPathname = normalizePathname(pathname);
  const composeDraft = useMomentComposeDraft();
  const resetComposeDraft = composeDraft.reset;
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>(
    {},
  );
  const [desktopReplyTarget, setDesktopReplyTarget] = useState<{
    authorId: string;
    authorName: string;
    commentId: string;
    postId: string;
  } | null>(null);
  // 移动端微信化交互状态
  const [actionBubble, setActionBubble] = useState<{
    momentId: string;
    anchorRect: DOMRect;
  } | null>(null);
  const [commentBarTarget, setCommentBarTarget] = useState<{
    momentId: string;
    replyTo: WeChatCommentBarReplyTarget | null;
  } | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [notice, _setNoticeRaw] = useState("");
  const [noticeTone, setNoticeTone] = useState<"success" | "info" | "danger">(
    "success",
  );
  const [noticeActionLabel, setNoticeActionLabel] = useState<string | null>(
    null,
  );
  const [noticeAction, setNoticeAction] = useState<(() => void) | null>(null);
  // 用递增 nonce 给 notice 倒计时 useEffect 当 reset 锚——「朋友圈互动已更新。」
  // 是通用 success 文案，连续点赞/评论会触发两次相同 setNotice(同字符串)；React
  // 看作 no-op → useEffect 不重跑 → 第二次只继承第一次剩余的倒计时，用户看不到
  // 2.4s 完整窗口。包一层 setNotice 自动 bump nonce，useEffect 跟 [noticeKey,
  // notice] 走就能稳定 clear-and-restart 倒计时。setNotice("") clear 路径也走这里，
  // useEffect 内部 if(!notice) return 短路掉无需启动 timer。
  const noticeKeyRef = useRef(0);
  const [noticeKey, setNoticeKey] = useState(0);
  const setNotice = useCallback((text: string) => {
    noticeKeyRef.current += 1;
    setNoticeKey(noticeKeyRef.current);
    _setNoticeRaw(text);
  }, []);
  const [favoriteSourceIds, setFavoriteSourceIds] = useState<string[]>([]);
  const [desktopAvatarPopover, setDesktopAvatarPopover] = useState<
    | {
        anchorElement: HTMLButtonElement;
        kind: "character";
        characterId: string;
        fallbackAvatar?: string | null;
        fallbackName: string;
        returnHash?: string;
      }
    | {
        anchorElement: HTMLButtonElement;
        kind: "owner";
        returnHash?: string;
      }
    | null
  >(null);
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  const routeState = parseDesktopMomentsRouteState(hash);
  const routeSelectedAuthorId = routeState.authorId ?? null;
  const routeSelectedMomentId = routeState.momentId ?? null;
  const safeReturnPath =
    routeState.returnPath && !isDesktopOnlyPath(routeState.returnPath)
      ? routeState.returnPath
      : undefined;
  const safeReturnHash = safeReturnPath ? routeState.returnHash : undefined;
  const currentRouteHash = useMemo(
    () =>
      buildDesktopMomentsRouteHash({
        authorId: routeSelectedAuthorId ?? undefined,
        momentId: routeSelectedMomentId ?? undefined,
        returnPath: safeReturnPath,
        returnHash: safeReturnHash,
      }),
    [
      routeSelectedAuthorId,
      routeSelectedMomentId,
      safeReturnHash,
      safeReturnPath,
    ],
  );

  useEffect(() => {
    setDesktopAvatarPopover(null);
  }, [hash, pathname]);

  // 朋友圈用无限分页，避免一次性把所有动态都拉过来（之前 1 次 ≈ 139 条 SQL）。
  // 每页 20 条；触底 → fetchNextPage；下拉刷新 → 重置到第 1 页。
  const momentsQuery = useInfiniteQuery({
    queryKey: ["app-moments-paged", baseUrl],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      getMomentsPage({ page: pageParam, limit: 20 }, baseUrl),
    getNextPageParam: (lastPage, allPages) =>
      lastPage.hasMore ? allPages.length + 1 : undefined,
  });
  // 按 id 去重：分页路径下若新发/删除导致页间边界偏移，page N 末尾和 page N+1 开头
  // 可能拿到同一条 moment。UI 层兜底去重，避免列表重复闪烁。
  const momentsData = useMemo<Moment[]>(() => {
    if (!momentsQuery.data) return [];
    const seen = new Set<string>();
    const items: Moment[] = [];
    for (const page of momentsQuery.data.pages) {
      for (const moment of page.items) {
        if (seen.has(moment.id)) continue;
        seen.add(moment.id);
        items.push(moment);
      }
    }
    return items;
  }, [momentsQuery.data]);
  const momentsHasNextPage = momentsQuery.hasNextPage;
  const momentsIsFetchingNextPage = momentsQuery.isFetchingNextPage;
  const momentsIsFetchNextPageError = momentsQuery.isFetchNextPageError;
  const momentsFetchNextPage = momentsQuery.fetchNextPage;
  // 服务端 total（来自首页响应）—— toolbar 之前一律显示 moments.length 当总数,
  // auto-prefetch 中途 100/240 时显示「共 100 条」会误导用户以为只剩 100。
  // 用第一页响应的 total 作为权威总数，hasNextPage=false 时退回纯 length（兜底）。
  const momentsServerTotal = momentsQuery.data?.pages[0]?.total ?? null;
  // 桌面工作区不挂触底 sentinel：mount 后自动连续 prefetch 把所有页悄悄填上。
  // 移动端用 sentinel + IntersectionObserver 按需触发。
  // fetchNextPageError 期间停止自动 prefetch——否则 isFetchingNextPage 翻 false
  // 就会触发 useEffect 重跑，又调一次 fetchNextPage，又失败，死循环烧 RTT。
  useEffect(() => {
    if (!isDesktopLayout) return;
    if (
      momentsHasNextPage &&
      !momentsIsFetchingNextPage &&
      !momentsIsFetchNextPageError
    ) {
      void momentsFetchNextPage();
    }
  }, [
    isDesktopLayout,
    momentsHasNextPage,
    momentsIsFetchingNextPage,
    momentsIsFetchNextPageError,
    momentsFetchNextPage,
  ]);
  const blockedQuery = useQuery({
    queryKey: ["app-moments-blocked-characters", baseUrl],
    queryFn: () => getBlockedCharacters(baseUrl),
    enabled: Boolean(ownerId),
    // 走查电脑端朋友圈 R3：和 mobile-friend-moments-page / friend-moments-page
    // 同款 staleTime。屏蔽列表变更频率低（用户手动操作），15s 让 /tabs/moments
    // 在 /tabs/contacts、/tabs/chat、/desktop/friend-moments/X 等页之间互跳
    // 时不每次都重打这一次 RTT。手动「刷新」按钮的 blockedQuery.refetch() 不受
    // staleTime 限制，仍然能强刷。
    staleTime: 15_000,
  });

  function resetMomentsToFirstPage() {
    // 帖子数量变化（发布/删除）时把已加载多页收回 page 1：
    // 避免 invalidate 同时 refetch 多页造成的分页边界重复或丢失（page 1 末尾 = page 2 开头）。
    queryClient.setQueryData<InfiniteData<MomentsPageResponse>>(
      ["app-moments-paged", baseUrl],
      (current) =>
        current
          ? {
              pages: current.pages.slice(0, 1),
              pageParams: current.pageParams.slice(0, 1),
            }
          : current,
    );
  }

  const createMutation = useMutation({
    // 走查新 Round 1：mutationFn 之前直接闭包读 composeDraft.{text,imageDrafts,videoDraft}，
    // onSuccess 又无脑 composeDraft.reset() + setShowCompose(false)。慢网场景：
    //   1. 输入 "A" 点发布，请求 5s 才回。
    //   2. 等 1s 嫌烦按 ESC，面板关。
    //   3. 重开面板输入 "B"。
    //   4. 第 5s "A" 的 onSuccess 跑回来，无条件 reset → "B" 草稿被抹掉，
    //      面板被强制关闭，用户没保存的新内容凭空消失。跟 1b285789 同类 bug。
    // 改：mutate 时把 draft snapshot 当 variables 传进去，onSuccess 用 reference
    // equality 校验当前 draft 是否还是那份 snapshot；动了就只发提示、不碰用户草稿。
    mutationFn: (input: {
      text: string;
      imageDrafts: MomentImageDraft[];
      videoDraft: MomentVideoDraft | null;
    }) =>
      publishMomentComposeDraft({
        text: input.text,
        imageDrafts: input.imageDrafts,
        videoDraft: input.videoDraft,
        baseUrl,
      }),
    onMutate: () => {
      // 走查电脑端朋友圈 R3（新一轮）：跟 friend-moments-page / profile-moments-page
      // 同款 mid-flight 切账户 guard 漏掉了。react-query v5 的 useMutation callbacks
      // 走的是「调用时点的最近一次 setOptions」——也就是 mutation 完成时跑的
      // onSuccess 是当前 render 的闭包。慢网下用户在 A 账户发完一条，~5s 内还没
      // 回 → 顶栏切 B 账户：onSuccess 跑回来时闭包里的 baseUrl 已经是 B 的了，
      // setQueryData([..., baseUrl=B], ...) 把 A 账户的 newMoment 写进 B 的 paged /
      // flat / mine 三把 cache → B 的 /tabs/moments 顶部突然冒出来一条不属于 B
      // 的帖子；invalidate 也落到 B，触发一次 GET /api/moments?page=1 顺手把那条
      // 错位 prepend 又清掉，但中间几百 ms 是脏数据。setNotice("朋友圈已发布。")
      // 也跑到 B，体感"我没发啊怎么冒成功 toast"。和上下面 like/comment/delete
      // mutation 的 mutationBaseUrl 守卫统一模板。
      return { mutationBaseUrl: baseUrl };
    },
    onSuccess: (newMoment, input, context) => {
      const mutationBaseUrl = context?.mutationBaseUrl ?? baseUrl;
      // cache 写到 mutation 触发时刻的 baseUrl（OLD = A 账户）—— 切回 A 时第一帧
      // 就能看到刚发的；不要污染 B 账户的 cache。和 friend-moments-page /
      // profile-moments-page createMutation 同模板。
      queryClient.setQueryData<InfiniteData<MomentsPageResponse>>(
        ["app-moments-paged", mutationBaseUrl],
        (current) =>
          current && current.pages.length > 0
            ? {
                pages: [
                  {
                    ...current.pages[0]!,
                    items: [newMoment, ...current.pages[0]!.items],
                    // 走查 R1：pages[0].total 也要 +1，否则 toolbar 的「已加载 X / 共 Y 条动态」
                    // 在 invalidate refetch (~600ms+) 落地前会显示陈旧的 Y——用户发完一条
                    // 立刻看 "已加载 21 / 共 126 条" 而不是 127，体感像「我发了但总数没动」。
                    total: (current.pages[0]!.total ?? 0) + 1,
                  },
                ],
                pageParams: current.pageParams.slice(0, 1),
              }
            : current,
      );
      queryClient.setQueryData<Moment[]>(["app-moments", mutationBaseUrl], (current) =>
        current ? [newMoment, ...current] : current,
      );
      // "我的朋友圈"页绑 mine cache，发布同步过去否则跳过去要等下次 refetch。
      queryClient.setQueryData<Moment[]>(
        ["app-moments-mine", mutationBaseUrl],
        (current) => (current ? [newMoment, ...current] : current),
      );
      // 后台 invalidate 也落到 OLD baseUrl ——profile/friend-moments-page、
      // search-index 等共享 cache 的页面也得跟新（落到 A 账户的 cache 上）。
      void queryClient.invalidateQueries({
        queryKey: ["app-moments-paged", mutationBaseUrl],
      });
      void queryClient.invalidateQueries({
        queryKey: ["app-moments", mutationBaseUrl],
      });
      void queryClient.invalidateQueries({
        queryKey: ["app-moments-mine", mutationBaseUrl],
      });
      // 切账户后剩下的 draft reset / toast 都属于当前页面的 UI 反馈——用户已经
      // 切到 B 了不该让他看到 A 的「朋友圈已发布」绿条。和 friend-moments-page
      // / profile-moments-page 同模板。
      if (mutationBaseUrl !== mutationBaseUrlRef.current) {
        return;
      }
      const draftStillMatchesPublish =
        composeDraft.text === input.text &&
        composeDraft.imageDrafts === input.imageDrafts &&
        composeDraft.videoDraft === input.videoDraft;
      if (draftStillMatchesPublish) {
        composeDraft.reset();
        setShowCompose(false);
      }
      setNoticeTone("success");
      setNoticeActionLabel(null);
      setNoticeAction(null);
      setNotice(t(msg`朋友圈已发布。`));
    },
  });

  // 共享 optimistic helper —— 同时 toggle paged / flat / mine 三套 cache。
  // 之前本页 onMutate 只动 paged：用户在 /tabs/moments 给自己的帖子点心，切到
  // /profile/moments 时 mine cache 还显示未点状态，要 ~600ms 等 refetch 才追上。
  // 切换后又一致：本页跟 friend/profile/mobile 同一套 cache 维护规则。
  const optimisticLike = useOptimisticMomentLikeHandlers({
    baseUrl,
    ownerId,
    ownerUsername,
    ownerAvatar,
  });
  // 跟 mutation 闭包同步的 baseUrl ref —— 用来在 onError 里判断"这条 mutation
  // 当初挂在哪个账户"。直接读 baseUrl state 是新值，跟 mutation 触发时的旧值
  // 不一定一样，比对就没意义。
  const mutationBaseUrlRef = useRef(baseUrl);
  useEffect(() => {
    mutationBaseUrlRef.current = baseUrl;
  }, [baseUrl]);
  // 新走查 R1：手动刷新按钮原本没有 in-flight guard，用户连点 5 次 → 5 次
  // GET /api/moments?page=1 同时发出（CDP 实测）。公网隧道下每次都付一个 RTT
  // + setQueryData 后等于 1 秒内整列表渲 5 次。用 ref 锁住，进入时翻 true，
  // finally 翻 false；同时用 state 给 toolbar 按钮一个 disabled 视觉态。
  // ref 同步赋值，第一次点击翻 true 之后所有后续 click 立刻早返，
  // 跟 mobileDeleteInflightRef 同思路（confirm 阻塞期间 click 入队也不会重复触发）。
  const refreshInflightRef = useRef(false);
  const [refreshPending, setRefreshPending] = useState(false);
  // 同步防双击锁——下方 mobile onDeleteMoment 的 `if (deleteMutation.isPending)
  // return;` guard 是上一次 render 的闭包值，window.confirm 是阻塞 native dialog
  // 期间 click 事件会被浏览器排队，用户在 dialog 出现的极短窗口内连点两次：
  // click 1 弹 confirm 阻塞、click 2 进队列；用户在 confirm 上点 OK，click 1
  // 走完 mutate.mutate(X) 后 React 还没 commit isPending=true，队列里的 click 2
  // 用同一个闭包跑出来时仍判 false → 第二个 confirm 又弹出来；用户再点 OK 又
  // 触发一次 DELETE。CDP 实测（confirm 重定义成同步返 true 后）：5 click →
  // 5 DELETE 在 1ms 内全飞出去。ref 同步赋值，第一次 click 翻 true 之后所有
  // 后续 click 立刻早返。
  const mobileDeleteInflightRef = useRef(false);
  // 新走查 R2：同帧双击守卫——CDP 实测 onCommentSubmit 同帧 2 次 click 触发
  // 2 次 POST /api/moments/{id}/comment，DB 里写 2 条一模一样的评论；同样
  // onLikeMomentId 双击 → 2 次 POST /like 把 toggle 多翻一轮。仅靠
  // commentMutation.isPending 不行：mutate() 是同步调起的，但 React useState
  // 的 isPending 更新要等下一个 render，同帧第二个 click 的 handler 闭包里
  // 读到的还是上次的 isPending=false。ref 同步赋值是唯一可靠的同帧锁。
  // 单帧锁按 momentId 维度分别记账——不同帖子的同帧 click 互不影响。
  const commentInflightRef = useRef<Record<string, boolean>>({});
  const likeInflightRef = useRef<Record<string, boolean>>({});
  // 走查电脑端朋友圈 R5：桌面删除有 `if (deleteMutation.isPending) return;`
  // 但 isPending 是 useState 上一次 render 的值——同帧双击 / retry 双击都看
  // false → 2 次 mutate；mobileDeleteInflightRef 是给 mobile confirm 阻塞期
  // 队列的 boolean 锁，不按 momentId 分维度。本轮把 desktop delete + retry 走
  // momentId 维度的 ref 锁，跟 like/comment 同模式。
  const deleteInflightRef = useRef<Record<string, boolean>>({});
  const likeMutation = useMutation({
    mutationFn: (momentId: string) => toggleMomentLike(momentId, baseUrl),
    onMutate: (momentId: string) => {
      // 把 onMutate 时刻的 baseUrl 钉进 context，onError 比对——切账户的话
      // 这条 mutation 属于上一个账户，UI 不应该再冒红条。
      const mutationBaseUrl = baseUrl;
      const inner = optimisticLike.onMutate(momentId);
      return Promise.resolve(inner).then((snapshots) => ({
        ...snapshots,
        mutationBaseUrl,
      }));
    },
    onError: (error, momentId, context) => {
      optimisticLike.onError(error, momentId, context);
      // mid-flight 切账户：当时的 momentId 在新账户里不存在，弹"点赞失败"红条 +
      // 重试按钮（重试还会再用旧 momentId 去新账户的 API → 又 404）只会
      // 把用户搞糊涂。和 R7/R8/R9 mid-flight 关 sheet 失败时静默吞错同思路。
      if (context && context.mutationBaseUrl !== mutationBaseUrlRef.current) {
        return;
      }
      // 之前 error 只回滚 cache、UI 沉默到底部那块 likeError 一直挂着不消失。
      // 把错误冒到顶 notice 通道，2.4s 自动收 + 给个「重试点赞」按钮。
      // tone="danger" 红条——之前用 tone="info" 蓝条，色调和「朋友圈互动已更新。」
      // 成功 toast 太接近，用户根本看不出是失败，跟 chat Round 6 同类 bug。
      setNoticeTone("danger");
      setNoticeActionLabel(t(msg`重试点赞`));
      // 走查电脑端朋友圈 R5：之前 retry action 是裸 `() => likeMutation.mutate(momentId)`，
      // 用户双击「重试点赞」会同帧 2 次 mutate → 2 个 POST /like → toggle 多翻
      // 一轮（点赞失败语义被"重试两次"翻成"再次取消"）；和上方 onLike inflight
      // ref 守卫不一致。用同一把 likeInflightRef 兜住，retry 也走 onSettled 释放。
      setNoticeAction(() => () => {
        if (likeInflightRef.current[momentId]) return;
        likeInflightRef.current[momentId] = true;
        likeMutation.mutate(momentId, {
          onSettled: () => {
            delete likeInflightRef.current[momentId];
          },
        });
      });
      setNotice(
        // 走查 R2：之前直拼 error.message 等于把 server 的 legacyMessage（始终
        // 中文）原样塞给非 zh-CN locale 用户。AppError 已经带 errorCode，先走
        // translateAppErrorCode 命中 i18n 字典走当前 locale，miss 时回退到原
        // error.message 兜底。和 profile-info-name-page / discover-scene-page
        // 同模式。
        isApiRequestError(error)
          ? t(msg`点赞失败：${translateAppErrorCode(error) ?? error.message}`)
          : error instanceof Error
            ? t(msg`点赞失败：${error.message}`)
            : t(msg`点赞失败，请稍后重试。`),
      );
    },
    onSuccess: (_data, _momentId, context) => {
      // mid-flight 切账户：成功 toast「朋友圈互动已更新」是当前账户的 notice 通道，
      // 但这条点赞其实发生在上一个账户，用户切过来还看不到任何 UI 变化反而冒
      // 一个绿条会困惑「我刚刚做了啥？」onError 路径已经按这个 guard 静默，
      // onSuccess 也对齐。
      if (context && context.mutationBaseUrl !== mutationBaseUrlRef.current) {
        return;
      }
      setNoticeTone("success");
      setNoticeActionLabel(null);
      setNoticeAction(null);
      setNotice(t(msg`朋友圈互动已更新。`));
      // 点赞 toggle 返回 { liked: boolean }，optimistic 已经把 ownerState 切对；
      // 服务端不会重算业务字段。完全省掉 invalidate，避免一次 GET /api/moments 全量
      // refetch 又拉回 30+ media 条件请求。
    },
  });

  // mutationFn 不能再次读 commentDrafts 取文本：onMutate 里的
  // setCommentDrafts(clear) 会在 onMutate 返回的微任务边界被 React 18 flush 掉，
  // 等 TanStack Query 调 mutationFn 时闭包里的 commentDrafts[momentId] 已经是 ""。
  // 在 onMutate 里把 text/target 写进 ref，mutationFn 直接读 ref。
  const commentSubmitArgsRef = useRef<
    Record<
      string,
      {
        text: string;
        target: { commentId: string; authorId: string } | null;
      }
    >
  >({});
  const commentMutation = useMutation({
    // onMutate: optimistic 插入临时评论 + 清输入/回复目标。
    // 公网隧道 ~600ms RTT 下，原 onSuccess 才清 drafts 会让用户看到输入框
    // 600ms 不消失；optimistic 插入还让评论立刻可见。临时 id 以 'optimistic-'
    // 前缀打标，onSuccess 通过 invalidate 让真实数据替换；onError 回滚 snapshot
    // 并恢复 drafts/reply target。
    onMutate: async (momentId: string) => {
      const text = commentDrafts[momentId]?.trim();
      if (!text || !ownerId) {
        return { skipped: true as const };
      }

      const desktopTarget =
        desktopReplyTarget && desktopReplyTarget.postId === momentId
          ? desktopReplyTarget
          : null;
      const mobileTarget =
        commentBarTarget?.momentId === momentId
          ? commentBarTarget.replyTo
          : null;
      const target = desktopTarget
        ? {
            commentId: desktopTarget.commentId,
            authorId: desktopTarget.authorId,
          }
        : mobileTarget;

      commentSubmitArgsRef.current[momentId] = { text, target };

      // 4 把 cache key 都得 optimistic 同步：
      //   - flat (app-moments)：search index / 旧 component
      //   - paged (app-moments-paged)：本页主数据源
      //   - mine (app-moments-mine)：/profile/moments
      //   - character (app-moments-character[X])：/desktop/friend-moments/X
      // 之前只更新前两套；用户在 /tabs/moments 评论一条角色 X 的动态后立刻切到
      // /desktop/friend-moments/X 会看不到新评论（character cache 还是旧值，
      // 要等下次 refetch）。跟 use-optimistic-like 同模板：4 把 key 全更新。
      await Promise.all([
        queryClient.cancelQueries({
          queryKey: ["app-moments-paged", baseUrl],
        }),
        queryClient.cancelQueries({ queryKey: ["app-moments", baseUrl] }),
        queryClient.cancelQueries({
          queryKey: ["app-moments-mine", baseUrl],
        }),
        queryClient.cancelQueries({
          queryKey: ["app-moments-character", baseUrl],
        }),
      ]);

      const flatSnapshots = queryClient.getQueriesData<Moment[]>({
        queryKey: ["app-moments", baseUrl],
      });
      const pagedSnapshots = queryClient.getQueriesData<
        InfiniteData<MomentsPageResponse>
      >({
        queryKey: ["app-moments-paged", baseUrl],
      });
      const mineSnapshots = queryClient.getQueriesData<Moment[]>({
        queryKey: ["app-moments-mine", baseUrl],
      });
      const characterSnapshots = queryClient.getQueriesData<Moment[]>({
        queryKey: ["app-moments-character", baseUrl],
      });

      // 走查 R1：Date.now() 同毫秒能撞 —— 公网 600ms RTT 下用户连续点 2 次发送，
      // 或同一帖下两条不同评论的 optimistic 行会落到同一 tempId，onSuccess 替换会
      // 命中错的那条。加 random 后缀让碰撞概率退化到可忽略。
      const tempId = `optimistic-comment-${ownerId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const tempComment: MomentComment = {
        id: tempId,
        postId: momentId,
        authorId: ownerId,
        authorName: ownerUsername ?? t(msg`我`),
        authorAvatar: ownerAvatar ?? "",
        authorType: "user",
        text,
        replyToCommentId: target?.commentId ?? null,
        replyToAuthorId: target?.authorId ?? null,
        createdAt: new Date().toISOString(),
      };

      const appendComment = (moment: Moment): Moment =>
        moment.id !== momentId
          ? moment
          : {
              ...moment,
              comments: [...moment.comments, tempComment],
              commentCount: moment.commentCount + 1,
            };

      flatSnapshots.forEach(([key, data]) => {
        if (!data) return;
        queryClient.setQueryData<Moment[]>(key, data.map(appendComment));
      });
      pagedSnapshots.forEach(([key, data]) => {
        if (!data) return;
        queryClient.setQueryData<InfiniteData<MomentsPageResponse>>(key, {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.map(appendComment),
          })),
        });
      });
      mineSnapshots.forEach(([key, data]) => {
        if (!data) return;
        queryClient.setQueryData<Moment[]>(key, data.map(appendComment));
      });
      characterSnapshots.forEach(([key, data]) => {
        if (!data) return;
        queryClient.setQueryData<Moment[]>(key, data.map(appendComment));
      });

      // 清输入与 reply target —— 用户看到立刻清空，体感"已发送"。
      const savedDraft = commentDrafts[momentId] ?? "";
      const savedDesktopReply =
        desktopReplyTarget && desktopReplyTarget.postId === momentId
          ? desktopReplyTarget
          : null;
      const savedMobileReply =
        commentBarTarget?.momentId === momentId ? commentBarTarget : null;
      // 钉住 mutation 触发时刻的 baseUrl ——切账户后 onError 比对，旧账户的失败
      // 不该 reopen 新账户里根本没这条 moment 的 commentBar / 弹红条。
      const mutationBaseUrl = baseUrl;

      setCommentDrafts((current) => ({ ...current, [momentId]: "" }));
      setDesktopReplyTarget((current) =>
        current?.postId === momentId ? null : current,
      );
      setCommentBarTarget((current) =>
        current?.momentId === momentId ? null : current,
      );

      return {
        skipped: false as const,
        flatSnapshots,
        pagedSnapshots,
        mineSnapshots,
        characterSnapshots,
        momentId,
        tempId,
        savedDraft,
        savedDesktopReply,
        savedMobileReply,
        mutationBaseUrl,
      };
    },
    mutationFn: (momentId: string) => {
      // 从 ref 读 onMutate 已捕获的 text/target，避免被 setCommentDrafts(clear) 抢跑
      const args = commentSubmitArgsRef.current[momentId];
      if (!args?.text) {
        throw new Error(t(msg`请先输入评论内容。`));
      }

      return addMomentComment(
        momentId,
        {
          text: args.text,
          replyToCommentId: args.target?.commentId,
          replyToAuthorId: args.target?.authorId,
        },
        baseUrl,
      );
    },
    onError: (err, momentId, context) => {
      delete commentSubmitArgsRef.current[momentId];
      if (!context || context.skipped) {
        // skipped 是 onMutate 自己拒绝（空文本/未登录），不算用户期望的提交，不报。
        return;
      }
      // mid-flight 切账户：旧账户的失败不该在新账户里 reopen 一个指着不存在
      // 帖子的 commentBar，也不该弹"评论失败"红条。和 likeMutation 同思路；
      // cache 回滚也跳过——旧 baseUrl 的 cache 用户已经看不到了。
      if (context.mutationBaseUrl !== mutationBaseUrlRef.current) {
        return;
      }
      context.flatSnapshots.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
      context.pagedSnapshots.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
      context.mineSnapshots.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
      context.characterSnapshots.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
      // 恢复 drafts / reply target，让用户能改后重发。
      setCommentDrafts((current) => ({
        ...current,
        [context.momentId]: context.savedDraft,
      }));
      if (context.savedDesktopReply) {
        setDesktopReplyTarget(context.savedDesktopReply);
      }
      if (context.savedMobileReply) {
        setCommentBarTarget(context.savedMobileReply);
      }
      // 顶 notice 走错误提示，2.4s 自动收。
      // 不放「重试」按钮——commentBar 已经被 setCommentBarTarget 重新打开，
      // 用户直接在评论框内点「发送」就能再试。
      setNoticeTone("danger");
      setNoticeActionLabel(null);
      setNoticeAction(null);
      setNotice(
        // 走查 R2 同 likeMutation 处理：translateAppErrorCode 优先走 i18n 字典
        // 拿当前 locale 文案，miss 才回退 raw err.message（server legacyMessage 中文）。
        isApiRequestError(err)
          ? t(msg`评论失败：${translateAppErrorCode(err) ?? err.message}`)
          : err instanceof Error
            ? t(msg`评论失败：${err.message}`)
            : t(msg`评论失败，请稍后重试。`),
      );
    },
    onSuccess: (realComment, momentId, context) => {
      delete commentSubmitArgsRef.current[momentId];
      // mid-flight 切账户：success toast 在新账户里冒「朋友圈互动已更新」很
      // 误导（用户根本没在这账户做交互），并且下面的 setQueriesData 用的是
      // 当前账户的 cache key——往 wrong cache 里写「这条 moment 的 temp 评论替换
      // 成 realComment」也是 no-op（新账户 cache 里根本没那条 moment），但
      // 顺手跳过省一次空操作。
      if (
        context &&
        !context.skipped &&
        context.mutationBaseUrl !== mutationBaseUrlRef.current
      ) {
        return;
      }
      setNoticeTone("success");
      setNoticeActionLabel(null);
      setNoticeAction(null);
      setNotice(t(msg`朋友圈互动已更新。`));
      // 把 optimistic temp（id=optimistic-comment-*）原地换成 server 真实评论。
      // 这样**完全省掉**一次 invalidate 触发的 GET /api/moments + paged refetch
      // ——公网隧道下 refetch 还会带回 30+ media 条件请求 RTT，是评论后体感
      // "页面又卡一下"的主要原因。staleTime 60s (mobile) 期间用户拿不到其他
      // NPC 同时段写的评论，但 pull-to-refresh / re-mount 都能补；可接受。
      if (context && !context.skipped) {
        const { tempId } = context;
        const replaceComment = (moment: Moment): Moment =>
          moment.id !== momentId
            ? moment
            : {
                ...moment,
                comments: moment.comments.map((c) =>
                  c.id === tempId ? realComment : c,
                ),
              };
        queryClient.setQueriesData<Moment[]>(
          { queryKey: ["app-moments", baseUrl] },
          (data) => (data ? data.map(replaceComment) : data),
        );
        queryClient.setQueriesData<InfiniteData<MomentsPageResponse>>(
          { queryKey: ["app-moments-paged", baseUrl] },
          (data) =>
            data
              ? {
                  ...data,
                  pages: data.pages.map((page) => ({
                    ...page,
                    items: page.items.map(replaceComment),
                  })),
                }
              : data,
        );
        // 跟 onMutate 的 4 把 key 对齐：mine + character 也得把 temp 换成 real，
        // 否则 /profile/moments、/desktop/friend-moments/X 看到的还是 optimistic id。
        queryClient.setQueriesData<Moment[]>(
          { queryKey: ["app-moments-mine", baseUrl] },
          (data) => (data ? data.map(replaceComment) : data),
        );
        queryClient.setQueriesData<Moment[]>(
          { queryKey: ["app-moments-character", baseUrl] },
          (data) => (data ? data.map(replaceComment) : data),
        );
      }
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (momentId: string) => deleteMoment(momentId, baseUrl),
    onMutate: async (momentId) => {
      // 同步从 4 把 cache 里把这条 moment 抹掉：flat / paged / mine。
      // 之前只动 paged → 用户在 /tabs/moments 删一条自己的动态后立刻切到
      // /profile/moments，那条已删的帖子还在那挂着 ~600ms 直到 invalidate
      // 把 mine refetch 回来。跟 use-optimistic-like 同模式：multi-cache 同步。
      // character cache 里不会有用户自己发的 moment（按 character=ID 服务端过滤），
      // 不必动，但 cancel 一下避免 in-flight refetch 把刚抹掉的拉回来（用户的 moment
      // 不会进 character cache 但 cancel 是安全 no-op）。
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ["app-moments-paged", baseUrl] }),
        queryClient.cancelQueries({ queryKey: ["app-moments", baseUrl] }),
        queryClient.cancelQueries({ queryKey: ["app-moments-mine", baseUrl] }),
      ]);
      const pagedSnapshots = queryClient.getQueriesData<
        InfiniteData<MomentsPageResponse>
      >({
        queryKey: ["app-moments-paged", baseUrl],
      });
      const flatSnapshots = queryClient.getQueriesData<Moment[]>({
        queryKey: ["app-moments", baseUrl],
      });
      const mineSnapshots = queryClient.getQueriesData<Moment[]>({
        queryKey: ["app-moments-mine", baseUrl],
      });
      pagedSnapshots.forEach(([key, data]) => {
        if (!data) return;
        // 走查 R1：删除时 pages[0].total 也要 -1，否则 toolbar 「已加载 X / 共 Y」
        // 在 invalidate refetch (~600ms+) 落地前会显示陈旧的 Y——用户删完一条
        // 立刻看 "已加载 99 / 共 126" 而不是 125，体感像「删了但总数没动」。
        // 仅 pages[0] 上下移 —— total 是服务端跨页累计值，不属于任何具体一页。
        queryClient.setQueryData<InfiniteData<MomentsPageResponse>>(key, {
          ...data,
          pages: data.pages.map((page, index) => ({
            ...page,
            items: page.items.filter((item) => item.id !== momentId),
            ...(index === 0
              ? { total: Math.max(0, (page.total ?? 0) - 1) }
              : {}),
          })),
        });
      });
      flatSnapshots.forEach(([key, data]) => {
        if (!data) return;
        queryClient.setQueryData<Moment[]>(
          key,
          data.filter((item) => item.id !== momentId),
        );
      });
      mineSnapshots.forEach(([key, data]) => {
        if (!data) return;
        queryClient.setQueryData<Moment[]>(
          key,
          data.filter((item) => item.id !== momentId),
        );
      });
      return {
        pagedSnapshots,
        flatSnapshots,
        mineSnapshots,
        // 钉住触发时刻的 baseUrl —— mid-flight 切账户后 onError 比对，旧账户的
        // "删除失败"红条不要冒到新账户，"重试删除"按钮的闭包也指着旧 momentId。
        mutationBaseUrl: baseUrl,
      };
    },
    onError: (error, momentId, context) => {
      // mid-flight 切账户：旧账户的失败不该在新账户里冒"删除失败"红条 +
      // 重试按钮（重试还会用旧 momentId 走新账户 → 又 404）。cache 也跳过回滚——
      // 旧 baseUrl 的 cache 用户已经看不到了。
      if (context && context.mutationBaseUrl !== mutationBaseUrlRef.current) {
        return;
      }
      context?.pagedSnapshots.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
      context?.flatSnapshots.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
      context?.mineSnapshots.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
      // 删除失败也冒到 notice，给「重试删除」按钮——之前完全沉默，
      // 用户只看到帖子又出现了，根本搞不清是不是删除生效。
      setNoticeTone("danger");
      setNoticeActionLabel(t(msg`重试删除`));
      // 同 like retry 走 deleteInflightRef 兜双击，否则双击「重试删除」会
      // 触发 2 个 DELETE /api/moments/{id}（第二次会被 server 404 但仍付 RTT
      // + 弹一条新红条覆盖原 retry 结果，体感"刚点了一下又冒出另一个错误"）。
      setNoticeAction(() => () => {
        if (deleteInflightRef.current[momentId]) return;
        deleteInflightRef.current[momentId] = true;
        deleteMutation.mutate(momentId, {
          onSettled: () => {
            delete deleteInflightRef.current[momentId];
          },
        });
      });
      setNotice(
        // 走查 R2 同 like/comment：err 是 AppError 时优先走 translateAppErrorCode
        // 拿当前 locale 文案，miss 才回退 raw err.message。
        isApiRequestError(error)
          ? t(msg`删除失败：${translateAppErrorCode(error) ?? error.message}`)
          : error instanceof Error
            ? t(msg`删除失败：${error.message}`)
            : t(msg`删除失败，请稍后重试。`),
      );
    },
    onSuccess: (_data, _momentId, context) => {
      // mid-flight 切账户：删除成功发生在上一个账户，新账户里不该弹「已删除
      // 这条朋友圈」绿条 + 把新账户的多页 cache 砍回 page 1（resetMomentsToFirstPage
      // 用闭包里的当前 baseUrl）→ 用户会看到列表瞬间变短、auto-prefetch 重拉。
      // 闭包里 invalidate 的 baseUrl 也是新账户的，invalidate 新账户 cache 来对应
      // 旧账户的删除完全错位 —— 静默跳过最安全。
      if (context && context.mutationBaseUrl !== mutationBaseUrlRef.current) {
        return;
      }
      setNoticeTone("success");
      setNoticeActionLabel(null);
      setNoticeAction(null);
      setNotice(t(msg`已删除这条朋友圈。`));
      // 删除会让分页边界前移：如不先把 cache 收回到 page 1，refetch 多页时下一页
      // 的第一条会被前面那页的末尾"吃掉"，造成中间漏一条。
      resetMomentsToFirstPage();
      // fire-and-forget：optimistic 已把这条从 cache 抹掉；await 会让删除按钮多卡 600ms+。
      void queryClient.invalidateQueries({
        queryKey: ["app-moments-paged", baseUrl],
      });
      void queryClient.invalidateQueries({
        queryKey: ["app-moments", baseUrl],
      });
      // "我的朋友圈"也得跟随删除——否则跳过去仍然能看到这条幽灵帖子。
      void queryClient.invalidateQueries({
        queryKey: ["app-moments-mine", baseUrl],
      });
    },
  });
  const pendingLikeMomentId = likeMutation.isPending
    ? likeMutation.variables
    : null;
  const pendingCommentMomentId = commentMutation.isPending
    ? commentMutation.variables
    : null;
  const pendingDeleteMomentId = deleteMutation.isPending
    ? deleteMutation.variables
    : null;
  // 输入 compose 文本时父组件每个字符都 re-render；visibleMoments / blockedCharacterIds
  // / routeSelectedMoment / routeSelectedAuthorMoment 之前每次都 new Set + filter +
  // 两次 find，249+ 条 moment 下白白烧 CPU。memo 缓存 + 给 DesktopMomentRow.memo 当
  // referential stability 来源——某条 moment 引用不变，row 就能跳过 re-render。
  const blockedCharacterIds = useMemo(
    () => new Set((blockedQuery.data ?? []).map((item) => item.characterId)),
    [blockedQuery.data],
  );
  const visibleMoments = useMemo(
    () =>
      momentsData.filter((moment) => {
        if (
          moment.authorType === "character" &&
          blockedCharacterIds.has(moment.authorId)
        ) {
          return false;
        }
        // 第二次走查 R1：偶尔有 AI 角色把 [TOOL_CALL] / <tool_call> 语法当正文
        // 发出来（实测线上 116 条里有 1 条全是 web_search 调用语法），
        // wechat-moment-card 把这种内容 strip 成空字符串后 hasText=false +
        // 多数是 text contentType (无 media) → 卡片只剩头像 + 时间戳 + ⋯ +
        // 一堆评论挂着，用户看到「界闻 / 刚刚 ⋯ / 评论：追政策信号倒挺敏锐」
        // 完全不知道在评什么。和 wechat-moment-card 内 visibleComments
        // 的 strip-then-skip 同模式：父层先过滤掉整张「空胶水」卡片，
        // 让附带的评论 / 点赞也一起退场（孤儿评论无意义）。location
        // 兜底是防御性的——理论上没有 location-only moment，但若 contentType=text
        // + media=[] + text strip 为空，仅 location 仍能撑住卡片，留个口。
        //
        // 走查 R5（本轮，perf）：早返放行 ——「空胶水帖」只可能发生在 text-only
        // moment 上；只要 moment 有 media 或 location，最终 return true 的分支
        // 已经盖死，不需要 strip。原版无论如何先走一遍 stripToolCallSyntax 正则，
        // 200 条 moment（图文为主）× 每条都 strip = 大量浪费的正则烧 CPU。
        // optimistic like/comment 改 momentsData 后 visibleMoments 重 filter 一遍，
        // 每帧又烧 ~20ms 正则。把"有 media 或 location"做提前 return true。
        if (moment.media.length > 0 || moment.location) {
          return true;
        }
        const stripped = stripToolCallSyntax(moment.text);
        if (!stripped) {
          return false;
        }
        return true;
      }),
    [momentsData, blockedCharacterIds],
  );
  // 「后端给了 N 条 moment 但全是被屏蔽角色」识别——空态 CTA 选「打开通讯录」
  // 还是「发一条朋友圈」要按这条分支走。和 discover-feed-page 的
  // hasFilteredOutPosts 同模式（commit 3b376e47 把"屏蔽=空"的兜底文案对齐）。
  const hasFilteredOutMoments =
    momentsData.length > 0 && visibleMoments.length === 0;
  const routeSelectedMoment = useMemo(
    () =>
      routeSelectedMomentId
        ? visibleMoments.find((moment) => moment.id === routeSelectedMomentId) ??
          null
        : null,
    [routeSelectedMomentId, visibleMoments],
  );
  const routeSelectedAuthorMoment = useMemo(
    () =>
      routeSelectedAuthorId
        ? routeSelectedMoment?.authorId === routeSelectedAuthorId
          ? routeSelectedMoment
          : visibleMoments.find(
              (moment) => moment.authorId === routeSelectedAuthorId,
            ) ?? null
        : null,
    [routeSelectedAuthorId, routeSelectedMoment, visibleMoments],
  );
  const syncedRouteSelectedAuthorId =
    routeSelectedAuthorId &&
    routeSelectedAuthorMoment?.authorType === "character"
      ? routeSelectedAuthorId
      : undefined;
  const isDiscoverSubPage = normalizedPathname === "/discover/moments";
  const desktopMomentsPath = "/tabs/moments";
  const isDesktopMomentsRoute =
    normalizedPathname === desktopMomentsPath ||
    normalizedPathname === "/moments" ||
    normalizedPathname === "/discover/moments";
  // InlineNotice secondary 按钮只在有 returnPath 时才展示（见 action 行渲染），
  // 因此固定走「返回上一页」语义；没有 returnPath 时该按钮整行都不渲染。
  const interactionActionLabel = t(msg`返回上一页`);

  function openMobileMomentsPublishPage() {
    void navigate({
      to: "/discover/moments/publish",
      hash: buildMobileMomentsPublishRouteHash({
        returnPath: pathname,
        returnHash: currentRouteHash || undefined,
      }),
    });
  }

  function openMobileFriendMoments(characterId: string) {
    void navigate({
      to: "/friend-moments/$characterId",
      params: { characterId },
      hash: buildMobileFriendMomentsRouteHash({
        returnPath: pathname,
        returnHash: currentRouteHash || undefined,
      }),
    });
  }

  function openCharacterDetail(characterId: string) {
    void navigate({
      to: "/character/$characterId",
      params: { characterId },
      hash: buildCharacterDetailRouteHash({
        returnPath: pathname,
        returnHash: currentRouteHash || undefined,
      }),
    });
  }

  function openDesktopFriendMoments(targetMoment: Moment) {
    if (targetMoment?.authorType !== "character") {
      return;
    }
    void navigate({
      to: "/desktop/friend-moments/$characterId",
      params: { characterId: targetMoment.authorId },
      hash: buildDesktopFriendMomentsRouteHash({
        // 新一轮 R10：source=moments + returnPath/returnHash 已经能把"返回上一页"
        // 带回 /tabs/moments，但 returnHash 之前是 buildDesktopMomentsRouteHash({})
        // 空 hash，用户从角色页返回后 momentsQuery 拉回来 routeSelectedMomentId
        // 是 null，没有 scroll-snap target，整页落回顶部。原本在 /tabs/moments
        // 上滚到第 50 条点角色头像 → 看完角色朋友圈点返回 → 又得从第 1 条开始
        // 找。把 targetMoment.id 当 momentId 串进 return hash，回来后
        // desktop-moments-workspace 的 scroll effect 自然把视口 snap 回那条。
        momentId: targetMoment.id,
        source: "moments",
        returnPath: desktopMomentsPath,
        returnHash: buildDesktopMomentsRouteHash({
          momentId: targetMoment.id,
        }),
      }),
    });
  }

  function navigateToRouteStateReturn() {
    if (!safeReturnPath) {
      return false;
    }

    void navigate({
      to: safeReturnPath,
      ...(safeReturnHash ? { hash: safeReturnHash } : {}),
    });
    return true;
  }

  function handleStatusBack() {
    if (navigateToRouteStateReturn()) {
      return;
    }

    // 先收回到 page 1 再 refetch，避免多页 refetch 命中分页边界偏移
    resetMomentsToFirstPage();
    void momentsQuery.refetch();
    void blockedQuery.refetch();
  }

  function handleRetryLoad() {
    resetMomentsToFirstPage();
    void momentsQuery.refetch();
    void blockedQuery.refetch();
  }

  function handleEmptyStateAction() {
    if (navigateToRouteStateReturn()) {
      return;
    }

    openMobileMomentsPublishPage();
  }

  useEffect(() => {
    resetComposeDraft();
    setCommentDrafts({});
    setShowCompose(false);
    // baseUrl 切换（账户切换）时，所有挂在「上一个 baseUrl」的交互态都得清，
    // 否则用户在 A 账户点开 ⋯ 弹出 actionBubble、或正在写评论 → 切到 B 账户
    // 后这些弹层还浮在屏幕上、anchorRect 还指着上一个账户的卡片位置；
    // 点 like / 评论会用旧 momentId 走 mutation → 在新账户里 404 → 弹红条
    // "点赞失败" 把人搞糊涂。配合 mid-flight onError 的 baseUrl-guard 一起兜底。
    // 与桌面端 60a8edb0 (走查新 Round 5) 同模式：跨 baseUrl 不要让交互态泄漏。
    setActionBubble(null);
    setCommentBarTarget(null);
    setDesktopReplyTarget(null);
    // 走查电脑端朋友圈 R1（新一轮）：desktopAvatarPopover 之前只在 [hash, pathname]
    // 翻转时清（行 209-211），切账户时 baseUrl 变了但 hash/pathname 不动，旧账户
    // 打开的角色头像 popover / 我自己头像 popover 仍然挂着；lazy 加载的
    // DesktopMessageAvatarPopover 内部 query 已经按新 baseUrl 拉，但 anchorRect
    // 还指着旧账户 cache 里的卡片位置（账户切换后 visibleMoments 整体翻新，旧锚
    // 元素早被 unmount），popover 飘在屏幕一角；characterId 是旧账户的 ID，新
    // 账户根本不存在，弹出来全是「角色不存在」或裸 loading。和 actionBubble /
    // commentBarTarget 同模式一起清。friend-moments-page / profile-moments-page
    // 同 bug 一并修。
    setDesktopAvatarPopover(null);
    // 走查新一轮 R4：旧 baseUrl 的失败 mutation 状态也得清。like/comment/delete
    // mutation 失败后 isError=true、error/variables 都保留在 mutation 状态里；
    // mid-flight 的 baseUrl-guard 只拦了 onError/onSuccess 的副作用回调，没把
    // mutation 自身的 isError 标志重置。toolbar 的「点赞失败/评论失败/删除失败」
    // ErrorBlock 是 `mutation.isError && !(notice && noticeTone==='danger')` 串
    // 出来的——切账户后 notice 被上面 setNotice('') 清掉，但 mutation.isError
    // 还挂着，2.4s notice 倒计时本来就过期了的话第一帧就能看到「评论失败：在
    // A 账户那条 moment 上的失败原文」挂在 B 账户的 toolbar 上。createMutation
    // 同理——切账户后用户重开 compose 面板会先看到旧账户那次发布失败的红条。
    // mutation.reset() 只清状态不取消 in-flight；in-flight 后续 onError/onSuccess
    // 还有 baseUrl-guard 拦住，安全。
    likeMutation.reset();
    commentMutation.reset();
    deleteMutation.reset();
    createMutation.reset();
    // 待发评论 args：onError/onSuccess 会清掉自己那条，但如果切账户时还有
    // mid-flight，旧 args 残留在内存。每次切账户都会堆，长期跑就是泄漏；
    // 顺手 wipe 防御。
    commentSubmitArgsRef.current = {};
    // hash 携带 momentId 时一次性 scroll-into-view 用的"已 snap 锁"也得清——
    // 否则 A 账户 snap 过的 momentId 留在 ref 里，B 账户如果碰巧 hash 还带着
    // 同 id（或 routeSelectedMomentId 未变），新账户里 momentsQuery 拉回来时
    // 不会重新 snap 到目标卡片。和 actionBubble/commentBarTarget 同模式：
    // 跨 baseUrl 不要让状态泄漏。
    mobileScrollSnappedRouteIdRef.current = null;
    const flashNotice = consumeMomentPublishFlash();
    if (flashNotice) {
      setNoticeTone("success");
      setNoticeActionLabel(null);
      setNoticeAction(null);
      setNotice(flashNotice);
      return;
    }

    setNoticeActionLabel(null);
    setNoticeAction(null);
    setNotice(""); // i18n-ignore-line: clearing state
  }, [baseUrl, resetComposeDraft]);

  useEffect(() => {
    setFavoriteSourceIds(readDesktopFavorites().map((item) => item.sourceId));
  }, []);

  useEffect(() => {
    if (!nativeDesktopFavorites) {
      return;
    }

    let cancelled = false;

    async function syncFavoriteSourceIds() {
      const favoriteSourceIds = (await hydrateDesktopFavoritesFromNative()).map(
        (item) => item.sourceId,
      );
      if (cancelled) {
        return;
      }

      setFavoriteSourceIds((current) =>
        JSON.stringify(current) === JSON.stringify(favoriteSourceIds)
          ? current
          : favoriteSourceIds,
      );
    }

    const handleFocus = () => {
      void syncFavoriteSourceIds();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      void syncFavoriteSourceIds();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [nativeDesktopFavorites]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => {
      setNotice(""); // i18n-ignore-line: clearing state
      setNoticeActionLabel(null);
      setNoticeAction(null);
    }, 2400);
    return () => window.clearTimeout(timer);
    // 跟 noticeKey 而不是只 notice ——两次相同字符串走 setNotice 也得重置倒计时；
    // 见 noticeKeyRef 注释。setNotice 已 wrap：注意 deps 里 setNotice 引用稳定。
  }, [noticeKey, notice, setNotice]);

  useEffect(() => {
    const desktopPathMismatch = pathname !== desktopMomentsPath;

    if (
      !isDesktopLayout ||
      !isDesktopMomentsRoute ||
      syncedRouteSelectedAuthorId ||
      (!desktopPathMismatch && currentRouteHash === normalizedHash)
    ) {
      return;
    }

    void navigate({
      to: desktopMomentsPath,
      hash: currentRouteHash || undefined,
      replace: true,
    });
  }, [
    currentRouteHash,
    isDesktopLayout,
    isDesktopMomentsRoute,
    navigate,
    normalizedHash,
    pathname,
    syncedRouteSelectedAuthorId,
    desktopMomentsPath,
  ]);

  useEffect(() => {
    if (
      !isDesktopLayout ||
      !isDesktopMomentsRoute ||
      !syncedRouteSelectedAuthorId
    ) {
      return;
    }

    void navigate({
      to: "/desktop/friend-moments/$characterId",
      params: { characterId: syncedRouteSelectedAuthorId },
      hash: buildDesktopFriendMomentsRouteHash({
        momentId: routeSelectedMomentId ?? undefined,
        source: "moments",
        returnPath: desktopMomentsPath,
        returnHash: buildDesktopMomentsRouteHash({
          momentId: routeSelectedMomentId ?? undefined,
        }),
      }),
      replace: true,
    });
  }, [
    isDesktopLayout,
    isDesktopMomentsRoute,
    navigate,
    routeSelectedMomentId,
    syncedRouteSelectedAuthorId,
    desktopMomentsPath,
  ]);

  useEffect(() => {
    if (
      !isDesktopLayout ||
      !routeSelectedAuthorId ||
      syncedRouteSelectedAuthorId === routeSelectedAuthorId
    ) {
      return;
    }

    const nextHash = buildDesktopMomentsRouteHash({
      momentId: routeSelectedMomentId ?? undefined,
      returnPath: safeReturnPath,
      returnHash: safeReturnHash,
    });

    if ((nextHash ?? "") === normalizedHash) {
      return;
    }

    void navigate({
      to: pathname,
      hash: nextHash,
      replace: true,
    });
  }, [
    isDesktopLayout,
    navigate,
    normalizedHash,
    pathname,
    routeSelectedAuthorId,
    routeSelectedMomentId,
    safeReturnHash,
    safeReturnPath,
    syncedRouteSelectedAuthorId,
  ]);

  async function handleImageFilesSelected(files: FileList | null) {
    try {
      await composeDraft.addImageFiles(files);
    } catch (error) {
      composeDraft.setMediaError(
        error instanceof Error
          ? error.message
          : t(msg`图片选择失败，请稍后重试。`),
      );
    }
  }

  async function handleVideoFileSelected(file: File | null) {
    try {
      await composeDraft.replaceVideoFile(file);
    } catch (error) {
      composeDraft.setMediaError(
        error instanceof Error
          ? error.message
          : t(msg`视频选择失败，请稍后重试。`),
      );
    }
  }

  // 走查新 Round 1：跟 discover-feed-page 的 mobileScrollSnappedRouteIdRef 锁
  // 同模式——之前只看 visibleMoments.length 一变就 hard-snap，hash auto-load
  // 期间反复 snap 是它的设计目的，但**目标已经在视口里、用户也已经手动滚开**
  // 之后还在 snap，用户继续向下滚 sentinel 触底自动 fetchNextPage →
  // visibleMoments.length 又变 → 整张朋友圈被弹回 X，刚滚到的位置全没了。
  // 加 snap lock：第一次目标真出现在 visibleMoments 才 snap，snap 完锁住当前
  // routeSelectedMomentId；后续 length 变化（用户翻页 / 新 moment prepend）不
  // 再触发。routeSelectedMomentId 切到另一条时锁里的 id 不匹配，自然解锁。
  // 同时把 smooth → auto：smooth 在 hash auto-load 多 page chain 拉过来期间
  // 动画会被 IntersectionObserver 又一次 fetchNextPage 打断，scrollTop 偏过
  // target 一截。
  const mobileScrollSnappedRouteIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      isDesktopLayout ||
      !routeSelectedMomentId ||
      typeof document === "undefined"
    ) {
      return;
    }
    if (mobileScrollSnappedRouteIdRef.current === routeSelectedMomentId) {
      return;
    }
    const targetLoaded = visibleMoments.some(
      (moment) => moment.id === routeSelectedMomentId,
    );
    if (!targetLoaded) {
      return;
    }

    window.requestAnimationFrame(() => {
      document
        .getElementById(`moment-post-${routeSelectedMomentId}`)
        ?.scrollIntoView({
          behavior: "auto",
          block: "start",
        });
    });
    mobileScrollSnappedRouteIdRef.current = routeSelectedMomentId;
  }, [isDesktopLayout, routeSelectedMomentId, visibleMoments]);

  // 用户从分享卡 / 收藏 / 站内跳转走 /discover/moments#moment=<id> 进来但目标
  // 不在首屏 20 条里时，上面的 snap useEffect 只在 visibleMoments 里 some()
  // 命中才 scrollIntoView —— 找不到就静默回退到顶部，用户看到普通朋友圈列表，
  // 完全不知道点进来要看的那条在哪。和 discover-feed-page 的 hash auto-load
  // 同思路：目标未加载且还有下一页时主动 fetchNextPage，IntersectionObserver
  // 触底兜底之上再多一层"跟着 hash 翻页"。
  //
  // 几个早返路径要小心：
  //   1) 已经在 visibleMoments 里 → snap 那条 effect 会处理；
  //   2) 已经在 momentsData 里但被 visibleMoments filter 剔除掉（blocked 角色
  //      或 tool_call 泄漏空胶水帖）→ 用户角度看不到这条，分享链接绕回来不要
  //      硬翻一路找永远不会出现的目标；
  //   3) 没下一页 / 正在 fetch / 上一次 fetch 出错 → 让位给底部错误条 + 用户
  //      重试，避免死循环。和 feed page Round 5/19 加的这两条等价。
  useEffect(() => {
    if (isDesktopLayout || !routeSelectedMomentId) {
      return;
    }
    const targetVisible = visibleMoments.some(
      (moment) => moment.id === routeSelectedMomentId,
    );
    if (targetVisible) {
      return;
    }
    const targetLoadedButBlocked = momentsData.some(
      (moment) => moment.id === routeSelectedMomentId,
    );
    if (targetLoadedButBlocked) {
      return;
    }
    if (!momentsHasNextPage || momentsIsFetchingNextPage) {
      return;
    }
    if (momentsIsFetchNextPageError) {
      return;
    }
    void momentsFetchNextPage();
  }, [
    isDesktopLayout,
    routeSelectedMomentId,
    visibleMoments,
    momentsData,
    momentsHasNextPage,
    momentsIsFetchingNextPage,
    momentsIsFetchNextPageError,
    momentsFetchNextPage,
  ]);

  if (isDesktopLayout) {
    if (syncedRouteSelectedAuthorId) {
      return (
        <RouteRedirectState
          title={t(msg`正在打开好友朋友圈`)}
          description={t(msg`正在切换到桌面好友朋友圈工作区，马上显示对应居民的动态。`)}
          loadingLabel={t(msg`正在切换到桌面朋友圈...`)}
        />
      );
    }

    const errors: string[] = [];

    // 走查 R1（本轮）：首页失败且空列表时 desktop-moments-feed 已经渲「朋友圈
    // 暂时不可用 / 重试读取」EmptyState（loadErrorMessage 走它），toolbar 这里
    // 再推同文 ErrorBlock = 同屏两条红色错误（一张大空态卡 + 一条窄红条），
    // 用户读着像"系统连发两次同错误"。已有内容时 toolbar ErrorBlock 仍有用
    // （EmptyState 不出现），所以按 visibleMoments.length > 0 做 gate。
    // i18n 一致性 —— raw error.message 是 server legacyMessage（中文），
    // 非 zh-CN locale 用户拿到的就是裸中文，先走 translateAppErrorCode。
    if (
      momentsQuery.isError &&
      !momentsQuery.isFetchNextPageError &&
      momentsQuery.error instanceof Error &&
      visibleMoments.length > 0
    ) {
      errors.push(
        isApiRequestError(momentsQuery.error)
          ? translateAppErrorCode(momentsQuery.error) ??
            momentsQuery.error.message
          : momentsQuery.error.message,
      );
    }
    // 桌面 auto-prefetch 中途某页失败：之前 isFetchNextPageError 完全没暴露到 UI ——
    // 用户看到列表停在 100/240 条，刷新按钮就在那，但没线索告诉他「下一页加载失败」。
    // 移动端有专门的错误条和重试按钮（fetchNextPageError prop），桌面也得透传。
    // 点「刷新」会 resetMomentsToFirstPage + refetch，react-query v5 refetch 成功后
    // isFetchNextPageError 自然归零，auto-prefetch 链路恢复。
    if (
      momentsQuery.isFetchNextPageError &&
      momentsQuery.error instanceof Error
    ) {
      const localized = isApiRequestError(momentsQuery.error)
        ? translateAppErrorCode(momentsQuery.error) ??
          momentsQuery.error.message
        : momentsQuery.error.message;
      errors.push(
        t(msg`部分朋友圈加载失败，请点击刷新重试：${localized}`),
      );
    }

    if (blockedQuery.isError && blockedQuery.error instanceof Error) {
      errors.push(
        isApiRequestError(blockedQuery.error)
          ? translateAppErrorCode(blockedQuery.error) ??
            blockedQuery.error.message
          : blockedQuery.error.message,
      );
    }

    return (
      <Suspense
        fallback={
          <RouteRedirectState
            title={t(msg`正在打开桌面朋友圈`)}
            description={t(msg`正在载入桌面朋友圈工作区，马上显示动态和详情。`)}
            loadingLabel={t(msg`载入桌面朋友圈...`)}
          />
        }
      >
        <DesktopMomentsWorkspace
          commentDrafts={commentDrafts}
          commentErrorMessage={
            commentMutation.isError
              ? resolveMomentsErrorMessage(commentMutation.error)
              : null
          }
          commentPendingMomentId={pendingCommentMomentId}
          composeErrorMessage={
            composeDraft.mediaError ??
            (createMutation.isError
              ? resolveMomentsErrorMessage(createMutation.error)
              : null)
          }
          createPending={createMutation.isPending}
          deletePendingMomentId={pendingDeleteMomentId}
          deleteErrorMessage={
            deleteMutation.isError
              ? resolveMomentsErrorMessage(deleteMutation.error)
              : null
          }
          errors={errors}
          imageDrafts={composeDraft.imageDrafts}
          isLoading={momentsQuery.isLoading}
          // 首屏失败时空态优先渲「朋友圈暂时不可用 / 重试读取」（feed Round 2 同款）。
          // isFetchNextPageError 单独走 toolbar 的 errors 通道（已加载内容时不该
          // 把 empty-state 弹出来）。
          loadErrorMessage={
            momentsQuery.isError && !momentsQuery.isFetchNextPageError
              ? resolveMomentsErrorMessage(momentsQuery.error)
              : null
          }
          likeErrorMessage={
            likeMutation.isError
              ? resolveMomentsErrorMessage(likeMutation.error)
              : null
          }
          likePendingMomentId={pendingLikeMomentId}
          moments={visibleMoments}
          totalCount={momentsServerTotal}
          isFullyLoaded={!momentsHasNextPage}
          // 走查 R3：把屏蔽态透到桌面 feed —— hasFilteredOutMoments=true 时
          // 让 EmptyState 切到「正在寻找未屏蔽的动态」/「朋友圈都被你屏蔽了 /
          // 打开通讯录」，跟 mobile 同模板，不再把"全被你拉黑了"误导成"还很安静"。
          hasFilteredOutMoments={hasFilteredOutMoments}
          // 走查电脑端 R1：传 momentsHasNextPage 必须去掉 fetchNextPageError 态。
          // 否则 auto-prefetch 中途某页失败 + 已加载全是被屏蔽角色时，
          // desktop-moments-feed 的 EmptyState 会永远停在「正在寻找未屏蔽的动态」
          // ——但其实 prefetch useEffect 在 isFetchNextPageError 时就已停摆，
          // 用户永远等不到下一页（toolbar 的 errors[] 有红条提示，但中间大空态
          // 仍误导成"还在加载"）。和 mobile 行 2415 同模板：
          // `hasNextPage && !fetchNextPageError ? "正在寻找..." : "都被屏蔽了"`。
          hasNextPage={
            momentsHasNextPage && !momentsIsFetchNextPageError
          }
          onOpenContacts={() => {
            void navigate({ to: "/tabs/contacts" });
          }}
          ownerAvatar={ownerAvatar}
          ownerId={ownerId}
          ownerUsername={ownerUsername}
          scrollToMomentId={routeSelectedMomentId}
          showCompose={showCompose}
          notice={notice}
          noticeTone={noticeTone}
          noticeActionLabel={noticeActionLabel}
          onNoticeAction={noticeAction}
          text={composeDraft.text}
          videoDraft={composeDraft.videoDraft}
          isMomentFavorite={(momentId) =>
            favoriteSourceIds.includes(`moment-${momentId}`)
          }
          commentReplyTarget={desktopReplyTarget}
          setShowCompose={setShowCompose}
          onCancelCommentReply={() => setDesktopReplyTarget(null)}
          onCommentChange={(momentId, value) =>
            setCommentDrafts((current) => ({
              ...current,
              [momentId]: value,
            }))
          }
          onCommentSubmit={(momentId) => {
            // 新走查 R2：ref 同步锁——同帧 click 第二次会读到 isPending=false
            // （React state 没翻新），直接 mutate 两次 → DB 写 2 条重复评论。
            if (commentInflightRef.current[momentId]) return;
            commentInflightRef.current[momentId] = true;
            commentMutation.mutate(momentId, {
              onSettled: () => {
                delete commentInflightRef.current[momentId];
              },
            });
          }}
          onStartCommentReply={({ momentId, comment }) =>
            setDesktopReplyTarget({
              authorId: comment.authorId,
              authorName: comment.authorName,
              commentId: comment.id,
              postId: momentId,
            })
          }
          onCreate={() =>
            createMutation.mutate({
              // 拍 snapshot 进 variables — 见上方 createMutation 注释。
              text: composeDraft.text,
              imageDrafts: composeDraft.imageDrafts,
              videoDraft: composeDraft.videoDraft,
            })
          }
          onDeleteMoment={(momentId) => {
            // 行内 DesktopMomentRow 已经有 window.confirm；这里直接走 mutation。
            // 走查电脑端朋友圈 R5：deleteMutation.isPending 是 useState 上一次 render
            // 的值，同帧双击两次 onDelete 都看 false → 2 个 DELETE。confirm 是 native
            // dialog 同步阻塞期间 React 不 commit，第二次 confirm OK 时 isPending 仍
            // 是 false。改 momentId 维度的 ref 同步锁，跟 like/comment 同模式 +
            // retry 路径共用同一把锁避免一击落两次 mutation。
            if (deleteInflightRef.current[momentId]) return;
            deleteInflightRef.current[momentId] = true;
            deleteMutation.mutate(momentId, {
              onSettled: () => {
                delete deleteInflightRef.current[momentId];
              },
            });
          }}
          onImageFilesSelected={(files) => {
            void handleImageFilesSelected(files);
          }}
          onLike={(momentId) => {
            // 新走查 R2：同帧 click 同步锁——双击点赞会同时发 2 个 POST /like
            // 把 toggle 多翻一轮，端 cache 看着是回到原状但白白付 2 个 RTT。
            if (likeInflightRef.current[momentId]) return;
            likeInflightRef.current[momentId] = true;
            likeMutation.mutate(momentId, {
              onSettled: () => {
                delete likeInflightRef.current[momentId];
              },
            });
          }}
          onOpenAuthorPopover={({ anchorElement, moment: targetMoment }) => {
            if (targetMoment?.authorType === "character") {
              openDesktopFriendMoments(targetMoment);
              return;
            }
            // 新走查 R2：own user moment 的头像点击之前 silent no-op，DOM 上还是
            // <AvatarChip> 不挂 <button> 包装，用户根本不知道自己头像可不可点。
            // 现在 desktop-moments-feed 已把 user 类型也接到 onSelectAuthor，
            // 这里按 authorType=user + ownerId 匹配 → 打开 owner popover（跟 liker
            // 行点「我自己」走的同款 owner kind，提供入口跳「我的朋友圈」等）。
            if (
              targetMoment?.authorType === "user" &&
              ownerId &&
              targetMoment.authorId === ownerId
            ) {
              setDesktopAvatarPopover({
                anchorElement,
                kind: "owner",
                returnHash: currentRouteHash || undefined,
              });
            }
          }}
          onOpenLikerPopover={({ anchorElement, moment, like }) => {
            // 新一轮 R11：原版用 currentRouteHash（=routeSelectedMomentId 当前值）。
            // 用户在 /tabs/moments 顶部"未深链"状态下滚到第 50 条 moment 看到
            // liker 行，点 liker 头像 → popover 弹出，currentRouteHash 是 ""，
            // 用户从 popover 里点「查看资料 / 朋友圈」跳出去 → 返回 /tabs/moments
            // 时 hash 干净 → 落到顶部，丢掉刚才看到的第 50 条位置。改用当下被
            // 点 liker 所属 moment.id 做 returnHash，desktop-moments-workspace
            // 的 scroll effect 能 snap 回那条。
            const returnHash =
              buildDesktopMomentsRouteHash({ momentId: moment.id }) || undefined;
            if (like.authorType === "character") {
              setDesktopAvatarPopover({
                anchorElement,
                kind: "character",
                characterId: like.authorId,
                fallbackAvatar: like.authorAvatar,
                fallbackName: like.authorName,
                returnHash,
              });
            } else if (like.authorType === "user") {
              setDesktopAvatarPopover({
                anchorElement,
                kind: "owner",
                returnHash,
              });
            }
          }}
          onToggleFavorite={(momentId) => {
            const moment = visibleMoments.find((item) => item.id === momentId);
            if (!moment) {
              return;
            }

            const sourceId = `moment-${moment.id}`;
            const collected = favoriteSourceIds.includes(sourceId);
            const routeHash = buildDesktopMomentsRouteHash({
              momentId: moment.id,
            });
            const nextFavorites = collected
              ? removeDesktopFavorite(sourceId)
              : upsertDesktopFavorite({
                  id: `favorite-${sourceId}`,
                  sourceId,
                  category: "moments",
                  title: moment.authorName,
                  description: getMomentSummaryText(moment),
                  meta: formatTimestamp(moment.postedAt),
                  to: `/tabs/moments${routeHash ? `#${routeHash}` : ""}`,
                  badge: t(msg`朋友圈`),
                  avatarName: moment.authorName,
                  avatarSrc: moment.authorAvatar,
                });

            setFavoriteSourceIds(
              nextFavorites.map((favorite) => favorite.sourceId),
            );
          }}
          refreshPending={refreshPending}
          onRefresh={() => {
            // 桌面手动刷新：只换 page 1，保留 page 2+ 在原位
            // —— 之前一律 resetMomentsToFirstPage() 把已加载的 N 页砍回 1 页 +
            // refetch()，scroll viewport scrollHeight 瞬间从 ~15k → ~1.5k，用户
            // 被甩到列表底，auto-prefetch 再一页一页串行串到 ~7s 才把内容堆回来，
            // 体感"刷新一下整页失踪"。mobile MobileMomentsView.onRefresh 一直
            // 用换 page 1 in-place 的模式，桌面跟齐；momentsData 的 id 去重
            // useMemo 兜底新 page 1 末尾跟旧 page 2 起点的潜在重复。
            //
            // 只有真正"帖子数量变化"路径（createMutation/deleteMutation onSuccess）
            // 还走 resetMomentsToFirstPage —— 那里 invalidate 多页 refetch 会
            // 命中分页边界偏移导致中间漏一条。
            //
            // 新走查 R1：ref 同步锁——之前没有 in-flight guard，CDP 实测 20ms
            // 间隔连点 5 次 = 5 次 GET /api/moments?page=1 + 5 次 GET
            // /api/social/blocked-characters 同时飞出去，公网隧道下用户付 5 个
            // RTT + setQueryData 把整列表重渲 5 次。ref 同步赋值，第一次 click
            // 翻 true 后所有后续 click 立刻早返；state 给按钮一个 disabled
            // 视觉态。
            if (refreshInflightRef.current) return;
            refreshInflightRef.current = true;
            setRefreshPending(true);
            const refreshBaseUrl = baseUrl;
            const key = ["app-moments-paged", refreshBaseUrl];
            // 走查电脑端朋友圈 R2：在「刷新前 auto-prefetch 中途某页失败」时记账。
            // 我们这条 onRefresh 用 setQueryData 在 page 1 in-place 覆盖（避免
            // multi-page refetch 把整列表砍回 1 页带来的视觉抖动），但 react-query
            // 的 isFetchNextPageError 标志仅在新一次 fetchNextPage / refetch 启动时
            // 才被 query.fetch 内部清成 false——setQueryData 完全绕开 Query 实例的
            // fetch 路径，所以 isError 一直挂着。后果：auto-prefetch useEffect 行
            // 250-265 的 gate `!momentsIsFetchNextPageError` 永远 false，链路死锁，
            // 用户读着 errors[] 红条「点击刷新重试」+「已加载 80 / 共 240」却怎么
            // 刷新都填不进剩下那 160 条。
            //
            // 修法：refresh 成功且原来处于 fetchNextPageError 态时主动调一次
            // fetchNextPage()。react-query 在 fetch 开始时把 error / isError 一起
            // 置 null/false，isFetchNextPageError 跟着归零 → useEffect 重跑且能进，
            // 自动续链。失败的话保留新 error 给红条覆盖更新，跟"用户手动重试"语义
            // 一致。snapshot 一次 isFetchNextPageError 拍下 click 那一刻的态，避免
            // 闭包内被 react-query 异步刷掉。
            const shouldRetryPrefetch = momentsIsFetchNextPageError;
            void Promise.all([
              getMomentsPage({ page: 1, limit: 20 }, refreshBaseUrl)
                .then((freshFirstPage) => {
                  queryClient.setQueryData<InfiniteData<MomentsPageResponse>>(
                    key,
                    (current) => {
                      if (!current || current.pages.length === 0) {
                        return { pages: [freshFirstPage], pageParams: [1] };
                      }
                      return {
                        pages: [freshFirstPage, ...current.pages.slice(1)],
                        pageParams: current.pageParams,
                      };
                    },
                  );
                  // 续链：见上方注释。mid-flight 切账户后这里的 momentsFetchNextPage
                  // 闭包仍指着 OLD 账户的 query observer（onRefresh 闭包里的 baseUrl
                  // 就是 OLD），fetchNextPage 写回 OLD 账户的 cache，行为正确——OLD
                  // 账户用户切回去时第一帧就能看到续上的页。fetch 自身失败不再额外
                  // 弹 toast：错误已经会通过新的 isFetchNextPageError 落到 toolbar
                  // errors[] 红条做持久指示，跟 auto-prefetch 失败一致。
                  if (
                    shouldRetryPrefetch &&
                    refreshBaseUrl === mutationBaseUrlRef.current
                  ) {
                    void momentsFetchNextPage();
                  }
                })
                .catch((error: unknown) => {
                  // mid-flight 切账户：A 的刷新失败不该弹到 B 账户的 notice 通道。
                  if (refreshBaseUrl !== mutationBaseUrlRef.current) {
                    return;
                  }
                  // 刷新失败：danger notice 通道（toolbar 已在 Round 1 接好 tone），
                  // 跟 like/comment/delete 失败处理对齐。
                  setNoticeTone("danger");
                  setNoticeActionLabel(null);
                  setNoticeAction(null);
                  setNotice(
                    isApiRequestError(error)
                      ? t(msg`刷新失败：${translateAppErrorCode(error) ?? error.message}`)
                      : error instanceof Error
                        ? t(msg`刷新失败：${error.message}`)
                        : t(msg`刷新失败，请稍后重试。`),
                  );
                }),
              ownerId ? blockedQuery.refetch() : Promise.resolve(null),
            ]).finally(() => {
              refreshInflightRef.current = false;
              setRefreshPending(false);
            });
          }}
          onTextChange={composeDraft.setText}
          onRemoveImage={(id) => composeDraft.removeImageDraft(id)}
          onRemoveVideo={() => composeDraft.clearVideoDraft()}
          onVideoFileSelected={(file) => {
            void handleVideoFileSelected(file);
          }}
        />
        {desktopAvatarPopover ? (
          <Suspense fallback={null}>
            {desktopAvatarPopover.kind === "character" ? (
              <DesktopMessageAvatarPopover
                anchorElement={desktopAvatarPopover.anchorElement}
                kind="character"
                characterId={desktopAvatarPopover.characterId}
                fallbackAvatar={desktopAvatarPopover.fallbackAvatar}
                fallbackName={desktopAvatarPopover.fallbackName}
                navigationContext={{
                  momentsReturnHash: desktopAvatarPopover.returnHash,
                  momentsReturnPath: pathname,
                  profileReturnHash: desktopAvatarPopover.returnHash,
                  profileReturnPath: pathname,
                }}
                onClose={() => setDesktopAvatarPopover(null)}
              />
            ) : (
              <DesktopMessageAvatarPopover
                anchorElement={desktopAvatarPopover.anchorElement}
                kind="owner"
                onClose={() => setDesktopAvatarPopover(null)}
              />
            )}
          </Suspense>
        ) : null}
      </Suspense>
    );
  }

  return (
    <MobileMomentsView
      isDiscoverSubPage={isDiscoverSubPage}
      // baseUrl 透到子里仅用于内部 useEffect 在切账户时清 shareMomentId —— 这块
      // local state 留在 MobileMomentsView，免得 share modal 的开关穿四五层 prop。
      baseUrl={baseUrl}
      ownerId={ownerId}
      ownerAvatar={ownerAvatar}
      ownerUsername={ownerUsername}
      visibleMoments={visibleMoments}
      momentsLoading={momentsQuery.isLoading}
      momentsError={
        momentsQuery.isError && momentsQuery.error instanceof Error
          ? momentsQuery.error
          : null
      }
      pendingCommentMomentId={pendingCommentMomentId}
      // 走查 R1：评论失败时 onError 重开 commentBar、把错误信息送到顶部 notice，
      // 但 bar 全屏 overlay 走 z=1000 把列表里的 notice 整张盖死。跟
      // discover-feed-page R6 一致，把 commentMutation 的错误透传进 bar 内
      // 显示在 textarea 上方；只在 bar 真在当前 mutate 的 moment 上打开时显示——
      // 用户切到别条 moment 的 bar 时显示旧错误反而误导。
      commentErrorForBar={
        // 走查 R4：commentBar 内 textarea 上方错误条 — 之前直拼 server
        // legacyMessage（中文），非 zh-CN locale 用户看到的就是中文。和上方
        // commentMutation.onError 的 translateAppErrorCode 处理同步。
        commentMutation.isError &&
        commentMutation.variables === commentBarTarget?.momentId
          ? isApiRequestError(commentMutation.error)
            ? (translateAppErrorCode(commentMutation.error) ??
              (commentMutation.error instanceof Error
                ? commentMutation.error.message
                : null))
            : commentMutation.error instanceof Error
              ? commentMutation.error.message
              : null
          : null
      }
      notice={notice}
      noticeTone={noticeTone}
      noticeActionLabel={noticeActionLabel}
      noticeAction={noticeAction}
      interactionActionLabel={interactionActionLabel}
      hasReturnPath={Boolean(safeReturnPath)}
      actionBubble={actionBubble}
      commentBarTarget={commentBarTarget}
      commentDrafts={commentDrafts}
      tx={t}
      onBack={() =>
        navigateBackOrFallback(() => {
          if (safeReturnPath) {
            void navigate({
              to: safeReturnPath,
              ...(safeReturnHash ? { hash: safeReturnHash } : {}),
            });
            return;
          }

          void navigate({ to: "/tabs/discover" });
        })
      }
      onCompose={openMobileMomentsPublishPage}
      onAuthorTap={(moment) => {
        if (moment.authorType === "character") {
          openMobileFriendMoments(moment.authorId);
          return;
        }
        // 走查 R1：自己发的 moment 在主朋友圈里 avatar+昵称仍按 link 色
        // (WECHAT_LINK_COLOR) 渲染成可点击按钮，但 onAuthorTap 对
        // authorType==="user" 静默 no-op —— 用户点自己的头像/名字一片死，
        // 跟 onLikeAuthorTap 里"自己点自己 → /profile/moments"语义对齐：
        // 点谁的名字看谁的朋友圈。authorId === ownerId 自检兜底，老
        // multi-owner cache 残留时不至于把自己跳到别人的"我的朋友圈"
        // （/profile/moments 对应 owner 视角，跨 owner 没有意义）。
        if (
          moment.authorType === "user" &&
          ownerId &&
          moment.authorId === ownerId
        ) {
          void navigate({ to: "/profile/moments" });
        }
      }}
      onLikeAuthorTap={(like) => {
        if (like.authorType === "user") {
          // 用户自己点过赞的帖子，赞列表里自己的名字之前 silently no-op，
          // 链接样式又把它渲染成蓝色可点击按钮，看起来像个坏按钮。带到
          // /profile/moments（我的朋友圈），跟点角色名字跳角色资料的语义
          // 对齐——「点谁的名字看谁的朋友圈」。
          void navigate({ to: "/profile/moments" });
          return;
        }
        if (like.authorType === "character") {
          openCharacterDetail(like.authorId);
        }
      }}
      onLikeMoment={(momentId) => {
        // 新走查 R2：同帧 click 同步锁——见 desktop onLike 注释。
        if (likeInflightRef.current[momentId]) return;
        likeInflightRef.current[momentId] = true;
        likeMutation.mutate(momentId, {
          onSettled: () => {
            delete likeInflightRef.current[momentId];
          },
        });
      }}
      onDeleteMoment={(momentId) => {
        // ref guard 必须在 window.confirm 之前 set，否则 confirm 阻塞期间
        // 队列里的第二个 click 拿同一份闭包跑出来时 isPending 仍是旧 false，
        // 会弹第二个 confirm；详见 mobileDeleteInflightRef 注释。
        if (mobileDeleteInflightRef.current) return;
        if (deleteMutation.isPending) return;
        mobileDeleteInflightRef.current = true;
        if (
          typeof window !== "undefined" &&
          !window.confirm(t(msg`确定删除这条朋友圈吗？`))
        ) {
          // 用户取消：清掉 ref 让下次 tap 能再来一次。这里有个边界——
          // 如果 confirm 阻塞期间用户连点了一次（被浏览器排队），cancel 后
          // 队列里的那次会再弹一个 confirm。第二次 confirm 弹出来不会触发
          // 重复 DELETE（用户可以选择 Cancel），算可接受退化；要彻底压掉得
          // 加 setTimeout 排队，会让 confirm 出现有可感的延迟，得不偿失。
          mobileDeleteInflightRef.current = false;
          return;
        }
        deleteMutation.mutate(momentId, {
          onSettled: () => {
            mobileDeleteInflightRef.current = false;
          },
        });
      }}
      onOpenActionMenu={(momentId, anchorRect) =>
        setActionBubble({ momentId, anchorRect })
      }
      onCloseActionMenu={() => setActionBubble(null)}
      onCommentTap={(momentId, comment) =>
        setCommentBarTarget({
          momentId,
          replyTo: comment
            ? {
                authorId: comment.authorId,
                authorName: comment.authorName,
                commentId: comment.id,
              }
            : null,
        })
      }
      onCloseCommentBar={() => setCommentBarTarget(null)}
      onCommentChange={(momentId, value) =>
        setCommentDrafts((current) => ({
          ...current,
          [momentId]: value,
        }))
      }
      onCommentSubmit={(momentId) => {
        // 新走查 R2：同帧 click 同步锁——见 desktop onCommentSubmit 注释。
        if (commentInflightRef.current[momentId]) return;
        commentInflightRef.current[momentId] = true;
        commentMutation.mutate(momentId, {
          onSettled: () => {
            delete commentInflightRef.current[momentId];
          },
        });
      }}
      onRefresh={async () => {
        // 下拉刷新只换头部 page 1，保留已加载的 page 2+：
        // 1) 旧逻辑把 N 页砍回 1 页 → 列表瞬间变短、撑不满视口 → iOS 上滑橡皮筋反弹
        //    + IntersectionObserver 串行一页一页 fetchNextPage 把内容堆回来，体感很慢；
        // 2) 顶部新发布的内容若把老 page 2 起点往下挤，由 momentsData 的 id 去重 useMemo 兜底重复。
        // 钉住触发时刻的 baseUrl —— mid-flight 切账户后 catch 里别把 A 账户的失败
        // 弹成 B 账户的「刷新失败」红条；fetch 本身和 setQueryData 都按 OLD baseUrl
        // 走，这是对的（OLD 账户的 page 1 缓存刷新好，下次切回 A 第一帧就能看到）。
        const refreshBaseUrl = baseUrl;
        const key = ["app-moments-paged", refreshBaseUrl];
        try {
          await Promise.all([
            getMomentsPage({ page: 1, limit: 20 }, refreshBaseUrl).then((freshFirstPage) => {
              queryClient.setQueryData<InfiniteData<MomentsPageResponse>>(
                key,
                (current) => {
                  if (!current || current.pages.length === 0) {
                    return { pages: [freshFirstPage], pageParams: [1] };
                  }
                  return {
                    pages: [freshFirstPage, ...current.pages.slice(1)],
                    pageParams: current.pageParams,
                  };
                },
              );
            }),
            ownerId ? blockedQuery.refetch() : Promise.resolve(null),
          ]);
        } catch (error) {
          if (refreshBaseUrl !== mutationBaseUrlRef.current) {
            // mid-flight 切走：A 的 refresh 失败不该弹到 B 账户的 notice 通道。
            // 跟 like/comment/delete 的 baseUrl-guard 同思路。
            return;
          }
          // 下拉刷新失败之前完全沉默——指示器走完一遍消失，但用户根本不知道
          // 列表没换。冒到 notice 通道 2.4s 自动收，跟点赞/删除失败一致。
          setNoticeTone("danger");
          setNoticeActionLabel(null);
          setNoticeAction(null);
          setNotice(
            // 走查 R2 同其它 mutation onError：i18n locale 一致性。
            isApiRequestError(error)
              ? t(msg`刷新失败：${translateAppErrorCode(error) ?? error.message}`)
              : error instanceof Error
                ? t(msg`刷新失败：${error.message}`)
                : t(msg`刷新失败，请稍后重试。`),
          );
        }
      }}
      hasNextPage={Boolean(momentsQuery.hasNextPage)}
      isFetchingNextPage={momentsQuery.isFetchingNextPage}
      // fetchNextPage 失败时 react-query 不会自动 stop——而 useEffect
      // 里 IntersectionObserver 一看到 isFetchingNextPage 翻 false 就重挂 observer，
      // sentinel 还在视口 → 立刻 onLoadMore → 又 fetchNextPage → 又失败 → 死循环。
      // 上层把 fetchNextPageError 透传下去，sentinel 在错误态下不挂，改在错误条
      // 上挂手动「重试」按钮。
      fetchNextPageError={
        momentsQuery.isFetchNextPageError && momentsQuery.error instanceof Error
          ? momentsQuery.error
          : null
      }
      onLoadMore={() => {
        if (
          momentsQuery.hasNextPage &&
          !momentsQuery.isFetchingNextPage &&
          !momentsQuery.isFetchNextPageError
        ) {
          void momentsQuery.fetchNextPage();
        }
      }}
      onRetryNextPage={() => {
        if (!momentsQuery.isFetchingNextPage) {
          void momentsQuery.fetchNextPage();
        }
      }}
      onRetry={handleRetryLoad}
      onEmptyAction={handleEmptyStateAction}
      onNoticeBack={handleStatusBack}
      hasFilteredOutMoments={hasFilteredOutMoments}
      onOpenContacts={() => {
        void navigate({ to: "/tabs/contacts" });
      }}
    />
  );
}

type MobileMomentsViewProps = {
  isDiscoverSubPage: boolean;
  baseUrl: string | undefined;
  ownerId: string | null;
  ownerAvatar: string | null;
  ownerUsername: string | null;
  visibleMoments: Moment[];
  momentsLoading: boolean;
  momentsError: Error | null;
  pendingCommentMomentId: string | null | undefined;
  commentErrorForBar: string | null;
  notice: string;
  noticeTone: "success" | "info" | "danger";
  noticeActionLabel: string | null;
  noticeAction: (() => void) | null;
  interactionActionLabel: string;
  hasReturnPath: boolean;
  actionBubble: { momentId: string; anchorRect: DOMRect } | null;
  commentBarTarget: {
    momentId: string;
    replyTo: WeChatCommentBarReplyTarget | null;
  } | null;
  commentDrafts: Record<string, string>;
  tx: (descriptor: MessageDescriptor) => string;
  onBack: () => void;
  onCompose: () => void;
  onAuthorTap: (moment: Moment) => void;
  onLikeAuthorTap: (like: MomentLike) => void;
  onLikeMoment: (momentId: string) => void;
  onDeleteMoment: (momentId: string) => void;
  onOpenActionMenu: (momentId: string, anchorRect: DOMRect) => void;
  onCloseActionMenu: () => void;
  onCommentTap: (momentId: string, comment: MomentComment | null) => void;
  onCloseCommentBar: () => void;
  onCommentChange: (momentId: string, value: string) => void;
  onCommentSubmit: (momentId: string) => void;
  onRefresh: () => Promise<unknown>;
  onRetry: () => void;
  onEmptyAction: () => void;
  onNoticeBack: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPageError: Error | null;
  onLoadMore: () => void;
  onRetryNextPage: () => void;
  hasFilteredOutMoments: boolean;
  onOpenContacts: () => void;
};

function MobileMomentsView({
  isDiscoverSubPage,
  baseUrl,
  ownerId,
  ownerAvatar,
  ownerUsername,
  visibleMoments,
  momentsLoading,
  momentsError,
  pendingCommentMomentId,
  commentErrorForBar,
  notice,
  noticeTone,
  noticeActionLabel,
  noticeAction,
  interactionActionLabel,
  hasReturnPath,
  actionBubble,
  commentBarTarget,
  commentDrafts,
  tx,
  onBack,
  onCompose,
  onAuthorTap,
  onLikeAuthorTap,
  onLikeMoment,
  onDeleteMoment,
  onOpenActionMenu,
  onCloseActionMenu,
  onCommentTap,
  onCloseCommentBar,
  onCommentChange,
  onCommentSubmit,
  onRefresh,
  onRetry,
  onEmptyAction,
  onNoticeBack,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPageError,
  onLoadMore,
  onRetryNextPage,
  hasFilteredOutMoments,
  onOpenContacts,
}: MobileMomentsViewProps) {
  const t = tx;
  const { containerRef, state: pullState } = usePullToRefresh({
    onRefresh,
    enabled: true,
  });
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  // onLoadMore caller 是 inline 箭头，每次 parent re-render 都新引用。下面 useEffect
  // 若依赖 onLoadMore，输入评论草稿那种高频 setState（每按一键 parent re-render）
  // 会让 IntersectionObserver 反复 disconnect+reobserve，本来稳定挂着的触底监听
  // 被白白拆装。收到 ref 里读最新值，effect 只跟三态 boolean。
  const onLoadMoreRef = useRef(onLoadMore);
  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  // 触底加载：观察列表底部 sentinel；进入视野且还有下一页 → 自动触发 fetchNextPage。
  // root 必须留 null（document viewport）。原来传 containerRef.current 是错的：
  // 这个 div 上 `flex-1 overflow-y-auto` 没生效（父级 AppPage 不是 flex 容器），
  // 它的 clientHeight 直接撑成 content 全高（≈28k px），IntersectionObserver
  // 一上来就把 sentinel 判成"在视口里"——结果初始挂载就把所有 4 页一次性串行拉完。
  // 真正的滚动容器是 MobileShell 的 absolute inset-0 viewport pane，对应 root=null
  // （document viewport）的判定是正确的。
  useEffect(() => {
    // fetchNextPageError 期间不挂 observer：之前 sentinel 一旦还在视口
    // 就会触发死循环（onLoadMore → fetchNextPage fail → isFetchingNextPage flip false
    // → effect 重挂 observer → 立刻又 fetch）。错误态下改在错误条上挂手动重试按钮。
    if (!hasNextPage || isFetchingNextPage || fetchNextPageError) {
      return;
    }
    const sentinel = loadMoreRef.current;
    if (!sentinel) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onLoadMoreRef.current();
        }
      },
      { rootMargin: "240px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
    // 故意只跟三态 boolean，不跟 onLoadMore——通过 ref 读最新值。
  }, [hasNextPage, isFetchingNextPage, fetchNextPageError]);

  const activeMoment = actionBubble
    ? visibleMoments.find((moment) => moment.id === actionBubble.momentId) ??
      null
    : null;
  const liked = Boolean(
    ownerId &&
      activeMoment?.likes.some((like) => like.authorId === ownerId),
  );
  const ownerName = ownerUsername?.trim() || t(msg`世界主人`);

  // 「分享图卡」目标。点 ⋯ → 「分享」时把当时 actionBubble 的 momentId 存下来，
  // 用 id 而不是整个 moment 对象 — 这样 visibleMoments 后续刷新时预览图也跟着新。
  const [shareMomentId, setShareMomentId] = useState<string | null>(null);
  // 切账户时清 shareMomentId —— 否则在账户 A 开着分享卡片切到 B：B 的 visibleMoments
  // 里找不到 A 的那条 → modal 暂时隐藏；一旦返回 A 重新进朋友圈，shareMoment 又能 find
  // 到，modal 自动重开，体验是「我没点为啥又冒出来」。和上层 actionBubble /
  // commentBarTarget 的 baseUrl-reset 配套。
  useEffect(() => {
    setShareMomentId(null);
  }, [baseUrl]);
  const shareMoment = shareMomentId
    ? visibleMoments.find((moment) => moment.id === shareMomentId) ?? null
    : null;
  const shareLiked = Boolean(
    ownerId &&
      shareMoment?.likes.some((like) => like.authorId === ownerId),
  );

  // Android 硬件 Back：弹层打开时先收弹层（评论条 > 行动菜单 > 分享卡片），
  // 不能直接 history.back() 把朋友圈页退掉。与 publish 页 (fa97a32c)、chat
  // 系列 (38a65fa5 等) 最近的 Back 行为对齐——用户语义是「关弹窗」，
  // 不是「离开页面」。优先级匹配 ESC 习惯：最新打开的先关。
  //
  // 走查第三轮 R1：CDP 实测——commentBar 打开期间在 textarea 连按 30 字，
  // back interceptor add/del 计数同样 30/30。父组件 MomentsPage 把
  // onCloseActionMenu={() => setActionBubble(null)} 等 inline 箭头每次 render
  // 都新引用透下来，effect deps 里挂了俩 handler → commentDrafts 每键 setState
  // 就 unregister + register 一次。和 publish 页 (423e2749) 同模式：用 ref
  // 把最新 handler/状态钉稳，effect 只在 hasOverlay 翻转时跑。
  const backInterceptorRef = useRef({
    commentBarTarget,
    actionBubble,
    shareMomentId,
    onCloseCommentBar,
    onCloseActionMenu,
    setShareMomentId,
  });
  useEffect(() => {
    backInterceptorRef.current = {
      commentBarTarget,
      actionBubble,
      shareMomentId,
      onCloseCommentBar,
      onCloseActionMenu,
      setShareMomentId,
    };
  });
  const hasOverlay = Boolean(
    commentBarTarget || actionBubble || shareMomentId,
  );
  useEffect(() => {
    if (!hasOverlay) return;
    return registerAndroidBackInterceptor((event) => {
      event.preventDefault();
      const ctx = backInterceptorRef.current;
      if (ctx.commentBarTarget) {
        ctx.onCloseCommentBar();
        return true;
      }
      if (ctx.actionBubble) {
        ctx.onCloseActionMenu();
        return true;
      }
      ctx.setShareMomentId(null);
      return true;
    });
  }, [hasOverlay]);

  return (
    <AppPage className="relative space-y-0 bg-white px-0 pb-0 pt-0">
      <TabPageTopBar
        title={t(msg`朋友圈`)}
        titleAlign="center"
        className="mx-0 mb-0 mt-0 border-b border-[#ECECEC] bg-white px-4 pb-1.5 pt-1.5 text-[#1A1A1A] shadow-none"
        leftActions={
          isDiscoverSubPage ? (
            <Button
              onClick={onBack}
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full border-0 bg-transparent text-[#1A1A1A] active:bg-black/[0.05]"
              aria-label={t(msg`返回`)}
            >
              <ArrowLeft size={17} />
            </Button>
          ) : undefined
        }
        rightActions={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full border-0 bg-transparent text-[#1A1A1A] active:bg-black/[0.05]"
            onClick={onCompose}
            aria-label={t(msg`发一条朋友圈`)}
          >
            <Camera size={20} strokeWidth={1.6} />
          </Button>
        }
      />

      <div
        ref={containerRef}
        className="relative flex-1 overflow-y-auto overscroll-contain bg-white"
        style={{ overflowAnchor: "none" }}
      >
        <PullToRefreshIndicator state={pullState} t={t} />

        <div
          style={{
            transform: `translateY(${pullState.offset}px)`,
            transition: pullState.pulling ? "none" : "transform 220ms ease-out",
          }}
        >
          <WeChatMomentsCover
            nickname={ownerName}
            avatarUrl={ownerAvatar}
          />

          {notice ? (
            <div className="px-4 pt-3">
              <MobileMomentsInlineNotice
                tone={noticeTone}
                action={
                  // 只在能产生不同动作的按钮存在时才挂 action 行：
                  // - 有「重试操作」按钮（点赞/删除失败） → 显示
                  // - 有 returnPath（用户从别处过来） → 显示「返回上一页」
                  // 否则（如评论失败 且 没有 returnPath），secondary 「重试读取」
                  // 跟主重试按钮重复 / 跟用户当下操作（commentBar 已重开）无关，
                  // 整行 action 不渲染，避免 toast 里冒一个误导的孤儿按钮。
                  // 失败 toast 现在走 "danger" 红条而非 "info" 蓝条；成功 "success"
                  // 不需要 action 行（朋友圈互动已更新本身就是终态）。
                  noticeTone !== "success" &&
                  ((noticeAction && noticeActionLabel) || hasReturnPath) ? (
                    <div className="flex items-center gap-1.5">
                      {noticeAction && noticeActionLabel ? (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-7 shrink-0 rounded-full border-[#E5E5E5] bg-white px-3 text-[11px]"
                          onClick={noticeAction}
                        >
                          {noticeActionLabel}
                        </Button>
                      ) : null}
                      {hasReturnPath ? (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-7 shrink-0 rounded-full border-[#E5E5E5] bg-white px-3 text-[11px]"
                          onClick={onNoticeBack}
                        >
                          {interactionActionLabel}
                        </Button>
                      ) : null}
                    </div>
                  ) : undefined
                }
              >
                {notice}
              </MobileMomentsInlineNotice>
            </div>
          ) : null}

          {momentsLoading && !visibleMoments.length ? (
            <div className="px-4 pt-10 pb-12 text-center text-[12px] text-[#9A9A9A]">
              {t(msg`正在刷新朋友圈`)}
            </div>
          ) : null}

          {momentsError ? (
            <div className="px-4 pt-10 pb-12 text-center">
              <div className="text-[14px] font-medium text-[#1A1A1A]">
                {t(msg`朋友圈暂时不可用`)}
              </div>
              <div className="mt-2 text-[12px] text-[#9A9A9A]">
                {momentsError.message}
              </div>
              <div className="mt-4 flex justify-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 rounded-full border-[#E5E5E5] bg-white px-3.5 text-[11px]"
                  onClick={onRetry}
                >
                  {t(msg`重试读取`)}
                </Button>
                {hasReturnPath ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 rounded-full border-[#E5E5E5] bg-white px-3.5 text-[11px]"
                    onClick={onNoticeBack}
                  >
                    {t(msg`返回上一页`)}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          {visibleMoments.map((moment, index) => (
            <div
              key={moment.id}
              className={
                index === 0
                  ? "yj-list-item-virtual-card"
                  : "yj-list-item-virtual-card border-t border-[#ECECEC]"
              }
            >
              <WeChatMomentCard
                cardId={`moment-post-${moment.id}`}
                moment={moment}
                ownerId={ownerId}
                liked={
                  Boolean(ownerId) &&
                  moment.likes.some((like) => like.authorId === ownerId)
                }
                onAuthorTap={() => onAuthorTap(moment)}
                onOpenActionMenu={(rect) => onOpenActionMenu(moment.id, rect)}
                onDoubleTapLike={() => onLikeMoment(moment.id)}
                onCommentTap={(comment) => onCommentTap(moment.id, comment)}
                onLikeAuthorTap={onLikeAuthorTap}
                onDelete={
                  ownerId &&
                  moment.authorType === "user" &&
                  moment.authorId === ownerId
                    ? () => onDeleteMoment(moment.id)
                    : undefined
                }
              />
            </div>
          ))}

          {/* like/comment/delete 失败统一冒到顶部 notice（带「重试」+ 2.4s 自动收），
              所以这里不再单独挂一块永驻的底部错误块。 */}

          {/* 触底 sentinel：只要还有下一页就挂，即使 visibleMoments 是空（拉到的整页
              都被 blockedCharacterIds 过滤掉时）也得继续拉，否则会卡在"还很安静"
              空状态——但其实后面还有非屏蔽的动态。"已经到底了" 标签仅在已经有渲染
              内容时才显示，否则空状态卡更直白。 */}
          {hasNextPage ? (
            fetchNextPageError && !isFetchingNextPage ? (
              // fetchNextPage 失败时不挂 sentinel（见 useEffect 注释），改在底部
              // 挂手动「重试」按钮——之前默认 IntersectionObserver 一看到 sentinel
              // 还在视口就死循环重试，整个页面被几百次失败请求刷爆。
              // 用户点重试后 isFetchingNextPage 翻 true，错误条让位给下方的
              // 「正在加载更多…」loading 态，跟成功流的反馈节奏一致。
              <div className="px-4 py-4 text-center">
                <div className="text-[12px] text-[#9A9A9A]">
                  {fetchNextPageError.message
                    ? t(msg`加载更多失败：${fetchNextPageError.message}`)
                    : t(msg`加载更多失败，请稍后重试。`)}
                </div>
                <div className="mt-2 flex justify-center">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-7 rounded-full border-[#E5E5E5] bg-white px-3 text-[11px]"
                    onClick={onRetryNextPage}
                  >
                    {t(msg`重试加载`)}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div
                  ref={loadMoreRef}
                  className="h-1 w-full"
                  aria-hidden="true"
                />
                {/* hasFilteredOutMoments 状态下，下方空态卡片已经显示
                    "正在寻找未屏蔽的动态" 同义文案 + 解释——这里再加
                    "正在加载更多…" 就是两条 loading 叠着重复说同一件事。
                    仅在有可见 moment 时显示这条 sentinel 文案。 */}
                {isFetchingNextPage && !hasFilteredOutMoments ? (
                  <div className="py-4 text-center text-[12px] text-[#9A9A9A]">
                    {t(msg`正在加载更多…`)}
                  </div>
                ) : null}
              </>
            )
          ) : visibleMoments.length > 0 ? (
            <div className="py-4 text-center text-[12px] text-[#C0C0C0]">
              {t(msg`已经到底了`)}
            </div>
          ) : null}

          {!momentsLoading && !momentsError && !visibleMoments.length ? (
            hasFilteredOutMoments ? (
              // 后端给了 N 条 moment 但全是被屏蔽角色——R21 加的「全被屏蔽 → 自动
              // 翻下一页」effect 在 moments-page mobile 这边其实没有显式实现，靠
              // sentinel IntersectionObserver 触底就够自动翻；下面两个分支按"还在
              // 翻"和"翻完了"分开兜文案：
              //   - 还在翻 (isFetchingNextPage || hasNextPage 且没失败)：换成
              //     "正在寻找未屏蔽的动态" loading 文案，让用户知道在等什么；
              //   - 翻完了：用「广场动态都被你屏蔽了」+「打开通讯录」按钮，跟
              //     discover-feed-page 移动端的 MobileFeedStatusCard 同模式
              //     （commit 3b376e47 把"屏蔽=空"的兜底文案对齐）。
              isFetchingNextPage ||
              (hasNextPage && !fetchNextPageError) ? (
                <div className="px-4 pt-12 pb-16 text-center">
                  <div className="text-[14px] font-medium text-[#1A1A1A]">
                    {t(msg`正在寻找未屏蔽的动态`)}
                  </div>
                  <div className="mt-2 text-[12px] text-[#9A9A9A]">
                    {t(msg`当前页加载到的动态作者都在你的屏蔽名单里，正在自动翻下一页找未屏蔽的居民动态。`)}
                  </div>
                </div>
              ) : (
                <div className="px-4 pt-12 pb-16 text-center">
                  <div className="text-[14px] font-medium text-[#1A1A1A]">
                    {t(msg`朋友圈都被你屏蔽了`)}
                  </div>
                  <div className="mt-2 text-[12px] text-[#9A9A9A]">
                    {t(msg`已加载的动态作者全部在你的屏蔽名单里。去通讯录里解除屏蔽，或者等其他居民发布新动态。`)}
                  </div>
                  <div className="mt-4 flex justify-center">
                    <Button
                      variant="primary"
                      size="sm"
                      className="h-8 rounded-full bg-[#07C160] px-3.5 text-[12px] text-white hover:bg-[#06ad56]"
                      onClick={onOpenContacts}
                    >
                      {t(msg`打开通讯录`)}
                    </Button>
                  </div>
                </div>
              )
            ) : !hasNextPage ? (
              <div className="px-4 pt-12 pb-16 text-center">
                <div className="text-[14px] font-medium text-[#1A1A1A]">
                  {t(msg`还很安静`)}
                </div>
                <div className="mt-2 text-[12px] text-[#9A9A9A]">
                  {t(msg`你先发一条动态，或者等世界里的角色们先开口。`)}
                </div>
                <div className="mt-4 flex justify-center">
                  <Button
                    variant="primary"
                    size="sm"
                    className="h-8 rounded-full bg-[#07C160] px-3.5 text-[12px] text-white hover:bg-[#06ad56]"
                    onClick={onEmptyAction}
                  >
                    {hasReturnPath ? t(msg`返回上一页`) : t(msg`发一条朋友圈`)}
                  </Button>
                </div>
              </div>
            ) : null
          ) : null}

          <div className="h-[calc(env(safe-area-inset-bottom,0px)+24px)]" />
        </div>
      </div>

      <WeChatActionBubble
        open={Boolean(actionBubble)}
        anchorRect={actionBubble?.anchorRect ?? null}
        liked={liked}
        onLike={() => {
          if (actionBubble) {
            onLikeMoment(actionBubble.momentId);
          }
        }}
        onComment={() => {
          if (actionBubble) {
            onCommentTap(actionBubble.momentId, null);
          }
        }}
        onShare={() => {
          if (actionBubble) {
            setShareMomentId(actionBubble.momentId);
          }
        }}
        onClose={onCloseActionMenu}
      />

      <MomentShareCardModal
        moment={shareMoment}
        liked={shareLiked}
        ownerId={ownerId}
        ownerDisplayName={ownerName}
        onClose={() => setShareMomentId(null)}
      />

      <WeChatCommentBar
        open={Boolean(commentBarTarget)}
        replyTo={commentBarTarget?.replyTo ?? null}
        value={
          commentBarTarget
            ? commentDrafts[commentBarTarget.momentId] ?? ""
            : ""
        }
        onChange={(value) => {
          if (commentBarTarget) {
            onCommentChange(commentBarTarget.momentId, value);
          }
        }}
        pending={
          commentBarTarget
            ? pendingCommentMomentId === commentBarTarget.momentId
            : false
        }
        errorMessage={commentErrorForBar}
        onSubmit={() => {
          if (commentBarTarget) {
            onCommentSubmit(commentBarTarget.momentId);
          }
        }}
        onClose={onCloseCommentBar}
      />
    </AppPage>
  );
}

function PullToRefreshIndicator({
  state,
  t,
}: {
  state: { offset: number; refreshing: boolean; pulling: boolean };
  t: (descriptor: MessageDescriptor) => string;
}) {
  if (!state.offset && !state.refreshing) return null;
  const label = state.refreshing
    ? t(msg`正在刷新...`)
    : state.offset >= 64
      ? t(msg`松手刷新`)
      : t(msg`下拉刷新`);
  return (
    <div
      className="pointer-events-none absolute left-0 right-0 z-10 flex items-center justify-center text-[12px] text-[#9A9A9A]"
      style={{
        top: 0,
        height: `${state.offset || 60}px`,
        transform: `translateY(-${(state.offset || 60) - state.offset}px)`,
      }}
    >
      <span>{label}</span>
    </div>
  );
}

function MobileMomentsInlineNotice({
  children,
  tone,
  action,
}: {
  children: ReactNode;
  tone: "success" | "info" | "danger";
  action?: ReactNode;
}) {
  return (
    <InlineNotice
      tone={tone}
      className="rounded-[11px] px-2.5 py-1.5 text-[11px] leading-[1.35rem] shadow-none"
    >
      {action ? (
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 flex-1">{children}</span>
          {action}
        </div>
      ) : (
        children
      )}
    </InlineNotice>
  );
}
