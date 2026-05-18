import {
  Suspense,
  lazy,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { msg } from "@lingui/macro";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bookmark,
  EyeOff,
  ImageIcon,
  MessageCircleMore,
  Music2,
  Play,
  Share2,
  ThumbsUp,
  X,
} from "lucide-react";
import {
  SELF_CHARACTER_ID,
  addFeedComment,
  favoriteFeedPost,
  followChannelAuthor,
  generateChannelPost,
  getChannelAuthorProfile,
  getChannelHome,
  getChannelHomeDecorations,
  getFeedPost,
  likeFeedPost,
  likeFeedComment,
  listFeedComments,
  markFeedPostNotInterested,
  replyFeedComment,
  unfavoriteFeedPost,
  unfollowChannelAuthor,
  unlikeFeedPost,
  viewFeedPost,
  type FeedChannelAuthorProfile,
  type FeedChannelHomeResponse,
  type FeedChannelHomeSection,
  type FeedComment,
  type FeedPostListItem,
  type FeedPostWithComments,
} from "@yinjie/contracts";
import { AppPage, Button, cn, InlineNotice } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { ChannelsForwardPicker } from "../components/channels-forward-picker";
import { resolveAppMediaUrl } from "../lib/media-url";
import { ExpandableText } from "../components/expandable-text";
import { RouteRedirectState } from "../components/route-redirect-state";
import { stripToolCallSyntax } from "../features/moments/moment-content";
import {
  buildDesktopChannelsRouteHash,
  parseDesktopChannelsRouteHash,
} from "../features/channels/channels-route-state";
import { getChannelsSectionBadge } from "../features/channels/channels-section-badge";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import {
  readDesktopFavorites,
  removeDesktopFavorite,
  restoreDesktopFavorite,
  upsertDesktopFavorite,
} from "../features/favorites/favorites-storage";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { formatTimestamp } from "../lib/format";
import { isDesktopOnlyPath, navigateBackOrFallback } from "../lib/history-back";
import { normalizePathname } from "../lib/normalize-pathname";
import { registerAndroidBackInterceptor } from "../runtime/android-back-button";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

const EMPTY_CHANNEL_POSTS: FeedPostListItem[] = [];
const EMPTY_COMMENT_PREVIEW: FeedComment[] = [];
const CHANNELS_PAGE_LIMIT = 20;
const DesktopChannelsWorkspace = lazy(async () => {
  const mod =
    await import("../features/desktop/channels/desktop-channels-workspace");
  return { default: mod.DesktopChannelsWorkspace };
});

type FeedCommentReplyTarget = {
  authorId: string;
  authorName: string;
  commentId: string;
  postId: string;
};

export function ChannelsPage() {
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
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const normalizedPathname = normalizePathname(pathname);
  const routeState = useMemo(() => parseDesktopChannelsRouteHash(hash), [hash]);
  const normalizedDesktopReturnPath =
    isDesktopLayout && routeState.returnPath === "/discover/channels"
      ? "/tabs/channels"
      : routeState.returnPath;
  const isDesktopChannelsRoute =
    normalizedPathname === "/tabs/channels" ||
    normalizedPathname === "/channels" ||
    normalizedPathname === "/discover/channels";
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  const safeReturnPath =
    normalizedDesktopReturnPath &&
    !isDesktopOnlyPath(normalizedDesktopReturnPath)
      ? normalizedDesktopReturnPath
      : undefined;
  const safeReturnHash = safeReturnPath ? routeState.returnHash : undefined;
  const routeSelectedPostId = routeState.postId;
  const routeSelectedAuthorId = routeState.authorId;
  const [activeSection, setActiveSection] =
    useState<FeedChannelHomeSection>(routeState.section ?? "recommended");
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>(
    {},
  );
  const [desktopSelectedPostId, setDesktopSelectedPostId] = useState<
    string | null
  >(routeSelectedPostId);
  const [mobileCommentSheetPostId, setMobileCommentSheetPostId] = useState<
    string | null
  >(null);
  const [mobileReplyTarget, setMobileReplyTarget] =
    useState<FeedCommentReplyTarget | null>(null);
  const [desktopReplyTarget, setDesktopReplyTarget] =
    useState<FeedCommentReplyTarget | null>(null);
  // 走查 2026-05-18 新会话 R3：抽屉 open 状态上提到 channels-page，让
  // desktopCommentsQuery 只在抽屉打开时 enable。之前 query 跟着 desktop
  // SelectedPostId 走 — 每滑过一张 slide 都 fetch 一次 comments，公网隧道
  // 200-500ms RTT × N slide 全打水漂（90% slide 用户根本不点 chat 图标）。
  // workspace 通过 onDrawerOpenChange prop 回调 setter，本地 state 只用于
  // workspace 内部抽屉显隐。
  const [desktopCommentDrawerPostId, setDesktopCommentDrawerPostId] = useState<
    string | null
  >(null);
  const [notice, setNotice] = useState("");
  // 走查 2026-05-18 新会话 R6（本轮）：原 tone 只允许 "success" | "info"，
  // 但下面 InlineNotice 的 role 判断（"danger" || "warning" → role=alert）
  // 在 TypeScript 上是死分支永不命中，typecheck 报 TS2367。结果所有失败 toast
  // （点赞失败 / 收藏失败 / 关注失败 / 评论失败 / 转发失败 / 减少推荐失败 / 换
  // 一批失败 / 评论点赞失败）一律 setNoticeTone("info")，role 落 "status"
  // = aria-live=polite，SR 用户的当前播报不会被打断，"点完赞 200-500ms 后才
  // 听到失败" 的体感（典型场景：公网隧道弱网时点赞 → 用户继续往下滚 → 失败
  // toast 冒出来但 SR 因 polite 排队后才播 → 用户已经离开这条 post），失败感
  // 知严重延迟。把 tone 联合类型扩到包含 "danger" / "warning"，并把所有
  // "...失败" / 阻塞类约束（如「需先加为好友才能互动」）显式分流：
  //   - "...失败" 类（mutation onError）→ "danger" → role=alert（assertive）
  //   - 阻塞约束（ensureCanInteract）→ "warning" → role=alert
  //   - 中性信息（生成无内容 / 已在直播流中）→ "info" → role=status
  //   - 成功反馈 → "success" → role=status
  // InlineNotice 已经支持这 4 个 tone 的视觉变体（packages/ui/src/components/
  // inline-notice.tsx），无需改基础组件。
  const [noticeTone, setNoticeTone] = useState<
    "success" | "info" | "danger" | "warning"
  >("success");
  const [noticeActionLabel, setNoticeActionLabel] = useState<string | null>(
    null,
  );
  const [noticeAction, setNoticeAction] = useState<(() => void) | null>(null);
  // 视频号转发面板：null = 关闭，非空 = 当前要转发的 post 摘要
  const [forwardPickerPost, setForwardPickerPost] = useState<{
    id: string;
    excerpt: string;
  } | null>(null);
  const previousBaseUrlRef = useRef(baseUrl);
  // 走查 2026-05-18 新会话 R1：跟 moments-page R3 同款 mid-flight 切账户守卫。
  // react-query v5 useMutation 完成时走的 onSuccess/onError 是当前 render 的闭包
  // —— 公网隧道慢网下用户在 A 账户点完赞 / 评论 / 收藏 / 关注 / 不感兴趣 /
  // 评论赞 / 换一批 后 RTT 200-500ms 没回 → 顶栏切 B 账户 → callback 跑回来
  // 时闭包 baseUrl 已是 B：
  //   - setNotice("视频号互动已更新")/"已收藏"/"已关注"等成功 toast 跑到 B，
  //     体感「我在 B 啥都没动怎么冒成功 toast」；
  //   - invalidateQueries({queryKey:[...home, baseUrl=B]}) 把 B 账户的 home/
  //     decorations/feed-comments cache 标 stale → 触发 B 的不必要 refetch；
  //     该被 invalidate 的 A 反而漏掉，A 那条 home 一直是乐观状态（点赞 ＋1）
  //     直到下次回 A 进入 channels 主动 refetch。
  // 模板：onMutate 把当时 baseUrl 钉进 context.mutationBaseUrl；onSuccess/
  // onError 比对 mutationBaseUrlRef.current 早返用户可见 toast，invalidate 改
  // 走 mutationBaseUrl（确保落 A 的 cache）。cache 写位置（setQueryData / 回
  // 滚 previousEntries 里的 key）已经是 onMutate 时点闭包的旧 baseUrl，正确。
  const mutationBaseUrlRef = useRef(baseUrl);
  useEffect(() => {
    mutationBaseUrlRef.current = baseUrl;
  }, [baseUrl]);

  // 走查 2026-05-18 新会话（本轮 R1）：state↔URL 双向 sync 防 ping-pong loop —
  // URL-sync effect 真正 navigate 之前把 desktopSelectedPostId 钉到这条 ref，
  // 下面 Effect on [baseUrl, routeSelectedPostId] 通过这条 ref 识别「URL 这帧
  // 的变化是我自己写出去的」，跳过反向 setDesktopSelectedPostId，避免值 swap
  // 死循环。详见下面 routeSelectedPostId effect 里的长注释。
  const urlSelfSyncEchoPostIdRef = useRef<string | null | undefined>(undefined);

  // 走查 2026-05-18 新会话（本轮 R4）：like / favorite / follow 三个 toggle 按
  // 钮的 pending 锁靠 useMutation.isPending → React state，下一次 render 才生
  // 效。同帧（<16ms）内连点 5 次 like 在 React state commit 前都过了，5 条
  // POST 全飞出去（网络 + cache 乐观更新 5 倍）。跟 chat-details
  // saveToContactsSubmittingRef / muteSubmittingRef 一套：再叠一层 sync ref
  // 锁挡同帧 double-tap，mutation settled 后 useEffect [isPending] 复位。
  const desktopLikeSubmittingRef = useRef(false);
  const desktopFavoriteSubmittingRef = useRef(false);
  const desktopFollowSubmittingRef = useRef(false);
  // R6 续：「换一批」按钮（generateMutation）同款 — 同帧 3 次点击触发 3 条
  // POST /channels/generate（实测）。一次生成 ~3-5 秒 LPP 端口，重复触发把队列
  // 撑爆。同一套 ref + useEffect [isPending] 复位。
  const desktopGenerateSubmittingRef = useRef(false);
  // 走查 2026-05-18 新会话 R5（本轮）：评论卡上的「赞」按钮（desktop drawer +
  // mobile sheet 共用同一条 likeCommentMutation）一直漏 sync ref，跟同文件 R4
  // 修过的 like/favorite/follow/generate 四个 toggle 同款 race：disabled=
  // {pendingLikeCommentId === comment.id} 靠 likeCommentMutation.isPending →
  // React state 下一次 render 才回 true。yuanzui0728 库里堆 142 条评论的那条
  // post，drawer 打开后键鼠双击或触摸双击「赞 0 → 已赞 1」同帧 <16ms 内进 2
  // 个 click handler，两次 mutate({commentId, postId}) 同步入栈，onMutate 各
  // 自把 cache likeCount +1（看到「已赞 2」），两条 POST 都飞出去；服务端
  // likeOwnerComment 对 already-liked 是 no-op（不会真叠 2 分）但仍走完
  // build avatar context + DB findOne + Promise.all，再被回滚一次。+1 RTT 在
  // 公网隧道下 ~200-500ms 浪费，再叠 onSettled invalidate 多刷一次 home
  // decorations。补 sync ref 锁 — 同帧第二次 click 直接早返。
  const commentLikeSubmittingRef = useRef(false);

  const channelsQuery = useQuery({
    queryKey: ["app-channels-home", baseUrl, activeSection],
    queryFn: () =>
      getChannelHome(baseUrl, {
        section: activeSection,
        limit: CHANNELS_PAGE_LIMIT,
      }),
    // 走查 2026-05-18 新一轮 R1：默认 staleTime=0 → 推荐/朋友/关注/直播 任何
    // tab 切换都会让新挂载的 queryKey 立即被判 stale，react-query 先返
    // 缓存数据再触发 background refetch；用户来回切「推荐 → 朋友 → 推荐」
    // 3 次每次回到推荐都会重发一次 home + decorations（公网隧道 ~35KB/请求 +
    // 200-500ms RTT × 2 个并行接口），完全是浪费。实测 4 次 tab 切换 + 返回
    // recommended 共 5 次 home 请求、5 次 decorations，半数是 cache-hit 路径。
    // 30s 内 tab 来回切复用缓存：足够覆盖用户在 4 个 tab 之间犹豫 / 比对的
    // 典型行为；30s 后该刷新（generate 队列产新内容 / AI 新评论）。任何
    // mutation 仍然 invalidate 绕过 staleTime 立即重拉，新数据不会卡。
    staleTime: 30_000,
  });
  // 装饰位（tab 计数 + 评论预览）走第二个并行请求，不卡首屏列表/首播。
  // 拆分理由见 api/src/modules/feed/feed.service.ts getChannelHomeDecorations。
  const decorationsQuery = useQuery({
    queryKey: ["app-channels-home-decorations", baseUrl, activeSection],
    queryFn: () =>
      getChannelHomeDecorations(baseUrl, {
        section: activeSection,
        limit: CHANNELS_PAGE_LIMIT,
      }),
    // 同 channelsQuery：tab 切换不重发，30s 后才视为 stale。decorations 包含
    // sections.count（4 个 tab 数字）+ authors（推荐作者位）+ liveEntries +
    // commentsPreviewByPostId（卡底最近评论），单接口 ~10KB；每次 tab 切换
    // 都不缓存对公网公网隧道用户影响 40-60% 的总流量。
    staleTime: 30_000,
  });
  const commentsPreviewByPostId =
    decorationsQuery.data?.commentsPreviewByPostId;
  const getCommentsPreview = useCallback(
    (postId: string): FeedComment[] =>
      // 走查 R2（本轮）：兜底用 EMPTY_COMMENT_PREVIEW 而不是每次 `?? []` 新建
      // literal——前者会让 placeholderData / commentsPreview prop 在 decorations
      // 没回来前每帧都换 array identity，触发 MobileChannelsCard 的 React.memo
      // shallow 比较打回 false，"卡片完全 memo 化"那条优化白做。
      commentsPreviewByPostId?.[postId] ?? EMPTY_COMMENT_PREVIEW,
    [commentsPreviewByPostId],
  );

  // 点赞改成 toggle：原来只 POST /like、不调 DELETE，但 aria-label 和
  // 实心 ThumbsUp 都暗示用户可以"取消点赞"。后端早就支持 unlike，UI 没接。
  // 现在 input 带 hasLiked，按需走 like / unlike，optimistic 也按 toggle 翻。
  //
  // 失败回滚 per-post 而不是整缓存：用户连点 A→B 两条 like，A 失败的时候
  // 不能 setQueryData(整张老快照)，否则会把 B 的乐观更新一起抹掉。只把 A 这条
  // 的 likeCount/hasLiked 恢复成"被点之前那条"，其他 post 用当前缓存。
  const likeMutation = useMutation({
    mutationFn: (input: { postId: string; hasLiked: boolean }) =>
      input.hasLiked
        ? unlikeFeedPost(input.postId, baseUrl)
        : likeFeedPost(input.postId, baseUrl),
    onMutate: async (input) => {
      await Promise.all([
        queryClient.cancelQueries({
          queryKey: ["app-channels-home", baseUrl],
        }),
        // 走查 2026-05-18 新会话 R2（本轮）：desktop 用户走 deep-link 进一条不
        // 在 home 推荐流的 post，post 是 desktopMissingRoutePostQuery 单独拉回
        // 来 prepend 到 desktopWorkspacePosts 的 ——
        // ["app-feed-post", baseUrl, postId] 单独缓存。原来 likeMutation
        // onMutate 只 cancel + setQueryData app-channels-home，那条 deep-link
        // post 的 cache 完全没动 → 用户在那条 slide 上点 like，optimistic 落不
        // 到 UI（slide 一直显示旧 hasLiked），mutation 成功后 setNotice 冒「视
        // 频号互动已更新」绿条但 ❤️ 图标没填充，体感「点了没生效」。
        queryClient.cancelQueries({
          queryKey: ["app-feed-post", baseUrl, input.postId],
        }),
      ]);
      const previousEntries: Array<{
        key: readonly unknown[];
        previousPost: FeedPostListItem | null;
      }> = [];
      const snapshots = queryClient.getQueriesData<FeedChannelHomeResponse>({
        queryKey: ["app-channels-home", baseUrl],
      });
      snapshots.forEach(([key, data]) => {
        if (!data?.posts) {
          return;
        }
        const previousPost =
          data.posts.find((post) => post.id === input.postId) ?? null;
        previousEntries.push({ key, previousPost });
        queryClient.setQueryData<FeedChannelHomeResponse>(key, {
          ...data,
          posts: data.posts.map((post) =>
            post.id === input.postId
              ? {
                  ...post,
                  likeCount: input.hasLiked
                    ? Math.max(0, post.likeCount - 1)
                    : post.likeCount + 1,
                  ownerState: {
                    ...(post.ownerState ?? {
                      hasLiked: false,
                      hasFavorited: false,
                      isFollowingAuthor: false,
                      isNotInterested: false,
                      hasViewed: false,
                      hasShared: false,
                      lastViewedAt: null,
                      watchProgressSeconds: null,
                      completed: false,
                    }),
                    hasLiked: !input.hasLiked,
                  },
                }
              : post,
          ),
        });
      });
      // 走查 2026-05-18 新会话 R2（续）：把同款 optimistic 也落到 app-feed-post
      // 那条 cache 上，desktopWorkspacePosts useMemo 会因 routePost 数据变化重
      // 算、把更新后的 routePost 喂回去 → slide 上的 like 状态翻对。
      const previousRoutePost =
        queryClient.getQueryData<FeedPostWithComments>([
          "app-feed-post",
          baseUrl,
          input.postId,
        ]) ?? null;
      if (previousRoutePost) {
        queryClient.setQueryData<FeedPostWithComments>(
          ["app-feed-post", baseUrl, input.postId],
          {
            ...previousRoutePost,
            likeCount: input.hasLiked
              ? Math.max(0, previousRoutePost.likeCount - 1)
              : previousRoutePost.likeCount + 1,
            ownerState: {
              ...(previousRoutePost.ownerState ?? {
                hasLiked: false,
                hasFavorited: false,
                isFollowingAuthor: false,
                isNotInterested: false,
                hasViewed: false,
                hasShared: false,
                lastViewedAt: null,
                watchProgressSeconds: null,
                completed: false,
              }),
              hasLiked: !input.hasLiked,
            },
          },
        );
      }
      return { previousEntries, previousRoutePost, mutationBaseUrl: baseUrl };
    },
    onError: (error, input, context) => {
      // 只回滚被点的这条 post——拿当前缓存（已经包含后来的乐观更新）做底，
      // 仅把 input.postId 还原成失败前那条。previousEntries 里的 key 已经
      // 是 onMutate 时点闭包的旧 baseUrl（A 账户），rollback 落 A 的 cache 正确。
      context?.previousEntries.forEach(({ key, previousPost }) => {
        const current =
          queryClient.getQueryData<FeedChannelHomeResponse>(key);
        if (!current?.posts) return;
        queryClient.setQueryData<FeedChannelHomeResponse>(key, {
          ...current,
          posts: current.posts.map((post) =>
            post.id === input.postId ? (previousPost ?? post) : post,
          ),
        });
      });
      // R2 续：route post cache 同步回滚到失败前的 likeCount/hasLiked。
      if (context?.previousRoutePost && context.mutationBaseUrl) {
        queryClient.setQueryData<FeedPostWithComments>(
          ["app-feed-post", context.mutationBaseUrl, input.postId],
          context.previousRoutePost,
        );
      }
      // mid-flight 切账户：这条点赞失败属于上一个账户，新账户不该冒红条。
      if (context && context.mutationBaseUrl !== mutationBaseUrlRef.current) {
        return;
      }
      // 失败时给一行 danger 通知；不要把单条点赞失败升级成"视频号暂时不可
      // 用"大状态卡——home 列表其实还能用。tone=danger → 下方 InlineNotice
      // role=alert / aria-live=assertive，让 SR 用户立刻知道失败（详见 L153
      // R6 注释）。
      setNoticeTone("danger");
      setNoticeActionLabel(null);
      setNoticeAction(null);
      setNotice(
        error instanceof Error
          ? t(msg`点赞失败：${error.message}`)
          : t(msg`点赞失败，请稍后重试。`),
      );
    },
    onSuccess: (_data, _input, context) => {
      // mid-flight 切账户：成功 toast 落到新账户没意义。
      if (context && context.mutationBaseUrl !== mutationBaseUrlRef.current) {
        return;
      }
      setNoticeTone("success");
      setNoticeActionLabel(null);
      setNoticeAction(null);
      setNotice(t(msg`视频号互动已更新。`));
      // 点赞 toggle 是 boolean，optimistic 已经切对 hasLiked/likeCount。
      // 完全省掉 invalidate，避免视频号首页全量 + media 条件请求 RTT。
    },
  });

  const commentMutation = useMutation({
    mutationFn: (input: {
      postId: string;
      replyTarget?: {
        authorId: string;
        authorName: string;
        commentId: string;
        postId: string;
      } | null;
      text: string;
    }) => {
      const text = input.text.trim();
      if (!text) {
        throw new Error(t(msg`请先输入评论内容。`));
      }

      if (input.replyTarget) {
        return replyFeedComment(
          input.replyTarget.commentId,
          {
            text,
          },
          baseUrl,
        );
      }

      return addFeedComment(
        input.postId,
        {
          text,
        },
        baseUrl,
      );
    },
    // 走查 新一轮 R5：原来 commentCount 要等 invalidate → refetch home 一圈
    // 才更新，公网隧道 200-500ms 内卡片上「N 评论」的小角标 / 评论 sheet 头
    // 「N 条」都不动，用户已经看到「评论已发送」notice 了却要继续等数字才跳，
    // 体感是「发送了吗？」。这里 per-post 乐观 +1，跟 like/favorite 一样：
    // - onMutate：snapshot 当前 commentCount，cache 里 +1；
    // - onError：只回滚被改的那条 post 的 commentCount（per-post 避免冲掉
    //   并发 like / favorite 的乐观），其它 post 沿用当前 cache；
    //
    // 走查 2026-05-18 新一轮 R4：原注释说「mutationFn 自带 text.trim() 校验，
    // 空草稿直接 throw、根本不会进 onMutate，所以不用预判空文本」——但
    // react-query v5 中 onMutate 在 mutationFn 之前执行，空草稿会先走完整段
    // optimistic +1，然后 mutationFn 抛错 → onError 回滚。中间这一帧用户看到
    // commentCount 闪一下 +1 又跌回去，体感「我没敲东西怎么 count 闪了」。
    // 实际路径中送按钮 disabled={!draft.trim()} 拦住了正常路径，但键盘提交 /
    // 自动化 / future 别的入口可能绕过。早返让 onMutate 不做 cache 改动，
    // mutationFn 仍会抛错走 onError 显示 toast。
    onMutate: async (input) => {
      if (!input.text.trim()) {
        return {
          previousEntries: [],
          previousRoutePost: null,
          mutationBaseUrl: baseUrl,
        };
      }
      // 走查 2026-05-18 新会话 R4（本轮）：跟 likeMutation R2 / favoriteMutation
      // R3 同款 —— desktop 深链 post 走 app-feed-post cache，commentMutation 也
      // 漏更新 commentCount 落不到那条 slide 的「N 条评论」小角标，用户在 deep-
      // link post 上发评论后看到 setNotice「评论已发送」但右栏角标数字不动 +
      // drawer 头部「评论 N」也不变，体感「发了吗？」。
      //
      // 走查 2026-05-18 新会话 R6（本轮）：app-feed-comments 也得 cancel —— R2
      // 把 onSuccess 改成直接 setQueryData push 新评论代替 invalidate 全量
      // refetch，但如果用户在 drawer 刚开（initial listFeedComments fetch 在飞
      // ~RTT）就立刻打字 Enter（input 已 auto-focus，公网 200-500ms RTT 内来
      // 得及），mutationFn 可能比 initial fetch 先回，onSuccess push 之后
      // initial fetch 才落地 → tanstack-query 用旧 list 覆盖掉刚 push 的新评论
      // → 用户在 drawer 看不到自己刚发的（commentCount +1 但列表里没那条），
      // 体感「评论丢了」。cancel 掉 initial fetch 避免覆盖；onSuccess 的 push
      // 改成「没 cache 就创建 [createdComment]」让 cache 不为 undefined（同样
      // 配 enabled=true 的情况下 tanstack 不会立刻 re-trigger 一个新 fetch 把
      // 旧 list 又拉回来）。
      await Promise.all([
        queryClient.cancelQueries({
          queryKey: ["app-channels-home", baseUrl],
        }),
        queryClient.cancelQueries({
          queryKey: ["app-feed-post", baseUrl, input.postId],
        }),
        queryClient.cancelQueries({
          queryKey: ["app-feed-comments", baseUrl, input.postId],
        }),
      ]);
      const previousEntries: Array<{
        key: readonly unknown[];
        previousPost: FeedPostListItem | null;
      }> = [];
      const snapshots = queryClient.getQueriesData<FeedChannelHomeResponse>({
        queryKey: ["app-channels-home", baseUrl],
      });
      snapshots.forEach(([key, data]) => {
        if (!data?.posts) return;
        const previousPost =
          data.posts.find((post) => post.id === input.postId) ?? null;
        previousEntries.push({ key, previousPost });
        queryClient.setQueryData<FeedChannelHomeResponse>(key, {
          ...data,
          posts: data.posts.map((post) =>
            post.id === input.postId
              ? { ...post, commentCount: post.commentCount + 1 }
              : post,
          ),
        });
      });
      const previousRoutePost =
        queryClient.getQueryData<FeedPostWithComments>([
          "app-feed-post",
          baseUrl,
          input.postId,
        ]) ?? null;
      if (previousRoutePost) {
        queryClient.setQueryData<FeedPostWithComments>(
          ["app-feed-post", baseUrl, input.postId],
          {
            ...previousRoutePost,
            commentCount: previousRoutePost.commentCount + 1,
          },
        );
      }
      return {
        previousEntries,
        previousRoutePost,
        mutationBaseUrl: baseUrl,
      };
    },
    onSuccess: (createdComment, input, context) => {
      const mutationBaseUrl = context?.mutationBaseUrl ?? baseUrl;
      // mid-flight 切账户：清 draft / reply target / notice 都不该跑到新账户。
      // 但 decorations / feed-comments invalidate 仍要落原账户（A），让用户回 A
      // 时新评论能正确反映。
      const sameAccount = mutationBaseUrl === mutationBaseUrlRef.current;
      if (sameAccount) {
        // 走查 R1：原来无条件把 commentDrafts[postId] 清空——但 textarea 在 mutation
        // 飞行期没 disabled，用户提交完会接着打下一条评论。RTT 落地时 onSuccess 把
        // 「正在打的下一条」也一起抹掉，用户辛苦敲的内容凭空消失。只在当前草稿仍
        // 等于刚发出去的文本（用户没继续输入）时才清空；否则保留草稿。
        const sentText = input.text;
        setCommentDrafts((current) => {
          if ((current[input.postId] ?? "") !== sentText) {
            return current;
          }
          return { ...current, [input.postId]: "" };
        });
        // 走查 R3：原来只按 postId 抹 replyTarget——但用户提交回复 A 后还没
        // 收到 RTT 就先按了评论 B 的「回复」按钮，replyTarget 已经被替换成 B；
        // mutation 落地把 current.postId === input.postId 当真，把刚换上的 B 也
        // 一起清掉，用户的「我下一步要回 B」意图丢失。改成「sent target 跟当前
        // target 完全相同」才清；用户已经切到别的评论 / 退回到顶层评论时不动。
        // input.replyTarget 为 null（顶层评论）时，原 replyTarget 必为 null
        // （顶层评论提交不会经过 setMobileReplyTarget），不需要再做事。
        const sentTarget = input.replyTarget ?? null;
        setMobileReplyTarget((current) => {
          if (!current || !sentTarget) return current;
          if (
            current.postId === sentTarget.postId &&
            current.commentId === sentTarget.commentId
          ) {
            return null;
          }
          return current;
        });
        setDesktopReplyTarget((current) => {
          if (!current || !sentTarget) return current;
          if (
            current.postId === sentTarget.postId &&
            current.commentId === sentTarget.commentId
          ) {
            return null;
          }
          return current;
        });
        setNoticeTone("success");
        setNoticeActionLabel(null);
        setNoticeAction(null);
        setNotice(
          input.replyTarget
            ? t(msg`视频号回复已发送。`)
            : t(msg`视频号评论已发送。`),
        );
      }
      // fire-and-forget：await 会让"发送"按钮一直 disabled。
      // 走查 R1（本轮）：原来连 home 也一起 invalidate，注释说要"刷 commentCount"——
      // 但 commentCount 已经在 onMutate 里 per-post +1 乐观更新过了，server 那一
      // 端真值也就是 +1，refetch 回来跟本地一致没差。home 一次 refetch ~35KB
      // (7 张 audio post 序列化 + ownerState/avatarContext 全跑一遍) + ~2-5 RTT 跨
      // 公网隧道；like 那条 onSuccess 早已注明「optimistic 已对应、完全省掉 invalidate」
      // 同样适用这里。decorations 仍然需要——commentsPreview 卡底"最近评论"要把
      // 刚发的这条加进去；feed-comments 当然要 invalidate（评论 sheet 当前打开列表）。
      // 同步去掉 home invalidate，省掉每次评论附带的全量重拉。
      // 走查 2026-05-18 新会话 R1：invalidate 落 mutationBaseUrl 而非闭包 baseUrl ——
      // 切账户后 baseUrl 是 B，但这条评论是 A 的，标 B 的 cache stale 触发 B
      // 不必要的 refetch + A 的 cache 永远不刷新。
      //
      // 走查 2026-05-18 新会话 R2（本轮）：原来无脑 invalidate app-feed-comments
      // 触发 listFeedComments 全量 refetch (server 拿 MAX_FEED_COMMENT_FETCH_LIMIT
      // ~100 条 → 全部 serialize + reply-author-map + likedCommentIds → ~10-30KB
      // JSON，公网隧道 RTT 200-500ms)，但 addFeedComment / replyFeedComment 本身
      // 就返了 createdComment 对象。yuanzui0728 那条积了 142 条评论的 post 上发
      // 评论：用户按发送 → toast "评论已发送" → commentCount +1 → drawer 列表却
      // 卡 200-500ms 才显示新评论（refetch 完成那一刻才 append），体感「评论卡
      // 住没渲」+「我刚发的去哪了」。直接 setQueryData 把 createdComment 推到
      // 缓存末尾（server 按 createdAt ASC，新评论必为最新一条），drawer 那条
      // auto-scroll-on-growth effect 立刻把视口落到底部显示新评论 —— 0 RTT 完成
      // 「发送 → 看到」闭环。同款思路下 decorations 仍走 invalidate（commentsPreview
      // 那里要重算 top-3 + replyAuthorNameMap，不便就地手算）。
      // R6: cache 为 undefined 说明 drawer initial fetch 已被上面 cancelQueries
      // 砍掉（或者根本没 fetch 过）—— 此时不要 push 单条 list（会让用户在
      // drawer 里"只看到自己刚发的一条评论"，丢失 142 条历史），让下方
      // invalidate 触发 fresh refetch 拿全量（新评论已落库会一并回来）。
      // cache 有数组的常规路径才 push（覆盖上面 R2 主诉求：drawer 已开稳定
      // 一段时间，cache 完整，直接 push 省掉全量 refetch）。
      const existingCommentsCache = queryClient.getQueryData<FeedComment[]>([
        "app-feed-comments",
        mutationBaseUrl,
        input.postId,
      ]);
      if (existingCommentsCache && existingCommentsCache.length > 0) {
        queryClient.setQueryData<FeedComment[]>(
          ["app-feed-comments", mutationBaseUrl, input.postId],
          (current) => {
            if (!current) return current;
            // 防重：万一 server 返回同 id 的评论（极罕见的 retry / race），先去掉再 push。
            const dedup = current.filter((c) => c.id !== createdComment.id);
            return [...dedup, createdComment];
          },
        );
      } else {
        // 初始 fetch 还没回（被 cancel）/ 从未 fetch 过：让 invalidate 触发
        // fresh refetch 拿全量。server 端新评论已落库，refetch 必带回。
        void queryClient.invalidateQueries({
          queryKey: ["app-feed-comments", mutationBaseUrl, input.postId],
        });
      }
      void queryClient.invalidateQueries({
        queryKey: ["app-channels-home-decorations", mutationBaseUrl],
      });
    },
    // 走查 R7: 失败兜底。原来没 onError，错误只通过 mobileCommentSheetErrorMessage
    // 在 sheet 里显示——但用户在提交完后立刻关 sheet（提交按钮不阻挡关闭 X），
    // mutation 还在飞，最终失败时 sheet 已经关了，红条没人看到。用户以为"发送
    // 成功"了，因为既没 success notice 也没 error notice。这里加 page 级 notice
    // 兜底，info tone，2.4s 自动消失（同 like/favorite 的失败提示样式）。
    onError: (error, input, context) => {
      // 走查 新一轮 R5：回滚 commentCount 乐观更新。per-post 维度——
      // 别整张 setQueryData 老快照，否则会冲掉这期间发生的 like / favorite /
      // not-interested 乐观更新（同 likeCommentMutation R4 修复同款问题）。
      context?.previousEntries.forEach(({ key, previousPost }) => {
        const current =
          queryClient.getQueryData<FeedChannelHomeResponse>(key);
        if (!current?.posts) return;
        queryClient.setQueryData<FeedChannelHomeResponse>(key, {
          ...current,
          posts: current.posts.map((post) =>
            post.id === input.postId ? (previousPost ?? post) : post,
          ),
        });
      });
      // R4 续：route post cache 同步回滚 commentCount。
      if (context?.previousRoutePost && context.mutationBaseUrl) {
        queryClient.setQueryData<FeedPostWithComments>(
          ["app-feed-post", context.mutationBaseUrl, input.postId],
          context.previousRoutePost,
        );
      }
      // mid-flight 切账户：失败 toast 落到新账户没意义。
      if (context && context.mutationBaseUrl !== mutationBaseUrlRef.current) {
        return;
      }
      // R6: 失败 toast → danger（详见 L153 注释）。
      setNoticeTone("danger");
      setNoticeActionLabel(null);
      setNoticeAction(null);
      const fallback = input.replyTarget
        ? t(msg`视频号回复发送失败，请稍后重试。`)
        : t(msg`视频号评论发送失败，请稍后重试。`);
      setNotice(error instanceof Error ? `${fallback} (${error.message})` : fallback);
    },
  });
  const generateMutation = useMutation({
    mutationFn: () => generateChannelPost(baseUrl),
    onMutate: () => {
      // 走查 2026-05-18 新会话 R1：mid-flight 守卫 — 用户在 A 账户点「换一批」，
      // 生成 ~3-5s 期间切到 B 账户：onSuccess 跑回时闭包 baseUrl 已是 B，「新
      // 视频号正在生成中」notice + invalidate B 的 home 都跑到 B，B 用户莫名
      // 看见"正在生成"以为自己刚点了什么；invalidate B 的 home 也会触发 B 的
      // 不必要 refetch。改成 onMutate 钉住 mutationBaseUrl，onSuccess 比对 ref
      // 早返 notice + invalidate 落 A。
      return { mutationBaseUrl: baseUrl };
    },
    onSuccess: async (data, _input, context) => {
      const mutationBaseUrl = context?.mutationBaseUrl ?? baseUrl;
      const sameAccount = mutationBaseUrl === mutationBaseUrlRef.current;
      if (sameAccount) {
        setNoticeActionLabel(null);
        setNoticeAction(null);
        if (!data) {
          // 后端跳过生成（MiniMax key 未配 / 视频额度今日用完 / 没有可发帖的角色）
          // 时统一返回 null。原来文案是"额度今日已用完, 明天再试"，但 key 未配 /
          // 没有可发帖的角色 时根本不是额度问题，"明天再试"会误导用户白等一天。
          // 改成中性"现在没法生成"，不锁死重试时间。
          setNoticeTone("info");
          setNotice(t(msg`现在没法生成新内容，稍后再试看看。`));
          return;
        }
        setNoticeTone("success");
        // 后端只是把 draft 写进 DB + 异步排队 MiniMax 出视频，要等 callback
        // 才会落到 publishStatus='published'。home 这次 refetch 通常看不到。
        // 把文案从 "已生成" 改成 "正在生成"，对齐真实状态。
        setNotice(t(msg`新视频号正在生成中，几分钟后刷新看看。`));
      }
      // invalidate 仍要落 A 账户 — generate 失败返 null 时也应该至少试一次
      // refetch（其它账户的 user/会话可能改了 home），但仅 data 非 null 才必要。
      if (data) {
        await queryClient.invalidateQueries({
          queryKey: ["app-channels-home", mutationBaseUrl],
        });
      }
    },
    onError: (err, _input, context) => {
      // mid-flight 切账户：失败 toast 不冒到新账户。
      if (context && context.mutationBaseUrl !== mutationBaseUrlRef.current) {
        return;
      }
      // 网络/服务端错误不要冒到顶层的 errorMessage——那会让整个 home
      // 切到 "视频号暂时不可用" 状态卡，但实际推荐流仍然能拉到。改成
      // 轻量通知（不全屏），2.4s 自动消失；R6: tone=danger 走 role=alert。
      setNoticeActionLabel(null);
      setNoticeAction(null);
      setNoticeTone("danger");
      setNotice(
        err instanceof Error
          ? t(msg`换一批失败：${err.message}`)
          : t(msg`换一批失败，请稍后重试。`),
      );
    },
  });
  const favoriteMutation = useMutation({
    mutationFn: (input: { postId: string; favorited: boolean }) =>
      input.favorited
        ? unfavoriteFeedPost(input.postId, baseUrl)
        : favoriteFeedPost(input.postId, baseUrl),
    // optimistic：和点赞 / 关注的处理同一套路。本地 favorites 入口（toggleFavorite
    // 里调的 upsertDesktopFavorite）原来已经立刻反映，但 slide 上的收藏按钮要等
    // home 重拉才翻状态，看着像是"按钮没响应"。
    onMutate: async (input) => {
      // 走查 2026-05-18 新会话 R3（本轮）：跟 likeMutation R2 同款 ——
      // desktop 深链 post 的 app-feed-post cache 没被 optimistic 翻，slide 上
      // 的收藏按钮不响应。补 cancel + setQueryData。
      await Promise.all([
        queryClient.cancelQueries({
          queryKey: ["app-channels-home", baseUrl],
        }),
        queryClient.cancelQueries({
          queryKey: ["app-feed-post", baseUrl, input.postId],
        }),
      ]);
      // 同 likeMutation：失败回滚 per-post，避免并发 mutate 互相覆盖。
      const previousEntries: Array<{
        key: readonly unknown[];
        previousPost: FeedPostListItem | null;
      }> = [];
      const snapshots = queryClient.getQueriesData<FeedChannelHomeResponse>({
        queryKey: ["app-channels-home", baseUrl],
      });
      snapshots.forEach(([key, data]) => {
        if (!data?.posts) return;
        const previousPost =
          data.posts.find((post) => post.id === input.postId) ?? null;
        previousEntries.push({ key, previousPost });
        queryClient.setQueryData<FeedChannelHomeResponse>(key, {
          ...data,
          posts: data.posts.map((post) =>
            post.id === input.postId
              ? {
                  ...post,
                  favoriteCount: input.favorited
                    ? Math.max(0, post.favoriteCount - 1)
                    : post.favoriteCount + 1,
                  ownerState: {
                    ...(post.ownerState ?? {
                      hasLiked: false,
                      hasFavorited: false,
                      isFollowingAuthor: false,
                      isNotInterested: false,
                      hasViewed: false,
                      hasShared: false,
                      lastViewedAt: null,
                      watchProgressSeconds: null,
                      completed: false,
                    }),
                    hasFavorited: !input.favorited,
                  },
                }
              : post,
          ),
        });
      });
      // 走查 2026-05-18 新会话 R3：route post cache 同步 optimistic。
      const previousRoutePost =
        queryClient.getQueryData<FeedPostWithComments>([
          "app-feed-post",
          baseUrl,
          input.postId,
        ]) ?? null;
      if (previousRoutePost) {
        queryClient.setQueryData<FeedPostWithComments>(
          ["app-feed-post", baseUrl, input.postId],
          {
            ...previousRoutePost,
            favoriteCount: input.favorited
              ? Math.max(0, previousRoutePost.favoriteCount - 1)
              : previousRoutePost.favoriteCount + 1,
            ownerState: {
              ...(previousRoutePost.ownerState ?? {
                hasLiked: false,
                hasFavorited: false,
                isFollowingAuthor: false,
                isNotInterested: false,
                hasViewed: false,
                hasShared: false,
                lastViewedAt: null,
                watchProgressSeconds: null,
                completed: false,
              }),
              hasFavorited: !input.favorited,
            },
          },
        );
      }
      return { previousEntries, previousRoutePost, mutationBaseUrl: baseUrl };
    },
    onError: (error, input, context) => {
      context?.previousEntries.forEach(({ key, previousPost }) => {
        const current =
          queryClient.getQueryData<FeedChannelHomeResponse>(key);
        if (!current?.posts) return;
        queryClient.setQueryData<FeedChannelHomeResponse>(key, {
          ...current,
          posts: current.posts.map((post) =>
            post.id === input.postId ? (previousPost ?? post) : post,
          ),
        });
      });
      // R3 续：route post cache 同步回滚。
      if (context?.previousRoutePost && context.mutationBaseUrl) {
        queryClient.setQueryData<FeedPostWithComments>(
          ["app-feed-post", context.mutationBaseUrl, input.postId],
          context.previousRoutePost,
        );
      }
      // mid-flight 切账户：失败 toast 不冒到新账户。
      if (context && context.mutationBaseUrl !== mutationBaseUrlRef.current) {
        return;
      }
      // R6: 失败 toast → danger（详见 L153 注释）。
      setNoticeTone("danger");
      setNoticeActionLabel(null);
      setNoticeAction(null);
      setNotice(
        error instanceof Error
          ? t(msg`收藏失败：${error.message}`)
          : t(msg`收藏失败，请稍后重试。`),
      );
    },
    onSuccess: (_, input, context) => {
      // mid-flight 切账户：成功 toast 不冒到新账户。
      if (context && context.mutationBaseUrl !== mutationBaseUrlRef.current) {
        return;
      }
      setNoticeTone("success");
      setNoticeActionLabel(null);
      setNoticeAction(null);
      setNotice(
        input.favorited
          ? t(msg`已取消收藏。`)
          : t(msg`已收藏这条视频号内容。`),
      );
      // 走查 R1（本轮）：原来 onSuccess 还 await invalidate home —— 但 favoriteCount
      // 在 mobile / desktop 都没有任何 UI 入口显示（grep 全工程只有 channels-page
      // 自己的 optimistic update 在读写它），收藏 toggle 真正可见的是 ownerState
      // .hasFavorited（按钮态）+ 本地 desktop-favorites localStorage（收藏列表入口），
      // 两者都已经在 onMutate / toggleFavorite 里同步过。home 一次 refetch ~35KB +
      // 公网隧道 RTT 完全打水漂；like 那条 onSuccess 早已注明「optimistic 已对应、
      // 完全省掉 invalidate」同款逻辑搬过来。
    },
  });
  const followMutation = useMutation({
    mutationFn: (input: { authorId: string; following: boolean }) =>
      input.following
        ? unfollowChannelAuthor(input.authorId, baseUrl)
        : followChannelAuthor(input.authorId, baseUrl),
    // optimistic：在关注 tab 上点 "已关注" → 应该立刻看到按钮翻成 +关注 状态。
    // 没有这层，关注 tab 上要等 invalidate → 重拉 home → 重渲，按钮在 300+ms
    // 里都还停在 "已关注"，比 点赞 慢得多。把同作者所有 post 的 ownerState
    // 一起翻——既覆盖 关注 tab，也覆盖 推荐 / 朋友 tab 上同一作者的 post。
    onMutate: async (input) => {
      await Promise.all([
        queryClient.cancelQueries({
          queryKey: ["app-channels-home", baseUrl],
        }),
        // 走查 2026-05-18 新会话 R3：原来只 cancel home，但 desktop 的作者
        // overlay 上「+关注」按钮直接读 app-channel-author cache 里的 profile
        // .isFollowing —— 不在这条 onMutate 的 optimistic 范围里。改完 onMutate
        // 跟着加 cancel + optimistic flip 后，author cache 也要先 cancel 避免
        // 飞行中的 refetch 把刚翻好的 optimistic 状态覆盖回旧值。
        queryClient.cancelQueries({
          queryKey: ["app-channel-author", baseUrl, input.authorId],
        }),
        // 走查 2026-05-18 新会话 R5（本轮）：跟 R2/R3/R4 同款 —— follow 也要
        // 把 desktop 深链 post 的 app-feed-post cache 翻 isFollowingAuthor。
        // 不然用户在 deep-link post 的 slide 上点「+关注」：home 没那条 post，
        // 翻不动，slide 上「+关注」按钮永远停在原状态。
        // 注意 follow 是 per-author 的，但 app-feed-post cache 是 per-post 的，
        // 同一作者下没在 home 缓存的所有 deep-link post 都得翻。不过实际同时
        // 缓存的 deep-link post 通常只有 1 条（用户当前查看的那条），扫一遍
        // ["app-feed-post", baseUrl] 命名空间下所有 cache 找匹配 authorId 即可。
        queryClient.cancelQueries({
          queryKey: ["app-feed-post", baseUrl],
        }),
      ]);
      // 同 likeMutation：per-author 记录失败前的所有相关 post，回滚也只动这些。
      const previousEntries: Array<{
        key: readonly unknown[];
        previousPosts: Map<string, FeedPostListItem>;
      }> = [];
      const snapshots = queryClient.getQueriesData<FeedChannelHomeResponse>({
        queryKey: ["app-channels-home", baseUrl],
      });
      snapshots.forEach(([key, data]) => {
        if (!data?.posts) return;
        const previousPosts = new Map<string, FeedPostListItem>();
        data.posts.forEach((post) => {
          if (post.authorId === input.authorId) {
            previousPosts.set(post.id, post);
          }
        });
        previousEntries.push({ key, previousPosts });
        queryClient.setQueryData<FeedChannelHomeResponse>(key, {
          ...data,
          posts: data.posts.map((post) =>
            post.authorId === input.authorId
              ? {
                  ...post,
                  ownerState: {
                    ...(post.ownerState ?? {
                      hasLiked: false,
                      hasFavorited: false,
                      isFollowingAuthor: false,
                      isNotInterested: false,
                      hasViewed: false,
                      hasShared: false,
                      lastViewedAt: null,
                      watchProgressSeconds: null,
                      completed: false,
                    }),
                    isFollowingAuthor: !input.following,
                  },
                }
              : post,
          ),
        });
      });
      // 走查 2026-05-18 新会话 R3：原来 followMutation 完全不动 app-channel-
      // author cache —— 用户在 desktop 作者 overlay 点 +关注：
      //   1) optimistic 翻 home cache 里同作者所有 post 的 isFollowingAuthor=true
      //      → slide 上「+关注」按钮立刻翻"已关注"
      //   2) followPending 设为 authorId，overlay 按钮 disabled+"处理中..."
      //   3) mutation 成功，followPending 清空
      //   4) overlay 按钮恢复读 profile.isFollowing —— cache 完全没动，仍然
      //      是 false → 按钮翻回 "+关注"，用户体感「点了没生效」
      //   5) 用户再点 → 同一条 mutation 又跑一次（POST follow 是 idempotent
      //      的所以不会破数据，但白白多 2-5 RTT 公网隧道 + 跟服务器对话两次
      //      只是为了证明已经关注过的事；commentCount/followerCount UI 也跟
      //      着按钮闪烁）
      // 同步给 author cache 做 optimistic：isFollowing 翻 + followerCount±1，
      // 跟 home cache 同款 per-author 行为。previousProfile 留存给 onError 回滚。
      const previousProfile =
        queryClient.getQueryData<FeedChannelAuthorProfile>([
          "app-channel-author",
          baseUrl,
          input.authorId,
        ]);
      if (previousProfile) {
        queryClient.setQueryData<FeedChannelAuthorProfile>(
          ["app-channel-author", baseUrl, input.authorId],
          {
            ...previousProfile,
            isFollowing: !input.following,
            followerCount: Math.max(
              0,
              previousProfile.followerCount + (input.following ? -1 : 1),
            ),
          },
        );
      }
      // R5 续：扫 app-feed-post 命名空间下所有缓存的 post（通常只有当前 deep-
      // link 那 1 条），匹配作者的把 isFollowingAuthor 翻。
      const routePostSnapshots = queryClient.getQueriesData<FeedPostWithComments>({
        queryKey: ["app-feed-post", baseUrl],
      });
      const previousRoutePosts: Array<{
        key: readonly unknown[];
        previousRoutePost: FeedPostWithComments;
      }> = [];
      routePostSnapshots.forEach(([key, data]) => {
        if (!data || data.authorId !== input.authorId) return;
        previousRoutePosts.push({ key, previousRoutePost: data });
        queryClient.setQueryData<FeedPostWithComments>(key, {
          ...data,
          ownerState: {
            ...(data.ownerState ?? {
              hasLiked: false,
              hasFavorited: false,
              isFollowingAuthor: false,
              isNotInterested: false,
              hasViewed: false,
              hasShared: false,
              lastViewedAt: null,
              watchProgressSeconds: null,
              completed: false,
            }),
            isFollowingAuthor: !input.following,
          },
        });
      });
      return {
        previousEntries,
        previousProfile,
        previousRoutePosts,
        mutationBaseUrl: baseUrl,
      };
    },
    onError: (error, input, context) => {
      context?.previousEntries.forEach(({ key, previousPosts }) => {
        const current =
          queryClient.getQueryData<FeedChannelHomeResponse>(key);
        if (!current?.posts) return;
        queryClient.setQueryData<FeedChannelHomeResponse>(key, {
          ...current,
          posts: current.posts.map((post) =>
            post.authorId === input.authorId
              ? (previousPosts.get(post.id) ?? post)
              : post,
          ),
        });
      });
      // 走查 2026-05-18 新会话 R3：author cache 也回滚。取当前 cache 做底
      // —— 用户在 follow 飞行期间可能已经把 overlay 关掉、再打开 / 重新拉
      // refetch，cache 已经是 server 真值；硬覆盖回 previousProfile 反而把
      // 服务器返的新数据冲掉。只在仍是同一 cache identity 时还原 isFollowing
      // / followerCount 两个 mutation 改过的字段。
      if (context?.previousProfile) {
        const currentProfile =
          queryClient.getQueryData<FeedChannelAuthorProfile>([
            "app-channel-author",
            context.mutationBaseUrl,
            input.authorId,
          ]);
        if (currentProfile) {
          queryClient.setQueryData<FeedChannelAuthorProfile>(
            ["app-channel-author", context.mutationBaseUrl, input.authorId],
            {
              ...currentProfile,
              isFollowing: context.previousProfile.isFollowing,
              followerCount: context.previousProfile.followerCount,
            },
          );
        }
      }
      // R5 续：route post cache 同步回滚 isFollowingAuthor。同 likeMutation 的
      // per-post 回滚思路：取当前 cache 做底再还原被改的字段，不硬覆盖整个对
      // 象 —— 飞行期间用户可能已经在那条 deep-link post 上 like/favorite，
      // 整对象回滚会把这些一起冲掉。
      context?.previousRoutePosts?.forEach(({ key, previousRoutePost }) => {
        const current = queryClient.getQueryData<FeedPostWithComments>(key);
        if (!current) return;
        queryClient.setQueryData<FeedPostWithComments>(key, {
          ...current,
          ownerState: {
            ...(current.ownerState ?? {
              hasLiked: false,
              hasFavorited: false,
              isFollowingAuthor: false,
              isNotInterested: false,
              hasViewed: false,
              hasShared: false,
              lastViewedAt: null,
              watchProgressSeconds: null,
              completed: false,
            }),
            isFollowingAuthor:
              previousRoutePost.ownerState?.isFollowingAuthor ?? false,
          },
        });
      });
      // mid-flight 切账户：失败 toast 不冒到新账户。
      if (context && context.mutationBaseUrl !== mutationBaseUrlRef.current) {
        return;
      }
      // R6: 失败 toast → danger（详见 L153 注释）。
      setNoticeTone("danger");
      setNoticeActionLabel(null);
      setNoticeAction(null);
      setNotice(
        error instanceof Error
          ? t(msg`关注失败：${error.message}`)
          : t(msg`关注失败，请稍后重试。`),
      );
    },
    onSuccess: async (_, input, context) => {
      const mutationBaseUrl = context?.mutationBaseUrl ?? baseUrl;
      const sameAccount = mutationBaseUrl === mutationBaseUrlRef.current;
      if (sameAccount) {
        setNoticeTone("success");
        setNoticeActionLabel(null);
        setNoticeAction(null);
        setNotice(
          input.following
            ? t(msg`已取消关注。`)
            : t(msg`已关注该视频号作者。`),
        );
      }
      // invalidate 落 mutationBaseUrl（A 账户）—— 标 B 的 cache stale 是错的：
      // 这次 follow 是给 A 加的，B 该 follow 列表完全不动；且 invalidate B 还
      // 会触发 B 不必要的 refetch。
      //
      // 走查 2026-05-18 新会话 R7（本轮）：active 'recommended' tab 的 home
      // posts 已经被 onMutate 里 ownerState.isFollowingAuthor 乐观翻好，refetch
      // ~35KB JSON 重拉一遍只为拿同样的 isFollowingAuthor=true，纯浪费。但
      // inactive 'following' / 'friends' tab 的 cache 必须标 stale —— 否则用户
      // 关注 X 后切到「关注」tab，30s staleTime 内还看不到 X 的 post。用
      // refetchType: 'none' 砍掉所有 section 的 active refetch，但仍把全部
      // section 的 cache 标 stale，下次切 tab 自动 fresh refetch。
      // decorations 不能 'none'：sections.count 在头部 4 个 tab badge 是当前
      // 'recommended' active query 的衍生数据，关注 X 后「关注 tab 计数 0→1」
      // 必须立即可见，否则用户看到「关注 (0)」会怀疑「我刚才关注成功了吗」。
      await queryClient.invalidateQueries({
        queryKey: ["app-channels-home", mutationBaseUrl],
        refetchType: "none",
      });
      await queryClient.invalidateQueries({
        queryKey: ["app-channels-home-decorations", mutationBaseUrl],
      });
      // 走查 2026-05-18 新会话 R3：author profile cache 也 invalidate ——
      // optimistic 已经把 isFollowing / followerCount 翻过来了，server 真值
      // 兜底一次防止极端情况下 drift（譬如别处也改了 followerCount）。
      await queryClient.invalidateQueries({
        queryKey: ["app-channel-author", mutationBaseUrl, input.authorId],
      });
    },
  });
  const notInterestedMutation = useMutation({
    mutationFn: (postId: string) => markFeedPostNotInterested(postId, baseUrl),
    // 减少推荐：optimistic 把这条 post 从可见列表里抠掉。
    // 没有这层，点完后要等 invalidate → 重拉 home (~150-400ms) 才消失，期间用户
    // 还会盯着自己说"不感兴趣"的卡，可能再来一下导致重复请求。
    onMutate: async (postId) => {
      await queryClient.cancelQueries({
        queryKey: ["app-channels-home", baseUrl],
      });
      // 走查 2026-05-18 R1：原来 onError 直接 setQueryData(key, previousData) 把
      // 整张 home 还原，但用户「减少推荐」A 之后立刻可能滑到 B 点赞 / 关注，
      // 这些都在 home cache 上做了 per-post 乐观更新；A 失败时整张 snapshot 覆盖
      // 回去会把 B 的乐观（likeCount/+1、isFollowingAuthor 翻转、收藏、评论 +1
      // 等）一起抹掉，B 那条要么靠下一次刷新才补回真值、要么 like 的 onSuccess
      // 早已注明"不 invalidate"永远停在错值。改成 per-post 维度：只记录被删的
      // 那一条 + 它的原始下标，onError 时把它按原位置塞回当前 cache，其它 post
      // 沿用现有 cache（含期间发生的其它乐观更新）。
      const previousEntries: Array<{
        key: readonly unknown[];
        removedPost: FeedPostListItem | null;
        removedIndex: number;
      }> = [];
      const snapshots = queryClient.getQueriesData<FeedChannelHomeResponse>({
        queryKey: ["app-channels-home", baseUrl],
      });
      snapshots.forEach(([key, data]) => {
        if (!data?.posts) return;
        const removedIndex = data.posts.findIndex((post) => post.id === postId);
        const removedPost = removedIndex >= 0 ? data.posts[removedIndex] : null;
        previousEntries.push({ key, removedPost, removedIndex });
        queryClient.setQueryData<FeedChannelHomeResponse>(key, {
          ...data,
          posts: data.posts.filter((post) => post.id !== postId),
        });
      });
      return { previousEntries, mutationBaseUrl: baseUrl };
    },
    onError: (error, postId, context) => {
      // per-post 回滚：取当前 cache 做底，把删除前那一条按原下标 splice 回去，
      // 不动同期发生的其它乐观更新。removedPost 为 null 表示原本就不在 cache
      // 里（snapshot 取到时 home 还没数据），无需还原。
      context?.previousEntries.forEach(({ key, removedPost, removedIndex }) => {
        if (!removedPost) return;
        const current =
          queryClient.getQueryData<FeedChannelHomeResponse>(key);
        if (!current?.posts) return;
        // 若 cache 期间因为别的乐观/refetch 已经把这条 post 又加回来了（极端
        // 情况），跳过，避免重复塞。
        if (current.posts.some((post) => post.id === postId)) return;
        const nextPosts = current.posts.slice();
        const insertAt = Math.min(removedIndex, nextPosts.length);
        nextPosts.splice(insertAt, 0, removedPost);
        queryClient.setQueryData<FeedChannelHomeResponse>(key, {
          ...current,
          posts: nextPosts,
        });
      });
      // mid-flight 切账户：失败 toast 不冒到新账户。
      if (context && context.mutationBaseUrl !== mutationBaseUrlRef.current) {
        return;
      }
      // R6: 失败 toast → danger（详见 L153 注释）。
      setNoticeTone("danger");
      setNoticeActionLabel(null);
      setNoticeAction(null);
      setNotice(
        error instanceof Error
          ? t(msg`减少推荐失败：${error.message}`)
          : t(msg`减少推荐失败，请稍后重试。`),
      );
    },
    onSuccess: async (_data, _postId, context) => {
      const mutationBaseUrl = context?.mutationBaseUrl ?? baseUrl;
      const sameAccount = mutationBaseUrl === mutationBaseUrlRef.current;
      if (sameAccount) {
        setNoticeTone("success");
        setNoticeActionLabel(null);
        setNoticeAction(null);
        setNotice(t(msg`这类内容会减少推荐。`));
      }
      // invalidate 落 mutationBaseUrl — 标 B 的 cache stale 完全错（hidePost
      // 只动 A 的 home），且 B 会做不必要的 refetch。
      //
      // 走查 2026-05-18 新会话 R8（本轮）：active 'recommended' tab 已经被
      // onMutate 里 posts.filter 抠掉了这条 post，refetch 重拉一遍只为拿同样
      // 的"少了这条"列表，纯浪费 ~35KB JSON。但 inactive 'friends' / 'following'
      // / 'live' tab cache 必须标 stale —— 用户「减少推荐」的可能是某位朋友
      // 的 post，朋友 tab 的 cache 还含这条，下次切过去会看到，体感「我刚说
      // 不感兴趣怎么还在」。用 refetchType: 'none' 砍掉所有 section 的 active
      // refetch，标 stale 让下次切 tab 自动 fresh refetch。
      // decorations 不能 'none'：sections.count 在头部 4 个 tab badge 是 active
      // query 衍生数据，「不感兴趣」一条朋友帖后「朋友 tab 计数 5→4」必须立
      // 即可见。
      await queryClient.invalidateQueries({
        queryKey: ["app-channels-home", mutationBaseUrl],
        refetchType: "none",
      });
      await queryClient.invalidateQueries({
        queryKey: ["app-channels-home-decorations", mutationBaseUrl],
      });
    },
  });
  const likeCommentMutation = useMutation({
    mutationFn: (input: { commentId: string; postId: string }) =>
      likeFeedComment(input.commentId, baseUrl),
    // optimistic：评论点赞 RTT ~200ms 期间按钮一直显示「处理中」，count 也不动，
    // 公网下点完一秒钟才看到点赞数 +1，体感像点了没生效。后端 likeOwnerComment
    // 对已 liked 是 no-op，没有 unlike 路径，所以 toggle 永远只往 +1 走，
    // optimistic 安全。
    // 缓存两处都翻：
    //   - app-feed-comments：评论面板里整条 list
    //   - app-channels-home-decorations.commentsPreviewByPostId：home 卡底"最近评论"
    onMutate: async (input) => {
      await Promise.all([
        queryClient.cancelQueries({
          queryKey: ["app-feed-comments", baseUrl, input.postId],
        }),
        queryClient.cancelQueries({
          queryKey: ["app-channels-home-decorations", baseUrl],
        }),
      ]);

      const previousFullComments = queryClient.getQueryData<FeedComment[]>([
        "app-feed-comments",
        baseUrl,
        input.postId,
      ]);
      const previousDecorationsEntries = queryClient.getQueriesData<{
        commentsPreviewByPostId?: Record<string, FeedComment[]>;
      }>({
        queryKey: ["app-channels-home-decorations", baseUrl],
      });

      const flipComment = (c: FeedComment): FeedComment =>
        c.id === input.commentId && !c.likedByOwner
          ? {
              ...c,
              likedByOwner: true,
              likeCount: c.likeCount + 1,
            }
          : c;

      if (previousFullComments) {
        queryClient.setQueryData<FeedComment[]>(
          ["app-feed-comments", baseUrl, input.postId],
          previousFullComments.map(flipComment),
        );
      }
      previousDecorationsEntries.forEach(([key, data]) => {
        if (!data?.commentsPreviewByPostId) return;
        const preview = data.commentsPreviewByPostId[input.postId];
        if (!preview) return;
        queryClient.setQueryData(key, {
          ...data,
          commentsPreviewByPostId: {
            ...data.commentsPreviewByPostId,
            [input.postId]: preview.map(flipComment),
          },
        });
      });

      return {
        previousFullComments,
        previousDecorationsEntries,
        mutationBaseUrl: baseUrl,
      };
    },
    onError: (error, input, context) => {
      const mutationBaseUrl = context?.mutationBaseUrl ?? baseUrl;
      // 走查 R4：原回滚把 previousFullComments 整体 setQueryData 回去——
      // 但用户连点 A → B 两条评论的点赞，B 的 onMutate 在 A 之后已经把 B 也
      // 翻成 liked；如果 A 失败时直接整张快照覆盖回去，B 的 optimistic 翻动
      // 也被一起抹掉，下一帧 invalidate 才补回 B 的真值，中间用户会看到 B
      // 突然变回未赞又再变回已赞，体感像"我又被打回去了"。改成只回滚当前 input
      // 这一条评论，其它评论按当前 cache（含后续乐观更新）继续保留。
      //
      // 走查 2026-05-18 新会话 R1：cache key 落 mutationBaseUrl，确保回滚是
      // 改的"评论当初点赞那个账户的 cache"，不是切到的新账户。
      if (context) {
        const previousFullComment = context.previousFullComments?.find(
          (c) => c.id === input.commentId,
        );
        queryClient.setQueryData<FeedComment[]>(
          ["app-feed-comments", mutationBaseUrl, input.postId],
          (current) => {
            if (!current) return current;
            return current.map((c) =>
              c.id === input.commentId ? (previousFullComment ?? c) : c,
            );
          },
        );
        context.previousDecorationsEntries.forEach(([key, prevData]) => {
          if (prevData === undefined) return;
          const previousPreviewComment = prevData.commentsPreviewByPostId?.[
            input.postId
          ]?.find((c) => c.id === input.commentId);
          queryClient.setQueryData<{
            commentsPreviewByPostId?: Record<string, FeedComment[]>;
          }>(key, (current) => {
            if (!current?.commentsPreviewByPostId) return current;
            const preview = current.commentsPreviewByPostId[input.postId];
            if (!preview) return current;
            return {
              ...current,
              commentsPreviewByPostId: {
                ...current.commentsPreviewByPostId,
                [input.postId]: preview.map((c) =>
                  c.id === input.commentId
                    ? (previousPreviewComment ?? c)
                    : c,
                ),
              },
            };
          });
        });
      }
      // mid-flight 切账户：失败 toast 不冒到新账户。
      if (context && context.mutationBaseUrl !== mutationBaseUrlRef.current) {
        return;
      }
      // 走查 R8: 跟 commentMutation 一样的兜底——用户点赞完后立刻关 sheet，
      // mutation 失败时 mobileCommentSheetErrorMessage 已经不渲染了，optimistic
      // 翻回去用户也不知道为啥，加 page 级 notice 兜底。
      // R6: 失败 toast → danger（详见 L153 注释）。
      setNoticeTone("danger");
      setNoticeActionLabel(null);
      setNoticeAction(null);
      setNotice(
        error instanceof Error
          ? t(msg`评论点赞失败：${error.message}`)
          : t(msg`评论点赞失败，请稍后重试。`),
      );
    },
    onSuccess: (_data, _input, context) => {
      const mutationBaseUrl = context?.mutationBaseUrl ?? baseUrl;
      const sameAccount = mutationBaseUrl === mutationBaseUrlRef.current;
      if (sameAccount) {
        setNoticeTone("success");
        setNoticeActionLabel(null);
        setNoticeAction(null);
        setNotice(t(msg`评论互动已更新。`));
      }
      // fire-and-forget：await 会让 like-comment 按钮一直 disabled。
      // 走查 2026-05-18 新会话 R3（本轮）：原来兜「optimistic 已经翻 likedByOwner /
      // likeCount，invalidate 让 server 真值兜底一次防 drift」——但 likeOwnerComment
      // 是 one-way 操作（server 端 already-liked = no-op，没有 unlike 路径），
      // optimistic flip 必然等于 server 真值（除非 onError 错回滚但 server 实际
      // 成功这种极罕见网络分区）。yuanzui0728 那条 142 条评论的 post 上每点一
      // 个赞都触发 listFeedComments 全量 refetch (server ~100 条 serialize +
      // replyAuthorMap + likedSet → ~10-30KB JSON，公网隧道 RTT 200-500ms)，
      // 5-10 个赞累计 1-5 秒纯浪费。同 commentMutation R2 的修法对齐：去掉
      // comments invalidate，让 optimistic 当家；decorations 仍 invalidate
      // (commentsPreviewByPostId 那条预览的 likedByOwner / likeCount 也要刷新)。
      void queryClient.invalidateQueries({
        queryKey: ["app-channels-home-decorations", mutationBaseUrl],
      });
    },
  });

  const visiblePosts = channelsQuery.data?.posts ?? EMPTY_CHANNEL_POSTS;

  // 推荐流里有大量非好友角色的帖子，后端对这些 post 的 like / comment /
  // favorite / comment_like 都会 403 FEED_NOT_FRIEND。前端原本没有 gating，按
  // 钮照点 → 用户看到 403 而不是友好提示。这里集中拦在 mutate 前，提示一句
  // 后直接 return；share / view / not-interested / 转发 仍开放给非好友。
  function ensureCanInteract(post: { canInteract?: boolean } | undefined | null) {
    if (!post || post.canInteract === false) {
      // R6: 阻塞约束 → warning（详见 L153 注释）。tone=warning → role=alert
      // 让 SR 用户立刻知道为什么按了按钮没反应。
      setNoticeTone("warning");
      setNoticeActionLabel(null);
      setNoticeAction(null);
      setNotice(t(msg`需先加为好友才能互动。`));
      return false;
    }
    return true;
  }
  function ensureCommentPostCanInteract(postId: string) {
    // 走查 2026-05-18 新会话 R1（本轮）：原 lookup 只看 visiblePosts —— 但
    // desktop 用户走 deep-link 进一条不在 home 推荐流里的 post 时，post 是
    // 通过 desktopMissingRoutePostQuery 单独拉回再 prepend 到 desktopWork
    // spacePosts 的；visiblePosts 没那条 post，find 返回 undefined →
    // ensureCanInteract(undefined) 走 `!post` 早返 → 用户看到「需先加为好
    // 友才能互动」即便那帖来自朋友。同事被链接分享视频号链接 → 进去想
    // 点赞 → 误以为对方拉黑了自己。
    // 改成在 desktopWorkspacePosts 里查（mobile 路径上 desktopWorkspace
    // Posts === visiblePosts，行为不变）。
    const post = desktopWorkspacePosts.find((p) => p.id === postId);
    return ensureCanInteract(post);
  }
  const desktopMissingRoutePostId =
    isDesktopLayout &&
    routeSelectedPostId &&
    !visiblePosts.some((post) => post.id === routeSelectedPostId)
      ? routeSelectedPostId
      : null;
  const desktopMissingRoutePostQuery = useQuery({
    queryKey: ["app-feed-post", baseUrl, desktopMissingRoutePostId],
    queryFn: async () => {
      if (!desktopMissingRoutePostId) {
        return null;
      }

      const post = await getFeedPost(desktopMissingRoutePostId, baseUrl);
      if (!post || post.surface !== "channels") {
        return null;
      }

      // 走查 2026-05-18 新会话 R6（本轮）：getFeedPost 拉回 FeedPostWithComments
      // 时已经带回了那条 post 的全量 comments，但下方 desktopCommentsQuery
      // (`["app-feed-comments", baseUrl, postId]`) 拿不到这份数据 —— 它的
      // placeholderData 走 getCommentsPreview = decorations.commentsPreviewByPostId
      // [postId]，但 decorations 是 home 流的衍生缓存，deep-link post 不在
      // home 里也就不在 decorations 里，placeholder 落 EMPTY_COMMENT_PREVIEW。
      // 用户在 deep-link post 上点评论图标 → drawer 冒「正在读取评论...」→
      // 公网隧道 RTT 200-500ms 再 fetch 一遍 listFeedComments(postId) → 渲染。
      // 这次 RTT 完全是浪费，server 已经在 getFeedPost 那一次给过了。
      // 提前 prime app-feed-comments cache，drawer 打开时直接 cache hit。
      queryClient.setQueryData<FeedComment[]>(
        ["app-feed-comments", baseUrl, post.id],
        post.comments,
      );
      return post;
    },
    enabled: Boolean(desktopMissingRoutePostId),
  });
  const desktopWorkspacePosts = useMemo(() => {
    const routePost = desktopMissingRoutePostQuery.data;
    if (!routePost || !desktopMissingRoutePostId) {
      return visiblePosts;
    }

    if (visiblePosts.some((post) => post.id === routePost.id)) {
      return visiblePosts;
    }

    return [createDesktopChannelRoutePost(routePost), ...visiblePosts];
  }, [
    desktopMissingRoutePostId,
    desktopMissingRoutePostQuery.data,
    visiblePosts,
  ]);
  const desktopRoutePostPending =
    Boolean(desktopMissingRoutePostId) && desktopMissingRoutePostQuery.isLoading;
  // 走查 2026-05-18 新会话（本轮 R1）：deep-link 到一条"不存在"的 post（
  // 同事链接已删 / typo 的 postId / 老链接对应 post 已被 cleanupBroken 清掉）。
  // 原流程是 desktopMissingRoutePostQuery 跑回 null / 报错 → desktopRoutePost
  // Pending 翻回 false → workspace 终于 mount —— 但 URL 里那个 ghost postId 没
  // 被任何人清掉，下面的 Effect A（line 1665）每次 routeSelectedPostId 变就把
  // desktopSelectedPostId 强同步成 ghost id；workspace 的 Effect 327 又把 selected
  // 兜回 posts[0].id 上报回来；Effect C（line 1699）的 URL sync 拿着 desktopSel
  // ='posts[0].id' 但闭包里 normalizedHash 还是上一帧的 'post=ghost'，每个新 commit
  // navigate 写 URL → 下一帧 Effect A 读到 URL 又写 desktopSel='ghost' → ping-pong
  // 死循环，React 25 次后抛 "Maximum update depth exceeded"，整个 channels-page
  // 被 CatchBoundary 兜下来。bash 走查 2026-05-18 R1 用 history.replaceState 设
  // /tabs/channels#post=does-not-exist-xxx 100% 复现。
  // 修法：query 落空后立刻把 URL 里 ghost postId 清掉（保留 section），让用户落
  // 回当前 tab 推荐流首条；不需要 toast 提示，因为 ghost link 不存在多数是链接
  // 失效情景，跟"打开 404 页面再回首页"体感一致即可。
  const desktopRoutePostMissingNotFoundRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isDesktopLayout) {
      return;
    }
    if (!desktopMissingRoutePostId) {
      return;
    }
    if (desktopMissingRoutePostQuery.isLoading) {
      return;
    }
    const data = desktopMissingRoutePostQuery.data;
    const isError = desktopMissingRoutePostQuery.isError;
    if (!isError && data) {
      return;
    }
    // 同一条 ghost id 只清一次 URL —— 避免清完后 router 状态还没把 hash 落进 useRouter
    // State 时 effect 多次连发 navigate({replace:true})。
    if (desktopRoutePostMissingNotFoundRef.current === desktopMissingRoutePostId) {
      return;
    }
    desktopRoutePostMissingNotFoundRef.current = desktopMissingRoutePostId;
    void navigate({
      to: "/tabs/channels",
      hash: buildDesktopChannelsRouteHash({
        section: activeSection,
      }),
      replace: true,
    });
  }, [
    activeSection,
    desktopMissingRoutePostId,
    desktopMissingRoutePostQuery.data,
    desktopMissingRoutePostQuery.isError,
    desktopMissingRoutePostQuery.isLoading,
    isDesktopLayout,
    navigate,
  ]);
  const desktopSelectedPost = useMemo(
    () =>
      desktopWorkspacePosts.find((post) => post.id === desktopSelectedPostId) ??
      null,
    [desktopSelectedPostId, desktopWorkspacePosts],
  );
  const syncedRouteSelectedAuthorId =
    routeSelectedAuthorId &&
    desktopSelectedPost?.authorId === routeSelectedAuthorId
      ? routeSelectedAuthorId
      : undefined;
  const mobileCommentSheetPost = useMemo(
    () =>
      visiblePosts.find((post) => post.id === mobileCommentSheetPostId) ?? null,
    [mobileCommentSheetPostId, visiblePosts],
  );
  const mobileCommentsQuery = useQuery({
    queryKey: ["app-feed-comments", baseUrl, mobileCommentSheetPostId],
    queryFn: () => listFeedComments(mobileCommentSheetPostId!, baseUrl),
    enabled: Boolean(mobileCommentSheetPostId),
    // 走查 R3（本轮）：兜底用稳定 EMPTY_COMMENT_PREVIEW，避免每帧新 [] 让
    // mobileCommentsQuery.data 在真数据到位前每次 render 都换 identity，
    // 进而把 MobileChannelCommentsSheet 里 commentsListNode 的 useMemo 也带飞。
    placeholderData: mobileCommentSheetPostId
      ? getCommentsPreview(mobileCommentSheetPostId)
      : EMPTY_COMMENT_PREVIEW,
  });
  // 走查 2026-05-18 新会话 R3：原 query key 跟着 desktopSelectedPostId 走 ——
  // 用户滑过 N 张 slide 就 fetch N 次 comments，但抽屉 90% 不开，全是浪费的
  // RTT。改用 desktopCommentDrawerPostId：workspace 通过 onDrawerOpenChange
  // 回调把开关信号上报，query 只在抽屉真打开时 enable。抽屉关时 enable false
  // → 不发请求；下次再打开同一条 post 时若已 cache 命中 → 零 RTT 直接渲染。
  const desktopCommentsQuery = useQuery({
    queryKey: ["app-feed-comments", baseUrl, desktopCommentDrawerPostId],
    queryFn: () => listFeedComments(desktopCommentDrawerPostId!, baseUrl),
    enabled: Boolean(isDesktopLayout && desktopCommentDrawerPostId),
    placeholderData: desktopCommentDrawerPostId
      ? getCommentsPreview(desktopCommentDrawerPostId)
      : EMPTY_COMMENT_PREVIEW,
  });
  const desktopAuthorProfileQuery = useQuery({
    queryKey: ["app-channel-author", baseUrl, syncedRouteSelectedAuthorId],
    queryFn: () => getChannelAuthorProfile(syncedRouteSelectedAuthorId!, baseUrl),
    enabled: Boolean(isDesktopLayout && syncedRouteSelectedAuthorId),
  });
  // 走查 R6（本轮）：原 label 直接吃 decorationsQuery / channelsQuery 返回的
  // 服务端字段——后端 CHANNEL_HOME_SECTION_LABELS 把 推荐/朋友/关注/直播 硬编码
  // 成中文，en-US / ja-JP / ko-KR 用户进视频号永远看到 4 个中文 tab，跟下面卡片
  // 内 t(msg`视频号推荐`) / 卡片 meta 行的"音乐 · 38 秒"等本地化文案对不上。
  // 只信任 server 的 key + count，label 一律走前端翻译。
  const channelSections = useMemo<
    Array<{ key: FeedChannelHomeSection; label: string; count: number }>
  >(() => {
    const sectionLabels: Record<FeedChannelHomeSection, string> = {
      recommended: t(msg`推荐`),
      friends: t(msg`朋友`),
      following: t(msg`关注`),
      live: t(msg`直播`),
    };
    const sourceSections =
      decorationsQuery.data?.sections ?? channelsQuery.data?.sections;
    if (sourceSections) {
      return sourceSections.map((section) => ({
        key: section.key,
        label: sectionLabels[section.key] ?? section.label,
        count: section.count,
      }));
    }
    return (
      Object.keys(sectionLabels) as FeedChannelHomeSection[]
    ).map((key) => ({ key, label: sectionLabels[key], count: 0 }));
  }, [decorationsQuery.data?.sections, channelsQuery.data?.sections, t]);
  // 只把"拉首屏数据"和"按 URL 定位帖"这两种"读"失败放进 errorMessage——
  // 这才是真正的 "视频号暂时不可用"。点赞 / 收藏 / 关注 / 减少推荐 / 评论
  // 这些点操作失败时整个 home 还能用，不应该让大状态卡盖住推荐流；它们的
  // 错误通过下方 setNotice 给一行轻量提示就好。
  // commentMutation 在评论面板里另有 inlineNotice 兜底，桌面端 errorMessage
  // 还会把 commentPanel 错单独拎出，这里也不重复进。
  // generateMutation 一直就显式排除——它失败 home 仍然能用。
  const errorMessage =
    (channelsQuery.isError && channelsQuery.error instanceof Error
      ? channelsQuery.error.message
      : null) ??
    (desktopMissingRoutePostId &&
    desktopMissingRoutePostQuery.isError &&
    desktopMissingRoutePostQuery.error instanceof Error
      ? desktopMissingRoutePostQuery.error.message
      : null);
  const mobileCommentSheetErrorMessage =
    (mobileCommentsQuery.isError && mobileCommentsQuery.error instanceof Error
      ? mobileCommentsQuery.error.message
      : null) ??
    (likeCommentMutation.isError &&
    likeCommentMutation.error instanceof Error &&
    likeCommentMutation.variables?.postId === mobileCommentSheetPostId
      ? likeCommentMutation.error.message
      : null) ??
    (commentMutation.isError &&
    commentMutation.error instanceof Error &&
    commentMutation.variables?.postId === mobileCommentSheetPostId
      ? commentMutation.error.message
      : null);
  const mobileCommentSheetRetryAction =
    mobileCommentsQuery.isError && mobileCommentSheetPostId
      ? {
          label: t(msg`重试读取评论`),
          onClick: () => {
            void mobileCommentsQuery.refetch();
          },
        }
      : likeCommentMutation.isError &&
          likeCommentMutation.error instanceof Error &&
          likeCommentMutation.variables?.postId === mobileCommentSheetPostId
        ? {
            label: t(msg`重试评论点赞`),
            onClick: () => {
              likeCommentMutation.mutate(likeCommentMutation.variables);
            },
          }
        : commentMutation.isError &&
            commentMutation.error instanceof Error &&
            commentMutation.variables?.postId === mobileCommentSheetPostId &&
            commentMutation.variables.text.trim()
          ? {
              label: commentMutation.variables.replyTarget
                ? t(msg`重试回复评论`)
                : t(msg`重试发送评论`),
              // postId / replyTarget 用旧的（用户改的是文本不是回复对象），
              // text 从 commentDrafts 现读现用——直接 mutate(variables) 会把
              // 失败那一刻的旧 text 又发一遍，但评论过长 / 被风控驳回时用户
              // 通常已经在草稿里缩短改写过，旧 text 会把刚改完的本意顶回去。
              onClick: () => {
                const variables = commentMutation.variables;
                if (!variables) return;
                // 用户失败后把草稿改回空再点重试——别替换 variables.text 让
                // mutationFn 抛 "请先输入评论内容"，把同一条红条又翻一遍。
                // 草稿空就退回到最初发送的那一份文本继续重试。
                const rawDraft = commentDrafts[variables.postId];
                const currentDraft = rawDraft?.trim()
                  ? rawDraft
                  : variables.text;
                commentMutation.mutate({
                  ...variables,
                  text: currentDraft,
                });
              },
            }
          : null;
  // 走查 2026-05-18 新会话 R3：error 匹配的 postId 从 desktopSelectedPostId
  // 换成 desktopCommentDrawerPostId —— panel 错误只在抽屉打开时才能看见，按
  // 抽屉对应的 postId 匹配语义更准（用户已经关抽屉或滑走时不该残留错条；
  // page-level setNotice 那条 onError 兜底已经在 R8-1 fix 加好）。
  const desktopCommentPanelErrorMessage =
    (desktopCommentsQuery.isError && desktopCommentsQuery.error instanceof Error
      ? desktopCommentsQuery.error.message
      : null) ??
    (likeCommentMutation.isError &&
    likeCommentMutation.error instanceof Error &&
    likeCommentMutation.variables?.postId === desktopCommentDrawerPostId
      ? likeCommentMutation.error.message
      : null) ??
    (commentMutation.isError &&
    commentMutation.error instanceof Error &&
    commentMutation.variables?.postId === desktopCommentDrawerPostId
      ? commentMutation.error.message
      : null);
  const pendingLikePostId = likeMutation.isPending
    ? (likeMutation.variables?.postId ?? null)
    : null;
  // 同 like，收藏 toggle 也要锁住按钮直到 mutation 落地，避免 rapid click 串成多条
  // 并发请求把最终状态打乱。
  const pendingFavoritePostId = favoriteMutation.isPending
    ? (favoriteMutation.variables?.postId ?? null)
    : null;
  // follow 是按 authorId 维度，"+关注"按钮在同作者的多条 post 上都显示，并发同样
  // 会乱。锁住整个 authorId 维度。
  const pendingFollowAuthorId = followMutation.isPending
    ? (followMutation.variables?.authorId ?? null)
    : null;
  const pendingCommentPostId = commentMutation.isPending
    ? (commentMutation.variables?.postId ?? null)
    : null;
  const pendingLikeCommentId = likeCommentMutation.isPending
    ? (likeCommentMutation.variables?.commentId ?? null)
    : null;
  // R4 sync ref 双击锁的复位：mutation settle 后清掉 ref，下一次正常点开放。
  // 走查 2026-05-18 第三轮 R1：这 3 条 effect 历史上重复写了两份（第一份在
  // pendingCommentPostId / pendingLikeCommentId 计算上方，第二份在下方），完全
  // 同 body 同 deps。React 把 6 个 fiber slot 全跑一遍 + isPending 翻 false 时
  // 2 次写同一 ref（cheap 但浪费）。把上面那份去掉，留下方一份完整集合（like/
  // favorite/follow + generate + likeComment）。
  useEffect(() => {
    if (!likeMutation.isPending) {
      desktopLikeSubmittingRef.current = false;
    }
  }, [likeMutation.isPending]);
  useEffect(() => {
    if (!favoriteMutation.isPending) {
      desktopFavoriteSubmittingRef.current = false;
    }
  }, [favoriteMutation.isPending]);
  useEffect(() => {
    if (!followMutation.isPending) {
      desktopFollowSubmittingRef.current = false;
    }
  }, [followMutation.isPending]);
  useEffect(() => {
    if (!generateMutation.isPending) {
      desktopGenerateSubmittingRef.current = false;
    }
  }, [generateMutation.isPending]);
  useEffect(() => {
    if (!likeCommentMutation.isPending) {
      commentLikeSubmittingRef.current = false;
    }
  }, [likeCommentMutation.isPending]);

  // useCallback 必要：onViewPost 作为 prop 进 DesktopChannelsWorkspace 的 useEffect 依赖，
  // 内联箭头函数会导致 effect 在父组件每次 re-render 都重跑，狂刷 viewFeedPost。
  const handleDesktopViewPost = useCallback(
    (postId: string) => {
      void viewFeedPost(postId, { progressSeconds: 3 }, baseUrl);
    },
    [baseUrl],
  );
  // 同上：mobile MobileChannelsViewport 里的 useEffect 把 onVisiblePost 当依赖，
  // 切 section / 父级任意 re-render 都会让 view POST 重发一次（实测切「朋友」tab
  // 一次激活同一 postId 17ms 内发了两次 /feed/:id/view）。
  const handleMobileViewPost = useCallback(
    (postId: string) => {
      void viewFeedPost(postId, { progressSeconds: 1 }, baseUrl);
    },
    [baseUrl],
  );

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

    void channelsQuery.refetch();
  }

  function handleRetryLoad() {
    void channelsQuery.refetch();
  }

  function handleEmptyStateAction() {
    if (navigateToRouteStateReturn()) {
      return;
    }

    // 这些 tab 的空态点"去推荐看看"才有意义——generateChannelPost 走
    // characters.findAllVisibleToOwner 随机一位 feedFrequency>0 的角色，
    // 既不保证落到通讯录里的朋友（friends tab）、也不会生成直播（live tab）、
    // 当然也不会自动产生关注（following tab）。统一切回推荐。
    if (
      activeSection === "following" ||
      activeSection === "friends" ||
      activeSection === "live"
    ) {
      handleSectionChange("recommended");
      return;
    }

    generateMutation.mutate();
  }

  useEffect(() => {
    const baseUrlChanged = previousBaseUrlRef.current !== baseUrl;
    previousBaseUrlRef.current = baseUrl;

    if (baseUrlChanged) {
      setCommentDrafts({});
      setNoticeActionLabel(null);
      setNoticeAction(null);
      setNotice(""); // i18n-ignore-line
      // 走查 R1（本轮）：原来 baseUrl 切换没清 forwardPickerPost。用户在 A 账号
      // 打开转发面板挑好友时切到 B 账号，picker 不关、postId 还是 A 世界的 uuid；
      // 点好友后 forwardFeedPostToChat 拿 A 的 postId 去 B 世界 API 打，立刻
      // 404 FEED_POST_NOT_FOUND，picker 弹一行没头没脑的"转发失败"。同步关掉。
      setForwardPickerPost(null);
    }

    // 走查 2026-05-18 新会话（本轮 R1）：urlSelfSyncEchoPostIdRef 兜「URL 这次
    // 变化是不是我下面 URL-sync effect 自己写出去的」—— 是的话不要把 URL 反向
    // 同步进 desktopSelectedPostId，否则跟 URL-sync 互相把对方在闭包里捕到的
    // 旧值再 commit 一次，跨 commit 两端值 swap → "Maximum update depth"。
    // 复现：deep-link 进一条不存在的 post（has=#post=does-not-exist-xxx）时
    //   render N: routeSel='ghost', desktopSel='real'（workspace 兜 posts[0] 上报回来）
    //     - 本 effect 闭包看到 routeSel='ghost' → 计划写 desktopSel='ghost'
    //     - URL-sync effect 闭包看到 desktopSel='real' → 计划 navigate URL='post=real'
    //   commit 完：desktopSel='ghost'，URL='post=real'，routeSel=>'real'
    //   render N+1: routeSel='real', desktopSel='ghost'（值 swap 了）
    //     - 本 effect 写 desktopSel='real'；URL-sync 写 URL='post=ghost'
    //   每次 commit 25 次 React 抛 Maximum update depth，CatchBoundary 兜底整页崩。
    // ref 在 URL-sync 真正发 navigate 时记下当时 desktopSelectedPostId；本 effect
    // 检测到 routeSel 跟上次自己派出去的 ID 一致 → 「这条 URL 变化是我自己
    // 写的回声」，跳过 setDesktopSelectedPostId 以避免覆盖。仍然要清 reply /
    // drawer 等 auxiliary state（用户切到另一条 post 就应该清掉之前的草稿）。
    if (
      urlSelfSyncEchoPostIdRef.current !== undefined &&
      urlSelfSyncEchoPostIdRef.current === routeSelectedPostId
    ) {
      urlSelfSyncEchoPostIdRef.current = undefined;
    } else {
      setDesktopSelectedPostId(routeSelectedPostId);
    }
    setDesktopReplyTarget(null);
    // 走查 2026-05-18 新会话 R3：drawer 状态也清 — workspace 的 R5-1 reset
    // 会在 baseUrl 切换时 setCommentDrawerPostId(null)，但那是 workspace 本地
    // state；上提到 channels-page 的 desktopCommentDrawerPostId 这边也要同步
    // 清空，否则 baseUrl change → workspace effect 还没跑前 query enable 残
    // 留 → 跑到 B 账户 fetch /feed/A_postId/comments 拿 404。
    setDesktopCommentDrawerPostId(null);
    setMobileCommentSheetPostId(null);
    setMobileReplyTarget(null);
  }, [baseUrl, routeSelectedPostId]);

  useEffect(() => {
    const routeSection = routeState.section ?? "recommended";
    setActiveSection((current) =>
      current === routeSection ? current : routeSection,
    );
  }, [routeState.section]);

  useEffect(() => {
    if (!desktopSelectedPostId) {
      return;
    }

    if (desktopRoutePostPending) {
      return;
    }

    if (!desktopWorkspacePosts.some((post) => post.id === desktopSelectedPostId)) {
      setDesktopSelectedPostId(null);
      setDesktopReplyTarget(null);
    }
  }, [desktopRoutePostPending, desktopSelectedPostId, desktopWorkspacePosts]);

  useEffect(() => {
    if (!isDesktopLayout || !isDesktopChannelsRoute) {
      return;
    }

    // URL 是 section 的真理之源；如果 React state 还没追平 URL（effect 578 还没跑完），
    // 不要拿旧 state 反向写 URL，否则会把刚发生的 tab 切换覆盖掉。
    const urlSection = routeState.section ?? "recommended";
    if (urlSection !== activeSection) {
      return;
    }

    // 走查 2026-05-18 新会话（本轮 R4）：URL 上有 author=Y 但 sync edRouteSelected
    // AuthorId 还没追上（routeSelectedAuthorId=Y 在闭包里 != desktopSelectedPost.
    // authorId 因为后者用 stale closure），同 commit 跑到这里 syncedRouteSelected
    // AuthorId=undefined，nextHash 会把 URL 上的 author= 抹掉。下一帧 Effect A 用
    // routeSelectedAuthorId=null 落 state → 用户的"deep-link 到这条 post + 这位
    // 作者"意图被吞，author overlay 永远不开。
    // 跳过本帧 navigate，等 Effect A 把 desktopSel 同步成 routeSel 后下一帧
    // desktopSelectedPost.authorId === routeSelectedAuthorId 让 synced 有值 → 本
    // effect 用最新 closure 重跑，nextHash 自然带回 author=，URL 不被砍。
    if (routeSelectedAuthorId && !syncedRouteSelectedAuthorId) {
      return;
    }

    const nextHash = buildDesktopChannelsRouteHash({
      postId: desktopSelectedPostId,
      authorId: syncedRouteSelectedAuthorId,
      section: activeSection,
    });
    if (
      pathname === "/tabs/channels" &&
      (nextHash ?? "") === normalizedHash
    ) {
      return;
    }

    // 走查 2026-05-18 新会话（本轮 R1）：把这次要写到 URL 上的 postId 钉到 ref
    // 上 —— 等 router 把 URL 变化推回 routeSelectedPostId 时，上面那条 effect
    // 用这条 ref 识别「URL 这帧的变化是我自己写出去的」就跳过反向写 desktop
    // SelectedPostId。避免 state ↔ URL 互推 swap → Maximum update depth loop。
    urlSelfSyncEchoPostIdRef.current = desktopSelectedPostId;
    void navigate({
      to: "/tabs/channels",
      hash: nextHash,
      replace: true,
    });
  }, [
    activeSection,
    isDesktopChannelsRoute,
    syncedRouteSelectedAuthorId,
    routeSelectedAuthorId,
    normalizedHash,
    desktopSelectedPostId,
    isDesktopLayout,
    navigate,
    pathname,
    routeState.section,
  ]);

  useEffect(() => {
    if (isDesktopLayout) {
      return;
    }
    // 走查 2026-05-18（本轮）R1：原来只 sync `/discover/channels` 的 hash——
    // 但移动端用户从其它入口（deep link / refresh / 应用首启动后 router 直接落到
    // `/tabs/channels`）落在 `/tabs/channels` 时，下面的 navigate 不跑，切 tab
    // 后 URL 里 section= 没变；用户刷新或者把 link 发给朋友会丢 tab 上下文。实测
    // playwright 在 `/tabs/channels` 点「朋友」tab 后 URL 一直停在 `/tabs/channels`，
    // 没追上 hash 里的 section=friends。对齐 desktop effect（line 1204）把
    // 所有 channels 路径都纳入 sync，path 用当前 pathname 不强切。
    const isChannelsPath =
      normalizedPathname === "/discover/channels" ||
      normalizedPathname === "/tabs/channels" ||
      normalizedPathname === "/channels";
    if (!isChannelsPath) {
      return;
    }

    // 走查 2026-05-17 R1：用户带 `#post=ID` 直达 /discover/channels 但 URL 里
    // 没写 section= 时，routeState.section 是 undefined，而本地 activeSection
    // 初始就是默认值 "recommended"，原代码用 `routeState.section === activeSection`
    // 做严格相等会判 false，于是 postId 被强写成 undefined，整段 URL 在挂载后
    // 立刻被 replace 成 `#section=recommended`，把用户带过来的 post= 锚点擦掉，
    // routeSelectedPostId 也变 null → scroll-to-route 永远跑不到。
    // 对齐桌面 effect（line 1204）把 "URL 没 section" 视同 "recommended"。
    const urlSection = routeState.section ?? "recommended";
    // 走查 2026-05-18 新一轮 R5：原来这条只把 sectionMatches 用作"是否带 postId"，
    // 不管 urlSection !== activeSection 仍照走 navigate({section: activeSection})——
    // 跟 desktop 同名 effect 早就有的「state 还没追平 URL 就 return」保护漏了。
    // 实测复现：用户从 #section=friends 通过任何方式（深链 / 应用内 push）切到
    // #section=recommended 那一帧：
    //   render-1: activeSection="friends"（旧 state）, URL "section=recommended"
    //     - section sync effect 排队 setActiveSection("recommended")
    //     - 本 effect 用 stale "friends" build nextHash → "section=friends" → navigate 把
    //       URL 写回 "friends"（把用户的"切到 recommended"操作覆盖掉）
    //   render-2: activeSection="recommended"（刚 set 完）, URL "section=friends"
    //     - section sync effect setActiveSection("friends")
    //     - 本 effect build nextHash → "section=recommended" → navigate 把 URL 写回 "recommended"
    // → 两条 effect 像乒乓球一样把 state / URL 反复弹来弹去，React 检测到 setState
    //   在 commitHookEffectListMount 里超过最大深度 → "Maximum update depth exceeded"
    //   → 整段 MobileChannelsViewport 被 error boundary 接住销毁，视频号页崩了。
    // 对齐 desktop effect（line 1398-1400）：state 还没追平 URL（urlSection !==
    // activeSection）时直接 return，让 section sync effect 先把 state 同步过去；
    // 等下一帧 activeSection === urlSection 时本 effect 才会跑 build/navigate。
    if (urlSection !== activeSection) {
      return;
    }
    const nextHash = buildDesktopChannelsRouteHash({
      postId: routeSelectedPostId,
      returnPath: safeReturnPath,
      returnHash: safeReturnHash,
      section: activeSection,
    });
    if ((nextHash ?? "") === normalizedHash) {
      return;
    }

    // 走查 R1（本轮）：to 用当前 pathname（不强切到 /discover/channels）——切到
    // 别的 path 会让整个 ChannelsPage 实例 unmount / remount，commentDrafts /
    // forwardPickerPost / activePostId 等本地状态全丢，体感像「点 tab 把整个页
    // 面 reset 了一次」。原来只跑 `/discover/channels` 不会撞这条，扩展支持
    // `/tabs/channels` / `/channels` 必须用 pathname 才能保持原 instance。
    void navigate({
      to:
        normalizedPathname === "/channels"
          ? "/tabs/channels"
          : normalizedPathname,
      hash: nextHash,
      replace: true,
    });
  }, [
    activeSection,
    isDesktopLayout,
    navigate,
    normalizedHash,
    normalizedPathname,
    routeSelectedPostId,
    routeState.section,
    safeReturnHash,
    safeReturnPath,
  ]);

  useEffect(() => {
    if (!mobileCommentSheetPostId) {
      return;
    }

    if (!visiblePosts.some((post) => post.id === mobileCommentSheetPostId)) {
      setMobileCommentSheetPostId(null);
      setMobileReplyTarget(null);
    }
  }, [mobileCommentSheetPostId, visiblePosts]);

  useEffect(() => {
    if (!mobileReplyTarget) {
      return;
    }

    if (mobileReplyTarget.postId !== mobileCommentSheetPostId) {
      setMobileReplyTarget(null);
    }
  }, [mobileCommentSheetPostId, mobileReplyTarget]);

  useEffect(() => {
    if (!desktopReplyTarget) {
      return;
    }

    if (desktopReplyTarget.postId !== desktopSelectedPostId) {
      setDesktopReplyTarget(null);
    }
  }, [desktopReplyTarget, desktopSelectedPostId]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => {
      setNotice(""); // i18n-ignore-line
      setNoticeActionLabel(null);
      setNoticeAction(null);
    }, 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // 视频号转发：点击转发按钮 → 弹好友选择器 → 用户选完调
  // forwardFeedPostToChat（在 ChannelsForwardPicker 内部完成）。
  function handleSharePost(post: (typeof visiblePosts)[number]) {
    // 卡片正文那边都用 stripToolCallSyntax 过滤了 <tool_call> / <bracket> 残留；
    // 转发面板顶部的摘要也要过一遍，不然某些 AI 生成贴的原文里夹的工具调用语法
    // 会原样塞进转发预览，看着像乱码。
    //
    // 走查 2026-05-18 R3：原 excerpt 直接拼 `${author}：${cleanText}`，但音乐
    // 帖（mediaType=audio）的 post.text 经常是空串——后端 createOwnerPost 走
    // audio 路径时 text 不强制——导致 picker 顶部摘要变成「李白：」一个孤零零
    // 的全角冒号悬空，用户体感「这是不是要转发的内容残缺了」。fallback 链：
    //   cleanText → post.title → "视频号动态"
    // 保证 picker 摘要永远有可读内容。
    const cleanText = stripToolCallSyntax(post.text ?? "").trim();
    const titleOrText =
      cleanText || post.title?.trim() || t(msg`视频号动态`);
    setForwardPickerPost({
      id: post.id,
      excerpt: `${post.authorName}：${titleOrText}`.slice(0, 80),
    });
  }

  function toggleFavorite(post: (typeof visiblePosts)[number]) {
    if (!ensureCanInteract(post)) return;
    const sourceId = `channels-${post.id}`;
    const routeHash = buildDesktopChannelsRouteHash({
      postId: post.id,
      section: activeSection,
    });
    const alreadyFavorited = Boolean(post.ownerState?.hasFavorited);
    // 走查 R1：toggleFavorite 同时改 React Query 缓存 + 本地 desktop-favorites
    // localStorage。favoriteMutation.onError 只回滚缓存里的 hasFavorited / count，
    // 不动 localStorage 那份。若 POST/DELETE 失败，server 上 favorite 状态没变，
    // 卡片 UI 翻回原状，但「我 → 收藏」里却多了 / 少了这条，长期堆出脏记录。
    // 这里记下取消前的原记录 + 在 mutate 的 per-call onError 里逆向回滚。
    const previousFavoriteRecord = alreadyFavorited
      ? (readDesktopFavorites().find((item) => item.sourceId === sourceId) ?? null)
      : null;
    if (alreadyFavorited) {
      removeDesktopFavorite(sourceId);
    } else {
      // 走查 2026-05-17 新会话 R2：description 直接吃 post.text，但某些 AI
      // 生成贴的原文夹了 <tool_call>...</tool_call> / [TOOL_CALL] 等工具调用
      // 残留——视频号卡上已经走 stripToolCallSyntax 过滤了，favorites 收藏
      // 这层却直接存原文。用户从「我 → 收藏」打开能看到一坨 XML 标签和参数
      // JSON 当成"动态正文"摘要在 line-clamp-2 里炸开，肉眼像乱码。同样
      // 过滤一遍再落 localStorage，保证收藏列表里的描述跟卡片正文一致。
      const cleanDescription = stripToolCallSyntax(post.text ?? "");
      upsertDesktopFavorite({
        id: `favorite-${sourceId}`,
        sourceId,
        category: "channels",
        title: post.authorName,
        description: cleanDescription,
        meta: formatTimestamp(post.createdAt),
        to: `/tabs/channels${routeHash ? `#${routeHash}` : ""}`,
        badge: t(msg`视频号`),
        avatarName: post.authorName,
        avatarSrc: post.authorAvatar,
      });
    }

    favoriteMutation.mutate(
      {
        postId: post.id,
        favorited: alreadyFavorited,
      },
      {
        onError: () => {
          if (alreadyFavorited) {
            // 之前是「已收藏 → 取消收藏」分支，刚把记录删了，要把原记录加回去。
            //
            // 走查 2026-05-18 R2：原代码 destructure 扔掉 collectedAt 走
            // upsertDesktopFavorite(restored) 重写为 now → favorite 在「我 →
            // 收藏」列表里神秘跳到顶部（按 collectedAt DESC 排序），用户体感
            // 「我刚取消失败的收藏，怎么跑到最上面了」。改走 restoreDesktopFavorite
            // 完整保留原 collectedAt，favorite 还原到原位置。
            if (previousFavoriteRecord) {
              restoreDesktopFavorite(previousFavoriteRecord);
            }
          } else {
            // 之前是「未收藏 → 收藏」分支，刚 upsert 了一条，删掉
            removeDesktopFavorite(sourceId);
          }
        },
      },
    );
  }

  function toggleFollowAuthor(post: (typeof visiblePosts)[number]) {
    followMutation.mutate({
      authorId: post.authorId,
      following: Boolean(post.ownerState?.isFollowingAuthor),
    });
  }

  function hidePost(postId: string) {
    notInterestedMutation.mutate(postId);
  }

  function handleSectionChange(section: FeedChannelHomeSection) {
    if (section === activeSection) {
      return;
    }

    if (isDesktopLayout) {
      // 同步把 React state 切到新 section 并清掉旧 post 锚点，
      // 否则后面同步 URL 的 effect 会读到旧 state，把刚发生的 tab 切换覆盖回去。
      setActiveSection(section);
      setDesktopSelectedPostId(null);
      setDesktopReplyTarget(null);
      void navigate({
        to: "/tabs/channels",
        hash: buildDesktopChannelsRouteHash({
          section,
        }),
        replace: true,
      });
      return;
    }

    // 走查 2026-05-18 新一轮 R1：移动端原来只 setActiveSection，URL 不管，靠
    // 下面 line 1431-1509 的 URL 同步 effect 兜——但 R5 fix（fb6fc7a41）加了
    // `urlSection !== activeSection 早返` 来防 URL → state → URL 死循环，副作
    // 用是 state → URL 这条路径也被同款早返堵死：用户点「朋友」tab 时
    //   render: activeSection="friends", urlSection="recommended"（URL 还没动）
    //   → URL sync effect 早返 → URL 一直停在 /tabs/channels（无 hash）。
    // 后果：
    //   - 刷新整页 → activeSection 用 routeState.section ?? "recommended" 初始
    //     化 → 回到「推荐」tab，用户切的「朋友」选择丢；
    //   - 把 URL 复制给朋友 / 截图分享 → 收到的人看到的是默认推荐，链接没传递
    //     上下文；
    //   - 浏览器后退 / 前进 → 历史里没记录过用户在「朋友」tab 待过，行为不可预测。
    // R5 的诊断是对的（URL/state ping-pong 死循环），但治法太重，把 click 路径
    // 也牺牲了。
    //
    // 对齐 desktop click handler 模式：click 时主动 navigate 把 URL 一步到位写
    // 对，URL sync effect 此时再跑一遍 urlSection==activeSection（都是新值）→
    // nextHash 等于当前 hash → 自然 no-op。R5 早返保护 URL→state 路径不变。
    //
    // hash 保留 routeSelectedPostId + safeReturn{Path,Hash} —— 切 tab 不应该把
    // 用户之前带过来的 returnPath / 锚点 post 也丢掉；section 用新值。注意
    // post 可能不在新 section 里（如 yz 在 recommended 切到 friends 时锚点 post
    // 不见了），但 hasRouteTargetInPosts effect 早返，scroll-to-post 自然不跑，
    // 不会出错；URL hash 残留 post= 只在用户后退时仍能定位回去。
    setActiveSection(section);
    void navigate({
      to:
        normalizedPathname === "/channels"
          ? "/tabs/channels"
          : normalizedPathname,
      hash: buildDesktopChannelsRouteHash({
        postId: routeSelectedPostId,
        returnPath: safeReturnPath,
        returnHash: safeReturnHash,
        section,
      }),
      replace: true,
    });
  }

  function openChannelAuthor(
    authorId: string,
    options?: {
      sourcePostId?: string | null;
    },
  ) {
    const sourcePostId =
      options?.sourcePostId ?? desktopSelectedPostId ?? routeSelectedPostId;
    const sourceHash = buildDesktopChannelsRouteHash({
      postId: sourcePostId,
      returnPath: safeReturnPath,
      returnHash: safeReturnHash,
      section: activeSection,
    });

    if (isDesktopLayout) {
      void navigate({
        to: "/tabs/channels",
        hash: buildDesktopChannelsRouteHash({
          postId: sourcePostId,
          authorId,
          section: activeSection,
        }),
      });
      return;
    }

    void navigate({
      to: "/channels/authors/$authorId",
      params: { authorId },
      hash: buildDesktopChannelsRouteHash({
        postId: sourcePostId,
        returnPath: pathname,
        returnHash: sourceHash,
        section: activeSection,
      }),
    });
  }

  function closeChannelAuthor() {
    void navigate({
      to: "/tabs/channels",
      hash: buildDesktopChannelsRouteHash({
        postId: desktopSelectedPostId,
        section: activeSection,
      }),
      replace: true,
    });
  }

  function openChannelAuthorPost(postId: string, authorId: string) {
    void navigate({
      to: "/tabs/channels",
      hash: buildDesktopChannelsRouteHash({
        postId,
        authorId,
        section: activeSection,
      }),
    });
  }

  function updateCommentDraft(postId: string, value: string) {
    setCommentDrafts((current) => ({
      ...current,
      [postId]: value,
    }));
  }

  function submitComment(
    postId: string,
    options?: {
      replyTarget?: {
        authorId: string;
        authorName: string;
        commentId: string;
        postId: string;
      } | null;
    },
  ) {
    if (!ensureCommentPostCanInteract(postId)) return;
    commentMutation.mutate({
      postId,
      replyTarget: options?.replyTarget ?? null,
      text: commentDrafts[postId] ?? "",
    });
  }

  if (isDesktopLayout && desktopRoutePostPending) {
    return (
      <RouteRedirectState
        title={t(msg`正在定位桌面视频号内容`)}
        description={t(
          msg`当前链接指向的内容不在推荐流里，正在补齐这条视频后再切进工作区。`,
        )}
        loadingLabel={t(msg`定位视频号内容...`)}
      />
    );
  }

  if (isDesktopLayout) {
    return (
      <Suspense
        fallback={
          <RouteRedirectState
            title={t(msg`正在打开桌面视频号`)}
            description={t(
              msg`正在载入桌面视频号工作区，马上显示当前频道内容。`,
            )}
            loadingLabel={t(msg`载入桌面视频号...`)}
          />
        }
      >
        <DesktopChannelsWorkspace
          activeSection={activeSection}
          authorProfile={desktopAuthorProfileQuery.data ?? null}
          authorProfileErrorMessage={
            desktopAuthorProfileQuery.isError &&
            desktopAuthorProfileQuery.error instanceof Error
              ? desktopAuthorProfileQuery.error.message
              : null
          }
          authorProfileLoading={desktopAuthorProfileQuery.isLoading}
          commentDrafts={commentDrafts}
          commentPendingPostId={pendingCommentPostId}
          errorMessage={errorMessage}
          isLoading={channelsQuery.isLoading}
          likePendingPostId={pendingLikePostId}
          favoritePendingPostId={pendingFavoritePostId}
          followPendingAuthorId={pendingFollowAuthorId}
          posts={desktopWorkspacePosts}
          routeSelectedAuthorId={syncedRouteSelectedAuthorId}
          routeSelectedPostId={routeSelectedPostId}
          sections={channelSections}
          successNotice={notice}
          successNoticeTone={noticeTone}
          onCommentChange={updateCommentDraft}
          onCommentSubmit={(postId) =>
            submitComment(postId, { replyTarget: desktopReplyTarget })
          }
          onLike={(postId) => {
            // R4: sync ref 锁挡同帧双击。disabled={pending} 靠 React state，下一
            // 次 render 才生效；同帧 <16ms 连点 5 次时 5 个 click handler 全过
            // disabled，5 条 like POST 一起飞出去。
            if (desktopLikeSubmittingRef.current) return;
            if (!ensureCommentPostCanInteract(postId)) return;
            const post = desktopWorkspacePosts.find((p) => p.id === postId);
            desktopLikeSubmittingRef.current = true;
            likeMutation.mutate({
              postId,
              hasLiked: Boolean(post?.ownerState?.hasLiked),
            });
          }}
          onRefresh={() => {
            // R6: sync ref 锁同帧双击。disabled={refreshPending} 是 React state
            // 反推，同帧 3 次连点会触发 3 条 generate POST 把 LPP 队列撑爆。
            if (desktopGenerateSubmittingRef.current) return;
            desktopGenerateSubmittingRef.current = true;
            generateMutation.mutate();
          }}
          // 走查 2026-05-19 第五轮 R3：desktop workspace 顶部 errorMessage（home
          // 读失败）原来没 retry 按钮，对齐 mobile MobileChannelsStatusCard 的
          // 「重试读取」（L2678-2698）补一份；handleRetryLoad 已经存在（L1847）。
          onRetryLoad={handleRetryLoad}
          refreshPending={generateMutation.isPending}
          comments={desktopCommentsQuery.data ?? EMPTY_COMMENT_PREVIEW}
          commentsErrorMessage={desktopCommentPanelErrorMessage}
          commentsLoading={desktopCommentsQuery.isLoading}
          commentReplyTarget={desktopReplyTarget}
          commentLikePendingId={pendingLikeCommentId}
          onCancelCommentReply={() => setDesktopReplyTarget(null)}
          onCloseAuthor={closeChannelAuthor}
          onOpenAuthor={openChannelAuthor}
          onOpenAuthorPost={openChannelAuthorPost}
          onToggleAuthorFollow={(authorId, following) => {
            // R4 sync ref 锁同帧双击（同上面 onLike 注释）。
            if (desktopFollowSubmittingRef.current) return;
            desktopFollowSubmittingRef.current = true;
            followMutation.mutate({ authorId, following });
          }}
          onSectionChange={handleSectionChange}
          onToggleFavorite={(post) => {
            // R4 sync ref 锁同帧双击。
            if (desktopFavoriteSubmittingRef.current) return;
            desktopFavoriteSubmittingRef.current = true;
            toggleFavorite(post);
          }}
          onLikeComment={(comment) => {
            // R5 sync ref 锁同帧双击（同上面 onLike / onToggleFavorite /
            // onToggleAuthorFollow 注释）。
            if (commentLikeSubmittingRef.current) return;
            if (!ensureCommentPostCanInteract(comment.postId)) return;
            commentLikeSubmittingRef.current = true;
            likeCommentMutation.mutate({
              commentId: comment.id,
              postId: comment.postId,
            });
          }}
          onReplyToComment={(comment) =>
            setDesktopReplyTarget({
              authorId: comment.authorId,
              authorName: comment.authorName,
              commentId: comment.id,
              postId: comment.postId,
            })
          }
          onSelectedPostChange={setDesktopSelectedPostId}
          // 走查 2026-05-18 第二轮（本会话）R2：drawer 关闭时同时清 desktop
          // ReplyTarget — workspace 的 4 条 drawer 关路径（X 按钮 / Esc / 切 slide
          // 自动关 / baseUrl change reset）只 setCommentDrawerPostId(null)，
          // desktopReplyTarget 留着不动。用户在 A post 打开 drawer 点「回复 X」
          // → desktopReplyTarget={commentId:X, postId:A}，关 drawer → 再点其它
          // post 的评论按钮重开 drawer：drawer 仍渲「正在回复 X」头条，textarea
          // placeholder 也带 X 名字。但 X 是上条 post 的评论，新 post 上发送出去
          // 会被 commentMutation.onMutate 当作回复 X（reply parentCommentId=X.id），
          // server 端虽然能 reject 跨 post 的 parentCommentId，但仍属于"用户意图
          // 错位"。Mobile sheet 的 onClose L2798-2801 早就 setMobileReplyTarget(null)
          // 一起清，desktop 一直漏。
          // 修法：drawer postId 落 null 时 channels-page 这边一起清 replyTarget。
          // 既覆盖 X 按钮 / Esc 主动关，也覆盖自动关（切 slide / baseUrl change）。
          // setDesktopReplyTarget(null) 是幂等的，replyTarget 本来就是 null 时 React
          // useState Object.is 命中跳过 re-render，没副作用。
          onDrawerOpenChange={(postId) => {
            setDesktopCommentDrawerPostId(postId);
            if (postId === null) {
              setDesktopReplyTarget(null);
            }
          }}
          onViewPost={handleDesktopViewPost}
        />
      </Suspense>
    );
  }

  return (
    <AppPage className="space-y-0 px-0 pb-0 pt-0">
      <TabPageTopBar
        title={t(msg`视频号`)}
        subtitle={t(msg`内容推荐与视频动态`)}
        titleAlign="center"
        className="mx-0 mb-0 mt-0 border-b border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.94)] px-4 pb-1.5 pt-1.5 text-[color:var(--text-primary)] shadow-none"
        leftActions={
          <Button
            onClick={() => {
              navigateBackOrFallback(
                () => {
                  if (safeReturnPath) {
                    void navigate({
                      to: safeReturnPath,
                      ...(safeReturnHash ? { hash: safeReturnHash } : {}),
                    });
                    return;
                  }

                  void navigate({ to: "/tabs/discover" });
                },
                safeReturnPath ?? "/tabs/discover",
              );
            }}
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full border-0 bg-transparent text-[color:var(--text-primary)] active:bg-black/[0.05]"
            aria-label={t(msg`返回`)}
          >
            <ArrowLeft size={17} />
          </Button>
        }
        rightActions={
          <Button
            onClick={() => {
              // 走查 R2 新一轮：generateChannelPost 走 characters.findAllVisibleToOwner
              // 随机角色出一条 audio，永远落到「推荐」流——不会自动产生关注 / 朋友的
              // 视频号 / 直播。原顶部「换一批」按钮在 朋友 / 关注 / 直播 tab 上一样能
              // 点，notice 提示「新视频号正在生成中，几分钟后刷新看看」，但用户回这些
              // tab 永远看不到那条新 audio（不在筛选集合里），refresh 后仍是空态或者
              // 老的几条，体感「换一批没用」。empty state 的「去推荐看看」按钮已经按
              // 同款逻辑切到 recommended 再 generate，顶部按钮跟它对齐。
              if (
                activeSection === "following" ||
                activeSection === "friends" ||
                activeSection === "live"
              ) {
                handleSectionChange("recommended");
              }
              generateMutation.mutate();
            }}
            variant="ghost"
            size="sm"
            className="h-8 rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--bg-canvas-elevated)] px-3.5 text-[12px] font-medium text-[color:var(--text-primary)] hover:bg-white"
            disabled={generateMutation.isPending}
          >
            {generateMutation.isPending ? t(msg`生成中...`) : t(msg`换一批`)}
          </Button>
        }
      >
        <div className="mt-1.5 flex items-center gap-1" role="tablist" aria-label={t(msg`视频号分组`)}>
          {channelSections.map((section) => {
            const selected = activeSection === section.key;
            return (
              <button
                key={section.key}
                type="button"
                role="tab"
                aria-selected={selected}
                // 走查 2026-05-18 [本轮] R1：原来同时挂 aria-selected + aria-pressed
                // —— aria-pressed 是 button 角色（toggle 按钮）的状态属性，role="tab"
                // 的标准状态属性是 aria-selected。两者并存非标准：NVDA / 部分 SR 会
                // 把两个状态都念出来，用户听到「推荐 tab selected pressed」之类双重
                // 状态声明，体感"这控件是 tab 还是按钮？"。aria-pressed 移除，保留
                // aria-selected。
                onClick={() => handleSectionChange(section.key)}
                className={cn(
                  "inline-flex h-9 items-center rounded-full px-3 text-[11px] transition",
                  selected
                    ? "bg-[rgba(7,193,96,0.12)] font-medium text-[#07c160]"
                    : "border border-[color:var(--border-subtle)] bg-[color:var(--bg-canvas-elevated)] text-[color:var(--text-muted)]",
                )}
              >
                {section.label}
              </button>
            );
          })}
        </div>
      </TabPageTopBar>

      <div className="space-y-1.5 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-2.5">
        {notice ? (
          <InlineNotice
            className="rounded-[11px] px-2.5 py-1.5 text-[11px] leading-[1.35rem] shadow-none"
            tone={noticeTone}
            // 走查 2026-05-18 新会话 R1：InlineNotice 包的是裸 <div>，没有任何
            // role / aria-live。视频号 home 里 like / 收藏 / 关注 / 减少推荐 /
            // 转发 mutation onSuccess 走 setNotice 在这个位置冒一行 toast，
            // 视觉用户能立刻看到，但 SR 用户没有任何反馈 —— CDP 实测点完赞
            // 整页 aria-live region 数 = 0，VoiceOver / TalkBack 不会自动播报
            // "已点赞这条视频号" / "已转发给 X" / "减少推荐失败：xxx"，体感
            // "我按了按钮但什么都没发生"。
            // tone===danger / warning（视频号转发失败 / 评论提交失败这类阻塞
            // 错误）走 role="alert" → aria-live=assertive 立刻打断当前播报；
            // info / success / muted 走 role="status" → aria-live=polite
            // 排队播报，不打断用户当前阅读流。InlineNotice 是裸 props spread
            // 到 div，直接挂 role 走标准 ARIA 路径，不需要改基础组件。
            role={
              noticeTone === "danger" || noticeTone === "warning"
                ? "alert"
                : "status"
            }
          >
            {noticeTone === "info" &&
            (Boolean(noticeAction && noticeActionLabel) ||
              Boolean(safeReturnPath)) ? (
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1">{notice}</span>
                <div className="flex items-center gap-1.5">
                  {noticeAction && noticeActionLabel ? (
                    <button
                      type="button"
                      onClick={noticeAction}
                      className="shrink-0 rounded-full border border-[rgba(15,23,42,0.08)] bg-white px-2 py-0.5 text-[10px] font-medium text-[color:var(--text-secondary)]"
                    >
                      {noticeActionLabel}
                    </button>
                  ) : null}
                  {safeReturnPath ? (
                    // 只在确实有"上一页"可返回时显示这个按钮；之前一律 fallback 到
                    // "重试读取" 调 handleStatusBack（refetch home），但对像
                    // "视频号生成额度今日已用完" 这种 info 通知毫无意义——重读
                    // home 也不会让额度回来，反而让用户以为可以"再试一次"。
                    <button
                      type="button"
                      onClick={handleStatusBack}
                      className="shrink-0 rounded-full border border-[rgba(15,23,42,0.08)] bg-white px-2 py-0.5 text-[10px] font-medium text-[color:var(--text-secondary)]"
                    >
                      {t(msg`返回上一页`)}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              notice
            )}
          </InlineNotice>
        ) : null}
        {errorMessage ? (
          <MobileChannelsStatusCard
            badge={t(msg`读取失败`)}
            description={errorMessage}
            title={t(msg`视频号暂时不可用`)}
            tone="danger"
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 rounded-full border-[color:var(--border-subtle)] bg-white px-3.5 text-[11px]"
                  onClick={handleRetryLoad}
                >
                  {t(msg`重试读取`)}
                </Button>
                {safeReturnPath ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 rounded-full border-[color:var(--border-subtle)] bg-white px-3.5 text-[11px]"
                    onClick={handleStatusBack}
                  >
                    {t(msg`返回上一页`)}
                  </Button>
                ) : null}
              </div>
            }
          />
        ) : null}
        {channelsQuery.isLoading ? (
          <MobileChannelsStatusCard
            badge={t(msg`读取中`)}
            title={t(msg`正在刷新视频号内容`)}
            description={t(msg`稍等一下，正在同步推荐流和互动状态。`)}
            tone="loading"
          />
        ) : null}

        {!channelsQuery.isLoading && !errorMessage && !visiblePosts.length ? (
          <MobileChannelsStatusCard
            badge={t(msg`视频号`)}
            title={
              activeSection === "following"
                ? // 走查 2026-05-18 新一轮 R3：原文案 "还没关注任何视频号" 假设
                  // 用户 0 个关注，但用户在关注 tab 把所有关注作者的帖都「减少
                  // 推荐」掉时也会落到这条空态——明明在关注、文案却说「没关注」，
                  // 体感「我刚才关注的人去哪了？」。改成中性「关注的视频号暂时
                  // 没有新内容」，0 关注 / 0 可见两种场景都讲得通。
                  t(msg`关注的视频号暂时没有新内容`)
                : activeSection === "friends"
                  ? t(msg`朋友还没有视频号动态`)
                  : activeSection === "live"
                    ? t(msg`暂无正在直播`)
                    : t(msg`还没有内容`)
            }
            description={
              activeSection === "following"
                ? t(
                    msg`去推荐 tab 找一找感兴趣的作者，点 +关注 把他们留下来，新内容会在这里聚合显示。`,
                  )
                : activeSection === "friends"
                  ? t(
                      msg`等通讯录里的角色发新视频号动态，这里就会聚合显示。`,
                    )
                  : activeSection === "live"
                    ? t(msg`稍后再来看看，可能有角色开播。`)
                    : t(
                        msg`再生成一批内容后，这里会逐步形成更连续的视频推荐流。`,
                      )
            }
            action={
              <Button
                variant="primary"
                size="sm"
                className="h-8 rounded-full bg-[#07c160] px-3.5 text-[11px] text-white hover:bg-[#06ad56]"
                // 只有按钮实际行为是「换一批」时才跟 generateMutation.isPending 关：
                // - safeReturnPath 在 → 按钮是「返回上一页」，generate pending 不应该挡返回；
                // - following/friends/live → 按钮是「去推荐看看」，纯切 tab，也不挡。
                disabled={
                  !safeReturnPath &&
                  activeSection === "recommended" &&
                  generateMutation.isPending
                }
                onClick={handleEmptyStateAction}
              >
                {safeReturnPath
                  ? t(msg`返回上一页`)
                  : activeSection === "following" ||
                      activeSection === "friends" ||
                      activeSection === "live"
                    ? t(msg`去推荐看看`)
                    : generateMutation.isPending
                      ? t(msg`生成中...`)
                      : t(msg`换一批`)}
              </Button>
            }
          />
        ) : null}
        {!channelsQuery.isLoading && visiblePosts.length ? (
          <MobileChannelsViewport
            activeSection={activeSection}
            likePendingPostId={pendingLikePostId}
            favoritePendingPostId={pendingFavoritePostId}
            followPendingAuthorId={pendingFollowAuthorId}
            posts={visiblePosts}
            commentsPreviewByPostId={commentsPreviewByPostId}
            routeSelectedPostId={routeSelectedPostId}
            onLike={(postId) => {
              if (!ensureCommentPostCanInteract(postId)) return;
              const post = visiblePosts.find((p) => p.id === postId);
              likeMutation.mutate({
                postId,
                hasLiked: Boolean(post?.ownerState?.hasLiked),
              });
            }}
            onOpenAuthor={(post) =>
              openChannelAuthor(post.authorId, { sourcePostId: post.id })
            }
            onOpenComments={(post) => {
              setMobileCommentSheetPostId(post.id);
              setMobileReplyTarget(null);
            }}
            onNotInterested={hidePost}
            onShare={(post) => void handleSharePost(post)}
            onToggleFollowAuthor={toggleFollowAuthor}
            onToggleFavorite={toggleFavorite}
            onVisiblePost={handleMobileViewPost}
          />
        ) : null}
      </div>
      <MobileChannelCommentsSheet
        comments={mobileCommentsQuery.data ?? EMPTY_COMMENT_PREVIEW}
        commentsArePlaceholder={mobileCommentsQuery.isPlaceholderData}
        draft={
          mobileCommentSheetPost
            ? (commentDrafts[mobileCommentSheetPost.id] ?? "")
            : ""
        }
        errorActionLabel={mobileCommentSheetRetryAction?.label}
        errorMessage={mobileCommentSheetErrorMessage}
        isLoading={mobileCommentsQuery.isLoading}
        likePendingCommentId={pendingLikeCommentId}
        open={Boolean(mobileCommentSheetPost)}
        post={mobileCommentSheetPost}
        replyTarget={mobileReplyTarget}
        submitPending={pendingCommentPostId === mobileCommentSheetPost?.id}
        onCancelReply={() => setMobileReplyTarget(null)}
        onClose={() => {
          setMobileCommentSheetPostId(null);
          setMobileReplyTarget(null);
        }}
        onDraftChange={(value) => {
          if (!mobileCommentSheetPost) {
            return;
          }

          updateCommentDraft(mobileCommentSheetPost.id, value);
        }}
        onErrorAction={mobileCommentSheetRetryAction?.onClick}
        onLikeComment={(comment) => {
          // R5 sync ref 锁同帧双击（与 desktop drawer onLikeComment 同款）。
          if (commentLikeSubmittingRef.current) return;
          if (!ensureCommentPostCanInteract(comment.postId)) return;
          commentLikeSubmittingRef.current = true;
          likeCommentMutation.mutate({
            commentId: comment.id,
            postId: comment.postId,
          });
        }}
        onReply={(comment) =>
          setMobileReplyTarget({
            authorId: comment.authorId,
            authorName: comment.authorName,
            commentId: comment.id,
            postId: comment.postId,
          })
        }
        onSubmit={() => {
          if (!mobileCommentSheetPost) {
            return;
          }

          submitComment(mobileCommentSheetPost.id, {
            replyTarget: mobileReplyTarget,
          });
        }}
      />
      <ChannelsForwardPicker
        open={Boolean(forwardPickerPost)}
        postId={forwardPickerPost?.id ?? null}
        postExcerpt={forwardPickerPost?.excerpt}
        baseUrl={baseUrl}
        onClose={() => setForwardPickerPost(null)}
        onForwarded={(target, context) => {
          // 走查 2026-05-18 新一轮 R2：mid-flight 切账户 guard —— forward 真正
          // 跑在 A 账户上，慢网 RTT 期间用户切到 B 后这条 success toast 不该
          // 冒到 B 用户视野里（"我刚来 B 怎么收到了转发成功提示"）。picker 把
          // 开始 forward 时的 baseUrl 传回来，比对当前 mutationBaseUrlRef，跨
          // 账户时静默吞掉 toast。同 like/comment/favorite/follow 等 mutation 的
          // mid-flight 守卫一脉相承。
          if (context.mutationBaseUrl !== mutationBaseUrlRef.current) {
            return;
          }
          setNoticeTone("success");
          setNoticeActionLabel(null);
          setNoticeAction(null);
          setNotice(t(msg`已转发给 ${target.name}。`));
          // 走查 2026-05-17 R1：原来这里 invalidate 整张 home，注释说要刷
          // "shareCount 小角标"——但 MobileChannelsCard 上 Share2 按钮的 label
          // 始终是 t(msg`分享`)，从不读 post.shareCount；ownerState.hasShared 也
          // 只在乐观更新的兜底分支里被填 false，没有任何 UI 读它。整张 home
          // refetch 在公网隧道下 ~150-400ms + ~100KB 流量，纯浪费，且会跟刚
          // 出口"已转发"通知争用 React 渲染。移除——share 不影响视频号 home
          // 的任何可见状态；用户回头看到的更新数据自然由其它 mutation /
          // section 切换的 invalidate 推动。
        }}
        onForwardFailed={(input) => {
          // 走查 R9：picker 在 mutation pending 时不挡关闭，用户点完好友
          // 立刻关 picker，失败时 picker 内的红条已经不渲染，page 级 notice 兜底。
          //
          // 走查 2026-05-18 新一轮 R2：同款 mid-flight 切账户 guard ——失败 toast
          // 不冒到新账户。picker 内 errorMessage 已经在 baseUrl 变化时关闭随 picker
          // 一起被吞，page 级别这里也要补上。
          if (input.mutationBaseUrl !== mutationBaseUrlRef.current) {
            return;
          }
          // R6: 失败 toast → danger（详见 L153 注释）。
          setNoticeTone("danger");
          setNoticeActionLabel(null);
          setNoticeAction(null);
          setNotice(t(msg`转发给 ${input.targetName} 失败：${input.message}`));
        }}
      />
    </AppPage>
  );
}

function MobileChannelMediaSurface({
  post,
  active,
  userUnmuted,
  onUnlock,
}: {
  post: FeedPostListItem;
  active: boolean;
  userUnmuted: boolean;
  onUnlock: () => void;
}) {
  const t = useRuntimeTranslator();
  const audioAsset = post.media?.find((asset) => asset.kind === "audio");
  const videoAsset = post.media?.find((asset) => asset.kind === "video");

  if (post.mediaType === "audio" && (audioAsset || post.mediaUrl)) {
    const images = (post.media ?? []).filter(
      (asset): asset is Extract<typeof asset, { kind: "image" }> =>
        asset.kind === "image",
    );
    // 兜底：历史 audio 帖只有封面，把它当成单图沉浸式背景
    const fallbackPoster = audioAsset?.posterUrl ?? post.coverUrl ?? null;
    return (
      <ChannelAudioPictorial
        title={
          audioAsset?.title ?? post.title ?? `${post.authorName}·${t(msg`音乐`)}`
        }
        audioUrl={audioAsset?.url ?? post.mediaUrl ?? ""}
        images={images.map((asset) => asset.url)}
        fallbackPosterUrl={fallbackPoster}
        active={active}
        userUnmuted={userUnmuted}
        onUnlock={onUnlock}
      />
    );
  }

  if (post.mediaType === "video" && (videoAsset?.url || post.mediaUrl)) {
    const rawVideoUrl = videoAsset?.url ?? post.mediaUrl ?? undefined;
    const rawPosterUrl = videoAsset?.posterUrl ?? post.coverUrl ?? undefined;
    return (
      <ChannelVideoSurface
        videoUrl={rawVideoUrl}
        posterUrl={rawPosterUrl}
        active={active}
        userUnmuted={userUnmuted}
        onUnlock={onUnlock}
      />
    );
  }

  // 图集帖：mediaType=image 后端确实在 inferFeedMediaType 里会返回。
  // 之前直接走兜底"暂无可播放内容"黑屏；现在复用 audio 的 pictorial 视图
  // 走多图滑动，关掉音频。封面优先用 post.coverUrl，其次第一张 image。
  const imageAssets = (post.media ?? []).filter(
    (asset): asset is Extract<typeof asset, { kind: "image" }> =>
      asset.kind === "image",
  );
  if (
    post.mediaType === "image" &&
    (imageAssets.length > 0 || post.coverUrl || post.mediaUrl)
  ) {
    const fallbackPoster =
      post.coverUrl ?? imageAssets[0]?.url ?? post.mediaUrl ?? null;
    return (
      <ChannelAudioPictorial
        title={post.title ?? post.authorName}
        audioUrl=""
        images={imageAssets.map((asset) => asset.url)}
        fallbackPosterUrl={fallbackPoster}
        active={active}
        userUnmuted={userUnmuted}
        onUnlock={onUnlock}
      />
    );
  }

  // 走查 R1（本轮）：用户自己用 createOwnerPost(surface='channels', mediaType='text')
  // 发的纯文字帖（yuanzui R3 测试用过；任何走 curl/第三方端的客户端都能造）会
  // 落到 home 推荐流里——前端历来直接 fall through 到下方"暂无可播放内容"黑屏，
  // 用户看到自己写的 42 赞、6 评论那条帖完全空白，体感「我发的贴坏了」/「别人
  // 看不到内容」。和 image 帖的兜底思路一致：用 post.title / post.text 拼一张
  // 暗色文字卡，至少把内容显示出来；正文走 stripToolCallSyntax 过 AI 思考残留。
  const textContent = stripToolCallSyntax(post.text ?? "");
  if (post.title?.trim() || textContent.trim()) {
    // 走查 2026-05-18 新一轮 R4：原 px-8 + max-w-[22rem] + items-center 在 < 400px
    // 宽屏（绝大多数移动设备）上，居中的文字卡右边会被外层 action rail 的 40x40
    // 按钮（rgba(15,23,42,0.62) 不透明 backdrop + blur）盖住 22-54px。action rail
    // 是 MobileChannelsCard 里 absolute inset-y-0 right-0 + pr-3.5 的 sibling，
    // z-order 在 MobileChannelMediaSurface 之后渲，肉眼覆盖。
    // bottom 内容区已经按 `max-w-[calc(100%-4.25rem)]` 给 action rail 留 68px
    // 出来；文字帖兜底没接这层。靠 pr-[4.25rem] 给右侧让出 68px（比 pl 多），
    // 文字居中视觉上仍然居中（max-w 在让出空间后的可用区域内 ~280px 容纳长
    // text-center），rail 不再压字。
    // 注：text post 在 yuanzui R3 测试帖上线后是真实存在的 case，curl / 第三方
    // 端口造的 owner post 也走这条；不是「只有调试用户撞」的稀有路径。
    return (
      <div className="relative flex h-full min-h-[calc(100dvh-12rem)] w-full items-center justify-center overflow-hidden bg-gradient-to-b from-[#1f2533] to-[#0a0c10] pb-8 pl-8 pr-[4.25rem] pt-8">
        <div className="max-w-[22rem] text-center text-white">
          {post.title?.trim() ? (
            <div className="text-[22px] font-semibold leading-[1.6]">
              {post.title}
            </div>
          ) : null}
          {textContent.trim() && textContent !== post.title ? (
            <div className="mt-3 text-[14px] leading-[1.7] text-white/82 line-clamp-[8]">
              {textContent}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  // 走查 2026-05-18 新一轮 R4：跟上面文字卡同款问题——"暂无可播放内容"标题 +
  // "稍后再来看看"副标题居中，右侧被 action rail 按钮盖住一部分。窄屏（≤ 360px）
  // 上 "暂无可播放内容" 末尾的"容"字会被点赞按钮的 dark backdrop 切掉一半。
  // 同样靠 pr-[4.25rem] 给 action rail 让位。
  return (
    <div className="flex min-h-[calc(100dvh-12rem)] w-full items-center justify-center bg-black pb-6 pl-6 pr-[4.25rem] pt-6 text-center">
      <div>
        <div className="text-[16px] font-semibold text-white">
          {t(msg`暂无可播放内容`)}
        </div>
        <div className="mt-2 text-[13px] leading-6 text-white/72">
          {t(msg`稍后再来看看`)}
        </div>
      </div>
    </div>
  );
}

// 底部进度条 + 拖动 seek：音视频共用。
// 视觉：贴卡片底部、细线（默认 3px，按下拉宽到 6px + 圆形 thumb），白色填充已播放部分。
// 交互：pointer events 统一处理鼠标 / 触屏 / 笔。setPointerCapture 让手指滑出条外也跟手。
// 阻止 touch / click 冒泡，避免触发外层 ChannelAudioPictorial 的 swipe / tap-to-pause。
function MediaProgressBar({
  mediaRef,
  active,
}: {
  mediaRef: React.RefObject<HTMLMediaElement | null>;
  active: boolean;
}) {
  const [progress, setProgress] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const scrubbingRef = useRef(false);
  const scrubProgressRef = useRef(0);
  const trackRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;
    const sync = () => {
      if (scrubbingRef.current) return;
      const d = media.duration;
      if (d > 0 && Number.isFinite(d)) {
        setProgress(media.currentTime / d);
      }
    };
    media.addEventListener("timeupdate", sync);
    media.addEventListener("loadedmetadata", sync);
    media.addEventListener("durationchange", sync);
    sync();
    return () => {
      media.removeEventListener("timeupdate", sync);
      media.removeEventListener("loadedmetadata", sync);
      media.removeEventListener("durationchange", sync);
    };
  }, [mediaRef]);

  // 卡片切走时进度条归零，下次进入避免显示上一首的位置
  useEffect(() => {
    if (!active) setProgress(0);
  }, [active]);

  const computeRatio = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    const r = (clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(1, r));
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // 某些环境 setPointerCapture 会抛——忽略即可，仍能通过 move/up 事件继续 scrub
    }
    scrubbingRef.current = true;
    setScrubbing(true);
    const r = computeRatio(event.clientX);
    scrubProgressRef.current = r;
    setProgress(r);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubbingRef.current) return;
    event.stopPropagation();
    const r = computeRatio(event.clientX);
    scrubProgressRef.current = r;
    setProgress(r);
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubbingRef.current) return;
    event.stopPropagation();
    scrubbingRef.current = false;
    setScrubbing(false);
    const media = mediaRef.current;
    if (media && media.duration > 0 && Number.isFinite(media.duration)) {
      media.currentTime = scrubProgressRef.current * media.duration;
    }
  };

  // 触屏 / 鼠标 / 合成 click 都要拦下来，避免外层 tap-to-pause / swipe 误触
  const stopTouch = (event: React.TouchEvent<HTMLDivElement>) =>
    event.stopPropagation();
  const stopClick = (event: React.MouseEvent<HTMLDivElement>) =>
    event.stopPropagation();

  return (
    <div
      className="pointer-events-auto absolute inset-x-0 z-20 touch-none px-3 py-2.5"
      style={{ bottom: "max(env(safe-area-inset-bottom,0px), 0px)" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onTouchStart={stopTouch}
      onTouchMove={stopTouch}
      onTouchEnd={stopTouch}
      onClick={stopClick}
    >
      <div
        ref={trackRef}
        className={cn(
          "relative w-full rounded-full bg-white/30 transition-[height]",
          scrubbing ? "h-1.5" : "h-[3px]",
        )}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-white"
          style={{ width: `${progress * 100}%` }}
        />
        {scrubbing ? (
          <div
            className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow"
            style={{ left: `${progress * 100}%` }}
          />
        ) : null}
      </div>
    </div>
  );
}

// 视频号"图文视频"沉浸式渲染：全卡背景图 + 左右滑切配图 + dots + 音频自动播。
// 历史音乐帖没有多图（images=[]）时，使用 fallbackPosterUrl 当唯一背景，禁用滑动。
//
// 交互参考抖音 / 微信视频号：无显式静音 / 暂停按钮；首次点击解除静音 + 保持播放，
// 之后点击切换 play/pause；暂停态显示居中大 Play 图标作为状态提示。
function ChannelAudioPictorial({
  title,
  audioUrl,
  images,
  fallbackPosterUrl,
  active,
  userUnmuted,
  onUnlock,
}: {
  title: string;
  audioUrl: string;
  images: string[];
  fallbackPosterUrl: string | null;
  active: boolean;
  userUnmuted: boolean;
  onUnlock: () => void;
}) {
  const t = useRuntimeTranslator();
  const displayImages =
    images.length > 0
      ? images
      : fallbackPosterUrl
        ? [fallbackPosterUrl]
        : [];
  const [imageIndex, setImageIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  // 走查 2026-05-18 新一轮 R2：rapid scroll 通过 N 张卡时每张 active 闪一下
  // → src 立即被设成 mp3 URL → 浏览器开始下载 → 200ms 后 src 被移除 →
  // 下载被 ERR_ABORTED 取消。实测快速滑过 4 张卡产生 4 次 partial download，
  // 公网隧道下浪费 ~25KB/张 × 4 = ~100KB 流量；每张 audio 元素还要走 pause +
  // load() 释放周期一次。
  // 引入 250ms 防抖：active=true 后停留 250ms 才视为「真的在这条卡上」，
  // 这时才让 <audio src=...> 接 URL；active=false 立即视为离开（pause+reset）。
  // 250ms 覆盖典型快速滑动（snap-mandatory 切卡 ~150-300ms），慢扫 / 用户
  // 停留观看（>250ms）的常规路径完全不受影响。
  const [mediaActive, setMediaActive] = useState(false);
  useEffect(() => {
    if (active) {
      const timer = window.setTimeout(() => setMediaActive(true), 250);
      return () => window.clearTimeout(timer);
    }
    setMediaActive(false);
  }, [active]);
  // 走查 R1 新一轮：cover/poster img 失败时之前没兜底，浏览器原生 broken-image
  // 占位会盖在沉浸式播放区——音频还在播但视觉是一张破图，体感"卡片坏了"。
  // 维护被标记失败的图片 url 集合；渲染时把这些 url 替换成渐变 Music2 占位。
  const [failedImageUrls, setFailedImageUrls] = useState<Set<string>>(
    () => new Set(),
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const swipeHandledRef = useRef(false);
  // 走查 R12 #1：touchend 处理完 tap 后浏览器还会合成一次 click，原 handleClick
  // 仅靠 touchStartXRef !== null 拦不住——touchend 里已经把它清成 null，
  // 合成 click 跑下来又会再 handleTap() 一次，等于点一下 → 一次 pause→一次 play
  // （或反之），用户 tap 想暂停永远暂停不下来，首次 tap 想解除静音也会立刻被
  // 反向 toggle 回去。touchend 走过 tap 后把这个 flag 置 1，吞掉紧跟着的合成 click。
  const suppressNextClickRef = useRef(false);
  // 走查 R13：竖向滑（用户想往下翻到下一张卡）会进 touchstart/touchmove/touchend：
  // handleTouchMove 只在横向位移超阈值时 setSwipeHandledRef，竖向情况下没被标记，
  // touchend 走完 wasSwipe=false 分支 → handleTap() → audio 莫名其妙暂停。
  // 真机上滑动到下一张快滚走时 IntersectionObserver 立刻把 activePostId 切走、
  // 老卡的 useEffect 把 audio.pause() 兜底回去，肉眼看不出来；但在 *同一张卡内*
  // 用户只是稍微往下拖一截（snap-mandatory 会回弹），audio 就真的被 tap 暂停了，
  // 用户没法理解为什么"我什么都没点"音乐就停。任何方向超过 10px 都视为非 tap。
  const movedBeyondTapRef = useRef(false);

  // 进入 active 时播放，离开时暂停 + 复位（保证全局只有一条 audio 在响）。
  // 注意：userUnmuted 不是这里的依赖——否则用户主动暂停后再切静音，会被
  // 重新强制 play()，违反暂停意图。muted 同步交给下方独立 effect。
  //
  // 走查 新一轮 R3：用 ref 缓存「最近一次 userUnmuted」给 catch 用——
  // 不进 useEffect deps（避免 user 解锁瞬间整段 effect 重跑触发抢断 play）。
  const userUnmutedRef = useRef(userUnmuted);
  userUnmutedRef.current = userUnmuted;
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    // 用 mediaActive（debounced active）控制播放/释放，跳过 fast scroll 里的
    // 短暂 active 窗口；JSX 里的 src/preload 也跟着 mediaActive 走，保持一致。
    if (mediaActive && audioUrl) {
      audio.muted = !userUnmuted;
      const promise = audio.play();
      if (promise && typeof promise.catch === "function") {
        promise.catch(() => {
          // 走查 新一轮 R3：原 catch 一律 muted-retry——这是为了绕过浏览器
          // autoplay policy（没用户手势前 unmuted play 直接拒）。但用户已经
          // 解锁过音频（userUnmuted=true）后还失败的是 codec / 网络 / 媒体
          // 格式问题，muted 重放无济于事；更糟的是 audio.muted=true 被卡死、
          // 而 userUnmuted state 仍 true 不会触发下面 userUnmuted-effect 重置
          // muted，结果用户看到 pictorial 渲好却永远静音、tap 也救不回（
          // handleTap 因 userUnmuted=true 走 toggle 分支不动 muted）。
          // 只在没解锁过的场景才走 muted 兜底；解锁过则让这次 play() 失败，
          // 由 user tap → handleTap → audio.play() 自然重试。
          if (!userUnmutedRef.current) {
            audio.muted = true;
            audio.play().catch(() => undefined);
          }
        });
      }
    } else {
      audio.pause();
      audio.currentTime = 0;
      // 走查 R1（本轮）：仅 pause + reset 不释放浏览器为这条 audio 已下载的
      // 缓冲。React 把 src 属性移除后，Chromium / Firefox 仍持有上一份 mp3 数据，
      // 直到 audio.load() 或 GC。视频号 20 张卡按顺序滑过去，每张「曾 active」过
      // 的 audio 都会留 ~100-500KB 的残留 buffer（30s 128kbps mp3 ≈ 480KB），
      // 全部滑完累计可达 5-10MB 挂在视频号页直到用户离开。这里 load() 强制把
      // media element 重置成 "无源" 初始态，立即释放缓冲。无 src 时 load() 只
      // 触发 emptied 事件、不发请求，安全。
      audio.load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaActive, audioUrl]);

  // mute 切换仅同步 audio.muted，不重新 play
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.muted = !userUnmuted;
  }, [userUnmuted]);

  // 切贴时重置图片索引
  useEffect(() => {
    if (!active) setImageIndex(0);
  }, [active]);

  // 走查 R3（本轮）：组件 unmount 时主动 pause —— 现实场景是用户在 active 卡上
  // 点了"减少推荐"，hidePost → notInterestedMutation.onMutate 把这条 post 直接从
  // visiblePosts filter 掉，对应的 MobileChannelsCard 立刻 unmount。但是 React
  // 把 <audio> 从 DOM 摘掉后 Chromium / Firefox 是不会自动 pause 的（webkit
  // 实测会），audio 在内存里继续 loop 直到用户离开整个 channels 页或刷新——
  // 用户听到自己刚刚说"不感兴趣"的那条音乐还在响，体感比不静音更怪。
  // 单独一个空依赖的 effect 兜 unmount。
  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      audio?.pause();
    };
  }, []);

  // tab 切到后台时主动 pause，回前台时按"切走前是否在播"决定是否 resume——
  // desktop Chrome 默认背景标签里 HTML5 audio 不会自动暂停，视频号 BGM 会
  // 一直跟着用户去别的标签里响，电池/数据/隐私都不友好。
  // 只对当前 active 卡处理；非 active 卡反正已经 pause 了。
  useEffect(() => {
    if (!active || !audioUrl) return;
    const audio = audioRef.current;
    if (!audio) return;
    let wasPlayingBeforeHide = false;
    const onVisibilityChange = () => {
      if (document.hidden) {
        wasPlayingBeforeHide = !audio.paused;
        if (wasPlayingBeforeHide) audio.pause();
      } else if (wasPlayingBeforeHide) {
        audio.play().catch(() => undefined);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [active, audioUrl]);

  const canSwipe = displayImages.length > 1;

  const goNext = () => {
    if (!canSwipe) return;
    setImageIndex((i) => (i + 1 >= displayImages.length ? 0 : i + 1));
  };
  const goPrev = () => {
    if (!canSwipe) return;
    setImageIndex((i) => (i - 1 < 0 ? displayImages.length - 1 : i - 1));
  };

  // 点击屏幕处理：首次点解除静音 + 强制 play；之后切 play/pause。
  //
  // 走查 R2（本轮）：图集帖（mediaType=image）也复用本组件，但传入 audioUrl=""
  // 表示"没有音轨"。原 handleTap 不分 audioUrl 都会 onUnlock() 把 viewport 级
  // userUnmuted 翻 true；用户只是在看图集一拍了张图，下一张滑到的 audio 帖
  // 立刻被自动 unmuted 播放，没有任何提示，体感像"莫名其妙突然出声"。
  // 没有音轨的卡 tap 当 no-op：不要替用户决定 unmute 整页音频。
  const handleTap = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audioUrl) return;
    if (!userUnmuted) {
      onUnlock();
      audio.muted = false;
      if (audio.paused) audio.play().catch(() => undefined);
      return;
    }
    if (audio.paused) {
      audio.play().catch(() => undefined);
    } else {
      audio.pause();
    }
  };

  const handleTouchStart = (event: React.TouchEvent) => {
    const touch = event.touches[0];
    if (!touch) return;
    touchStartXRef.current = touch.clientX;
    touchStartYRef.current = touch.clientY;
    swipeHandledRef.current = false;
    movedBeyondTapRef.current = false;
  };
  const handleTouchMove = (event: React.TouchEvent) => {
    if (swipeHandledRef.current) return;
    const touch = event.touches[0];
    if (!touch || touchStartXRef.current == null || touchStartYRef.current == null) {
      return;
    }
    const dx = touch.clientX - touchStartXRef.current;
    const dy = touch.clientY - touchStartYRef.current;
    // 任何方向超过 10px 就算"用户在滑而不是点"——iOS/Android tap 阈值都在这附近，
    // touchend 时拒绝走 handleTap，避免竖向滚动顺手把 audio 暂停 / 解除静音。
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
      movedBeyondTapRef.current = true;
    }
    // 横向位移占主导且超阈值 → 切图；竖向占主导 → 让外层 snap-y 接管
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      swipeHandledRef.current = true;
      if (dx < 0) goNext();
      else goPrev();
    }
  };
  const handleTouchEnd = () => {
    const wasSwipe = swipeHandledRef.current;
    const movedBeyondTap = movedBeyondTapRef.current;
    touchStartXRef.current = null;
    touchStartYRef.current = null;
    if (!wasSwipe && !movedBeyondTap) {
      // 纯点击：切播放/暂停（首次顺带解除静音）
      // 标记：本次合成 click 要被吞掉，否则下面 handleClick 会再跑一次 handleTap
      suppressNextClickRef.current = true;
      handleTap();
    }
    // 走查 2026-05-18 [本轮] R2：原注释说「不在这里清，下面 onClick 还要看；都改在
    // touchStart 重置」—— 但这只覆盖「下一次交互是 touch」的场景。混合设备（iPad
    // + 外接鼠标 / Surface / 带触屏的 Chromebook / 桌面浏览器触屏 emulator）下，
    // 用户在 touch swipe / 竖向 scroll 之后切去鼠标点同一张卡：
    //   1) handleTouchEnd 写入 swipeHandledRef=true / movedBeyondTapRef=true
    //      （走 wasSwipe / movedBeyondTap 分支不进 handleTap）
    //   2) 浏览器合成 click 在 touchend 同帧 fire → handleClick 读到 swipeHandledRef
    //      或 movedBeyondTapRef = true → 正确 return 吞掉。
    //   3) （之后没有 touchstart）用户拿鼠标点视频号卡 → handleClick 仍然读到
    //      swipeHandledRef = true（永远停在上次 touch 留下的值）→ return → 鼠标
    //      tap 被静默吞掉，audio 不切 play/pause，体感「鼠标按下完全没反应」。
    //      要再 touch 一次（重置 ref）才能恢复鼠标交互。
    // 用 rAF 延后清空：紧跟着的合成 click 在当前 / 下一帧前先 fire 看到 stale=true
    // 拦掉；rAF callback 跑完后 refs=false，后续真鼠标 click（典型间隔 >> 1 帧）
    // 落到 fresh=false 路径正常 handleTap。
    window.requestAnimationFrame(() => {
      swipeHandledRef.current = false;
      movedBeyondTapRef.current = false;
    });
  };
  // 桌面鼠标场景兜底：触屏 touchend 后浏览器仍会合成 click，但 swipe
  // 期间 click 多数浏览器会自动取消；这里只为非触屏鼠标点击服务。
  const handleClick = (event: React.MouseEvent) => {
    if (event.detail === 0) return; // 由键盘等触发的 synthetic click 忽略
    // touch 路径已经在 touchend 里跑过 handleTap；suppress flag 吃掉对应的合成 click。
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    if (swipeHandledRef.current) return;
    // touch 路径下大幅滑动浏览器通常不会再 fire 合成 click，但同样兜底拦一下，
    // 避免某些设备上的边缘行为重新触发 handleTap。
    if (movedBeyondTapRef.current) return;
    handleTap();
  };
  // 走查 2026-05-18 新一轮 R1：role="button" + tabIndex=0 把媒体面板纳入了键盘
  // tab 序列，aria-label 也告知 SR 这是"播放/暂停按钮"，但原代码只挂了 onClick
  // ——键盘 Enter/Space 不 fire onClick（合成 click event.detail === 0 还被
  // handleClick 主动忽略掉），desktop 移动视口下用键盘 tab 到这里再按 Space/
  // Enter 完全无反应，role 承诺的"按钮"行为对键盘用户失效。
  // 显式拦 Enter/Space 直接走 handleTap（跳过 click 合成那一圈），并阻止
  // Space 默认滚动行为。
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    handleTap();
  };

  const currentImage = displayImages[imageIndex];
  const currentImageFailed = currentImage
    ? failedImageUrls.has(currentImage)
    : false;

  return (
    <div
      className="relative h-full min-h-[calc(100dvh-12rem)] w-full overflow-hidden bg-black"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={isPlaying ? t(msg`暂停`) : t(msg`播放`)}
    >
      {currentImage && !currentImageFailed ? (
        <img
          key={currentImage}
          src={resolveAppMediaUrl(currentImage)}
          alt={title}
          draggable={false}
          // active 卡可见，其余卡都堆在下方 snap-y 列表里不可见；
          // 没有 lazy 时 ~20 张专辑封面同时拉，公网隧道下首屏明显堆积。
          loading={active ? "eager" : "lazy"}
          decoding="async"
          onError={() => {
            // 走查 R1 新一轮：minimax 出的 cover 图偶发 404 / cloud-api 反代
            // 401（token expire 边界）/ 网络掉包。原本浏览器直接显示破图占位，
            // 盖在 audio 播放区上头，体感像「整张卡片坏了」实际音频还在响。
            // 标记失败 → 切到 Music2 渐变兜底；切到别的图 / 离开 active 卡 +
            // 再回来 重新尝试加载（setState 触发重渲染时若该 url 仍在 set 里，
            // 不会重试；用户主动刷新页面才彻底重试，避免 hot-loop）。
            setFailedImageUrls((prev) => {
              if (prev.has(currentImage)) return prev;
              const next = new Set(prev);
              next.add(currentImage);
              return next;
            });
          }}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        // 走查 2026-05-18 R2：原 fallback 一律渲 Music2 音符图标——音频帖
        // 是合理的（没封面就是音频流），但图集帖（mediaType=image）也复用
        // 本组件且把 audioUrl 传空串，所有图片 url 失败 / 没 cover 时同样
        // 落到这里，用户看到一张「图集帖」突然变成音符图标，体感「这不是
        // 我看的那条」/「图集变成了音乐」。按 audioUrl 是否为空区分：
        // 没音轨用 ImageIcon（lucide），保持图集语义。
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-[#1f2533] to-[#0a0c10]">
          {audioUrl ? (
            <Music2 size={56} className="text-white/40" />
          ) : (
            <ImageIcon size={56} className="text-white/40" />
          )}
        </div>
      )}

      {/* 桌面/平板鼠标用左右大箭头 */}
      {canSwipe ? (
        <>
          <button
            type="button"
            aria-label={t(msg`上一张`)}
            onClick={(event) => {
              event.stopPropagation();
              goPrev();
            }}
            className="group absolute left-2 top-1/2 z-20 hidden -translate-y-1/2 items-center justify-center rounded-full bg-black/30 p-2 text-white/80 backdrop-blur-sm transition hover:bg-black/50 md:flex"
          >
            <ArrowLeft size={20} />
          </button>
          <button
            type="button"
            aria-label={t(msg`下一张`)}
            onClick={(event) => {
              event.stopPropagation();
              goNext();
            }}
            className="group absolute right-2 top-1/2 z-20 hidden -translate-y-1/2 items-center justify-center rounded-full bg-black/30 p-2 text-white/80 backdrop-blur-sm transition hover:bg-black/50 md:flex"
          >
            <ArrowLeft size={20} className="rotate-180" />
          </button>
        </>
      ) : null}

      {/* 暂停状态指示：居中大 Play 图标。
          图集帖（audioUrl=""）没有播放/暂停语义，否则用户点一下解除静音后就一直挂着 Play 图标。 */}
      {audioUrl && active && userUnmuted && !isPlaying ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-black/45 backdrop-blur-sm">
            <Play size={32} className="text-white" fill="white" />
          </div>
        </div>
      ) : null}

      {/* 底部居中 dots */}
      {canSwipe ? (
        <div className="pointer-events-none absolute left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5"
          style={{ bottom: "max(env(safe-area-inset-bottom,0px), 16rem)" }}
        >
          {displayImages.map((_, idx) => (
            <span
              key={idx}
              className={cn(
                "h-1.5 rounded-full transition-all",
                idx === imageIndex
                  ? "w-5 bg-white"
                  : "w-1.5 bg-white/45",
              )}
            />
          ))}
        </div>
      ) : null}

      {/* 隐藏音频元素：实际播放走 useEffect 控制。
          仅 mediaActive 卡挂 src + preload metadata；其它卡 src 留空避免 25+ 卡
          一起触发 mp3 metadata 拉取（实测一次 /discover/channels 进入会并发
          27 条 minimax-music.mp3，离开时全 ERR_ABORTED，纯浪费带宽与公网隧道
          RTT，移动端公网下首屏会卡顿）。
          走查 2026-05-18 新一轮 R2：src/preload 跟着 mediaActive（debounced
          active）走，rapid scroll 通过卡时不再触发 partial download → 流量降。 */}
      <audio
        ref={audioRef}
        src={mediaActive && audioUrl ? resolveAppMediaUrl(audioUrl) : undefined}
        loop
        preload={mediaActive ? "metadata" : "none"}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        className="hidden"
      />

      {/* 图集帖（audioUrl="") 没东西可 seek，进度条会一直停在 0% 又占点击区——直接不渲染。 */}
      {audioUrl ? (
        <MediaProgressBar mediaRef={audioRef} active={active} />
      ) : null}
    </div>
  );
}

// 视频沉浸式播放：active 时自动播 + muted 跟 userUnmuted；离开暂停 + 复位。
// 交互参考抖音 / 微信视频号：无显式静音 / 暂停按钮；首次点击解除静音 + 保持播放，
// 之后点击切换 play/pause；暂停态显示居中大 Play 图标作为状态提示。
function ChannelVideoSurface({
  videoUrl,
  posterUrl,
  active,
  userUnmuted,
  onUnlock,
}: {
  videoUrl: string | undefined;
  posterUrl: string | undefined;
  active: boolean;
  userUnmuted: boolean;
  onUnlock: () => void;
}) {
  const t = useRuntimeTranslator();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  // 走查 2026-05-18 新一轮 R2：跟 ChannelAudioPictorial 同款 mediaActive 防抖。
  // 视频体积比音频还大（5s 720p ≈ 1-2MB），rapid scroll 误触发 partial download
  // 的浪费更明显（4 张视频卡快滑 ≈ 100-300KB 公网流量打水漂）。250ms 防抖
  // 让短暂闪过的卡跳过 src 设置，settled 后才走 preload=auto + play()。
  const [mediaActive, setMediaActive] = useState(false);
  useEffect(() => {
    if (active) {
      const timer = window.setTimeout(() => setMediaActive(true), 250);
      return () => window.clearTimeout(timer);
    }
    setMediaActive(false);
  }, [active]);

  // 同 audio：userUnmuted 不当依赖，避免用户暂停后被强制 replay。
  // 走查 新一轮 R3：跟 ChannelAudioPictorial 同坑——已解锁后 play() 失败
  // 走 muted 重放会把 video.muted 卡死、user 永远没声音。ref 拿最新 userUnmuted。
  const userUnmutedRef = useRef(userUnmuted);
  userUnmutedRef.current = userUnmuted;
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (mediaActive && videoUrl) {
      video.muted = !userUnmuted;
      const promise = video.play();
      if (promise && typeof promise.catch === "function") {
        promise.catch(() => {
          if (!userUnmutedRef.current) {
            video.muted = true;
            video.play().catch(() => undefined);
          }
        });
      }
    } else {
      video.pause();
      video.currentTime = 0;
      // 走查 R1（本轮）：同 ChannelAudioPictorial——单纯 pause 不释放浏览器
      // 已下载的视频 buffer。视频体积更大（5s minimax 720p 视频 ≈ 1-2MB），
      // 滑过去若干视频卡后内存增长更显著。load() 触发 emptied 释放资源。
      video.load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaActive, videoUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) video.muted = !userUnmuted;
  }, [userUnmuted]);

  // 走查 R3（本轮）：同 ChannelAudioPictorial 的 unmount-pause 兜底——用户在
  // 视频卡上"减少推荐"立刻把 active 卡 unmount，<video> 从 DOM 摘掉后
  // Chromium 不会自动 pause；音轨会继续 loop 直到刷新。
  //
  // 走查 R3（新一轮）：原来 mount 期 `const video = videoRef.current` 把第一个
  // <video> 元素 capture 进闭包，但 <video key={videoUrl}> 在 videoUrl 变化时
  // 会强制 remount，videoRef.current 切到新元素而闭包里 video 仍指老元素。等
  // ChannelVideoSurface 整体 unmount 时 pause 的是已经被 React 摘掉的老元素，
  // 真正还在播的新元素得不到 pause —— 浏览器不会自动 pause detached video，
  // 视频号继续 loop。改成 cleanup 时现读 videoRef.current（React unmount 顺序：
  // 先跑 effect cleanup 再 unmount 子树，此时 ref 仍指向最新元素）。
  useEffect(() => {
    return () => {
      videoRef.current?.pause();
    };
  }, []);

  // 同 audio：tab 切到后台时主动 pause，回前台按切走前状态恢复。
  useEffect(() => {
    if (!active || !videoUrl) return;
    const video = videoRef.current;
    if (!video) return;
    let wasPlayingBeforeHide = false;
    const onVisibilityChange = () => {
      if (document.hidden) {
        wasPlayingBeforeHide = !video.paused;
        if (wasPlayingBeforeHide) video.pause();
      } else if (wasPlayingBeforeHide) {
        video.play().catch(() => undefined);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [active, videoUrl]);

  const handleTap = () => {
    const video = videoRef.current;
    if (!video) return;
    if (!userUnmuted) {
      onUnlock();
      video.muted = false;
      if (video.paused) video.play().catch(() => undefined);
      return;
    }
    if (video.paused) {
      video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  };

  // 走查 2026-05-18 新一轮 R1：跟 ChannelAudioPictorial 同款键盘 a11y 修复——
  // role="button" + tabIndex=0 但只挂 onClick，Enter/Space 触发不了 play/pause。
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    handleTap();
  };

  return (
    <div
      className="relative h-full min-h-[calc(100dvh-12rem)] w-full bg-black"
      onClick={handleTap}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={isPlaying ? t(msg`暂停`) : t(msg`播放`)}
    >
      {/* 仅 mediaActive 卡挂 src；其它卡只显 poster，避免页面挂 N 个 <video>
          自动拉 metadata（每条几百 KB）。视频源切换由 mediaActive 翻转 + 上面
          useEffect 的 .play() 触发，poster 始终可见保持视觉。
          走查 2026-05-18 新一轮 R2：src/preload 跟着 mediaActive（debounced
          active）走，rapid scroll 通过卡时不再触发视频 partial download。 */}
      <video
        ref={videoRef}
        key={`video:${videoUrl ?? ""}`}
        src={mediaActive && videoUrl ? resolveAppMediaUrl(videoUrl) : undefined}
        poster={posterUrl ? resolveAppMediaUrl(posterUrl) : undefined}
        playsInline
        loop
        preload={mediaActive ? "auto" : "none"}
        controls={false}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        className="pointer-events-none h-full min-h-[calc(100dvh-12rem)] w-full object-cover"
      />
      {active && userUnmuted && !isPlaying ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-black/45 backdrop-blur-sm">
            <Play size={32} className="text-white" fill="white" />
          </div>
        </div>
      ) : null}

      {/* 走查 新一轮 R4：<video> 用 key 在 videoUrl 切换时强制
          remount，但 MediaProgressBar 内部的 useEffect deps 是 [mediaRef]——
          mediaRef 是稳定的 ref 对象、identity 不变，effect 不再 fire 给新
          的 video element 绑 timeupdate / loadedmetadata / durationchange 监听。
          老监听挂在已销毁的 element 上，新 element 没有监听，进度条卡死在 0%。
          同步把 key 传给 MediaProgressBar 让它跟随 videoUrl 一起 remount，
          effect 重跑、监听挂到新 element。
          走查 2026-05-17 R2：原来 <video> 和 MediaProgressBar 这两个兄弟节点
          都用 key={videoUrl} —— 同 parent children list 里 key 撞车，React 抛
          "Encountered two children with the same key" warning（实测 R2 走查
          扫到 12 条），后果是 React 会随机舍弃一个组件实例（reconcile 时只
          认第一个匹配 key），video 或 ProgressBar 可能错位复用老实例 → poster
          / 进度条挂在错误 videoUrl 的元素上。给两边的 key 加 `video:` /
          `progress:` 前缀消歧义。 */}
      <MediaProgressBar key={`progress:${videoUrl ?? ""}`} mediaRef={videoRef} active={active} />
    </div>
  );
}

function MobileChannelsStatusCard({
  badge,
  title,
  description,
  tone = "default",
  action,
}: {
  badge: string;
  title: string;
  description: string;
  tone?: "default" | "danger" | "loading";
  action?: ReactNode;
}) {
  const loading = tone === "loading";
  return (
    <section
      className={cn(
        "rounded-[16px] border px-3.5 py-4 text-center shadow-none",
        tone === "danger"
          ? "border-[color:var(--border-danger)] bg-[linear-gradient(180deg,rgba(255,245,245,0.96),rgba(254,242,242,0.94))]"
          : "border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]",
      )}
    >
      <div
        className={cn(
          "mx-auto inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium tracking-[0.04em]",
          tone === "danger"
            ? "bg-[rgba(220,38,38,0.08)] text-[color:var(--state-danger-text)]"
            : "bg-[rgba(7,193,96,0.1)] text-[#07c160]",
        )}
      >
        {badge}
      </div>
      {loading ? (
        <div className="mt-2.5 flex items-center justify-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-black/15 animate-pulse" />
          <span className="h-2 w-2 rounded-full bg-black/25 animate-pulse [animation-delay:120ms]" />
          <span className="h-2 w-2 rounded-full bg-[#8ecf9d] animate-pulse [animation-delay:240ms]" />
        </div>
      ) : null}
      <div className="mt-2.5 text-[14px] font-medium text-[color:var(--text-primary)]">
        {title}
      </div>
      <p className="mx-auto mt-1.5 max-w-[17rem] text-[11px] leading-[1.35rem] text-[color:var(--text-secondary)]">
        {description}
      </p>
      {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
    </section>
  );
}

function createDesktopChannelRoutePost(
  post: FeedPostWithComments,
): FeedPostListItem {
  return {
    ...post,
    commentsPreview: post.comments,
  };
}

type MobileChannelsViewportProps = {
  activeSection: FeedChannelHomeSection;
  likePendingPostId: string | null;
  favoritePendingPostId: string | null;
  followPendingAuthorId: string | null;
  posts: FeedPostListItem[];
  commentsPreviewByPostId?: Record<string, FeedComment[]>;
  routeSelectedPostId: string | null;
  onLike: (postId: string) => void;
  onOpenAuthor: (post: FeedPostListItem) => void;
  onOpenComments: (post: FeedPostListItem) => void;
  onNotInterested: (postId: string) => void;
  onShare: (post: FeedPostListItem) => void;
  onToggleFollowAuthor: (post: FeedPostListItem) => void;
  onToggleFavorite: (post: FeedPostListItem) => void;
  onVisiblePost: (postId: string) => void;
};

type MobileCardNullaryHandlers = {
  onLike: () => void;
  onOpenAuthor: () => void;
  onOpenComments: () => void;
  onNotInterested: () => void;
  onShare: () => void;
  onToggleFollowAuthor: () => void;
  onToggleFavorite: () => void;
  onUnlock: () => void;
};

function MobileChannelsViewport({
  activeSection,
  likePendingPostId,
  favoritePendingPostId,
  followPendingAuthorId,
  posts,
  commentsPreviewByPostId,
  routeSelectedPostId,
  onLike,
  onOpenAuthor,
  onOpenComments,
  onNotInterested,
  onShare,
  onToggleFollowAuthor,
  onToggleFavorite,
  onVisiblePost,
}: MobileChannelsViewportProps) {
  const [activePostId, setActivePostId] = useState<string | null>(null);
  // 抖音风：用户首次点屏幕解除静音后，整页保持解除静音（单向，不再回到 muted）
  const [userUnmuted, setUserUnmuted] = useState(false);
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  // 走查 新一轮 R1：MobileChannelsCard 之前没 memo，加上一堆内联箭头回调把
  // 每张卡的 props identity 每次 ChannelsPage 渲染都翻新——用户在评论 sheet
  // 里敲一个字 setCommentDrafts 会让全部 20 张卡跟着 re-render（含 audio /
  // video media surface、ExpandableText、5 个 action 按钮、commentPreview 渲染），
  // 慢机上一次输入肉眼可感 30-60ms 卡顿。下面用「ref 持最新 prop + Map 缓存
  // 按 postId 稳定的 nullary handler」搭配 React.memo(MobileChannelsCard)，
  // 让 post 数据没变 / active 没翻的卡完全跳过 render。
  //
  // 关键点：cardHandlersCacheRef 里的 handler 是 stable 引用（一辈子不变），
  // 但执行时通过 latestRef.current.handlers 读取「当前最新」的 onLike / onShare，
  // 通过 latestRef.current.postsById 拿到当前 post 对象——这样既稳定又不会
  // 拿到 stale visiblePosts。
  const latestHandlersRef = useRef({
    onLike,
    onOpenAuthor,
    onOpenComments,
    onNotInterested,
    onShare,
    onToggleFollowAuthor,
    onToggleFavorite,
  });
  latestHandlersRef.current = {
    onLike,
    onOpenAuthor,
    onOpenComments,
    onNotInterested,
    onShare,
    onToggleFollowAuthor,
    onToggleFavorite,
  };
  const postsByIdRef = useRef<Map<string, FeedPostListItem>>(new Map());
  postsByIdRef.current = useMemo(() => {
    const map = new Map<string, FeedPostListItem>();
    posts.forEach((p) => map.set(p.id, p));
    return map;
  }, [posts]);
  const cardHandlersCacheRef = useRef(
    new Map<string, MobileCardNullaryHandlers>(),
  );
  const handleUnlock = useCallback(() => setUserUnmuted(true), []);
  const getCardHandlers = (postId: string): MobileCardNullaryHandlers => {
    let cached = cardHandlersCacheRef.current.get(postId);
    if (!cached) {
      cached = {
        onLike: () => latestHandlersRef.current.onLike(postId),
        onOpenAuthor: () => {
          const p = postsByIdRef.current.get(postId);
          if (p) latestHandlersRef.current.onOpenAuthor(p);
        },
        onOpenComments: () => {
          const p = postsByIdRef.current.get(postId);
          if (p) latestHandlersRef.current.onOpenComments(p);
        },
        onNotInterested: () => latestHandlersRef.current.onNotInterested(postId),
        onShare: () => {
          const p = postsByIdRef.current.get(postId);
          if (p) latestHandlersRef.current.onShare(p);
        },
        onToggleFollowAuthor: () => {
          const p = postsByIdRef.current.get(postId);
          if (p) latestHandlersRef.current.onToggleFollowAuthor(p);
        },
        onToggleFavorite: () => {
          const p = postsByIdRef.current.get(postId);
          if (p) latestHandlersRef.current.onToggleFavorite(p);
        },
        onUnlock: handleUnlock,
      };
      cardHandlersCacheRef.current.set(postId, cached);
    }
    return cached;
  };
  // 跟 cardRefCallbacksRef 一样，posts 变了把已下线的 postId 清掉，
  // 防 long-lived viewport 在多次 invalidate 后无限堆积。
  useEffect(() => {
    const liveIds = new Set(posts.map((p) => p.id));
    cardHandlersCacheRef.current.forEach((_, key) => {
      if (!liveIds.has(key)) {
        cardHandlersCacheRef.current.delete(key);
      }
    });
  }, [posts]);

  // 切 tab 时把滚动复位到顶部 + active 重置：之前用户在 推荐 tab 滚到第 5 张，
  // 切去 朋友 tab，如果 朋友 tab 有缓存（isLoading=false），viewport 不会 unmount，
  // scrollTop 留在原位，新 tab 的内容从中间显示，非常错乱。切到新 tab 就当成
  // 「从头开始看」，体感对齐抖音 / 视频号。
  // 不依赖 posts，因为 posts 数组身份在 home 刷新时也会变（点赞 / 关注的
  // optimistic + invalidate），那时不该 reset 滚动。
  useEffect(() => {
    const node = scrollContainerRef.current;
    if (!node) return;
    if (node.scrollTop !== 0) {
      node.scrollTop = 0;
    }
    setActivePostId(null);
  }, [activeSection]);

  // 首次有数据时 pick 第一条作为 active；之后 activePostId 由 IntersectionObserver
  // 维护。注意：如果 activePostId 指向的 post 被删（"减少推荐"乐观 filter 掉），
  // 不要回退到 posts[0]——用户可能滚到了第 5 张，posts[0] 跟他看的不是一回事，
  // 强切回去会让最顶上那条音频替换掉他正在看的卡片的音频。留 stale 一帧让
  // observer 重算 → setActivePostId(实际可见的卡)。极端情况 (observer 不 fire) 下
  // 才退化到 posts[0]，用 setTimeout 兜底。
  const fallbackTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!posts.length) {
      setActivePostId(null);
      return;
    }

    if (!activePostId) {
      setActivePostId(posts[0]?.id ?? null);
      return;
    }

    if (!posts.some((post) => post.id === activePostId)) {
      // 留 350ms 让 IntersectionObserver 在新布局里 fire 一次；超时还没拿到
      // 真正的可见卡，再退化到 posts[0]。
      if (fallbackTimerRef.current != null) {
        window.clearTimeout(fallbackTimerRef.current);
      }
      fallbackTimerRef.current = window.setTimeout(() => {
        fallbackTimerRef.current = null;
        setActivePostId((current) => {
          // 这期间 observer 已经 fire 把 activePostId 换成存在的 post → 别覆盖
          if (current && posts.some((p) => p.id === current)) return current;
          return posts[0]?.id ?? null;
        });
      }, 350);
      return () => {
        if (fallbackTimerRef.current != null) {
          window.clearTimeout(fallbackTimerRef.current);
          fallbackTimerRef.current = null;
        }
      };
    }
  }, [activePostId, posts]);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const nextEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (left, right) => right.intersectionRatio - left.intersectionRatio,
          )[0];
        const nextPostId = nextEntry?.target.getAttribute("data-post-id");
        if (nextPostId) {
          setActivePostId(nextPostId);
        }
      },
      {
        threshold: [0.45, 0.65, 0.85],
        rootMargin: "-10% 0px -14% 0px",
      },
    );

    observerRef.current = observer;
    cardRefs.current.forEach((node) => observer.observe(node));
    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, []);

  const registerCardRef = (postId: string, node: HTMLElement | null) => {
    const previous = cardRefs.current.get(postId);
    if (previous && previous !== node) {
      observerRef.current?.unobserve(previous);
    }

    if (node) {
      cardRefs.current.set(postId, node);
      observerRef.current?.observe(node);
    } else {
      cardRefs.current.delete(postId);
    }
  };
  // 每张卡传给 <article ref={...}> 的回调，必须按 postId 稳定。
  // 原来用 `(node) => registerCardRef(post.id, node)` 内联 arrow，每次父级 re-render
  // 都是新引用，React 会先把旧回调以 null 调用一次再以 element 调新回调，等于
  // 每次 re-render 把这张卡 unobserve + observe 一遍。视频号 home 上 IntersectionObserver
  // 维护的就是「当前居中的卡」，重复 unobserve/observe 期间它可能漏掉一次
  // intersection 事件——表现是滑过去音频没自动切。useRef 缓存按 postId 缓存稳定回调。
  const cardRefCallbacksRef = useRef(
    new Map<string, (node: HTMLElement | null) => void>(),
  );
  const getCardRefCallback = (postId: string) => {
    let cb = cardRefCallbacksRef.current.get(postId);
    if (!cb) {
      cb = (node) => registerCardRef(postId, node);
      cardRefCallbacksRef.current.set(postId, cb);
    }
    return cb;
  };
  // 防 cardRefCallbacksRef 长期累积 stale postId：每次 posts 变化时把不在
  // 当前 posts 里的回调清掉。
  useEffect(() => {
    const liveIds = new Set(posts.map((p) => p.id));
    cardRefCallbacksRef.current.forEach((_, key) => {
      if (!liveIds.has(key)) {
        cardRefCallbacksRef.current.delete(key);
      }
    });
  }, [posts]);

  // 进入页面时按 URL 的 #postId 把指定卡滚到顶部一次。
  // 不要把 posts 整体当 deps：home 一刷新（点赞 invalidate / generate / decorations）
  // posts 数组身份就变，这个 effect 会重跑 scrollIntoView，把用户从他正在看的位置
  // 拽回 routeSelectedPostId。只在 routeSelectedPostId 变化、或目标 post 刚刚出现
  // 在 posts 里时滚一次。
  // 用 hasRouteTargetInPosts 而不是 posts.length / posts：channelsQuery 慢（公网
  // 隧道下 500-800ms）时，effect 第一次跑 cardRefs 为空，原来的 20 RAF (~330ms)
  // 轮询会兜底失败 → routeSelectedPostId 没变后续永不重跑。改成 posts 里出现目标
  // 时（hasTarget false→true）就再触发一次，覆盖 API 慢的场景。
  const scrolledRouteIdRef = useRef<string | null>(null);
  const hasRouteTargetInPosts = routeSelectedPostId
    ? posts.some((post) => post.id === routeSelectedPostId)
    : false;
  useEffect(() => {
    if (!routeSelectedPostId) {
      scrolledRouteIdRef.current = null;
      return;
    }
    if (scrolledRouteIdRef.current === routeSelectedPostId) {
      return;
    }
    if (!hasRouteTargetInPosts) {
      // 目标还没在 posts 里——别 RAF 浪费帧，等下次 hasRouteTargetInPosts 翻 true 再跑。
      return;
    }

    let cancelled = false;
    let attempts = 0;
    const tryScroll = () => {
      if (cancelled) return;
      const targetNode = cardRefs.current.get(routeSelectedPostId);
      if (targetNode) {
        targetNode.scrollIntoView({ behavior: "smooth", block: "start" });
        setActivePostId(routeSelectedPostId);
        scrolledRouteIdRef.current = routeSelectedPostId;
        return;
      }
      attempts += 1;
      // ~20 帧（≈330ms）兜底，避开"卡片刚 mount 但 ref 还没注册"的渲染窗
      if (attempts < 20) {
        window.requestAnimationFrame(tryScroll);
      }
    };
    window.requestAnimationFrame(tryScroll);
    return () => {
      cancelled = true;
    };
  }, [routeSelectedPostId, hasRouteTargetInPosts]);

  // 视频号是 snap-y 短视频流，用户经常一甩划过 5-10 张卡。原来 activePostId
  // 一变就立刻 POST /feed/:id/view，背后会做 owner-interaction findOneBy + 落库
  // + （首次）viewCount/watchCount 自增，rapid swipe 时实测一秒能打掉 6-8 次没人
  // 真在看的"观看"。加 600ms 防抖：用户在某条上停留够久才算 view，扫过的卡不发。
  //
  // 走查 2026-05-18 新会话 R2：再加一层 viewport 生命周期内的「已上报集合」
  // 去重 —— 用户切 tab (推荐 ↔ 朋友) N 次时每次 setActiveSection 都让
  // activePostId 经 null → 新 section 的 posts[0]，触发新 600ms timer；如果
  // 该 postId 在两个 section 都排第一（比如 "我自己" 角色发的 post 在
  // recommended 和 friends 两个 tab 都置顶），4 次切换 = 4 次 view POST 同一
  // post，server 端 viewOwnerPost 走 update existing interaction (re-save +
  // updatedAt 翻新) → lastViewedAt 被误触发 + 浪费 2-3 DB query/次 × 4 + 4 个
  // 公网 RTT。viewCount 因 server 端 `if (!existing)` 守卫不会重复涨，但
  // updatedAt drift 会让"最近观看"列表把同一帖反复置顶。
  // viewport mount 期内同一 postId 只 view 一次；onVisiblePost 引用变（baseUrl
  // 切换 → handleMobileViewPost 的 useCallback 重建）时清空，新账户重新计数。
  const viewedPostIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    viewedPostIdsRef.current = new Set();
  }, [onVisiblePost]);
  useEffect(() => {
    if (!activePostId) {
      return;
    }
    const postId = activePostId;
    if (viewedPostIdsRef.current.has(postId)) {
      return;
    }
    const timer = window.setTimeout(() => {
      viewedPostIdsRef.current.add(postId);
      onVisiblePost(postId);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [activePostId, onVisiblePost]);

  return (
    <div
      ref={scrollContainerRef}
      className="h-[calc(100dvh-9.6rem)] snap-y snap-mandatory space-y-2 overflow-y-auto overscroll-contain scroll-pb-2 pb-2"
    >
      {posts.map((post) => {
        const handlers = getCardHandlers(post.id);
        return (
          <MobileChannelsCard
            key={post.id}
            activeSection={activeSection}
            active={activePostId === post.id}
            favorite={Boolean(post.ownerState?.hasFavorited)}
            likePending={likePendingPostId === post.id}
            favoritePending={favoritePendingPostId === post.id}
            followPending={followPendingAuthorId === post.authorId}
            post={post}
            commentsPreview={
              // 走查 R1（本轮）：原来 ?? post.commentsPreview 在 commentsPreviewByPostId
              // 还没回来时会兜到 getChannelHome 在 line 413 强写的 `commentsPreview: []`——
              // 但这个 [] 是 *每次 home refetch 现造的新数组身份*（点赞 / 关注 /
              // 减少推荐 任何 invalidate 都会换一次），propagate 到 MobileChannelsCard
              // 让 React.memo shallow compare 永远不 bail，"卡片完全 memo 化"那条
              // 优化失效。fallback 直接落到 EMPTY_COMMENT_PREVIEW（稳定的常量），
              // 跟 getCommentsPreview（line 173-181）的同款修复对齐。
              // 注：mobile viewport 不会被 desktopWorkspacePosts 喂数据（desktop 路径
              // 在上面 line 1542 已经分叉走 DesktopChannelsWorkspace），post.commentsPreview
              // 在这条路径下永远是 home 接口给的空 []，省掉这层 fallback 不会丢信息。
              commentsPreviewByPostId?.[post.id] ?? EMPTY_COMMENT_PREVIEW
            }
            setCardRef={getCardRefCallback(post.id)}
            userUnmuted={userUnmuted}
            onUnlock={handlers.onUnlock}
            onLike={handlers.onLike}
            onOpenAuthor={handlers.onOpenAuthor}
            onOpenComments={handlers.onOpenComments}
            onNotInterested={handlers.onNotInterested}
            onShare={handlers.onShare}
            onToggleFollowAuthor={handlers.onToggleFollowAuthor}
            onToggleFavorite={handlers.onToggleFavorite}
          />
        );
      })}
    </div>
  );
}

type MobileChannelsCardProps = {
  activeSection: FeedChannelHomeSection;
  active: boolean;
  favorite: boolean;
  likePending: boolean;
  favoritePending: boolean;
  followPending: boolean;
  post: FeedPostListItem;
  commentsPreview: FeedComment[];
  setCardRef: (node: HTMLElement | null) => void;
  userUnmuted: boolean;
  onUnlock: () => void;
  onLike: () => void;
  onOpenAuthor: () => void;
  onOpenComments: () => void;
  onNotInterested: () => void;
  onShare: () => void;
  onToggleFollowAuthor: () => void;
  onToggleFavorite: () => void;
};

// 走查 新一轮 R1：memo 包裹。配合 viewport 里 ref + Map 缓存的 stable nullary
// handler，让评论 sheet 里敲字 / 父级任意非 post 数据 re-render 时所有不变的卡
// 完全跳过 render 树重算。default shallow compare 已够：post 对象在 home
// invalidate / optimistic 才换 identity，那时确实需要 re-render。
const MobileChannelsCard = memo(function MobileChannelsCard({
  activeSection,
  active,
  favorite,
  likePending,
  favoritePending,
  followPending,
  post,
  commentsPreview,
  setCardRef,
  userUnmuted,
  onUnlock,
  onLike,
  onOpenAuthor,
  onOpenComments,
  onNotInterested,
  onShare,
  onToggleFollowAuthor,
  onToggleFavorite,
}: MobileChannelsCardProps) {
  const t = useRuntimeTranslator();
  return (
    <article
      ref={setCardRef}
      data-post-id={post.id}
      className="snap-start scroll-mt-2 overflow-hidden rounded-[18px] border border-[color:var(--border-subtle)] bg-white shadow-none"
    >
      <div className="relative min-h-[calc(100dvh-12rem)] bg-[#0f1115]">
        <MobileChannelMediaSurface
          post={post}
          active={active}
          userUnmuted={userUnmuted}
          onUnlock={onUnlock}
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-[linear-gradient(180deg,rgba(15,23,42,0.78),rgba(15,23,42,0))]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-[linear-gradient(180deg,rgba(15,23,42,0),rgba(15,23,42,0.88))]" />

        <div className="absolute left-3.5 top-3.5 flex items-center gap-1.5">
          <div className="rounded-full bg-[rgba(15,23,42,0.62)] px-2.5 py-1 text-[10px] font-medium tracking-[0.04em] text-white">
            {getChannelsSectionBadge(activeSection, t)}
          </div>
        </div>

        <div className="absolute inset-y-0 right-0 flex items-center pr-3.5">
          <div className="flex flex-col items-center gap-2.5">
            <ActionRailButton
              active={Boolean(post.ownerState?.hasLiked)}
              ariaPressed={Boolean(post.ownerState?.hasLiked)}
              label={likePending ? t(msg`处理中`) : String(post.likeCount)}
              ariaLabel={
                post.ownerState?.hasLiked
                  ? t(msg`取消点赞，当前 ${post.likeCount} 赞`)
                  : t(msg`点赞，当前 ${post.likeCount} 赞`)
              }
              // 视频号点赞改成 toggle 后，rapid click 容易让多个 mutation 并发：
              // 点 → unlike → 点 → like → 点 → unlike，三条请求并行回 server，
              // 谁先成功谁先落库，最终状态可能跟用户最后一次点击的"意图"对不上。
              // 锁住按钮直到当前 mutation 落地，避免叠死。
              disabled={likePending}
              onClick={onLike}
            >
              <ThumbsUp
                size={17}
                className={
                  post.ownerState?.hasLiked ? "fill-current" : undefined
                }
              />
            </ActionRailButton>
            <ActionRailButton
              label={String(post.commentCount)}
              ariaLabel={t(msg`打开评论，当前 ${post.commentCount} 条`)}
              onClick={onOpenComments}
            >
              <MessageCircleMore size={17} />
            </ActionRailButton>
            <ActionRailButton
              active={favorite}
              ariaPressed={favorite}
              label={
                favoritePending
                  ? t(msg`处理中`)
                  : favorite
                    ? t(msg`已收藏`)
                    : t(msg`收藏`)
              }
              disabled={favoritePending}
              onClick={onToggleFavorite}
            >
              {favorite ? (
                <Bookmark size={17} className="fill-current" />
              ) : (
                <Bookmark size={17} />
              )}
            </ActionRailButton>
            <ActionRailButton label={t(msg`分享`)} onClick={onShare}>
              <Share2 size={17} />
            </ActionRailButton>
            <ActionRailButton
              label={t(msg`减少推荐`)}
              onClick={onNotInterested}
            >
              <EyeOff size={17} />
            </ActionRailButton>
          </div>
        </div>

        {/*
          外层 inset-x-0 是 100% 宽，pointer-events 默认会接管整条底部带状区域；
          但内层只用了 max-w-[calc(100%-4.25rem)] 来视觉避让右侧 action rail，
          留出的 68px 右侧空白条仍然在外层 hit 范围里 —— 它会盖到 action rail
          底部两颗按钮（分享 / 减少推荐）的点击区，导致用户怎么点都点不到。
          外层 pointer-events-none + 内层 auto，让"无内容的空白条"不挡事件。
        */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 px-3.5 pb-3.5">
          <div className="pointer-events-auto max-w-[calc(100%-4.25rem)]">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onOpenAuthor}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <AvatarChip
                  name={post.authorName}
                  src={post.authorAvatar}
                  size="wechat"
                />
                <div className="min-w-0 flex-1 text-white">
                  <div className="truncate text-[12px] font-medium">
                    {post.authorName}
                  </div>
                  <div className="mt-0.5 text-[11px] text-white/70">
                    {t(
                      msg`${formatTimestamp(post.createdAt)} · 视频号动态`,
                    )}
                  </div>
                </div>
              </button>
              {post.authorId !== SELF_CHARACTER_ID &&
              post.authorType !== "user" ? (
                // 「我自己」是用户的代理角色，关注 / 取消关注自己没语义；前后端
                // 都没禁——但后端 followChannelAuthor 对 owner===authorId 才
                // no-op，char-default-self 不是 owner.id，会真插一行 follow 记录，
                // 视觉上落到 "已关注" 来回切看着很怪。直接在 UI 隐掉。
                //
                // 走查 R2（本轮）：用户自己发的 surface='channels' post 也会在
                // 自己的视频号 home 出现，authorId=owner.id 但 authorType==='user'。
                // 老的 SELF_CHARACTER_ID 检查只过 char-default-self；用户在自己
                // 卡上点 +关注 → server 端 followChannelAuthor 撞到 owner.id 分支
                // 真 no-op + 返回 isFollowing=false → 按钮永远停在 "+关注"，点一万次
                // 不变，体感"按钮坏了"。authorType==='user' 时统一把按钮也隐掉。
                <button
                  type="button"
                  onClick={onToggleFollowAuthor}
                  // rapid click 会让 follow / unfollow 同时在路上，状态可能跟最后一次
                  // 点击意图对不上；锁到 mutation 落地。
                  disabled={followPending}
                  // 走查 2026-05-18 新会话 R3：跟点赞 / 收藏 ActionRailButton 同款
                  // —— 它们都是 toggle 按钮，挂 aria-pressed 让 VoiceOver / TalkBack
                  // 念出"已选 / 未选"。本按钮也是 +关注 ↔ 已关注 二态 toggle，但
                  // 一直没挂 aria-pressed —— 视觉用户看 +关注 绿底 vs 已关注 灰底
                  // 一眼能识别状态，但 SR 用户只能靠"+关注"/"已关注"两段中文文本
                  // 自己分辨，没有标准 toggle 语义，无法在"按钮聚焦时"由 SR 自动
                  // 播报 pressed 状态。aria-label 同时把"作者名"和动作放上去，比
                  // 单看"+关注"两字更准确（"+关注 唐安"）。
                  aria-pressed={Boolean(post.ownerState?.isFollowingAuthor)}
                  aria-label={
                    post.ownerState?.isFollowingAuthor
                      ? t(msg`已关注 ${post.authorName}，点击取消关注`)
                      : t(msg`关注 ${post.authorName}`)
                  }
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[10px] font-medium transition disabled:cursor-not-allowed disabled:opacity-70",
                    post.ownerState?.isFollowingAuthor
                      ? "border border-white/20 bg-white/10 text-white/72"
                      : "bg-[#07c160] text-white",
                  )}
                >
                  {followPending
                    ? t(msg`处理中...`)
                    : post.ownerState?.isFollowingAuthor
                      ? t(msg`已关注`)
                      : t(msg`+关注`)}
                </button>
              ) : null}
            </div>
            {post.title ? (
              <div className="mt-2 text-[13px] font-medium text-white">
                {post.title}
              </div>
            ) : null}
            {(() => {
              // 视频号 audio post 后端常把 title 和 text 都填成 "X·音乐"，
              // 标题和正文重复出现没意义；只在两者不一致时才渲染正文。
              const cleanText = stripToolCallSyntax(post.text);
              if (!cleanText || cleanText === post.title) {
                return null;
              }
              return (
                <ExpandableText
                  text={cleanText}
                  className="mt-1"
                  textClassName="text-[12px] leading-[1.35rem] text-white"
                  toggleClassName="text-[11px] text-white/82"
                />
              );
            })()}
            {post.topicTags?.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5 text-[9px] text-white/72">
                {post.topicTags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-[rgba(255,255,255,0.12)] px-2 py-1"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="mt-2 text-[9px] text-white/65">
              {formatChannelMeta(post, t)}
            </div>
            <div className="mt-2 rounded-[16px] bg-[rgba(255,255,255,0.12)] px-2.5 py-2 text-[10px] leading-4 text-white/86 backdrop-blur">
              {(() => {
                // 走查 2026-05-18 R2（本轮）：commentsPreview 里偶尔混入纯
                // AI thinking-prose 评论（库里至少 eb9c88ce 等帖各有 1 条
                // 1019 字 CoT 漏出），stripToolCallSyntax 把这类内容整段抠成
                // 空串，但原代码无脑拼 `${authorName}：${stripped}` 让卡底
                // 出现 "我自己：" 这种孤零零的鬼影 row。先按 stripped 非空过滤
                // 掉这类条目，再 slice(-2) 取真正能渲的最新 2 条。空过滤后整页
                // 没有可显示的评论时再回到下面的 `commentCount > 0` 占位文案。
                const renderableComments = commentsPreview
                  .map((comment) => ({
                    comment,
                    cleanText: stripToolCallSyntax(comment.text),
                  }))
                  .filter((entry) => entry.cleanText)
                  .slice(-2);
                if (renderableComments.length) {
                  return (
                    <>
                      <div className="mb-1 text-[9px] uppercase tracking-[0.03em] text-white/60">
                        {t(msg`最近评论`)}
                      </div>
                      <div className="space-y-1">
                        {/*
                          走查 2026-05-18 新一轮 R2：commentsPreview 是后端
                          buildCommentsPreviewMap 给的"最近 3 条"评论，按
                          createdAt ASC 排（最老的在 [0]，最新的在 [2]）——
                          backend 注释明确"postId → 最近 3 条评论"，slice(-3)
                          在 ASC 流上取最新 3 条。原前端 .slice(0, 2) 取的是
                          这 3 条里最早的两条，把真·最新那条 (commentsPreview[2])
                          漏了。改成上面 filter 后再 slice(-2)：在按 ASC 排
                          序的可渲染条里取末尾 2 条，ASC 顺序保留（老→新），
                          跟评论 sheet 内的阅读顺序对齐。
                        */}
                        {renderableComments.map(({ comment, cleanText }) => (
                          // 走查 R2：实测库里有 1000+ 字的"AI thinking 漏到
                          // comment.text"长评论（feed_comments 最长 1019 字），
                          // 不 clamp 这条 review 会把卡片底部 chip 撑成半屏高，
                          // 盖到上面的标题 / 头像 / overflow-hidden 后还把封面
                          // 切走一截。每行限 1 行，超出末尾省略号。后端那条 AI
                          // thinking 入库属于服务端 bug，前端先把这层显示兜住。
                          <div key={comment.id} className="line-clamp-1">
                            <span className="font-medium">
                              {comment.authorName}
                            </span>
                            {`：${cleanText}`}
                          </div>
                        ))}
                      </div>
                    </>
                  );
                }
                if (post.commentCount > 0) {
                  // home 主接口先返回，decorations 第二个并行请求才带
                  // commentsPreview。在 decorations 落地前 / 或筛掉所有 CoT
                  // dump 后剩 0 条可渲：commentCount > 0 的卡如果显示"还没有
                  // 评论"会和 action rail 上"143 评论"的小角标自相矛盾——给个
                  // 占位提示。
                  return (
                    <span className="text-white/70">
                      {t(msg`正在载入最近评论...`)}
                    </span>
                  );
                }
                return <span>{t(msg`还没有评论，先聊一句。`)}</span>;
              })()}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[color:var(--border-subtle)] bg-white px-3.5 py-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-[color:var(--text-muted)]">
          <span>
            {post.mediaType === "video"
              ? t(msg`短片`)
              : post.mediaType === "audio"
                ? t(msg`音乐`)
                : post.mediaType === "image"
                  ? t(msg`图集`)
                  : t(msg`内容卡片`)}
          </span>
          <span>{t(msg`${post.likeCount} 赞`)}</span>
          <span>{t(msg`${post.commentCount} 评论`)}</span>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={onOpenComments}
          className="h-8 rounded-full border-[color:var(--border-subtle)] bg-[#f8f8f8] px-3 text-[11px] text-[color:var(--text-primary)] shadow-none"
        >
          {t(msg`打开评论`)}
        </Button>
      </div>
    </article>
  );
});

function ActionRailButton({
  children,
  label,
  ariaLabel,
  ariaPressed,
  active = false,
  disabled = false,
  onClick,
}: {
  children: ReactNode;
  label: string;
  ariaLabel?: string;
  // toggle 按钮（点赞 / 收藏）传 aria-pressed，让 VoiceOver / TalkBack 念出
  // "已选 / 未选"。普通操作按钮（评论 / 分享 / 减少推荐）不是 toggle，不要传
  // 否则会让屏幕阅读器误以为是 toggle 控件。
  ariaPressed?: boolean;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel ?? label}
      aria-pressed={ariaPressed}
      className="flex flex-col items-center gap-1 text-white transition-transform active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-70"
    >
      <span
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(15,23,42,0.62)] backdrop-blur transition-colors",
          active && "bg-[#07c160] shadow-[0_10px_24px_rgba(7,193,96,0.14)]",
        )}
      >
        {children}
      </span>
      <span className="text-[9px]">{label}</span>
    </button>
  );
}

function MobileChannelCommentsSheet({
  comments,
  commentsArePlaceholder,
  draft,
  errorActionLabel,
  errorMessage,
  isLoading,
  likePendingCommentId,
  open,
  post,
  replyTarget,
  submitPending,
  onCancelReply,
  onClose,
  onDraftChange,
  onErrorAction,
  onLikeComment,
  onReply,
  onSubmit,
}: {
  comments: FeedComment[];
  commentsArePlaceholder: boolean;
  draft: string;
  errorActionLabel?: string;
  errorMessage?: string | null;
  isLoading: boolean;
  likePendingCommentId: string | null;
  open: boolean;
  post: FeedPostListItem | null;
  replyTarget: {
    authorId: string;
    authorName: string;
    commentId: string;
    postId: string;
  } | null;
  submitPending: boolean;
  onCancelReply: () => void;
  onClose: () => void;
  onDraftChange: (value: string) => void;
  onErrorAction?: () => void;
  onLikeComment: (comment: FeedComment) => void;
  onReply: (comment: FeedComment) => void;
  onSubmit: () => void;
}) {
  const t = useRuntimeTranslator();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const hasAutoScrolledRef = useRef(false);
  const previousCommentCountRef = useRef(0);
  // 走查 R4（新一轮）：原 isNearBottom 在评论增长的 effect 里读 *新 DOM* 的
  // scrollHeight——新评论已经被 React 渲到 DOM 里，scrollHeight 提前涨上去，
  // scrollTop 没动 → scrollHeight-scrollTop-clientHeight 突然变大（典型新评论
  // 卡 80-120px 高就够把 diff 干过 80px 阈值），isNearBottom=false，
  // 错把"用户刚发完一条还在底部"判成"用户已经主动上滑读老评论"，shouldAutoScroll=false。
  // 实测：用户在底部发评论后，scrollTop=1477 / 新 scrollHeight=2085 / diff=107
  // → 自己发的新评论被卡在视口外，得手动再滑一下。
  // 改用 *上一次 scroll 事件捕获到的* 用户位置（ref 跟 scroll 事件实时同步），
  // 评论被 append 后 scrollTop 没动 → scroll 事件不 fire → ref 仍是用户上一次
  // 主动滚的"贴底"状态，growth + 贴底 → 跟随到底；用户主动滚上去时 scroll
  // 事件已经把 ref 翻成 false，growth 时不跟随、尊重阅读位置。
  const userNearBottomRef = useRef(true);
  useEffect(() => {
    if (!open) return;
    const node = scrollContainerRef.current;
    if (!node) return;
    const updateNearBottom = () => {
      userNearBottomRef.current =
        node.scrollHeight - node.scrollTop - node.clientHeight < 80;
    };
    updateNearBottom();
    node.addEventListener("scroll", updateNearBottom, { passive: true });
    return () => node.removeEventListener("scroll", updateNearBottom);
  }, [open]);

  // 走查 2026-05-18 R4：原 growth 自动滚动只在「用户当前贴底」时跟随，意图是
  // 保护正在读老评论时被 AI 自动回复（1-5 分钟后到位）打断。但同一规则也把
  // 「用户自己刚提交评论」的场景一起卡住：用户滑到 sheet 顶部读老评论 → 在
  // 底部 textarea 敲字（textarea sticky bottom，不动列表 scrollTop）→ 提交 →
  // mutation invalidate → refetch 把新评论 append 到底 → 用户已经滚远，
  // userNearBottomRef=false → shouldAutoScroll=false → 用户没看到自己刚发
  // 的评论，体感「我按了发送，到底成没成？」。
  // 用 submitInitiatedAtRef 记录最近一次主动 submit 的时间戳，growth 落地
  // 时若在 8s 窗口内视为「这是我自己刚发的评论」强制滚到底，盖过 isNearBottom
  // 的保守判定；超出窗口或 errorMessage 出现（submit 失败）则清掉，不污染后
  // 续的 AI 回复滚动行为。
  //
  // 走查 2026-05-18 新会话 R1：原 timestamp 只在 send 按钮 onClick 里同步 set，
  // 「重试发送评论」路径走的是 ChannelsPage 顶部的 mobileCommentSheetRetryAction
  // 而不是这个 onClick —— submit 失败 → errorMessage effect 把 timestamp 清成
  // null → 用户 10s 后才点重试 → mutate 飞 → onSuccess invalidate → comments
  // refetch growth → userJustSubmitted = (null !== null && …) = false → 用户读
  // 老评论时若不贴底 shouldAutoScroll=false → 重试发出的评论留在底部，用户根本
  // 看不见，比 R4 修之前更怪（明明刚点了"重试"）。
  // 改成跟着 submitPending 的 false→true 跳变 set timestamp —— send 按钮、retry
  // 路径都会让 commentMutation 的 isPending 从 false 翻 true，两条路径共享同款
  // userJustSubmitted 8s 窗口保护，无须在 ChannelsPage 那条 retry 链路里另插一脚。
  const submitInitiatedAtRef = useRef<number | null>(null);
  const previousSubmitPendingRef = useRef(false);
  useEffect(() => {
    if (submitPending && !previousSubmitPendingRef.current) {
      submitInitiatedAtRef.current = Date.now();
    }
    previousSubmitPendingRef.current = submitPending;
  }, [submitPending]);

  const commentAuthorNameMap = useMemo(() => {
    const map = new Map<string, string>();
    comments.forEach((comment) => {
      map.set(comment.id, comment.authorName);
    });
    return map;
  }, [comments]);
  // 走查 新一轮 R2：onReply / onLikeComment 是 ChannelsPage 内联箭头，每次
  // parent 渲染 identity 都翻新。用户在 textarea 里敲字 → setCommentDrafts →
  // ChannelsPage re-render → sheet re-render，下面 comments.map 重跑一遍
  // （142 条评论时 142 次 stripToolCallSyntax regex + 142 次 JSX 创建）。
  // 把回调透过 ref 包成「永远稳定」的版本，再用 useMemo 缓存整段评论 list 的
  // JSX 树——deps 里没 draft，敲字时直接返回上次的 element 树，React 在
  // 子树上 bailout 跳过 reconciliation。
  const latestSheetHandlersRef = useRef({ onReply, onLikeComment });
  latestSheetHandlersRef.current = { onReply, onLikeComment };
  const stableOnReply = useCallback(
    (c: FeedComment) => latestSheetHandlersRef.current.onReply(c),
    [],
  );
  const stableOnLikeComment = useCallback(
    (c: FeedComment) => latestSheetHandlersRef.current.onLikeComment(c),
    [],
  );

  useEffect(() => {
    if (!open || typeof document === "undefined") {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // 走查 2026-05-18 新会话 R2（移动端视频号评论 sheet）：跟同 commit 的
  // ChannelsForwardPicker focus trap 同款问题—— sheet 挂了
  // role="dialog" aria-modal="true" 但浏览器不会自动 trap focus（aria-modal
  // 只对原生 <dialog>.showModal() 生效）。CDP 实测从「打开评论」按钮按 5 次
  // Tab，焦点 5 次全漏到 background 的视频号卡 action rail 上 —— 既挡键盘用
  // 户用 Tab 在评论列表里走/到发送按钮，又让 SR 用户的 modal 内部语义破口。
  // 现状部分缓解：open 时已经把 textarea .focus() 拉进 sheet（line 4644-4651
  // requestAnimationFrame focus），但 Tab cycle 仍能跳出。
  // 同款修法 — keydown 监听 Tab + 首尾循环 + 飘出时拉回，不依赖第三方
  // focus-trap 库。previouslyFocusedRef 记开打前焦点关闭时归还。
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedSheetRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    previouslyFocusedSheetRef.current =
      document.activeElement instanceof HTMLElement &&
      document.activeElement !== document.body
        ? document.activeElement
        : null;
    return () => {
      const prev = previouslyFocusedSheetRef.current;
      previouslyFocusedSheetRef.current = null;
      if (prev && document.contains(prev)) {
        window.requestAnimationFrame(() => prev.focus());
      }
    };
  }, [open]);
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const sheet = sheetRef.current;
      if (!sheet) return;
      const focusable = sheet.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (!active || !sheet.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // 走查 R9：Esc 键关 sheet —— ChannelsForwardPicker (line 95-104) 早就有这套
  // window keydown / Escape preventDefault + onClose 的兜底，但 MobileChannelComments
  // Sheet 一直缺。桌面端 / iPad 接外接键盘 / 真机 PWA 在 web 嵌入下，用户按 Esc
  // 想关评论 sheet 没反应，必须用鼠标点 backdrop / 右上 X，体感断了。
  // 真机 mobile 浏览器没物理 Esc 也无害（window 上根本不会 fire），不会引入开销。
  useEffect(() => {
    if (!open || typeof window === "undefined") {
      return;
    }
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // 走查 2026-05-17 新会话 R4：Android 硬件 Back 键 — 评论 sheet 打开时按
  // Back 应该收 sheet 而不是退掉整个 /discover/channels 页（默认行为会让
  // capacitor App.backButton 走 history.back，把用户从视频号甩回上一页 /
  // 主 tab，体感「我只是想关掉评论」)。和 wechat-comment-bar (line 149) /
  // share-card-modal / moment-media-gallery viewer 同款拦截：preventDefault
  // + 返回 true 消费按键。非 Android 平台 registerAndroidBackInterceptor 返
  // 回 no-op 注销函数，无副作用。
  useEffect(() => {
    if (!open) return;
    return registerAndroidBackInterceptor((event) => {
      event.preventDefault();
      onClose();
      return true;
    });
  }, [open, onClose]);

  // Sheet 关闭时重置自动滚动 flag，下次再打开重新跑一次。previousCommentCountRef
  // 也复位以便下次打开时不会把首次 0→N 数据到位误判成"用户刚刚发了一条评论"。
  // submitInitiatedAtRef 也清，避免「用户提交后立刻关 sheet → 几分钟后回来」时
  // AI 回复增长落地被误判成「我的提交刚到」强制滚到底。
  useEffect(() => {
    if (!open) {
      hasAutoScrolledRef.current = false;
      previousCommentCountRef.current = 0;
      submitInitiatedAtRef.current = null;
    }
  }, [open]);

  // submit 失败时（errorMessage 出现）也清掉 submit 时间戳：mutation 已失败，
  // 不会有 growth 落地，留着会污染下一次 AI 自动回复到位时的滚动判断。
  useEffect(() => {
    if (errorMessage) {
      submitInitiatedAtRef.current = null;
    }
  }, [errorMessage]);

  useEffect(() => {
    if (!open) {
      return;
    }

    // 走查 2026-05-18 第三会话 R1：原来无脑 textareaRef.focus()，但非好友帖
    // (post.canInteract === false) 走 line ~4080 把 textarea disabled 掉。disabled
    // input 调 .focus() 是 no-op（浏览器不会把焦点放上去），但 sequential focus
    // navigation 会让焦点甩到 sheet 内下一个可聚焦元素——右上角"关闭评论面板"
    // 那颗 X button。实测（playwright /discover/channels 非好友帖打开评论 sheet）
    // document.activeElement 落到 BUTTON，用户按 Space 想滚评论列表 → 触发 X.click()
    // → sheet 直接关掉。非好友 sheet 还允许用户读评论，autofocus 反成关闭陷阱。
    // cannotInteract 时跳过 focus，让焦点留在用户主动点击的那个 comment 按钮上。
    if (post?.canInteract === false) {
      return;
    }
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }, [open, post?.canInteract, replyTarget?.commentId]);

  // 视频号评论按 createdAt ASC 排（最老的在最上面，回复链路顺着对话读起来才连贯），
  // 但 yuanzui0728 这条 post 已经积了 142 条评论：用户打开评论面板第一眼看到的
  // 是 5 天前的旧评论，要手动滑到底部才能看到刚刚的对话。WeChat 视频号 / TikTok
  // 都是默认把视图落到「最新」位置。
  //  - 打开 sheet 且 comments 第一次到位（hasAutoScrolledRef）→ 跳到底部
  //  - 用户在 sheet 里发了新评论（commentCount 变大）→ 也跟着滚到底，体感对齐"发送即看到"
  // 用 scrollTop = scrollHeight 而不是 scrollIntoView 末条，避免在 sheet 容器
  // 之外（外层 body）产生连带滚动。
  //
  // 走查 R1（本轮）：原来 growth 一律 scroll-to-bottom——但 maybeScheduleChannelsCommentReplies
  // 调度的 AI 角色回复在用户评论后 1-5 分钟才到位（feed.service.ts L2027），
  // 那时用户可能正滑到 sheet 顶部读 5 天前的老评论 / 别人的回复链。新评论数 +1
  // 直接 scrollTop=scrollHeight 把他甩到底，老回复链丢失阅读位置，体感像"评论面板
  // 自己在跳"。改成：只有当前已经贴在底部（80px 阈值，覆盖"用户自己刚发完字"的
  // 微妙偏离）才跟随；用户主动滚上去阅读时尊重位置。首次打开（hasAutoScrolledRef=false）
  // 仍无条件落到底，对齐 WeChat 视频号默认体验。
  useEffect(() => {
    if (!open || isLoading) {
      return;
    }
    if (!comments.length) {
      previousCommentCountRef.current = 0;
      return;
    }

    const node = scrollContainerRef.current;
    if (!node) return;

    const previousCount = previousCommentCountRef.current;
    const growth = comments.length > previousCount;
    // 用 userNearBottomRef.current（scroll 事件实时维护）而不是 *此刻* 重算
    // DOM。新评论 append 后 DOM scrollHeight 已经涨上去而 scrollTop 没动，
    // 这里如果用 DOM 算会立即判成"用户已上滑"，把贴底状态错杀。
    const isNearBottom = userNearBottomRef.current;
    // 走查 2026-05-18 R4：「我自己刚提交评论」窗口期内强制滚到底——盖过
    // isNearBottom 的"读老评论保护"。submit 落地走 invalidate→refetch，从
    // 用户点发送到 comments 数组真增长通常 300-1500ms（公网隧道）；给 8s
    // 兜底窗口覆盖慢网。窗口外的 growth（AI 自动回复，1-5min 后到位）
    // 仍按 isNearBottom 决定，尊重用户阅读位置。
    const submittedAt = submitInitiatedAtRef.current;
    const userJustSubmitted =
      submittedAt != null && Date.now() - submittedAt < 8000;
    const shouldAutoScroll =
      !hasAutoScrolledRef.current ||
      (growth && (isNearBottom || userJustSubmitted));
    if (shouldAutoScroll) {
      // 走查 R3（新一轮）：mobileCommentsQuery 用 decorations 里 ≤3 条 commentsPreview
      // 作 placeholderData，sheet 首次打开会先拿到 placeholder（comments.length 很小）。
      // 原代码这里无条件把 hasAutoScrolledRef 翻 true + previousCount=3，等真数据
      // (例如 143 条) 到位时再跑下面 effect，shouldAutoScroll 走 (growth && isNearBottom)，
      // 但 placeholder 滚到底时 scrollHeight=200/clientHeight=500 → isNearBottom=true，
      // 真数据到位后新增 ~140 条把 scrollHeight 干到 15000，scrollTop 仍 ≈ 200 →
      // 远不是 isNearBottom，shouldAutoScroll=false，sheet 卡在最老评论的顶上。
      // 用户重现：评论数 50+ 的 post 打开 sheet → 看到 5 天前的最早评论。
      // placeholder 阶段照常跑 RAF 滚到底（让 ≤3 条也对齐 WeChat 默认体验），但
      // **不消费 first-scroll 标志 / 不更新 previousCount**，留给真数据到位时再用一次。
      if (!commentsArePlaceholder) {
        hasAutoScrolledRef.current = true;
        previousCommentCountRef.current = comments.length;
      }
      // RAF 一次：确保 list 已经 layout，scrollHeight 取到稳定值
      window.requestAnimationFrame(() => {
        if (!scrollContainerRef.current) return;
        scrollContainerRef.current.scrollTop =
          scrollContainerRef.current.scrollHeight;
        // 程序滚到底时显式同步 ref——某些环境（极短滚动距离 / 浏览器节流）
        // scroll 事件不一定 fire，下一次 effect 又会拿到 stale 的 false。
        userNearBottomRef.current = true;
      });
      // 「我自己刚提交」窗口期内 growth 已经被滚到底，消费掉时间戳，避免
      // 后续 AI 回复仍在 8s 窗口内时被误判成同一次 submit。
      if (growth && userJustSubmitted) {
        submitInitiatedAtRef.current = null;
      }
    } else {
      previousCommentCountRef.current = comments.length;
    }
  }, [open, comments, isLoading, commentsArePlaceholder]);

  // 走查 新一轮 R2：把评论 list JSX 整段 useMemo，deps 不含 draft/submitPending/
  // replyTarget——这些只影响底部 textarea，敲字时直接返回上轮缓存的 element 树，
  // React 在子树上 bailout 跳过整个 142 条评论的重渲。stripToolCallSyntax 也跟着
  // 缓存住，不每次 keypress 都跑 142 次 regex。
  // 新一轮走查 R5：把 post.canInteract 也拿进来——非好友帖里，「回复」和「赞」
  // 按钮原来照样可点，点完 ChannelsPage 兜底 setNotice 提示，但 sheet z-50 把
  // page notice 盖死，用户没任何反馈。改成 cannotInteract 时两个按钮全 disable，
  // 维持「能看不能动」的明确边界。
  const cannotInteract = post?.canInteract === false;
  const commentsListNode = useMemo<ReactNode>(() => {
    if (!comments.length) return null;
    // 走查 2026-05-18 R2（本轮）：DB 里偶尔混入纯 AI thinking-prose 的评论
    // （feed_comments 实测最长 1019 字 CoT，至少 yuanzui0728 库的 eb9c88ce
    // 帖等就有 1 条），stripToolCallSyntax 直接抠成空串。原代码无脑 map →
    // 渲染出仅 "作者名 + 时间戳 + 回复 X：" 的空泡泡（cleanText 空 → 整条评
    // 论文本区是空白），点赞/回复按钮还在底下；用户体感「这条评论坏了 / 没
    // 加载完」。先按 cleanText 非空过滤掉这类条目再 map：可见行数会少于
    // 头部"N 条"角标几个，但角标本身就是后端 commentCount（含所有
    // published），那条来源跟前端可见数 drift 是已知容忍偏差。
    const renderableComments = comments
      .map((comment) => ({
        comment,
        cleanText: stripToolCallSyntax(comment.text),
        replyTargetName: comment.replyToCommentId
          ? (comment.replyToAuthorName ??
              commentAuthorNameMap.get(comment.replyToCommentId) ??
              null)
          : null,
      }))
      .filter((entry) => entry.cleanText);
    if (!renderableComments.length) return null;
    return (
      <div className="space-y-3">
        {renderableComments.map(({ comment, cleanText, replyTargetName }) => {
          // 优先用后端 serializeComment 给的 replyToAuthorName——本地
          // commentAuthorNameMap 只能反查到当前已显示的 comments；如果被
          // 回复的根评论在分页之外 / 已删 / 已隐，本地 map 是空，"回复 X"
          // 整段就漏掉了。后端的 lookup map 是整个 post 全量评论 + 单条
          // reply 新建时临时灌入，覆盖面更广，优先取后端值。
          const liking = likePendingCommentId === comment.id;
          return (
            <div
              key={comment.id}
              className="rounded-[16px] border border-[color:var(--border-subtle)] bg-white px-3.5 py-3"
            >
              <div className="flex items-start gap-3">
                <AvatarChip
                  name={comment.authorName}
                  src={comment.authorAvatar}
                  size="wechat"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[11px]">
                    {/*
                      走查 R2（本轮）：跟评论 sheet 底部"正在回复 X" chip 同款问题。
                      authorName 单纯 truncate 没有 min-w-0 / flex-1，flex item 默认
                      按内容宽度伸展、不收缩，超长 authorName 会把右侧时间戳挤到
                      comment 卡外。给名字加 min-w-0 + flex-1 让 truncate 真生效，
                      时间戳 shrink-0 锁住宽度不被压。
                    */}
                    <span className="min-w-0 flex-1 truncate font-medium text-[#111827]">
                      {comment.authorName}
                    </span>
                    <span className="shrink-0 text-[#9ca3af]">
                      {formatTimestamp(comment.createdAt)}
                    </span>
                  </div>
                  <div className="mt-1 text-[12px] leading-6 text-[#111827]">
                    {replyTargetName ? (
                      <span className="text-[#6b7280]">
                        {t(msg`回复 ${replyTargetName}`)}
                        {"："}
                      </span>
                    ) : null}
                    {cleanText}
                  </div>
                  <div className="mt-2 flex items-center gap-4 text-[11px] text-[#6b7280]">
                    <button
                      type="button"
                      disabled={cannotInteract}
                      onClick={() => stableOnReply(comment)}
                      className="transition active:text-[#111827] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t(msg`回复`)}
                    </button>
                    <button
                      type="button"
                      disabled={
                        cannotInteract || comment.likedByOwner || liking
                      }
                      onClick={() => stableOnLikeComment(comment)}
                      className={cn(
                        "inline-flex items-center gap-1 transition disabled:cursor-not-allowed",
                        comment.likedByOwner
                          ? "text-[#07c160]"
                          : "active:text-[#111827]",
                        cannotInteract && !comment.likedByOwner
                          ? "opacity-50"
                          : null,
                      )}
                    >
                      <ThumbsUp size={12} />
                      {liking
                        ? t(msg`处理中`)
                        : comment.likedByOwner
                          ? t(msg`已赞 ${comment.likeCount}`)
                          : t(msg`赞 ${comment.likeCount}`)}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }, [
    cannotInteract,
    comments,
    commentAuthorNameMap,
    likePendingCommentId,
    stableOnReply,
    stableOnLikeComment,
    t,
  ]);

  if (!open || !post) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-[rgba(15,23,42,0.14)]">
      <button
        type="button"
        className="absolute inset-0"
        aria-label={t(msg`关闭评论面板`)}
        onClick={onClose}
      />
      {/*
        走查 2026-05-17 R3：pb 原来只用 safe-area-inset-bottom——iOS WKWebView /
        Android Capacitor 软键盘弹起时，sheet 底部 textarea + 发送按钮被键盘整段
        盖住，用户没法看到自己正在敲的内容也按不到发送按钮（mobile-note-send-sheet
        早就改成了 max(safe-area, --keyboard-inset) 同款修复）。--keyboard-inset
        由 mobile-shell 的 useKeyboardInset 写入根 :root，键盘开合时实时更新。

        走查 2026-05-18 R1（本轮）：role/aria-modal 缺失——sheet 视觉上是 modal
        （z-50 backdrop + body overflow:hidden 锁滚 + Esc/Back 关闭），但没有
        role="dialog" + aria-modal="true"，VoiceOver / TalkBack 不会进入 modal
        模式，焦点能 tab 漏到底下的 ChannelsPage（视频号 card / action rail 仍
        在 tab 序列里）。配合 aria-labelledby 把头部"评论 · N 条"作为对话标题。
      */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-channels-comments-sheet-title"
        // tabIndex=-1 让 sheet 自身可程序聚焦兜底（极端 loading 态下 sheet 内
        // 没有任何 focusable child 时焦点 trap 仍能落到 sheet 上不漏）。
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 flex max-h-[80dvh] flex-col overflow-hidden rounded-t-[20px] border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] pb-[calc(max(env(safe-area-inset-bottom,0px),var(--keyboard-inset,0px))+0.25rem)] pt-2 shadow-[0_-14px_28px_rgba(15,23,42,0.10)]"
      >
        <div className="flex justify-center pb-1.5">
          <div className="h-1 w-10 rounded-full bg-[rgba(148,163,184,0.45)]" />
        </div>
        <div className="flex items-start justify-between gap-3 px-4 pb-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2" id="mobile-channels-comments-sheet-title">
              <div className="text-[14px] font-medium text-[#111827]">
                {t(msg`评论`)}
              </div>
              <div className="rounded-full bg-[rgba(7,193,96,0.1)] px-2 py-0.5 text-[10px] font-medium text-[#07c160]">
                {t(msg`${post.commentCount} 条`)}
              </div>
            </div>
            <div className="mt-1 line-clamp-2 text-[11px] leading-[1.35rem] text-[#6b7280]">
              {(() => {
                const cleanText = stripToolCallSyntax(post.text);
                if (post.title) {
                  return cleanText && cleanText !== post.title
                    ? `${post.title} · ${cleanText}`
                    : post.title;
                }
                return cleanText;
              })()}
            </div>
          </div>
          {/*
            走查 2026-05-17 R1（新一轮）：原来 sheet 右上角这颗 X 关闭按钮 *只*
            渲染一个 X 图标，没 aria-label / 没文字 label。VoiceOver / TalkBack
            读到这颗按钮只会念 "button"，盲用用户没法判断它做什么。背景 backdrop
            button 已经带 aria-label="关闭评论面板"，但盲用用户多半 swipe 在 sheet
            内部，先扫到的就是这颗带 X 的按钮——没语义就只能跳过 / 退出整页。
            visually 用户看图标即可识别，加 aria-label 无副作用。
          */}
          <button
            type="button"
            onClick={onClose}
            aria-label={t(msg`关闭评论面板`)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#6b7280] transition active:bg-[color:var(--surface-card-hover)]"
          >
            <X size={15} />
          </button>
        </div>

        <div
          ref={scrollContainerRef}
          className="min-h-0 flex-1 overflow-y-auto px-4 pb-4"
        >
          {errorMessage ? (
            <InlineNotice
              tone="warning"
              // 走查 2026-05-18 新会话 R1：sheet 内的错误条 —— "评论提交失败"
              // / "网络错误，请重试" 这类是用户主动操作后的阻塞错误，挂
              // role="alert" 让 SR aria-live=assertive 立刻打断当前播报。
              // 上面 page-level notice 走 role="status" polite，二者错位
              // 不冲突。
              role="alert"
              className="rounded-[14px] border-[color:var(--border-danger)] bg-white"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1">{errorMessage}</span>
                <div className="flex shrink-0 items-center gap-1.5">
                  {errorActionLabel && onErrorAction ? (
                    <button
                      type="button"
                      onClick={onErrorAction}
                      className="rounded-full border border-[rgba(220,38,38,0.14)] bg-white px-2 py-0.5 text-[10px] font-medium text-[color:var(--state-danger-text)]"
                    >
                      {errorActionLabel}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-full border border-[rgba(15,23,42,0.08)] bg-white px-2 py-0.5 text-[10px] font-medium text-[#6b7280]"
                  >
                    {t(msg`返回视频号`)}
                  </button>
                </div>
              </div>
            </InlineNotice>
          ) : null}
          {isLoading && !comments.length ? (
            <div className="rounded-[16px] border border-[color:var(--border-subtle)] bg-white px-4 py-5 text-center text-[12px] text-[#6b7280]">
              {t(msg`正在读取评论...`)}
            </div>
          ) : null}
          {/*
            走查 2026-05-17 新会话 R1：原条件只看 !isLoading && !comments.length，
            mobileCommentsQuery 失败 + placeholderData 也是空（首次打开 sheet、
            decorations 也还没回 / 没该 post 的 preview）时，红条已经渲了
            "Failed to fetch comments..."，下面却同时出现"还没有评论，先发第一句。"
            空态卡——用户既看到错误又看到"没有评论"的引导，矛盾且会让人以为
            真的没人评论。"评论读失败"和"真没人评论"在 UI 上必须二选一：有 error
            就只显示错误条+重试按钮，别再叠一行误导性空态。

            走查 2026-05-18 R3：再加一道防线——commentCount > 0 但 comments
            还没到位（decorations preview 也没该 post）的情况：placeholderData
            返回 EMPTY_COMMENT_PREVIEW（长度 0），同时 react-query 已经把 data
            置为 placeholder → isLoading=false。原条件只判 isLoading + comments
            长度，会错把「真数据 fetch 中、commentCount=143」当成「真的没人评论」。
            按 post.commentCount 兜一层：> 0 时改显「正在读取最近评论」，避免
            「143 条评论的帖子打开却看到「还没有评论，先发第一句」」的撞数据矛盾。
          */}
          {!isLoading && !comments.length && !errorMessage ? (
            (post?.commentCount ?? 0) > 0 ? (
              <div className="rounded-[16px] border border-[color:var(--border-subtle)] bg-white px-4 py-5 text-center text-[12px] text-[#6b7280]">
                {t(msg`正在读取最近评论...`)}
              </div>
            ) : (
              <div className="rounded-[16px] border border-dashed border-[color:var(--border-subtle)] bg-white px-4 py-5 text-center text-[12px] leading-6 text-[#6b7280]">
                {t(msg`还没有评论，先发第一句。`)}
              </div>
            )
          ) : null}
          {commentsListNode}
        </div>

        <div className="border-t border-[color:var(--border-subtle)] bg-white px-4 pb-2 pt-3">
          {/*
            新一轮走查 R4：非好友帖（post.canInteract===false）的评论 sheet 之前
            textarea 默认 enabled、send 按钮也只在 !draft.trim() 时 disable。用户
            读完评论想跟着发一句，敲完按「发送」→ ChannelsPage.submitComment 走
            ensureCommentPostCanInteract → setNotice("需先加为好友才能互动")。
            但通知 InlineNotice 渲染在 ChannelsPage 顶部，被 z-50 评论 sheet 整张
            backdrop 完全盖住，用户看不到任何反馈，体感「按了发送什么都没发生」。
            sheet 自带 post，本地直接判 canInteract 把输入框 + 发送钮 disable，
            并在 sheet 内贴一行黄色提示替代不可见的页级 notice，让限制在用户视
            线内。
          */}
          {post && post.canInteract === false ? (
            <div className="mb-2 rounded-[12px] bg-[rgba(234,179,8,0.10)] px-3 py-2 text-[11px] leading-[1.35rem] text-[#854d0e]">
              {t(msg`需先加为好友才能互动。`)}
            </div>
          ) : null}
          {replyTarget ? (
            <div className="mb-2 flex items-center justify-between gap-3 rounded-[12px] bg-[rgba(7,193,96,0.08)] px-3 py-2 text-[11px] text-[#166534]">
              {/*
                走查 R1（本轮）：原 truncate 没有 min-w-0 + flex-1，flex item 默认
                min-width:auto，超长 authorName（比如用户用户名 yuanzui0728_5999 +
                "正在回复 " 前缀 ≈ 25 字、或者用户自定的中文长昵称）会按 nowrap 撑开
                父级 flex 容器，把右侧"取消"按钮挤到屏外（移动端 < 380px 宽 chip 必现）。
                给 truncate 那段加 min-w-0 + flex-1 让它在 flex 里能正常收缩、就位
                truncate 省略号；shrink-0 把"取消"按钮锁死不被压扁。
              */}
              <div className="min-w-0 flex-1 truncate">
                {t(msg`正在回复 ${replyTarget.authorName}`)}
              </div>
              <button
                type="button"
                onClick={onCancelReply}
                className="shrink-0 text-[#166534] transition active:opacity-70"
              >
                {t(msg`取消`)}
              </button>
            </div>
          ) : null}
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              rows={2}
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
              disabled={post?.canInteract === false}
              placeholder={
                post?.canInteract === false
                  ? t(msg`需先加为好友才能评论`)
                  : replyTarget
                    ? t(msg`回复 ${replyTarget.authorName}...`)
                    : t(msg`说点什么...`)
              }
              // 走查 R11：服务端 assertCommentText 上限 500 字（UTF-16 length），
              // 之前 textarea 没卡，用户写 600 字提交才看到「评论最多 500 字。」
              // 红条，已经粘贴/打字写好的内容要手动删一段。maxLength 让浏览器
              // 在输入阶段就硬截断，移动端原生输入法也会跟着不再让用户多敲。
              maxLength={500}
              // text-[16px]: iOS Safari/WKWebView focus 时 <16px 会强制 viewport
              // zoom-in。视频号评论 sheet 是常用功能，原本 text-[13px] 每次写
              // 评论都让整页放大、回弹时还要双指捏才能回正。
              className="min-h-[72px] flex-1 rounded-[16px] border-[color:var(--border-subtle)] bg-[#f7f7f7] px-3 py-2 text-[16px] shadow-none focus:border-[rgba(7,193,96,0.2)] focus:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            />
            <Button
              variant="primary"
              size="sm"
              disabled={
                !draft.trim() ||
                submitPending ||
                post?.canInteract === false
              }
              onClick={onSubmit}
              // submitInitiatedAtRef 的钉值已经迁到 submitPending false→true effect
              // 那条上，原 send 按钮 onClick 里手 set 的同款 timestamp 改去掉 —— retry
              // 路径走的是 ChannelsPage 那条 retry button，不经过这里，所以单点 set
              // 漏了 retry。effect 覆盖两条路径，单一来源。
              className="mb-1 h-10 rounded-full bg-[#07c160] px-4 text-[12px] text-white shadow-none hover:bg-[#06ad56]"
            >
              {submitPending ? t(msg`发送中...`) : t(msg`发送`)}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatChannelMeta(
  post: FeedPostListItem,
  t: ReturnType<typeof useRuntimeTranslator>,
) {
  // 注意：不要在这里拼 topicTags——上面已经把 tags 渲染成圆角小标签，
  // 再在 meta 行里追加 "#音乐" 会和最上面的 chip 重复。
  const pieces = [t(msg`${post.viewCount ?? 0} 播放`)];

  if (typeof post.durationMs === "number" && post.durationMs > 0) {
    const seconds = Math.max(1, Math.round(post.durationMs / 1000));
    pieces.push(t(msg`${seconds} 秒`));
  }

  return pieces.join(" · ");
}
