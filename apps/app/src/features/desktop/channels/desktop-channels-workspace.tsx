import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { msg } from "@lingui/macro";
import { useRuntimeTranslator, translateRuntimeMessage } from "@yinjie/i18n";
import { useNavigate } from "@tanstack/react-router";
import {
  SELF_CHARACTER_ID,
  type FeedChannelAuthorProfile,
  type FeedChannelHomeSection,
  type FeedComment,
  type FeedPostListItem,
} from "@yinjie/contracts";
import {
  Button,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  TextField,
  cn,
} from "@yinjie/ui";
import {
  Bookmark,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ImageOff,
  MessageCircleMore,
  RadioTower,
  RefreshCcw,
  Share2,
  ThumbsUp,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { AvatarChip } from "../../../components/avatar-chip";
import { AudioCard } from "../../../components/audio-card";
import { ChannelsForwardPicker } from "../../../components/channels-forward-picker";
import { EmptyState } from "../../../components/empty-state";
import {
  getChannelsEmptyState,
  getChannelsSectionBadge,
} from "../../channels/channels-section-badge";
import { stripToolCallSyntax } from "../../moments/moment-content";
import { formatTimestamp } from "../../../lib/format";
import { resolveAppMediaUrl } from "../../../lib/media-url";
import { useAppRuntimeConfig } from "../../../runtime/runtime-config-store";

type DesktopChannelsWorkspaceProps = {
  activeSection: FeedChannelHomeSection;
  authorProfile: FeedChannelAuthorProfile | null;
  authorProfileErrorMessage?: string | null;
  authorProfileLoading: boolean;
  comments: FeedComment[];
  commentsErrorMessage?: string | null;
  commentsLoading: boolean;
  commentDrafts: Record<string, string>;
  commentLikePendingId: string | null;
  commentPendingPostId: string | null;
  commentReplyTarget: {
    authorId: string;
    authorName: string;
    commentId: string;
    postId: string;
  } | null;
  errorMessage?: string | null;
  isLoading: boolean;
  likePendingPostId: string | null;
  // 走查 2026-05-17 R1：原桌面 workspace 只接 likePending，关注/收藏完全没有
  // pending 锁。channels-page 早就计算了 followPendingAuthorId / favoritePendingPostId
  // 给移动端用，桌面端这两个按钮在 mutation 飞行期允许 rapid click，导致
  // follow → unfollow → follow 三条并发请求落库时按谁先回来谁先生效，最终状态
  // 跟用户最后一次点击意图对不上（同移动端 R1 已修过的同款问题）。补上 prop
  // 透传，按钮按 mutation 锁。
  favoritePendingPostId: string | null;
  followPendingAuthorId: string | null;
  posts: FeedPostListItem[];
  refreshPending?: boolean;
  routeSelectedAuthorId?: string | null;
  routeSelectedPostId?: string | null;
  successNotice?: string;
  // 走查 2026-05-18 R4（本轮）：parent channels-page 的 noticeTone 在 mobile
  // InlineNotice 上用对了 tone={noticeTone}，但 desktop workspace 上一直硬编
  // 码 tone="success"——半数以上的 notice 路径 setNoticeTone("info") 是给失败
  // 兜底的（"点赞失败：xxx" / "需先加为好友才能互动" / "稍等，已经在直播流
  // 中" 等等，channels-page L310/459/511/570/649/821/922/1072/1112），全部在
  // desktop 上渲成绿色 success 体感，明显误导。把 tone 透下来按 parent 给的
  // 渲染。
  // R6（2026-05-18 新会话）：tone 联合扩到 "danger" / "warning"，让失败 toast
  // 跟 InlineNotice 视觉变体 + role=alert 对齐（详见 channels-page.tsx L153
  // 同款 R6 注释）。
  successNoticeTone?: "success" | "info" | "danger" | "warning";
  isPostFavorite: (postId: string) => boolean;
  onCloseAuthor: () => void;
  onCancelCommentReply: () => void;
  onCommentChange: (postId: string, value: string) => void;
  onCommentSubmit: (postId: string) => void;
  onLike: (postId: string) => void;
  onLikeComment: (comment: FeedComment) => void;
  onOpenAuthor: (authorId: string) => void;
  onOpenAuthorPost: (postId: string, authorId: string) => void;
  onRefresh: () => void;
  onReplyToComment: (comment: FeedComment) => void;
  onSectionChange: (section: FeedChannelHomeSection) => void;
  onSelectedPostChange: (postId: string | null) => void;
  // 走查 2026-05-18 新会话 R3：把"当前哪条 post 的评论抽屉是开的"上报给
  // channels-page，用来 gate desktopCommentsQuery 的 enable/key —— 之前 query
  // 跟着 desktopSelectedPostId 走，用户每滑过一条 slide 就会 fetch 一次 comments
  // （公网隧道 200-500ms RTT × N slide），但 90% slide 用户根本不点 chat 图标。
  // 抽屉是 workspace 本地状态，channels-page 拿不到；通过这个回调把开关信号
  // 透给父级，让 query 只在抽屉真打开时才发请求。
  onDrawerOpenChange?: (postId: string | null) => void;
  onToggleAuthorFollow: (authorId: string, following: boolean) => void;
  onToggleFavorite: (post: FeedPostListItem) => void;
  onViewPost: (postId: string) => void;
  sections: Array<{
    key: FeedChannelHomeSection;
    label: string;
    count: number;
  }>;
};

const DESKTOP_CHANNEL_COMMENT_THREAD_STORAGE_KEY =
  "yinjie:channels:desktop-comment-threads";

export function DesktopChannelsWorkspace({
  activeSection,
  authorProfile,
  authorProfileErrorMessage,
  authorProfileLoading,
  comments,
  commentsErrorMessage,
  commentsLoading,
  commentDrafts,
  commentLikePendingId,
  commentPendingPostId,
  commentReplyTarget,
  errorMessage,
  isLoading,
  likePendingPostId,
  favoritePendingPostId,
  followPendingAuthorId,
  posts,
  refreshPending = false,
  routeSelectedAuthorId = null,
  routeSelectedPostId = null,
  successNotice,
  successNoticeTone = "success",
  isPostFavorite,
  onCloseAuthor,
  onCancelCommentReply,
  onCommentChange,
  onCommentSubmit,
  onLike,
  onLikeComment,
  onOpenAuthor,
  onOpenAuthorPost,
  onRefresh,
  onReplyToComment,
  onSectionChange,
  onSelectedPostChange,
  onDrawerOpenChange,
  onToggleAuthorFollow,
  onToggleFavorite,
  onViewPost,
  sections,
}: DesktopChannelsWorkspaceProps) {
  const navigate = useNavigate();
  const t = useRuntimeTranslator();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  // 视频号转发面板：null = 关闭。点 Share 按钮 → 设当前帖摘要。
  const [forwardPickerPost, setForwardPickerPost] = useState<{
    id: string;
    excerpt: string;
  } | null>(null);
  const [forwardNotice, setForwardNotice] = useState<string | null>(null);
  const [commentDrawerPostId, setCommentDrawerPostId] = useState<string | null>(
    null,
  );
  // 视频号的静音状态提升到 workspace：一旦用户在某一条 unmute，再滚到下一条仍保持
  // 取消静音，对齐移动端 / 微信视频号 / 抖音的体验；否则每张 slide 都是独立 ChannelVideoPlayer
  // 实例，会从默认 muted=true 重新开始，导致来回切静音。
  const [unmuted, setUnmuted] = useState(false);
  const toggleUnmuted = useCallback(() => {
    setUnmuted((current) => !current);
  }, []);

  // 走查 2026-05-18 新会话 R1：channels-page 在 baseUrl 切换（用户换账号）时
  // 已经清掉自己那份 forwardPickerPost / commentDrafts / notice（line 1162-
  // 1181），但 DesktopChannelsWorkspace 不在 React tree 上 unmount，自己这份
  // forwardPickerPost / forwardNotice / commentDrawerPostId 没人重置。结果用
  // 户在 A 账号打开转发面板挑好友、半途切到 B 账号 → picker 还开着 + postId
  // 仍是 A 世界的 uuid → 点好友落地 B 世界的 API 立刻 FEED_POST_NOT_FOUND，
  // 错误通过 picker 兜底文案翻成"这条视频号已经不在了"——但用户视角是「我刚
  // 进新账号点了下转发就报视频号丢了」，错得没头没脑。同步把 channels-page
  // 那条 baseUrl change reset 镜像到 workspace 这份本地状态上：picker / notice
  // / 评论 drawer 一律清零，让新账号干净落地。unmuted / selectedPostId 不动
  // —— unmuted 是用户跨账号一致的偏好；selectedPostId 上面 effect L195-204
  // 已经按新 posts 兜底了。
  const previousBaseUrlRef = useRef(baseUrl);
  // 走查 2026-05-18 新会话 R2：picker 打开时 baseUrl 钉到 ref —— forward
  // mutation 是 picker 内部的 useMutation，picker 因 R5-1 reset 被 unmount
  // 后 mutationFn 仍然在 flight（fetch 不会因组件卸载自动取消），完成时
  // handlePick 的 try 分支照样 await 落地 → 调 onForwarded?.(...) → workspace
  // 的 setForwardNotice("已转发给 X") 在新账户 UI 上冒出来，体感「我刚切到
  // B 啥都没干怎么有转发通知」。失败路径 onForwardFailed 同款问题。
  // 用 ref 捕获 picker 打开时的 baseUrl，下面 onForwarded / onForwardFailed
  // 比对当前 baseUrl 早返：跨账户的"上一个账户"的转发不冒到当前账户。
  // ref 清空时机：baseUrl change（上面那条 effect）会顺手清；onClose 不清
  //（同账户内手动关 picker 后 mutation 落地仍想给确认）。
  const forwardPickerBaseUrlRef = useRef<string | null>(null);
  useEffect(() => {
    if (previousBaseUrlRef.current === baseUrl) {
      return;
    }
    previousBaseUrlRef.current = baseUrl;
    setForwardPickerPost(null);
    setForwardNotice(null);
    setCommentDrawerPostId(null);
    forwardPickerBaseUrlRef.current = null;
  }, [baseUrl]);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const slideRefs = useRef(new Map<string, HTMLDivElement>());
  const registerSlide = useCallback(
    (postId: string, node: HTMLDivElement | null) => {
      if (node) {
        slideRefs.current.set(postId, node);
      } else {
        slideRefs.current.delete(postId);
      }
    },
    [],
  );

  // 走查 2026-05-18 新会话 R1：channels-page 把所有 mutation 回调 (onLike /
  // onShare / onToggleAuthorFollow / onToggleFavorite / onOpenAuthor 等) 用
  // 内联箭头穿到 DesktopChannelsWorkspace —— 父级每 render（包括频繁的乐观
  // 更新和 IntersectionObserver setSelectedPostId）都换 callback identity。
  // 配合下方 posts.map 里的二级内联箭头 `onLike={() => onLike(post.id)}`，
  // 即使每条 slide 的 post / isActive / pending 属性都没变，每次父 re-render
  // 也把 20 张 slide 全推一遍 → ChannelMediaSurface / ChannelVideoPlayer 跟着
  // 重渲（虽然 effect deps 没变所以视频不会重启，但 DOM diff 仍然过一遍）。
  // 用 latest-ref 兜稳定 identity 的回调，下面 React.memo(ChannelFeedSlide)
  // 才有意义 —— 只有真正属性变化的那条 slide 会重渲。
  const handlerRefs = useRef({
    onLike,
    onOpenAuthor,
    onToggleAuthorFollow,
    onToggleFavorite,
    baseUrl,
  });
  handlerRefs.current = {
    onLike,
    onOpenAuthor,
    onToggleAuthorFollow,
    onToggleFavorite,
    baseUrl,
  };
  const handleSlideLike = useCallback((postId: string) => {
    handlerRefs.current.onLike(postId);
  }, []);
  const handleSlideOpenAuthor = useCallback((authorId: string) => {
    handlerRefs.current.onOpenAuthor(authorId);
  }, []);
  const handleSlideToggleCommentDrawer = useCallback((postId: string) => {
    setCommentDrawerPostId((current) =>
      current === postId ? null : postId,
    );
  }, []);
  const handleSlideShare = useCallback((post: FeedPostListItem) => {
    // 走查 2026-05-17 R2：移动端 handleSharePost 早就用 stripToolCallSyntax
    // 把 <tool_call> / [TOOL_CALL] 这类残留过滤掉再当转发面板顶部摘要；
    // 桌面这里一直拿原文，AI 生成贴里夹的工具调用语法会原样塞进
    // 转发预览，看着像乱码。和移动端对齐一道清洗。
    //
    // 走查 2026-05-18 新会话续轮 R1：mobile handleSharePost（channels-page
    // L1630-1647）早就加了 fallback 链 cleanText → post.title → "视频号动态"
    // —— audio 帖（mediaType=audio）后端 createOwnerPost 走 audio 路径时 text
    // 不强制，post.text 经常是空串；纯 AI thinking-prose 帖也会被 strip 抠成
    // 空。原 desktop 代码直接拼 `${author}：${cleanText}` 让 picker 顶部摘要
    // 变成「李白：」一个孤零零的全角冒号悬空，体感「要转发的内容是不是残缺了」。
    // 桌面跟移动端对齐 fallback 链；用 translateRuntimeMessage 而非 t hook，
    // 是因为下方 useCallback([]) 不该把 t 拽进 deps。
    const cleanText = stripToolCallSyntax(post.text ?? "").trim();
    const titleOrText =
      cleanText ||
      post.title?.trim() ||
      translateRuntimeMessage(msg`视频号动态`);
    // 走查 2026-05-18 新会话 R2：picker 打开时钉住 baseUrl 供下方 onForwarded
    // / onForwardFailed 比对（跨账户的转发完成不冒到新账户）。
    forwardPickerBaseUrlRef.current = handlerRefs.current.baseUrl ?? null;
    setForwardPickerPost({
      id: post.id,
      excerpt: `${post.authorName}：${titleOrText}`.slice(0, 80),
    });
  }, []);
  const handleSlideToggleAuthorFollow = useCallback((post: FeedPostListItem) => {
    handlerRefs.current.onToggleAuthorFollow(
      post.authorId,
      Boolean(post.ownerState?.isFollowingAuthor),
    );
  }, []);
  const handleSlideToggleFavorite = useCallback((post: FeedPostListItem) => {
    handlerRefs.current.onToggleFavorite(post);
  }, []);
  // 同款 hoist：原来 sectionBadge 在 posts.map 里每条 slide 都跑一次
  // getChannelsSectionBadge(activeSection, t) — 同 section 下结果完全一样，
  // 20 张 slide 浪费 20 次 switch + 20 次 t() 翻译查表。提到外面只算一次。
  const sectionBadge = useMemo(
    () => getChannelsSectionBadge(activeSection, t),
    [activeSection, t],
  );

  // 走查 2026-05-18 新会话（本轮 R1）：原 effect 直接 setSelectedPostId(routeSel
  // ectedPostId) 是 OK 的，但跟下面那条 effect 在同一 commit 里都看见旧 select
  // edPostId 的闭包：那条用非 functional 写法 setSelectedPostId(posts[0]?.id)
  // 又覆盖回来 → 实际 selectedPostId 落到 posts[0] 而不是 routeSelectedPostId。
  // 这条用 functional 防 stale closure：c 是 React 队列里上一条 setState 翻新
  // 过的 current，不再被覆盖。
  useEffect(() => {
    setSelectedPostId((current) =>
      current === routeSelectedPostId ? current : routeSelectedPostId,
    );
  }, [routeSelectedPostId]);

  // 走查 2026-05-18 新会话（本轮 R1）：原写法用闭包里捕到的 selectedPostId 判
  // `!selectedPostId || !posts.some(...)` 然后 setSelectedPostId(posts[0]?.id)
  // ——但在工作区刚刚 mount 那一帧（baseUrl 切账户 / deep-link 入场 → desktop
  // RoutePostPending 翻 false 之后 workspace 重新挂上）这条 effect 跟上面那条
  // [routeSelectedPostId] effect 在同一个 commit 里都看见 selectedPostId=null
  // 的闭包：上面 setSelectedPostId(routeSel='real-id')，本 effect 看见闭包还是
  // null 就再 setSelectedPostId(posts[0].id)，最后一次 wins → routeSel 被覆盖
  // 成 posts[0]。Effect 345 再把这个 posts[0] 回报上去 → channels-page Effect
  // C navigate URL='post=posts[0]' → 下一帧 URL/state 跨 commit 又 swap，整个
  // 链子 25 次 commit 后 React 抛 "Maximum update depth"，CatchBoundary 兜底
  // 整页崩。
  // 改用 functional setState：闭包不再读 stale selectedPostId，由 React 在执
  // 行队列里拿到上一条 setState 翻新过的 current 值。上面 effect 已经把 c 设到
  // routeSel='real-id' 时，posts.some(id===real-id) 大部分时候是 true（包括
  // 走 desktopMissingRoutePostId 单独拉回 prepend 那条），functional 返回
  // current 不动；只有真没有命中 posts（home 列表里完全没这条 + missing
  // RoutePostQuery 也跑空）时才兜 posts[0]。
  useEffect(() => {
    if (!posts.length) {
      setSelectedPostId(null);
      onSelectedPostChangeRef.current(null);
      return;
    }

    let fallbackToEcho: string | null | undefined = undefined;
    setSelectedPostId((current) => {
      if (current && posts.some((post) => post.id === current)) {
        return current;
      }
      const fallback = posts[0]?.id ?? null;
      if (fallback !== current) {
        fallbackToEcho = fallback;
      }
      return fallback;
    });
    // 兜底切换走 ref，避免 setState updater 里直接调 prop（updater 必须 pure）。
    // 同帧调用（在 React 18 严格模式下不会抛 "setState during render"）。
    if (fallbackToEcho !== undefined) {
      onSelectedPostChangeRef.current(fallbackToEcho);
    }
  }, [posts]);

  const selectedPost =
    posts.find((post) => post.id === selectedPostId) ?? posts[0] ?? null;
  const selectedIndex = selectedPost
    ? posts.findIndex((post) => post.id === selectedPost.id)
    : -1;
  const authorPanelVisible = Boolean(routeSelectedAuthorId);

  // 走查 2026-05-18 新会话（本轮 R1）：原 effect 每次 selectedPost?.id 变都把
  // 值 echo 回 channels-page。问题是 useEffect 的闭包捕到的 selectedPost.id 经
  // 常是上一帧的 stale 值（Effect 321 这一帧 setSelectedPostId 只是排队，本 effect
  // 在同 commit 跑时拿的还是旧闭包）。channels-page 收到 stale id → desktop
  // SelectedPostId 跟 URL 真理之源不一致 → URL-sync effect 拿这条 stale state 把
  // URL 又写回上一帧，下一帧 routeSelectedPostId 跟 desktopSelectedPostId 跨帧
  // swap → 死循环 → "Maximum update depth"。
  // 修法：彻底改成事件驱动 echo（不再用 useEffect 监听 selectedPost.id）：
  //   - 用户滚 slide 改变 selectedPostId → IntersectionObserver 那边的回调里同帧
  //     调 onSelectedPostChange，闭包是当时刚算出来的最新 postId 不会 stale。
  //   - Effect 327 兜 posts[0] / 无 posts 兜 null 时，回调读最新 ref 同帧 echo。
  //   - 路由同步那条（Effect 321）不需要 echo —— channels-page 那边 Effect on
  //     [routeSelectedPostId] 已经从 URL 同步过 desktopSelectedPostId 了，本来
  //     就一致，再 echo 一次反而把 stale 旧值反向覆盖回去。
  // ref 在 render 每次同步刷成最新，IntersectionObserver / Effect 327 的 echo
  // 调用都通过 ref 拿当下最新的 onSelectedPostChange 身份，避免 effect deps 化成
  // 没必要的频繁 re-fire。
  const onSelectedPostChangeRef = useRef(onSelectedPostChange);
  onSelectedPostChangeRef.current = onSelectedPostChange;

  // 走查 2026-05-17 新会话 R1：原 useEffect 在 selectedPost.id 一变就立刻 POST
  // /feed/:id/view，鼠标滚轮快速滚过 5-10 张 slide 时一秒就能打掉 5-10 次没人
  // 真在看的"观看"——后端 viewFeedPost 每条都做 owner-interaction findOneBy +
  // 落库 + （首次）viewCount/watchCount 自增，纯浪费 RTT。和移动端
  // MobileChannelsViewport 同款，加 600ms 防抖：停留够久才算 view，扫过的卡不发。
  useEffect(() => {
    const postId = selectedPost?.id;
    if (!postId) {
      return;
    }
    const timer = window.setTimeout(() => {
      onViewPost(postId);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [onViewPost, selectedPost?.id]);

  // Close the comment drawer whenever the active post changes
  useEffect(() => {
    setCommentDrawerPostId((current) =>
      current && current === selectedPost?.id ? current : null,
    );
  }, [selectedPost?.id]);

  // 走查 2026-05-18 新会话 R3：drawer open 状态上报 channels-page —— 父级用
  // 来 gate desktopCommentsQuery（之前 query 跟着 desktopSelectedPostId 走，
  // 每滑过一张 slide 都 fetch comments 一次浪费 RTT）。fire-and-forget：
  // onDrawerOpenChange 是 channels-page 的 setState setter，identity 稳定，
  // 不会让这个 effect 重复跑。
  useEffect(() => {
    onDrawerOpenChange?.(commentDrawerPostId);
  }, [commentDrawerPostId, onDrawerOpenChange]);

  // 走查 2026-05-17 新会话 R2：原依赖整个 posts 数组——每次 ChannelsPage 上
  // 的 like/favorite/follow 乐观更新让 React Query setQueryData 返回新数组，
  // 这条 effect 就把 IntersectionObserver 整张拆掉重建，下一帧再重新 observe
  // 当前所有 slide。lots of churn for nothing：slide id 集合没变，重建毫无意义。
  // 用 id 拼成的稳定 key 代替——只有真正插/删 slide 时才重建 observer。
  const slideIdsKey = useMemo(
    () => posts.map((post) => post.id).join(","),
    [posts],
  );
  // IntersectionObserver: keep selectedPostId in sync with whichever slide
  // is currently filling the viewport.
  useEffect(() => {
    const root = scrollContainerRef.current;
    if (!root || slideIdsKey.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) {
          return;
        }

        const postId = (visible.target as HTMLElement).dataset.postId;
        if (postId) {
          setSelectedPostId(postId);
          // 走查 2026-05-18 新会话（本轮 R3）：观察者真切到新 slide 时事件驱动
          // echo 给 channels-page。原写法把 echo 放在 setSelectedPostId updater
          // 内部，但 setState updater 必须 pure —— 内部又触发 parent setState
          // 在 React 18 严格模式下抛 "Cannot update a component while rendering
          // a different component"。把 echo 移到 updater 外、observer 回调本帧
          // 同步调（不在 render 期间），ref 解锁回调最新 identity。
          onSelectedPostChangeRef.current(postId);
        }
      },
      { root, threshold: [0.6] },
    );

    slideRefs.current.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [slideIdsKey]);

  // 走查 2026-05-17 新会话 R2：原依赖 [routeSelectedPostId, posts]——每次
  // 用户在桌面端点赞 / 收藏 / 关注 → ChannelsPage setQueryData → posts 是新
  // 数组 → 这条 effect 又 fire → scrollIntoView(routeSelectedPostId) 把用户拽
  // 回最初进入 channels 时的那条 slide。用户已经滑了几屏到第 5 张，一点赞就
  // 被甩回第 1 张，体感「这个页面在跟我抢滚动控制权」。和移动端 R 同款思路：
  // 用 scrolledRouteIdRef 记录"这个 route id 我已经滚到过了"，posts 后续变化
  // 不重滚；只在 routeSelectedPostId 变 / 或目标 post 首次出现在 posts 里时
  // 尝试一次。
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
      return;
    }

    const node = slideRefs.current.get(routeSelectedPostId);
    if (node) {
      node.scrollIntoView({ behavior: "auto", block: "start" });
      scrolledRouteIdRef.current = routeSelectedPostId;
    }
  }, [routeSelectedPostId, hasRouteTargetInPosts]);

  // Esc closes whichever overlay is on top (drawer first, then author panel).
  //
  // 走查 2026-05-18 R3（本轮）：onCloseAuthor 来自父级 channels-page 的 regular
  // function declaration（`function closeChannelAuthor() {...}`，不是 useCall
  // back），每次 channels-page re-render 都换 identity。视频号 home 主体在视
  // 频播放期间有大量 query 更新（home refetch / decorations refetch / 每 600ms
  // viewFeedPost mutation 完成）触发 channels-page re-render → workspace 也
  // 一道 re-render → 这条 effect deps 看到新 onCloseAuthor → cleanup 旧
  // keydown listener + add 新 listener。drawer 或 author 一旦打开，user 静坐
  // 不动也会持续装卸 listener（实测每秒 4-8 次），listener 装卸本身廉价但
  // 在 React 18 strict-mode dev 下能放大成抖动 + 极端时与 native keypress
  // 错峰丢键。latest-ref 锁稳：deps 只挂 drawer / author 状态，listener 内部
  // 读 ref.current。
  const onCloseAuthorRef = useRef(onCloseAuthor);
  onCloseAuthorRef.current = onCloseAuthor;
  // 走查 2026-05-18 新会话 R1（本轮）：原 Esc handler 监听 [authorPanelVisible,
  // commentDrawerPostId]，但当 ChannelsForwardPicker 浮在最上层（z-110，比
  // drawer z-30 / author z-40 高）时，picker 内部 L98-110 注册了自己一份 Esc
  // 监听器。两个 window-level keydown 都不调 stopPropagation，按一次 Esc 同
  // 时触发：workspace 这边把 drawer / author 关掉，picker 那边把自己关掉
  // —— 用户只想收 picker，结果连底下的评论 drawer / 作者主页一道被甩掉，
  // 体感「我刚刚是不是不小心碰到了什么键」。drawer 是可以跟 picker 共存的
  // （drawer 外层 pointer-events-none，user 仍能点到 slide action rail 的
  // 「转发」按钮把 picker 调出来），所以这条共存路径不少见。
  // 修法：workspace 的 Esc handler 当 forwardPickerPost 存在时直接 bail，
  // 把 Esc 完全让给 picker；picker 关掉后下一次 Esc 才回到 drawer / author
  // 的关闭逻辑。
  const forwardPickerOpenRef = useRef(false);
  forwardPickerOpenRef.current = Boolean(forwardPickerPost);
  useEffect(() => {
    if (!commentDrawerPostId && !authorPanelVisible) {
      return;
    }

    const handler = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      // R1 续：forward picker 在最上层时把 Esc 让给它独家处理。
      if (forwardPickerOpenRef.current) {
        return;
      }
      event.preventDefault();
      if (commentDrawerPostId) {
        setCommentDrawerPostId(null);
      } else if (authorPanelVisible) {
        onCloseAuthorRef.current();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [authorPanelVisible, commentDrawerPostId]);

  const scrollToOffset = useCallback((delta: number) => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }
    container.scrollBy({ top: delta, behavior: "smooth" });
  }, []);

  const handlePrev = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }
    scrollToOffset(-container.clientHeight);
  }, [scrollToOffset]);

  const handleNext = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }
    scrollToOffset(container.clientHeight);
  }, [scrollToOffset]);

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-[rgba(244,247,246,0.98)]">
      <div className="border-b border-[color:var(--border-faint)] bg-white/92 backdrop-blur-xl">
        <div className="flex h-14 items-center justify-between gap-4 px-6">
          <div className="flex h-full items-stretch gap-7">
            {sections.map((section) => {
              const active = activeSection === section.key;
              return (
                <button
                  key={section.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onSectionChange(section.key)}
                  className="relative flex h-full items-center text-[14px] outline-none"
                >
                  <span
                    className={cn(
                      "transition-colors",
                      active
                        ? "font-medium text-[color:var(--text-primary)]"
                        : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]",
                    )}
                  >
                    {section.label}
                  </span>
                  {active ? (
                    <span className="pointer-events-none absolute bottom-0 left-1/2 h-[2px] w-7 -translate-x-1/2 rounded-full bg-[color:var(--brand-primary)]" />
                  ) : null}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={onRefresh}
              disabled={refreshPending}
            >
              <RefreshCcw size={14} />
              {refreshPending ? t(msg`生成中...`) : t(msg`换一批`)}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() =>
                void navigate({ to: "/desktop/channels/live-companion" })
              }
            >
              <RadioTower size={14} />
              {t(msg`直播伴侣`)}
            </Button>
          </div>
        </div>

      </div>

      {/*
        走查 2026-05-18 新会话 R2：notice / errorMessage 原来作为 header 的
        flex 子节点，每次 like / favorite / follow / comment / share 触发的
        2.4s notice 都把 header 高度从 56px 撑到 ~100px、content flex-1 同时
        缩水 → snap-y 容器整体下移 → 当前 slide 顶 / 底被裁切，下条 slide 也
        相应跳一下。视频号 home 每分钟正常会有 5-10 次 notice，等于每分钟看
        见 5-10 次「页面突然抖一下」。改用 absolute 浮在 header 下面、覆在
        content 顶部 —— header 永远 h-14 固定不动，snap 容器也不再重排；视
        觉上 notice 还是从 header 边缘冒出，对齐 backdrop-blur 没掉。

        走查 2026-05-18 新会话 R4：z-index 必须高过 comment drawer (z-30) 和
        author overlay (z-40)，否则小视口（laptop 13" ~720px）上 drawer 容易
        竖向覆掉 notice 的 y=56..106 那一段；用户在 drawer 里发完评论想看
        「评论已发送」的 success notice，只看见 drawer 自己——drawer 里没有
        success state，体感「按了发送，到底成没成？」。用 z-50 让 notice
        始终浮在 drawer / author overlay 之上（forward picker z-110 是全屏
        modal，用户在 picker 内时本来就不需要看 notice，让它盖掉无妨）。
      */}
      {successNotice || errorMessage ? (
        <div className="pointer-events-none absolute left-0 right-0 top-14 z-50 space-y-2 border-b border-[color:var(--border-faint)] bg-white/92 px-6 py-2 backdrop-blur-xl">
          {successNotice ? (
            <div className="pointer-events-auto">
              <InlineNotice
                tone={successNoticeTone}
                className="border-[color:var(--border-faint)] bg-white"
              >
                {successNotice}
              </InlineNotice>
            </div>
          ) : null}
          {errorMessage ? (
            <div className="pointer-events-auto">
              <ErrorBlock message={errorMessage} />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="relative min-h-0 flex-1 overflow-hidden bg-[#101013]">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <LoadingBlock label={t(msg`正在读取视频号内容...`)} />
          </div>
        ) : null}

        {!isLoading && !posts.length ? (
          <div className="flex h-full items-center justify-center">
            {(() => {
              // 按当前 tab 给"为什么空"的具体原因——尤其 关注 / 直播 这种
              // 经常空的 tab，通用文案没有信息量。
              //
              // 走查 2026-05-18 R1：原 EmptyState 只渲文字，没 CTA。用户在
              // 朋友 / 关注 / 直播 三个常空 tab 落到空态后唯一可触发的入口
              // 是顶部的「换一批」——而那条按钮在非推荐 tab 上点了 generate
              // 后内容只会落到推荐流，本 tab 还是空，体感「按了没效果」。
              // 移动端 MobileChannelsStatusCard 在空态卡里给了同款 CTA
              // （channels-page.tsx L1837-1862）：following/friends/live 显
              // "去推荐看看" 切 tab，recommended 显「换一批」触发 generate。
              // 桌面 workspace 对齐，避免用户进空 tab 无所适从。
              const empty = getChannelsEmptyState(activeSection, t);
              const isSpecialTab =
                activeSection === "following" ||
                activeSection === "friends" ||
                activeSection === "live";
              return (
                <EmptyState
                  title={empty.title}
                  description={empty.description}
                  action={
                    isSpecialTab ? (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => onSectionChange("recommended")}
                      >
                        {t(msg`去推荐看看`)}
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={onRefresh}
                        disabled={refreshPending}
                      >
                        <RefreshCcw size={14} />
                        {refreshPending ? t(msg`生成中...`) : t(msg`换一批`)}
                      </Button>
                    )
                  }
                />
              );
            })()}
          </div>
        ) : null}

        {!isLoading && posts.length ? (
          <>
            <div
              ref={scrollContainerRef}
              className="h-full snap-y snap-mandatory overflow-y-scroll scroll-smooth"
            >
              {posts.map((post) => (
                <ChannelFeedSlide
                  key={post.id}
                  post={post}
                  isActive={post.id === selectedPost?.id}
                  sectionBadge={sectionBadge}
                  registerSlide={registerSlide}
                  isFavorite={isPostFavorite(post.id)}
                  likePending={likePendingPostId === post.id}
                  favoritePending={favoritePendingPostId === post.id}
                  followPending={followPendingAuthorId === post.authorId}
                  unmuted={unmuted}
                  onToggleUnmuted={toggleUnmuted}
                  onLike={handleSlideLike}
                  onOpenAuthor={handleSlideOpenAuthor}
                  onShare={handleSlideShare}
                  onToggleAuthorFollow={handleSlideToggleAuthorFollow}
                  onToggleCommentDrawer={handleSlideToggleCommentDrawer}
                  onToggleFavorite={handleSlideToggleFavorite}
                />
              ))}
            </div>

            <FeedNavArrows
              canPrev={selectedIndex > 0}
              canNext={
                selectedIndex >= 0 && selectedIndex < posts.length - 1
              }
              onPrev={handlePrev}
              onNext={handleNext}
            />

            {selectedPost && commentDrawerPostId === selectedPost.id ? (
              <ChannelCommentsDrawer
                comments={comments}
                commentsErrorMessage={commentsErrorMessage}
                commentsLoading={commentsLoading}
                draft={commentDrafts[selectedPost.id] ?? ""}
                likePendingCommentId={commentLikePendingId}
                replyTarget={commentReplyTarget}
                selectedPost={selectedPost}
                submitPending={commentPendingPostId === selectedPost.id}
                onCancelReply={onCancelCommentReply}
                onClose={() => setCommentDrawerPostId(null)}
                onDraftChange={(value) =>
                  onCommentChange(selectedPost.id, value)
                }
                onLikeComment={onLikeComment}
                onReplyToComment={onReplyToComment}
                onSubmit={() => onCommentSubmit(selectedPost.id)}
              />
            ) : null}
          </>
        ) : null}

        {authorPanelVisible ? (
          <ChannelAuthorOverlay
            authorId={routeSelectedAuthorId}
            errorMessage={authorProfileErrorMessage}
            isLoading={authorProfileLoading}
            profile={authorProfile}
            // 走查 2026-05-17 R1：overlay 上的 +关注 / 已关注 按钮没有 pending
            // 锁，rapid click 同样会让 toggle mutation 串行竞态。把 followPendingAuthorId
            // 透过来，按当前展示的作者 id 锁按钮。
            followPending={
              followPendingAuthorId !== null &&
              routeSelectedAuthorId !== null &&
              followPendingAuthorId === routeSelectedAuthorId
            }
            selectedPostId={selectedPost?.id ?? null}
            onClose={onCloseAuthor}
            onOpenPost={onOpenAuthorPost}
            onToggleFollow={onToggleAuthorFollow}
          />
        ) : null}
      </div>

      <ChannelsForwardPicker
        open={Boolean(forwardPickerPost)}
        postId={forwardPickerPost?.id ?? null}
        postExcerpt={forwardPickerPost?.excerpt}
        baseUrl={baseUrl}
        onClose={() => setForwardPickerPost(null)}
        onForwarded={(target) => {
          // 走查 2026-05-18 新会话 R2：mid-flight 切账户守卫 — 上一行 effect
          // 在 baseUrl change 时已经把 forwardPickerBaseUrlRef 清成 null。若
          // 当前 baseUrl 跟 picker 打开时不一致（中途切了账户），说明这条
          // forward 是上一个账户的事，不该在新账户冒「已转发给 X」通知。
          if (
            forwardPickerBaseUrlRef.current !== null &&
            forwardPickerBaseUrlRef.current !== baseUrl
          ) {
            return;
          }
          if (forwardPickerBaseUrlRef.current === null) {
            // 已经切账户：picker 被 baseUrl effect unmount，但 mutation 仍 in
            // flight 落地走到这里。skip 同上。
            return;
          }
          setForwardNotice(t(msg`已转发给 ${target.name}。`));
          // 走查 2026-05-17 R1：原注释说要刷"shareCount"——但桌面端工作区
          // 没有任何地方显示 post.shareCount / ownerState.hasShared，移动端同
          // 流程已经在 channels-page.tsx 移除了同款 invalidate。这里也跟着
          // 去掉，避免每次转发后白白拉一次 home 列表。
        }}
        onForwardFailed={(input) => {
          // 走查 2026-05-17 新会话 R3：picker 在 mutation pending 时不挡关闭，
          // 用户点完好友立刻关 picker → picker 内的红条已经不渲染。移动端在
          // channels-page 上有 onForwardFailed → page 级 notice 兜底，桌面端
          // 一直没接，等于失败被静默吞。借现成的 forwardNotice channel 兜
          // 出来——成功是绿色文案，失败也用同一条 notice 通道把错误顶出来，
          // 不让用户「按了转发什么都没发生」。
          //
          // 走查 2026-05-18 新会话 R2：mid-flight 切账户守卫同 onForwarded。
          if (
            forwardPickerBaseUrlRef.current !== null &&
            forwardPickerBaseUrlRef.current !== baseUrl
          ) {
            return;
          }
          if (forwardPickerBaseUrlRef.current === null) {
            return;
          }
          setForwardNotice(
            t(msg`转发给 ${input.targetName} 失败：${input.message}`),
          );
        }}
      />
      {forwardNotice ? (
        <ForwardNotice
          message={forwardNotice}
          onDismiss={() => setForwardNotice(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * 顶部短暂浮现的转发成功提示——3 秒自动消失。
 *
 * 走查 2026-05-18 R1：原 effect deps 是 [onDismiss]，但 onDismiss 是父级
 * DesktopChannelsWorkspace 里 `() => setForwardNotice(null)` 内联箭头，每次父
 * re-render 都换 identity。视频号工作区里鼠标滚动切 slide → IntersectionObserver
 * → setSelectedPostId → 父 re-render → ForwardNotice 拿到新 onDismiss →
 * useEffect cleanup 清旧 timer 再起新 3s timer。用户转发完一直滑 slide 时
 * notice 永远不消失，最后还得手动等用户停下来才能 fire。
 * 用 ref 缓存最新 onDismiss，effect 只依赖 message —— message 改变才重置
 * timer，父 re-render 跟 timer 解耦。
 */
function ForwardNotice({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  useEffect(() => {
    const timer = window.setTimeout(() => onDismissRef.current(), 3000);
    return () => window.clearTimeout(timer);
  }, [message]);
  return (
    <div className="fixed left-1/2 top-6 z-[120] -translate-x-1/2 rounded-full bg-[rgba(17,24,39,0.92)] px-4 py-2 text-[13px] text-white shadow-lg">
      {message}
    </div>
  );
}

function ChannelActionButton({
  active = false,
  ariaLabel,
  icon,
  label,
  pending = false,
  surface = "light",
  onClick,
}: {
  active?: boolean;
  // 可视 label 只是计数数字（"17"、"29"），屏读出来就一个数字毫无上下文。
  // 调用方传 ariaLabel 才能让屏读读出"点赞，当前 17 赞"这种完整意图。
  ariaLabel?: string;
  icon: ReactNode;
  label: string;
  pending?: boolean;
  surface?: "light" | "dark";
  onClick: () => void;
}) {
  const isDark = surface === "dark";
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={ariaLabel}
      disabled={pending}
      onClick={onClick}
      className={cn(
        "group flex flex-col items-center gap-1 outline-none",
        pending && "opacity-60",
      )}
    >
      <span
        className={cn(
          "flex h-11 w-11 items-center justify-center rounded-full border transition-colors",
          isDark
            ? active
              ? "border-[rgba(7,193,96,0.65)] bg-white/12 text-[color:var(--brand-primary)]"
              : "border-white/14 bg-white/12 text-white group-hover:bg-white/22"
            : active
              ? "border-[rgba(7,193,96,0.42)] bg-white text-[color:var(--brand-primary)] shadow-[var(--shadow-section)]"
              : "border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)] shadow-[var(--shadow-section)] group-hover:bg-[color:var(--surface-console)] group-hover:text-[color:var(--text-primary)]",
        )}
      >
        {icon}
      </span>
      <span
        className={cn(
          "text-[11px]",
          isDark
            ? active
              ? "font-medium text-[color:var(--brand-primary)]"
              : "text-white/72"
            : active
              ? "font-medium text-[color:var(--brand-primary)]"
              : "text-[color:var(--text-muted)]",
        )}
      >
        {label}
      </span>
    </button>
  );
}

function ChannelMediaSurface({
  post,
  isActive,
  unmuted,
  onToggleUnmuted,
}: {
  post: FeedPostListItem;
  isActive: boolean;
  unmuted: boolean;
  onToggleUnmuted: () => void;
}) {
  const t = useRuntimeTranslator();
  const audioAsset = post.media?.find((asset) => asset.kind === "audio");
  const videoAsset = post.media?.find((asset) => asset.kind === "video");

  // 走查 2026-05-18 R2（本轮）：原来 audio/video 两个分支的 gate 和 URL 解析
  // 用了不同的 fallback 操作符——gate 用 `||`（truthy 检查），URL 用 `??`
  // （nullish-only）。contracts 里 FeedMediaAsset.url 是 `string` 必填，但没
  // 约束非空，server 偶发会落空字符串（minimax 拉取失败 + 后端没 cleanupBroken
  // ChannelPosts 跑过 / 异步 LPP 子端口未确认 url 时）。
  //   - video 分支：`videoAsset?.url || post.mediaUrl` 让 gate 取到 mediaUrl
  //     真值，但 url prop 用 `??` 留下 videoAsset.url=""，<ChannelVideoPlayer>
  //     拿到空字符串 → `isActive && url` 永远 false → 永远黑屏不播 + 不报错
  //     （用户看到自己发的视频卡，封面有，点了取消静音也没反应）。
  //   - audio 分支：gate 检查 audioAsset 对象本体存在（不看 url），url prop 同
  //     样 `??` 让空字符串穿过 → AudioCard 拿到空 url → play 失败静默。
  // 统一改成"先把可播 url 算出来，再用它当 gate"，逻辑零分歧。
  const audioPlaybackUrl = audioAsset?.url || post.mediaUrl || "";
  if (post.mediaType === "audio" && audioPlaybackUrl) {
    const backgroundCover = resolveAppMediaUrl(
      audioAsset?.posterUrl ?? post.coverUrl ?? undefined,
    );
    return (
      <div className="relative flex flex-1 items-center justify-center bg-gradient-to-b from-[#1f2533] to-[#0a0c10] px-6">
        {backgroundCover ? (
          // 浮在背景里的封面图（半透明），给音乐贴一些视觉氛围
          //
          // 走查 2026-05-18 R1：原 <img> 既无 lazy 也无 onError 兜底。20 张
          // audio slide 一起 eager 拉公网封面，首屏并发十几张 minimax-cover 浪
          // 费带宽 + 公网隧道 RTT；单张 cover 404（minimax 资源被回收 / cloud-
          // api 反代 401 边界）时浏览器原生破图占位会盖在沉浸式播放区上方，
          // 透着 opacity-30 还隐约能看到。和移动端 ChannelAudioPictorial / 桌
          // 面 ChannelFallbackImage 的修法一致：active 卡 eager，其余 lazy；
          // onError 直接把封面隐掉，让纯渐变背景兜底（卡顶角已经有"音乐"标签，
          // 不需要 Music2 占位图标重复打）。decoding=async 避免大图同步解码卡
          // 主线程。
          <BackgroundCoverImage
            src={backgroundCover}
            alt={post.title ?? ""}
            isActive={isActive}
          />
        ) : null}
        <div className="relative">
          <AudioCard
            url={audioPlaybackUrl}
            posterUrl={audioAsset?.posterUrl ?? post.coverUrl ?? undefined}
            title={
              audioAsset?.title ?? post.title ?? `${post.authorName}·${t(msg`音乐`)}`
            }
            durationMs={audioAsset?.durationMs ?? post.durationMs ?? undefined}
            variant="feed"
            isActive={isActive}
          />
        </div>
      </div>
    );
  }

  const videoPlaybackUrl = videoAsset?.url || post.mediaUrl || "";
  if (post.mediaType === "video" && videoPlaybackUrl) {
    const resolvedPoster = resolveAppMediaUrl(
      videoAsset?.posterUrl ?? post.coverUrl ?? undefined,
    );
    return (
      <ChannelVideoPlayer
        url={resolveAppMediaUrl(videoPlaybackUrl)}
        posterUrl={resolvedPoster || undefined}
        isActive={isActive}
        unmuted={unmuted}
        onToggleUnmuted={onToggleUnmuted}
      />
    );
  }

  // 走查 2026-05-17 R2：mediaType='image' / 'text' 这两种 server 实际会返回但
  // 桌面 surface 一直直接 fall through 到下面"暂无可播放内容"——前端 contracts
  // 里 FeedMediaType 包含 image 且 isPostMediaPlayable 对非视频/音频统一放行，
  // 移动端 MobileChannelMediaSurface 已经按 image 渲成多图 pictorial 占位。
  // 桌面 surface 至少把 cover/首图 当成静态背景显示出来，别让作者发了图集 / 仅
  // 文字的视频号直接黑屏。
  const imageAssets = (post.media ?? []).filter(
    (asset): asset is Extract<typeof asset, { kind: "image" }> =>
      asset.kind === "image",
  );
  // 走查 2026-05-18 R5（本轮）：跟 R2 的 audio/video gate 同坑——原 `??` 让
  // 空字符串 `""` 穿过 fallback。post.coverUrl 偶发是 `""`（minimax 封面拉
  // 失败时后端落空 url、character_override fallback 路径未填、cleanupBroken
  // ChannelPosts 还没扫到），fallbackImage 落 `""` → ChannelFallbackImage 渲
  // <img src=""> → Chrome/Firefox 视为 broken-image 但又不触发 onError（空
  // src 不发请求），用户看到原生 broken-image 占位永远不会被 setFailed(true)
  // 切到友好兜底文案，体感「这个帖子坏了」+ 透着沉浸式深背景里隐约可见。
  // 改用 `||` 让空字符串走下一个 fallback。同理下面 mediaUrl fallback。
  const fallbackImage =
    post.coverUrl || imageAssets[0]?.url || post.mediaUrl || null;
  if (fallbackImage) {
    return (
      <ChannelFallbackImage
        src={fallbackImage}
        alt={post.title ?? post.authorName}
        isActive={isActive}
      />
    );
  }

  // 走查 R1（本轮）：和 mobile MobileChannelMediaSurface 同款修法——
  // 纯 mediaType='text' 帖（无 coverUrl / mediaUrl / image media）历来直接
  // fall through 到下方"暂无可播放内容"黑屏，用户在桌面工作区主区看到自己写
  // 的文字帖完全空白，体感「内容丢了」。把 title + text 渲到暗色卡上至少把
  // 文字显示出来；正文走 stripToolCallSyntax 过 AI 思考残留。
  const textContent = stripToolCallSyntax(post.text ?? "");
  if (post.title?.trim() || textContent.trim()) {
    return (
      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-gradient-to-b from-[#1f2533] to-[#0a0c10] px-10">
        <div className="max-w-[28rem] text-center text-white">
          {post.title?.trim() ? (
            <div className="text-[24px] font-semibold leading-[1.6]">
              {post.title}
            </div>
          ) : null}
          {textContent.trim() && textContent !== post.title ? (
            <div className="mt-3 text-[15px] leading-[1.7] text-white/82 line-clamp-[10]">
              {textContent}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center text-center">
      <div className="px-6">
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

// 走查 2026-05-18 R1：audio 帖背景封面（opacity-30 blur 的氛围层）—— 单张
// 失败不该用 Music2 替换（卡内层已经有 AudioCard 显示 cover），失败就直接隐
// 掉让渐变背景兜底。active 卡 eager、其余 lazy 避免 20 张并发拉公网封面。
function BackgroundCoverImage({
  src,
  alt,
  isActive,
}: {
  src: string;
  alt: string;
  isActive: boolean;
}) {
  const [failed, setFailed] = useState(false);
  // 走查 2026-05-18 新会话 R3：用户停在同一条 audio slide 不动时，若 home
  // refetch 拉回了新的 coverUrl（minimax 资源轮换 / 后端 cleanupBrokenChannel
  // Posts 修复了原本 404 的那张），src prop 切到新 URL —— 但 BackgroundCoverImage
  // 是同一个 React 实例（key 在外层 ChannelFeedSlide 上按 post.id），useState
  // 的 failed 在旧 src 失败时设过 true，新 src 进来仍按 failed=true 直接 return
  // null，用户永远看不到新封面。同步加 useEffect 在 src 变化时清 failed，给
  // 新 URL 一次尝试机会。
  useEffect(() => {
    setFailed(false);
  }, [src]);
  if (failed) return null;
  return (
    <img
      src={src}
      alt={alt}
      loading={isActive ? "eager" : "lazy"}
      decoding="async"
      onError={() => setFailed(true)}
      className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-30 blur-[1px]"
    />
  );
}

// 走查 2026-05-17 新会话 R4：ChannelMediaSurface 的图集 / 文字帖兜底 cover——
// 原直接挂 <img src=...>，没 onError 兜底 + 没 lazy 标签。
//  - 失败时浏览器原生 broken-image 占位盖在沉浸式播放区，体感「卡片坏了」
//  - 非 active 卡也 eager 拉图，10+ 张图集 slide 一起 load 浪费首屏带宽
// 加 onError 切到渐变兜底（和 mobile ChannelAudioPictorial 同款），lazy
// 仅在 active 时 eager。
function ChannelFallbackImage({
  src,
  alt,
  isActive,
}: {
  src: string;
  alt: string;
  isActive: boolean;
}) {
  const t = useRuntimeTranslator();
  const [failed, setFailed] = useState(false);
  // 走查 2026-05-18 新会话 R3：跟 BackgroundCoverImage 同款 — src prop 换
  // 新 URL 时清 failed，给新 URL 一次尝试。否则 home refetch 拉回新 coverUrl
  // 用户在原 slide 看到的永远是「封面暂时无法显示」占位。
  useEffect(() => {
    setFailed(false);
  }, [src]);
  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-gradient-to-b from-[#1f2533] to-[#0a0c10]">
      {failed ? (
        // 走查 2026-05-18 R1（本轮）：ChannelFallbackImage 用于 mediaType
        // 'image' / 'text' 帖的兜底封面（参 ChannelMediaSurface L948-955）——
        // 原图标用 Music2 是错的，这两类帖都不是音乐；用户图集 / 文字帖封面
        // 404 时却看到一个音乐符号 + "封面暂时无法显示"，体感「这帖是音乐还
        // 是图片到底」。换成更贴语义的 ImageOff。
        <div className="flex flex-col items-center gap-2 text-white/70">
          <ImageOff size={48} className="text-white/40" />
          <div className="text-[12px]">{t(msg`封面暂时无法显示`)}</div>
        </div>
      ) : (
        <img
          src={resolveAppMediaUrl(src)}
          alt={alt}
          loading={isActive ? "eager" : "lazy"}
          decoding="async"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </div>
  );
}

function ChannelVideoPlayer({
  url,
  posterUrl,
  isActive,
  unmuted,
  onToggleUnmuted,
}: {
  url: string;
  posterUrl?: string;
  isActive: boolean;
  unmuted: boolean;
  onToggleUnmuted: () => void;
}) {
  const t = useRuntimeTranslator();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // React 的 muted prop 是异步设到 DOM 上的，浏览器评估 autoplay 时可能还没 muted →
  // autoplay 被策略拦截。用 callback ref 在 React 把 element 挂到 DOM 之前就把
  // muted 同步到 IDL 属性上。参考 facebook/react#10389。
  //
  // 走查 2026-05-18 新会话 R1：必须 useCallback 包稳定身份——否则每次父
  // re-render（IntersectionObserver 切 selectedPostId / like / favorite /
  // comment / forwardNotice 出现 / 用户切 section 等等）这个 callback ref
  // 都换 identity，React 按 callback-ref 协议先 detach(null) 再 attach(node)，
  // 内部 `node.muted = true` 就把视频强行打回静音。下面的 unmuted-effect 依
  // 赖 [unmuted, isActive]，这两个没变就不会重跑，结果用户解锁后第一次父级
  // re-render 就把声音吃掉，再点静音按钮 toggle unmuted 也救不回（unmuted 仍
  // true，effect 不 fire）。stable identity 让 React 不再 detach/attach，
  // 只在真正 mount / key 切换（url 变）/ unmount 时跑一次。
  const setVideoNode = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    if (node) {
      // 初始挂载阶段强制 muted=true 以确保 autoplay 不被策略拦；下面的 effect 会在
      // 用户已 unmute 的情况下再切回 unmuted。
      node.muted = true;
      node.defaultMuted = true;
    }
  }, []);

  // 走查 2026-05-17 新会话 R1：跟移动端 ChannelVideoSurface 同坑——解锁后 play()
  // 失败一律 muted-retry 会把 video.muted 卡死，而 unmuted state 仍 true 不会触发
  // 下面的 unmuted-effect 重置 muted，结果用户看到画面渲好却永远没声音、点了静音
  // 按钮也救不回。用 ref 缓存最新 unmuted，仅在没解锁过时才走 muted 兜底。
  const unmutedRef = useRef(unmuted);
  unmutedRef.current = unmuted;

  // 进入视口的 slide 自动播放，离开的暂停。
  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (isActive && url) {
      const playResult = video.play();
      if (playResult && typeof playResult.catch === "function") {
        playResult.catch(() => {
          if (!unmutedRef.current) {
            video.muted = true;
            video.play().catch(() => undefined);
          }
        });
      }
    } else {
      video.pause();
      video.currentTime = 0;
      // 走查 2026-05-17 新会话 R1：同移动端 ChannelVideoSurface R1——pause 不释
      // 放浏览器已下载的 video buffer。video 单条 ~1-2MB，10+ 张 slide 全曾激活
      // 一遍累计能挂十几 MB 在 channels 页直到用户离开。load() 强制重置 media
      // element 释放缓冲；无 src 时只触发 emptied 事件、不发请求，安全。
      video.load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, url]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    video.muted = !unmuted;
    if (unmuted && isActive) {
      const playResult = video.play();
      if (playResult && typeof playResult.catch === "function") {
        playResult.catch(() => {
          // 取消静音后若浏览器仍阻断，回退到静音继续播放。
          video.muted = true;
        });
      }
    }
  }, [unmuted, isActive]);

  // 走查 2026-05-17 新会话 R1：跟移动端 ChannelVideoSurface R3 / ChannelAudio
  // Pictorial R3 同款——组件 unmount 时主动 pause。React 把 <video> 从 DOM 摘掉
  // 后 Chromium / Firefox 不会自动 pause，音轨会一直 loop 到刷新整页。用户在
  // active 卡上点「减少推荐」/ 切到别的 section 导致 slide 整张 unmount 时尤其
  // 明显——画面没了但声音还在。cleanup 时现读 videoRef.current（React unmount
  // 顺序：先跑 effect cleanup 再 unmount 子树，此时 ref 仍指向最新元素）。
  useEffect(() => {
    return () => {
      videoRef.current?.pause();
    };
  }, []);

  // 走查 2026-05-17 新会话 R1：tab 切到后台时主动 pause，回前台按切走前状态恢
  // 复——desktop Chrome 默认背景标签里 HTML5 video 不会自动暂停，视频号 BGM
  // 会一直跟着用户去别的标签里响。和移动端 R 同款。
  useEffect(() => {
    if (!isActive || !url) return;
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
  }, [isActive, url]);

  // 走查 2026-05-17 新会话 R1：原 src/preload 一律挂在每张 slide 上——10 张视
  // 频 slide 一起 preload="auto"，公网隧道下首屏并发 10+ 个 ~MB 级 minimax 视
  // 频拉取，离开 channels 页时全 ERR_ABORTED 纯浪费带宽。和移动端 ChannelVideo
  // Surface 同款：仅 active 卡挂 src + preload="auto"，其它卡 src 留空 / preload
  // ="none"，由 isActive 翻转 + 上面 effect 的 .play() 触发。poster 始终可见
  // 保持视觉。
  return (
    <>
      <video
        ref={setVideoNode}
        // key 让 src 变化时强制重建 video element，避免上一个视频的 buffered range 干扰
        key={`video:${url}`}
        src={isActive && url ? url : undefined}
        poster={posterUrl}
        autoPlay
        muted
        loop
        playsInline
        preload={isActive ? "auto" : "none"}
        onClick={onToggleUnmuted}
        className="absolute inset-0 h-full w-full cursor-pointer bg-black object-contain"
      />
      <button
        type="button"
        aria-label={unmuted ? t(msg`静音`) : t(msg`取消静音`)}
        aria-pressed={unmuted}
        onClick={(event) => {
          event.stopPropagation();
          onToggleUnmuted();
        }}
        className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/22 bg-black/45 text-white backdrop-blur-sm transition hover:bg-black/65"
      >
        {unmuted ? <Volume2 size={16} /> : <VolumeX size={16} />}
      </button>
    </>
  );
}

// 走查 2026-05-18 新会话 R1：memo + post-aware callbacks，让稳定 props 的
// slide 在父 re-render 时直接跳过 reconciliation。回调签名改成接 post / postId
// / authorId，使外层只暴露 latest-ref 包过的稳定 handler；slide 内的 onClick
// 内联箭头每次重渲都会换 identity，但 slide 本身被 memo 挡住后根本不重渲。
const ChannelFeedSlide = memo(function ChannelFeedSlide({
  post,
  isActive,
  sectionBadge,
  registerSlide,
  isFavorite,
  likePending,
  favoritePending,
  followPending,
  unmuted,
  onLike,
  onOpenAuthor,
  onShare,
  onToggleAuthorFollow,
  onToggleCommentDrawer,
  onToggleFavorite,
  onToggleUnmuted,
}: {
  post: FeedPostListItem;
  isActive: boolean;
  sectionBadge: string;
  registerSlide: (postId: string, node: HTMLDivElement | null) => void;
  isFavorite: boolean;
  likePending: boolean;
  favoritePending: boolean;
  followPending: boolean;
  unmuted: boolean;
  onLike: (postId: string) => void;
  onOpenAuthor: (authorId: string) => void;
  onShare: (post: FeedPostListItem) => void;
  onToggleAuthorFollow: (post: FeedPostListItem) => void;
  onToggleCommentDrawer: (postId: string) => void;
  onToggleFavorite: (post: FeedPostListItem) => void;
  onToggleUnmuted: () => void;
}) {
  const t = useRuntimeTranslator();
  return (
    <div
      ref={(node) => registerSlide(post.id, node)}
      data-post-id={post.id}
      className="flex h-full min-h-[640px] snap-start snap-always items-center justify-center px-6 py-6"
    >
      <div className="flex max-h-full items-end gap-4">
        <article className="relative flex aspect-[9/16] h-[min(82vh,800px)] flex-shrink-0 overflow-hidden rounded-[20px] bg-[#0d0e12] shadow-[0_24px_60px_rgba(0,0,0,0.55)]">
          <ChannelMediaSurface
            post={post}
            isActive={isActive}
            unmuted={unmuted}
            onToggleUnmuted={onToggleUnmuted}
          />
          <div className="pointer-events-none absolute left-4 top-4 rounded-md bg-[rgba(15,23,42,0.68)] px-2.5 py-1 text-[11px] font-medium text-white">
            {sectionBadge}
          </div>

          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[rgba(0,0,0,0.82)] via-[rgba(0,0,0,0.36)] to-transparent px-5 pb-5 pt-14">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => onOpenAuthor(post.authorId)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <AvatarChip
                  name={post.authorName}
                  src={post.authorAvatar}
                  size="wechat"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold text-white">
                    {post.authorName}
                  </div>
                  <div className="mt-0.5 text-[11px] text-white/72">
                    {formatTimestamp(post.createdAt)} ·{" "}
                    {formatChannelMeta(post)}
                  </div>
                </div>
              </button>
              {post.authorId !== SELF_CHARACTER_ID &&
              post.authorType !== "user" ? (
                // 「我自己」是用户自己的代理角色，不让用户关注 / 取消关注自己——
                // 后端 followChannelAuthor 也对 owner.id===authorId 做了 no-op，
                // 但 char-default-self 是角色而非 owner，会真插一行 follow 记录，
                // 视觉上落到 "已关注" / 点了又能 "+ 关注"，徒增困惑。
                //
                // 走查 R2（本轮）：authorType==='user' 是 owner 自己发的视频号 post
                // （自己也可发 surface='channels'）。这条 follow 按钮真点了 server
                // 端 owner.id 分支 no-op，按钮永远停在 "+ 关注"，看着像点不动。
                <button
                  type="button"
                  // 走查 2026-05-18 新会话 R4：原 button 没挂 aria-pressed —— 这
                  // 是 toggle（关注 ↔ 已关注），SR 用户听到的只是按钮文字「已关
                  // 注」/「+ 关注」，没办法判断"是当前状态还是要触发的目标动作"。
                  // 同款侧栏 ChannelActionButton（赞/收藏）早就有 aria-pressed
                  // ={active}，slide 头部的作者关注按钮一直漏。补 aria-pressed
                  // = isFollowingAuthor，让 SR 听见"按下，已关注"/"未按下，关注"
                  // 的状态信号；同时给 aria-label 加上明确"关注 {作者}/取消关注
                  // {作者}"避免单看一个数字按钮听不出对谁操作。
                  aria-pressed={Boolean(post.ownerState?.isFollowingAuthor)}
                  aria-label={
                    post.ownerState?.isFollowingAuthor
                      ? t(msg`取消关注 ${post.authorName}`)
                      : t(msg`关注 ${post.authorName}`)
                  }
                  onClick={() => onToggleAuthorFollow(post)}
                  disabled={followPending}
                  className={cn(
                    "rounded-full px-3 py-1 text-[12px] transition disabled:cursor-not-allowed disabled:opacity-70",
                    post.ownerState?.isFollowingAuthor
                      ? "border border-white/28 bg-transparent text-white/85 hover:bg-white/10"
                      : "bg-[color:var(--brand-primary)] text-white hover:opacity-95",
                  )}
                >
                  {followPending
                    ? t(msg`处理中...`)
                    : post.ownerState?.isFollowingAuthor
                      ? t(msg`已关注`)
                      : t(msg`+ 关注`)}
                </button>
              ) : null}
            </div>
            {post.title ? (
              <div className="mt-3 line-clamp-2 text-[15px] font-semibold text-white">
                {post.title}
              </div>
            ) : null}
            {(() => {
              // 视频号 audio post 后端常把 title 和 text 都填成 "X·音乐"，
              // 标题和正文重复出现没意义；只在两者不一致时才渲染正文。和移动端
              // MobileChannelsCard 里的处理保持一致。
              const cleanText = stripToolCallSyntax(post.text ?? "");
              if (!cleanText || cleanText === post.title) {
                return null;
              }
              return (
                <div className="mt-2 line-clamp-3 text-[13px] leading-6 text-white/82">
                  {cleanText}
                </div>
              );
            })()}
            {post.topicTags?.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {post.topicTags.slice(0, 4).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-white/14 px-2 py-0.5 text-[10px] text-white"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </article>

        <div className="flex w-12 flex-shrink-0 flex-col items-center gap-3 pb-12">
          <ChannelActionButton
            surface="dark"
            icon={<ThumbsUp size={18} />}
            label={`${post.likeCount}`}
            ariaLabel={
              post.ownerState?.hasLiked
                ? t(msg`已点赞，当前 ${post.likeCount} 赞`)
                : t(msg`点赞，当前 ${post.likeCount} 赞`)
            }
            active={Boolean(post.ownerState?.hasLiked)}
            pending={likePending}
            onClick={() => onLike(post.id)}
          />
          <ChannelActionButton
            surface="dark"
            icon={<MessageCircleMore size={18} />}
            label={`${post.commentCount}`}
            ariaLabel={t(msg`打开评论，当前 ${post.commentCount} 条`)}
            onClick={() => onToggleCommentDrawer(post.id)}
          />
          <ChannelActionButton
            surface="dark"
            icon={<Share2 size={18} />}
            label={t(msg`转发`)}
            // 走查 2026-05-18 新会话 R1：原 ariaLabel 缺席，按钮 visible label
            // 只是「转发」，但旁边的点赞 / 评论按钮 ariaLabel 都带「当前 N 条」
            // 给屏读上下文。这条对齐：点击会触发转发面板，告知"对哪条 post"
            // 转发也无意义（picker 自己会显示标题）；这里强调它是会打开面板
            // 的入口，避免屏读用户当成 toggle 误按。
            ariaLabel={t(msg`转发到聊天`)}
            onClick={() => onShare(post)}
          />
          <ChannelActionButton
            surface="dark"
            icon={
              // 走查 2026-05-17 R1：原图标无论 active 与否都是空心 Bookmark，
              // 仅外圈边框换色——夜色背景下绿色 border 跟未收藏态白边几乎区分不
              // 出来。配合 hasLiked 用 fill-current 加强已激活语义。
              <Bookmark
                size={18}
                className={isFavorite ? "fill-current" : undefined}
              />
            }
            label={
              favoritePending
                ? t(msg`处理中`)
                : isFavorite
                  ? t(msg`已收藏`)
                  : t(msg`收藏`)
            }
            // 走查 2026-05-18 新会话 R1：原 ariaLabel 缺席。aria-pressed 已经
            // 告知 toggle 状态，但屏读用户没办法知道当前 toggle 的语义对象是
            // 「这条视频号」。点赞按钮里给了 ariaLabel="点赞，当前 N 赞"，收藏
            // 按钮按同款思路补「已收藏 / 收藏这条视频号」。
            ariaLabel={
              isFavorite
                ? t(msg`已收藏这条视频号`)
                : t(msg`收藏这条视频号`)
            }
            active={isFavorite}
            pending={favoritePending}
            onClick={() => onToggleFavorite(post)}
          />
        </div>
      </div>
    </div>
  );
});

function ChannelCommentsDrawer({
  comments,
  commentsErrorMessage,
  commentsLoading,
  draft,
  likePendingCommentId,
  replyTarget,
  selectedPost,
  submitPending,
  onCancelReply,
  onClose,
  onDraftChange,
  onLikeComment,
  onReplyToComment,
  onSubmit,
}: {
  comments: FeedComment[];
  commentsErrorMessage?: string | null;
  commentsLoading: boolean;
  draft: string;
  likePendingCommentId: string | null;
  replyTarget: {
    authorId: string;
    authorName: string;
    commentId: string;
    postId: string;
  } | null;
  selectedPost: FeedPostListItem;
  submitPending: boolean;
  onCancelReply: () => void;
  onClose: () => void;
  onDraftChange: (value: string) => void;
  onLikeComment: (comment: FeedComment) => void;
  onReplyToComment: (comment: FeedComment) => void;
  onSubmit: () => void;
}) {
  const t = useRuntimeTranslator();
  // 走查 2026-05-18 新会话 R7（本轮）：drawer 视觉上是 modal 浮层（pointer-
  // events-auto 卡 + Esc 关），但裸 <div> 没有 dialog 语义 → VoiceOver / TalkBack
  // 焦点 / 阅读顺序仍把它当成普通内容的一部分，跟同套 ChannelsForwardPicker
  // R1（已修，在该组件 line 112）犯的同款问题。SR 用户进 drawer 后看不出"现
  // 在在评论面板里"，关闭按钮也只是普通 button。补 role="dialog" + aria-
  // modal="true" + aria-labelledby 指向顶部「评论 N」标题，让 SR 进 drawer 时
  // 立刻播报"评论 N 对话框"，跟移动端 sheet / forward picker 体验对齐。
  // 注：完整的 focus trap + 离场归还焦点跟 ChannelsForwardPicker 走的是同套
  // requestAnimationFrame + ref 协议，本轮先把语义补全，trap 留给后续 round
  // 处理（drawer 内只有 textarea / 1 个发送 / 1 个关闭 / 评论列表里的赞和回
  // 复按钮，已经远好于 picker；用户实际 Tab 漏出的概率比 picker 低，但仍存在）。
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center px-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="channels-comments-drawer-title"
        className="pointer-events-auto flex max-h-[85vh] w-[380px] flex-col overflow-hidden rounded-[20px] border border-[color:var(--border-faint)] bg-white shadow-[0_24px_60px_rgba(0,0,0,0.32)] sm:translate-x-[260px]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-[color:var(--border-faint)] px-4 py-3">
          <div>
            <div
              id="channels-comments-drawer-title"
              className="text-[14px] font-medium text-[color:var(--text-primary)]"
            >
              {t(msg`评论 ${selectedPost.commentCount}`)}
            </div>
            <div className="mt-0.5 truncate text-[11px] text-[color:var(--text-muted)]">
              {selectedPost.authorName}
            </div>
          </div>
          <button
            type="button"
            aria-label={t(msg`关闭评论`)}
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-[color:var(--text-muted)] transition hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-4 pb-4 pt-2">
          {commentsErrorMessage ? (
            <div className="mt-3">
              <ErrorBlock message={commentsErrorMessage} />
            </div>
          ) : null}
          <DesktopChannelCommentsPanel
            comments={comments}
            commentsHasError={Boolean(commentsErrorMessage)}
            commentsLoading={commentsLoading}
            draft={draft}
            likePendingCommentId={likePendingCommentId}
            replyTarget={replyTarget}
            selectedPost={selectedPost}
            submitPending={submitPending}
            onCancelReply={onCancelReply}
            onDraftChange={onDraftChange}
            onLikeComment={onLikeComment}
            onReplyToComment={onReplyToComment}
            onSubmit={onSubmit}
          />
        </div>
      </div>
    </div>
  );
}

function ChannelAuthorOverlay({
  authorId,
  errorMessage,
  followPending,
  isLoading,
  profile,
  selectedPostId,
  onClose,
  onOpenPost,
  onToggleFollow,
}: {
  authorId: string | null;
  errorMessage?: string | null;
  followPending: boolean;
  isLoading: boolean;
  profile: FeedChannelAuthorProfile | null;
  selectedPostId: string | null;
  onClose: () => void;
  onOpenPost: (postId: string, authorId: string) => void;
  onToggleFollow: (authorId: string, following: boolean) => void;
}) {
  const t = useRuntimeTranslator();
  // R7（同 ChannelCommentsDrawer 同款修法）：author overlay 视觉上是 modal
  // （半透明 backdrop + Esc 关 + 居中 card），但裸 <div> 没有 dialog 语义。
  // 同时 backdrop button 上有 aria-label="关闭作者主页"，但 SR 进 overlay 时
  // 没有任何方式知道"现在在作者主页面板里"。补 role/aria-modal/aria-
  // labelledby 指向 DesktopChannelAuthorPanel 顶部的"作者主页"标题。
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[rgba(0,0,0,0.55)] p-8 backdrop-blur-sm">
      <button
        type="button"
        aria-label={t(msg`关闭作者主页`)}
        onClick={onClose}
        className="absolute inset-0"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="channels-author-overlay-title"
        className="relative flex max-h-[90vh] w-full max-w-[720px] flex-col overflow-auto rounded-[24px] bg-white shadow-[var(--shadow-overlay)]"
      >
        <DesktopChannelAuthorPanel
          authorId={authorId}
          errorMessage={errorMessage}
          followPending={followPending}
          isLoading={isLoading}
          profile={profile}
          selectedPostId={selectedPostId}
          onClose={onClose}
          onOpenPost={onOpenPost}
          onToggleFollow={onToggleFollow}
        />
      </div>
    </div>
  );
}

function FeedNavArrows({
  canPrev,
  canNext,
  onPrev,
  onNext,
}: {
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  const t = useRuntimeTranslator();
  return (
    <div className="pointer-events-none absolute bottom-6 right-6 z-20 flex flex-col gap-3">
      <button
        type="button"
        aria-label={t(msg`上一条`)}
        disabled={!canPrev}
        onClick={onPrev}
        className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full border border-white/22 bg-white/14 text-white transition hover:bg-white/24 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-white/14"
      >
        <ChevronUp size={20} />
      </button>
      <button
        type="button"
        aria-label={t(msg`下一条`)}
        disabled={!canNext}
        onClick={onNext}
        className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full border border-white/22 bg-white/14 text-white transition hover:bg-white/24 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-white/14"
      >
        <ChevronDown size={20} />
      </button>
    </div>
  );
}

function DesktopChannelAuthorPanel({
  authorId,
  errorMessage,
  followPending,
  isLoading,
  profile,
  selectedPostId,
  onClose,
  onOpenPost,
  onToggleFollow,
}: {
  authorId: string | null;
  errorMessage?: string | null;
  followPending: boolean;
  isLoading: boolean;
  profile: FeedChannelAuthorProfile | null;
  selectedPostId: string | null;
  onClose: () => void;
  onOpenPost: (postId: string, authorId: string) => void;
  onToggleFollow: (authorId: string, following: boolean) => void;
}) {
  const t = useRuntimeTranslator();
  const fallbackBio =
    profile?.authorType === "character"
      ? t(msg`这位居民暂时还没有填写视频号简介。`)
      : t(msg`这个视频号作者暂时还没有填写简介。`);
  const recentPosts = profile?.recentPosts.slice(0, 5) ?? [];
  // 走查 2026-05-18 新会话 R8（本轮）：原 liveClipCount = (profile?.recentPosts ?? [])
  // .filter(p => p.sourceKind === "live_clip").length，但 server 把 recentPosts
  // 截到 12 条 → 高产作者直播回放计数永远 ≤12，与 home 卡上的全量统计对不上。
  // server 现在直接回 liveClipCount / postCount 两个全量数（feed.service.ts R8
  // 同款修法）；client 优先用 server 字段，旧 client 兼容 fallback 走 .length。
  const liveClipCount =
    profile?.liveClipCount ??
    (profile?.recentPosts ?? []).filter(
      (post) => post.sourceKind === "live_clip",
    ).length;
  const postCount = profile?.postCount ?? profile?.recentPosts.length ?? 0;

  return (
    <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-4 shadow-[var(--shadow-section)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div
            id="channels-author-overlay-title"
            className="text-sm font-medium text-[color:var(--text-primary)]"
          >
            {t(msg`作者主页`)}
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={onClose}>
          {t(msg`回到内容`)}
        </Button>
      </div>

      {isLoading ? (
        <div className="mt-4">
          <LoadingBlock label={t(msg`正在读取作者主页...`)} />
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mt-4">
          <ErrorBlock message={errorMessage} />
        </div>
      ) : null}

      {!isLoading && !errorMessage && !profile ? (
        <div className="mt-4">
          <EmptyState
            title={t(msg`作者主页暂时不可用`)}
            description={t(msg`这位作者的信息还没有准备好，稍后再试。`)}
          />
        </div>
      ) : null}

      {!isLoading && !errorMessage && profile ? (
        <>
          <div className="mt-4 flex items-start gap-3">
            <AvatarChip
              name={profile.authorName}
              src={profile.authorAvatar}
              size="wechat"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="truncate text-[16px] font-semibold text-[color:var(--text-primary)]">
                  {profile.authorName}
                </div>
                <span className="rounded-full bg-[rgba(15,23,42,0.06)] px-2 py-0.5 text-[10px] text-[color:var(--text-secondary)]">
                  {profile.authorType === "character"
                    ? t(msg`居民作者`)
                    : t(msg`世界主人`)}
                </span>
              </div>
              <div className="mt-2 text-[12px] leading-6 text-[color:var(--text-secondary)]">
                {profile.bio?.trim() || fallbackBio}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-2.5 py-1 text-[11px] text-[color:var(--text-secondary)]">
              {t(msg`${profile.followerCount} 关注者`)}
            </span>
            <span className="rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-2.5 py-1 text-[11px] text-[color:var(--text-secondary)]">
              {t(msg`${postCount} 条内容`)}
            </span>
            <span className="rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-2.5 py-1 text-[11px] text-[color:var(--text-secondary)]">
              {t(msg`${liveClipCount} 条直播回放`)}
            </span>
          </div>

          <div className="mt-4 flex gap-2">
            {/* 走查 R2（本轮）：authorType==='user' 时也是 owner 自己（server 端
                followChannelAuthor 对 owner.id no-op，按钮永远停在 +关注 不动）。
                跟移动端作者主页 + home 卡片 R2 改法对齐。 */}
            {profile.authorId !== SELF_CHARACTER_ID &&
            profile.authorType !== "user" ? (
              <Button
                variant={profile.isFollowing ? "secondary" : "primary"}
                size="sm"
                // R4: 同 slide header 关注按钮同款 aria-pressed/aria-label，
                // 让 SR 用户能听出"按下/未按下"的 toggle 状态 + 操作对象（作者名）。
                aria-pressed={profile.isFollowing}
                aria-label={
                  profile.isFollowing
                    ? t(msg`取消关注 ${profile.authorName}`)
                    : t(msg`关注 ${profile.authorName}`)
                }
                disabled={followPending}
                onClick={() =>
                  onToggleFollow(profile.authorId, profile.isFollowing)
                }
                className={
                  profile.isFollowing
                    ? "border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)] shadow-none hover:bg-[color:var(--surface-console)]"
                    : "bg-[color:var(--brand-primary)] text-white shadow-none hover:opacity-95"
                }
              >
                {followPending
                  ? t(msg`处理中...`)
                  : profile.isFollowing
                    ? t(msg`已关注`)
                    : t(msg`+关注`)}
              </Button>
            ) : null}
            {/* 原来这里还有一个 "当前内容" 按钮 onClick={onClose}，跟头部的
                "回到内容" 完全是同一件事——只是 disabled 多挡了 selectedPostId
                null 这条边界。两个按钮跳同一个 close 操作没意义，删一个。 */}
          </div>

          <div className="mt-5">
            <div className="text-sm font-medium text-[color:var(--text-primary)]">
              {t(msg`最近内容`)}
            </div>
            <div className="mt-3 space-y-2">
              {recentPosts.length ? (
                recentPosts.map((post) => (
                  <button
                    key={post.id}
                    type="button"
                    onClick={() => onOpenPost(post.id, profile.authorId)}
                    className={cn(
                      "w-full rounded-[16px] border px-3 py-3 text-left transition",
                      selectedPostId === post.id
                        ? "border-[rgba(7,193,96,0.14)] bg-white shadow-[inset_3px_0_0_0_var(--brand-primary),0_8px_18px_rgba(15,23,42,0.04)]"
                        : "border-[color:var(--border-faint)] bg-[color:var(--surface-console)] hover:bg-white hover:shadow-[0_8px_18px_rgba(15,23,42,0.04)]",
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-[color:var(--text-primary)]">
                        {post.title?.trim() || t(msg`查看这条内容`)}
                      </div>
                      <span className="rounded-full border border-[color:var(--border-faint)] bg-white px-2 py-0.5 text-[10px] text-[color:var(--text-secondary)]">
                        {post.sourceKind === "live_clip"
                          ? t(msg`直播回放`)
                          : post.mediaType === "video"
                            ? t(msg`视频`)
                            : t(msg`动态`)}
                      </span>
                    </div>
                    {(() => {
                      // audio post 后端常把 title 和 text 都填成 "X·音乐"，
                      // recent posts list 里 title 已经在上面渲染了一遍，再渲染
                      // 一遍 text 就是重复——和 slide overlay / mobile card 那两处
                      // 一样处理。
                      const cleanText = stripToolCallSyntax(post.text ?? "");
                      if (!cleanText || cleanText === post.title) {
                        return null;
                      }
                      return (
                        <div className="mt-2 line-clamp-2 text-xs leading-6 text-[color:var(--text-secondary)]">
                          {cleanText}
                        </div>
                      );
                    })()}
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[color:var(--text-muted)]">
                      <span>{formatTimestamp(post.createdAt)}</span>
                      <span>·</span>
                      <span>{formatChannelMeta(post, { includeTopicTag: true })}</span>
                      {selectedPostId === post.id ? (
                        <>
                          <span>·</span>
                          <span className="font-medium text-[color:var(--brand-primary)]">
                            {t(msg`当前内容`)}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </button>
                ))
              ) : (
                <div className="rounded-[16px] border border-dashed border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 py-4 text-xs leading-6 text-[color:var(--text-muted)]">
                  {t(msg`这位作者暂时还没有可以展示的内容。`)}
                </div>
              )}
            </div>
          </div>

          {authorId && profile.authorId !== authorId ? (
            <div className="mt-4 rounded-[14px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 py-3 text-xs leading-6 text-[color:var(--text-muted)]">
              {t(msg`当前路由和作者数据还在同步，稍后会自动收敛到最新作者资料。`)}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

// 走查 R1（本轮）：原一律 `pieces.push(\`#${topicTags[0]}\`)` 在 slide overlay
// （ChannelFeedSlide L1054）和 author overlay 的 recent posts 列表（L1527）都生效。
// slide overlay 紧跟着就把 topicTags 渲成一排彩色 pill chip（L1107-1118），meta
// 行已经写了 "... · #音乐" 又重复出现一次 "#音乐" pill，体感像「同一个 tag 出现
// 两次」；author overlay 的 recent posts 列表没渲 pill，meta 行带 #tag 是必要的。
// 移动端 formatChannelMeta 早就只在没 pill 的位置加 tag（mobile channels-page.tsx
// L4002 注释明确说"不要拼 topicTags，上面已经渲成 chip 了"）。给一个 includeTag
// 开关让两个 call site 各按需要决定。
function formatChannelMeta(
  post: FeedPostListItem,
  options?: { includeTopicTag?: boolean },
) {
  const viewCount = post.viewCount ?? 0;
  const pieces = [translateRuntimeMessage(msg`${viewCount} 播放`)];

  if (typeof post.durationMs === "number" && post.durationMs > 0) {
    const seconds = Math.max(1, Math.round(post.durationMs / 1000));
    pieces.push(translateRuntimeMessage(msg`${seconds} 秒`));
  }

  if (options?.includeTopicTag && post.topicTags?.length) {
    pieces.push(`#${post.topicTags[0]}`);
  }

  return pieces.join(" · ");
}

function DesktopChannelCommentsPanel({
  comments,
  commentsHasError,
  commentsLoading,
  draft,
  likePendingCommentId,
  replyTarget,
  selectedPost,
  submitPending,
  onCancelReply,
  onDraftChange,
  onLikeComment,
  onReplyToComment,
  onSubmit,
}: {
  comments: FeedComment[];
  commentsHasError: boolean;
  commentsLoading: boolean;
  draft: string;
  likePendingCommentId: string | null;
  replyTarget: {
    authorId: string;
    authorName: string;
    commentId: string;
    postId: string;
  } | null;
  selectedPost: FeedPostListItem | null;
  submitPending: boolean;
  onCancelReply: () => void;
  onDraftChange: (value: string) => void;
  onLikeComment: (comment: FeedComment) => void;
  onReplyToComment: (comment: FeedComment) => void;
  onSubmit: () => void;
}) {
  const t = useRuntimeTranslator();
  const selectedPostId = selectedPost?.id ?? null;
  // 走查 2026-05-17 R3：移动端 R5 早就按 canInteract 把非好友帖的「回复 / 赞 /
  // textarea / 发送」按钮全部 disable，桌面侧一直没接——用户读完评论按"发送"
  // → ChannelsPage.submitComment 走 ensureCommentPostCanInteract → setNotice
  // 提示「需先加为好友才能互动」。这条 notice 走 successNotice prop 渲在 workspace
  // 顶端，被 z-30 抽屉部分遮住后用户多半看不到，体感「按了发送什么都没发生」。
  // 在评论 panel 内部也按 canInteract 把所有 mutation 入口锁死，并贴一行黄色
  // 提示告知用户为什么不能动。
  const cannotInteract = selectedPost?.canInteract === false;
  const inputRef = useRef<HTMLInputElement | null>(null);
  // 走查 2026-05-18 R2（本轮）：评论 input 同步双击锁。原 send 路径只 guard
  // `submitPending` （即 react-query commentMutation.isPending），但 isPending
  // 是 mutation 启动后下一次 render 才回 true 的异步 state。用户在 keyboard
  // 上连按两次 Enter (典型间隔 <16ms) 或鼠标快速双击「发送」时，两次
  // onSubmit() 同步进入 → submitComment() 同步进入 → commentMutation.mutate()
  // 同步入栈两次 → onMutate 顺序 fire 两次（cache 乐观 +2）→ 两个 POST 落地
  // 同一段文本插两条一模一样的评论。
  // 同移动端 wechat-comment-bar / mobile-feed-publish-page 的 submittingRef
  // 思路：ref 同步赋值，第一次 Enter 翻 true 后同帧内的 click/Enter 全部早返；
  // submitPending 下沿（mutation settle）时释放，允许下条评论发送。
  // 切 post / 切 reply target 时也释放（用户从一条切到另一条理论上是新意图）。
  const submittingRef = useRef(false);
  useEffect(() => {
    if (!submitPending) {
      submittingRef.current = false;
    }
  }, [submitPending]);
  useEffect(() => {
    submittingRef.current = false;
  }, [selectedPostId, replyTarget?.commentId]);
  const handleSubmit = () => {
    if (submittingRef.current) return;
    if (
      !selectedPost ||
      cannotInteract ||
      !draft.trim() ||
      submitPending
    )
      return;
    submittingRef.current = true;
    onSubmit();
  };
  // 打开评论抽屉 / 点 "回复 X" 时，把焦点送到 input——和移动端 sheet 的处理
  // 一致（commit 2090+），用户开了抽屉就能直接敲字。
  //
  // 走查 2026-05-18 新会话 R4：mobile 那边 R1（channels-page L4087-4097）
  // 早就发现并修过：post.canInteract === false 时 input 是 disabled，对 dis
  // abled element 调 .focus() 是 no-op —— 但 sequential focus navigation 会
  // 把焦点甩到 drawer 内下一个可聚焦元素，也就是头部「关闭评论」那颗 X
  // button。用户想滚评论列表按 Space → 触发 X.click() → drawer 直接关掉。
  // 桌面 drawer 一直漏，cannotInteract 时跳过 focus 让用户主动点击的位置
  // 保留焦点。
  useEffect(() => {
    if (!selectedPostId) return;
    if (cannotInteract) return;
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, [cannotInteract, selectedPostId, replyTarget?.commentId]);
  const commentAuthorNameMap = useMemo(() => {
    const map = new Map<string, string>();
    comments.forEach((comment) => {
      map.set(comment.id, comment.authorName);
    });
    return map;
  }, [comments]);
  // 走查 2026-05-18 R3（本轮）：移动端 R5（channels-page L4287-4305）早就
  // 加了"空文本评论过滤"——feed_comments 库里偶尔混入纯 AI thinking-prose
  // 评论（实测 yuanzui0728 库 eb9c88ce 帖等就有 1019 字 CoT 漏出），
  // stripToolCallSyntax 把整段抠成空串，DesktopThreadCommentCard 内只在
  // body 区用 cleanText，外层 "作者名 + 时间戳 + 回复 X：" + 底部点赞/回复
  // 按钮全照常渲，结果用户看到一条「头有作者尾有按钮、中间空白」的鬼影
  // 卡，体感「这条评论坏了」+ 卡间距还把真实评论顶下去。
  // 桌面 drawer 一直漏，按 mobile 同款思路在 thread 构建前先 filter 掉空
  // cleanText 的评论；threading 自然 re-root 残留的 orphan reply（root 空
  // 被过滤掉时它的子回复变成自己的 root，replyToAuthorName 走后端 lookup
  // 还能显示「回复 X：」上下文）。
  const renderableComments = useMemo(
    () =>
      comments.filter((comment) => stripToolCallSyntax(comment.text).length > 0),
    [comments],
  );
  const commentThreads = useMemo(() => {
    const commentMap = new Map(
      renderableComments.map((comment) => [comment.id, comment]),
    );
    const rootComments = renderableComments.filter(
      (comment) =>
        !comment.parentCommentId ||
        !commentMap.has(comment.parentCommentId),
    );
    const repliesByRoot = new Map<string, FeedComment[]>();

    renderableComments.forEach((comment) => {
      if (!comment.parentCommentId || !commentMap.has(comment.parentCommentId)) {
        return;
      }

      const currentReplies = repliesByRoot.get(comment.parentCommentId) ?? [];
      currentReplies.push(comment);
      repliesByRoot.set(comment.parentCommentId, currentReplies);
    });

    return rootComments.map((rootComment) => ({
      rootComment,
      replies: repliesByRoot.get(rootComment.id) ?? [],
    }));
  }, [renderableComments]);
  const threadIdsWithReplies = useMemo(
    () =>
      commentThreads
        .filter(({ replies }) => replies.length > 0)
        .map(({ rootComment }) => rootComment.id),
    [commentThreads],
  );
  const [collapsedThreadsByPostId, setCollapsedThreadsByPostId] = useState<
    Record<string, string[]>
  >(() => readStoredCollapsedChannelCommentThreads());
  const collapsedThreadIds = useMemo(() => {
    if (!selectedPostId) {
      return [];
    }

    return normalizeCollapsedThreadIds(
      collapsedThreadsByPostId[selectedPostId] ?? [],
      threadIdsWithReplies,
    );
  }, [collapsedThreadsByPostId, selectedPostId, threadIdsWithReplies]);

  function updateCollapsedThreadIds(
    updater: string[] | ((current: string[]) => string[]),
  ) {
    if (!selectedPostId) {
      return;
    }

    setCollapsedThreadsByPostId((current) => {
      const currentIds = normalizeCollapsedThreadIds(
        current[selectedPostId] ?? [],
        threadIdsWithReplies,
      );
      const nextIdsRaw =
        typeof updater === "function" ? updater(currentIds) : updater;
      const nextIds = normalizeCollapsedThreadIds(
        nextIdsRaw,
        threadIdsWithReplies,
      );

      if (areThreadIdsEqual(currentIds, nextIds)) {
        return current;
      }

      return {
        ...current,
        [selectedPostId]: nextIds,
      };
    });
  }

  useEffect(() => {
    if (!selectedPostId) {
      return;
    }

    setCollapsedThreadsByPostId((current) => {
      const currentIds = current[selectedPostId] ?? [];
      const nextIds = normalizeCollapsedThreadIds(
        currentIds,
        threadIdsWithReplies,
      );
      if (areThreadIdsEqual(currentIds, nextIds)) {
        return current;
      }

      return {
        ...current,
        [selectedPostId]: nextIds,
      };
    });
  }, [selectedPostId, threadIdsWithReplies]);

  useEffect(() => {
    writeStoredCollapsedChannelCommentThreads(collapsedThreadsByPostId);
  }, [collapsedThreadsByPostId]);

  useEffect(() => {
    if (!replyTarget || !selectedPostId) {
      return;
    }

    const matchingThread = commentThreads.find(
      ({ replies, rootComment }) =>
        rootComment.id === replyTarget.commentId ||
        replies.some((comment) => comment.id === replyTarget.commentId),
    );
    if (!matchingThread?.replies.length) {
      return;
    }

    setCollapsedThreadsByPostId((current) => {
      const currentIds = normalizeCollapsedThreadIds(
        current[selectedPostId] ?? [],
        threadIdsWithReplies,
      );

      if (!currentIds.includes(matchingThread.rootComment.id)) {
        return current;
      }

      return {
        ...current,
        [selectedPostId]: currentIds.filter(
          (threadId) => threadId !== matchingThread.rootComment.id,
        ),
      };
    });
  }, [commentThreads, replyTarget, selectedPostId, threadIdsWithReplies]);

  // 走查 2026-05-18 新会话 R2：视频号评论 server 端按 createdAt ASC 返
  // （最老在最上），桌面 drawer panel max-h-[420px] overflow-auto 一直
  // 没自动滚 —— yuanzui0728 这条 post 已经积了 142 条评论：用户点 chat
  // 图标打开 drawer 第一眼看到的是 5 天前最早的根评论，要手动滚到底才看到
  // 最新对话；自己刚发的评论也是 append 到列表末尾，count +1 但视口里看
  // 不到，体感「按了发送，到底成没成？」。Mobile 那边早就（commentDr -
  // R1/R4）按 first-open + growth-if-near-bottom 兜了，desktop drawer 一直
  // 漏。补一份精简版：首次拿到 comments 落底，后续 growth 时若用户仍贴底
  // 才跟随；用户主动上滑读老评论时尊重位置（AI 1-5min 后自动回复落地
  // 不该把他甩到底）。
  const threadsScrollRef = useRef<HTMLDivElement | null>(null);
  const previousCommentCountRef = useRef(0);
  const hasAutoScrolledOnOpenRef = useRef(false);
  const userNearBottomRef = useRef(true);
  // post 切换（drawer 关再开 / 切换到另一条 post 的 drawer）时重置 first-
  // scroll 标志，让新 post 也享受落底默认。
  useEffect(() => {
    hasAutoScrolledOnOpenRef.current = false;
    previousCommentCountRef.current = 0;
    userNearBottomRef.current = true;
  }, [selectedPostId]);
  // 走查 2026-05-18 R1（本轮）：原 effect deps 只有 [selectedPostId]，但
  // 打开 drawer 的第一帧 commentsLoading=true / commentThreads.length=0，
  // 下方 `{commentThreads.length ? <div ref={threadsScrollRef}> ...}` 那个
  // 滚动容器根本没挂载，threadsScrollRef.current 是 null → effect early
  // return → 没装 scroll listener。后续 comments 到了 threads 容器 mount
  // 上，ref 才赋值，但 selectedPostId 没变 → effect 不会再跑 → listener 永
  // 远没装上 → userNearBottomRef 一直停在初始 true → 1-5 分钟后 AI 自动回
  // 复落地 growth 时 useEffect 判定 isNearBottom=true 把用户从他主动上滑
  // 读老评论的位置硬甩回最底。把 commentThreads.length 也加进 deps：threads
  // 容器一 mount 立刻装 listener；容器卸载（切 post 或清空）也清掉旧 listener。
  const hasCommentThreads = commentThreads.length > 0;
  useEffect(() => {
    const node = threadsScrollRef.current;
    if (!node) return;
    const update = () => {
      userNearBottomRef.current =
        node.scrollHeight - node.scrollTop - node.clientHeight < 80;
    };
    update();
    node.addEventListener("scroll", update, { passive: true });
    return () => node.removeEventListener("scroll", update);
  }, [selectedPostId, hasCommentThreads]);
  useEffect(() => {
    if (!selectedPostId) return;
    if (commentsLoading && !comments.length) return;
    if (!comments.length) {
      previousCommentCountRef.current = 0;
      return;
    }
    const node = threadsScrollRef.current;
    if (!node) return;
    const previousCount = previousCommentCountRef.current;
    const growth = comments.length > previousCount;
    const isNearBottom = userNearBottomRef.current;
    const shouldScroll =
      !hasAutoScrolledOnOpenRef.current || (growth && isNearBottom);
    if (shouldScroll) {
      hasAutoScrolledOnOpenRef.current = true;
      previousCommentCountRef.current = comments.length;
      window.requestAnimationFrame(() => {
        const target = threadsScrollRef.current;
        if (!target) return;
        target.scrollTop = target.scrollHeight;
        // 程序滚到底后显式同步 ref —— 短滚动 / 浏览器节流时 scroll 事件
        // 不一定 fire，下一次 effect 又会拿 stale false。
        userNearBottomRef.current = true;
      });
    } else if (comments.length !== previousCount) {
      previousCommentCountRef.current = comments.length;
    }
  }, [comments.length, commentsLoading, selectedPostId]);

  return (
    <div className="mt-3 space-y-3">
      {commentsLoading && !comments.length ? (
        <div className="rounded-[14px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-4 py-4 text-xs leading-6 text-[color:var(--text-muted)]">
          {t(msg`正在读取评论...`)}
        </div>
      ) : null}
      {/*
        走查 2026-05-17 R5：原条件只看 !commentsLoading && !comments.length，
        commentsErrorMessage 设值时（ChannelCommentsDrawer 顶部已经渲了红色
        ErrorBlock），这条空态卡也会同时冒出来。用户既看到错误又看到「还没
        有评论」，矛盾且会让人以为真的没人评论（同移动端 R1 修复同款问题）。
      */}
      {!commentsLoading && !comments.length && !commentsHasError ? (
        <div className="rounded-[14px] border border-dashed border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-4 py-4 text-xs leading-6 text-[color:var(--text-muted)]">
          {t(msg`这条内容还没有评论，你可以先开口。`)}
        </div>
      ) : null}
      {threadIdsWithReplies.length ? (
        <div className="flex items-center justify-between rounded-[12px] border border-[color:var(--border-faint)] bg-white px-3 py-2 text-[11px] text-[color:var(--text-secondary)]">
          <span>
            {t(msg`共 ${threadIdsWithReplies.length} 个可折叠线程`)}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => updateCollapsedThreadIds([])}
              className="rounded-full border border-[color:var(--border-faint)] px-2.5 py-1 transition hover:bg-[color:var(--surface-console)]"
            >
              {t(msg`全部展开`)}
            </button>
            <button
              type="button"
              onClick={() => updateCollapsedThreadIds(threadIdsWithReplies)}
              className="rounded-full border border-[color:var(--border-faint)] px-2.5 py-1 transition hover:bg-[color:var(--surface-console)]"
            >
              {t(msg`全部收起`)}
            </button>
          </div>
        </div>
      ) : null}
      {commentThreads.length ? (
        <div
          ref={threadsScrollRef}
          className="max-h-[420px] space-y-3 overflow-auto pr-1"
        >
          {commentThreads.map(({ replies, rootComment }) => (
            <div
              key={rootComment.id}
              className="rounded-[16px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 py-3"
            >
              <DesktopThreadCommentCard
                comment={rootComment}
                active={replyTarget?.commentId === rootComment.id}
                cannotInteract={cannotInteract}
                commentAuthorNameMap={commentAuthorNameMap}
                compact={false}
                likePendingCommentId={likePendingCommentId}
                onLikeComment={onLikeComment}
                onReplyToComment={onReplyToComment}
              />
              {replies.length ? (
                <DesktopCommentThreadReplies
                  cannotInteract={cannotInteract}
                  collapsed={collapsedThreadIds.includes(rootComment.id)}
                  replies={replies}
                  replyTarget={replyTarget}
                  commentAuthorNameMap={commentAuthorNameMap}
                  likePendingCommentId={likePendingCommentId}
                  onLikeComment={onLikeComment}
                  onReplyToComment={onReplyToComment}
                  onToggleCollapsed={() =>
                    updateCollapsedThreadIds((current) =>
                      current.includes(rootComment.id)
                        ? current.filter((threadId) => threadId !== rootComment.id)
                        : [...current, rootComment.id],
                    )
                  }
                />
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="rounded-[16px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 py-3">
        {cannotInteract ? (
          <div className="mb-3 rounded-[12px] bg-[rgba(234,179,8,0.10)] px-3 py-2 text-[11px] leading-[1.35rem] text-[#854d0e]">
            {t(msg`需先加为好友才能互动。`)}
          </div>
        ) : null}
        {replyTarget ? (
          <div className="mb-3 flex items-center justify-between gap-3 rounded-[12px] bg-[rgba(7,193,96,0.08)] px-3 py-2 text-[11px] text-[color:var(--brand-primary)]">
            <div className="truncate">
              {t(msg`正在回复 ${replyTarget.authorName}`)}
            </div>
            <button
              type="button"
              onClick={onCancelReply}
              className="transition hover:opacity-75"
            >
              {t(msg`取消`)}
            </button>
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <TextField
            ref={inputRef}
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            // Enter 直接发——评论 input 是单行 TextField，不存在多行换行，没必要
            // 强迫用户手离开键盘去点"发送"。IME composing 时回车是确认候选词，
            // 别误判成发送。
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              if (event.shiftKey) return;
              if (
                (event.nativeEvent as { isComposing?: boolean }).isComposing
              ) {
                return;
              }
              event.preventDefault();
              handleSubmit();
            }}
            placeholder={
              cannotInteract
                ? t(msg`需先加为好友才能评论`)
                : replyTarget
                  ? t(msg`回复 ${replyTarget.authorName}...`)
                  : selectedPost
                    ? t(msg`写下你对这条视频号内容的评论...`)
                    : t(msg`先选择一条内容`)
            }
            disabled={!selectedPost || cannotInteract}
            className="min-w-0 flex-1 rounded-xl border-[color:var(--border-faint)] bg-white py-2.5 shadow-none hover:bg-white focus:border-[rgba(7,193,96,0.14)] focus:shadow-none"
          />
          <Button
            variant="primary"
            size="sm"
            disabled={
              !selectedPost ||
              cannotInteract ||
              !draft.trim() ||
              submitPending
            }
            onClick={handleSubmit}
            className="bg-[color:var(--brand-primary)] text-white shadow-none hover:opacity-95"
          >
            {submitPending ? t(msg`发送中...`) : t(msg`发送`)}
          </Button>
        </div>
      </div>
    </div>
  );
}

function DesktopCommentThreadReplies({
  cannotInteract,
  collapsed,
  commentAuthorNameMap,
  likePendingCommentId,
  onLikeComment,
  onReplyToComment,
  onToggleCollapsed,
  replies,
  replyTarget,
}: {
  cannotInteract: boolean;
  collapsed: boolean;
  commentAuthorNameMap: Map<string, string>;
  likePendingCommentId: string | null;
  onLikeComment: (comment: FeedComment) => void;
  onReplyToComment: (comment: FeedComment) => void;
  onToggleCollapsed: () => void;
  replies: FeedComment[];
  replyTarget: {
    authorId: string;
    authorName: string;
    commentId: string;
    postId: string;
  } | null;
}) {
  const t = useRuntimeTranslator();
  const latestReply = replies[replies.length - 1] ?? null;
  // 走查 2026-05-18 R1（本轮）：collapsed 状态下"楼中楼"折起来后下面那块儿
  // 预览，原 `${authorName}：${latestReply.text}` 直接拿 raw text 渲到 DOM——
  // 视频号 AI 角色（gpt-4.1 / claude）回复偶尔把 <tool_call>…</tool_call>
  // 或 [TOOL_CALL] 这种工具调用残留漏到 comment.text 里（feed_comments 库里
  // 实测有 1019 字 CoT 漏出），collapsed 预览没 stripToolCallSyntax 也没
  // line-clamp，把整段 XML/JSON 原样塞进高度 ~24px 的预览块 → 块本身
  // overflow 撑成 200+px 把线程卡撑高 + 下方 main 评论被挤出可视区。
  // 同步对齐 DesktopThreadCommentCard 的 cleanText 处理：先 strip 再 clamp
  // 到 2 行。空文本时（被 strip 抠成空串）不渲 authorName: 这条 ghost row。
  const latestReplyCleanText = latestReply
    ? stripToolCallSyntax(latestReply.text)
    : "";

  return (
    <div className="mt-3 rounded-[14px] border border-[rgba(7,193,96,0.12)] bg-white px-3 py-3">
      <button
        type="button"
        onClick={onToggleCollapsed}
        className="flex w-full items-center justify-between text-left"
      >
        <div className="flex items-center gap-2 text-[10px] font-medium text-[color:var(--text-muted)]">
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          <span>{t(msg`楼中楼`)}</span>
        </div>
        <span className="text-[10px] text-[color:var(--text-muted)]">
          {collapsed
            ? t(msg`展开 ${replies.length} 条跟帖`)
            : t(msg`收起 ${replies.length} 条跟帖`)}
        </span>
      </button>
      {collapsed ? (
        <div className="mt-3 rounded-[12px] bg-[color:var(--surface-console)] px-3 py-3 text-[11px] leading-6 text-[color:var(--text-secondary)]">
          {latestReply && latestReplyCleanText ? (
            <div className="line-clamp-2">
              <span className="font-medium text-[color:var(--text-primary)]">
                {latestReply.authorName}
              </span>
              {`：${latestReplyCleanText}`}
            </div>
          ) : (
            t(msg`这个线程里还有跟帖。`)
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-2 border-l border-[rgba(7,193,96,0.14)] pl-3">
          {replies.map((comment) => (
            <DesktopThreadCommentCard
              key={comment.id}
              comment={comment}
              active={replyTarget?.commentId === comment.id}
              cannotInteract={cannotInteract}
              commentAuthorNameMap={commentAuthorNameMap}
              compact
              likePendingCommentId={likePendingCommentId}
              onLikeComment={onLikeComment}
              onReplyToComment={onReplyToComment}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DesktopThreadCommentCard({
  active,
  cannotInteract,
  comment,
  commentAuthorNameMap,
  compact,
  likePendingCommentId,
  onLikeComment,
  onReplyToComment,
}: {
  active: boolean;
  cannotInteract: boolean;
  comment: FeedComment;
  commentAuthorNameMap: Map<string, string>;
  compact: boolean;
  likePendingCommentId: string | null;
  onLikeComment: (comment: FeedComment) => void;
  onReplyToComment: (comment: FeedComment) => void;
}) {
  const t = useRuntimeTranslator();
  // 走查 2026-05-17 R3：原代码只看本地 commentAuthorNameMap——它只覆盖当前
  // 分页展示的评论。被回复的根评论若在分页之外 / 已删 / 已隐藏，map 是空，
  // "回复 X" 整段就漏掉了。移动端 R3 早就改成「优先吃后端 serializeComment
  // 给的 replyToAuthorName」，桌面这里也对齐。
  const replyTargetName = comment.replyToCommentId
    ? (comment.replyToAuthorName ??
        commentAuthorNameMap.get(comment.replyToCommentId) ??
        null)
    : null;
  // 走查 2026-05-17 R3：评论正文同样跑 stripToolCallSyntax，避免 AI 角色 CoT
  // 漏出的 <tool_call> / [TOOL_CALL] 标签原样在评论楼里显示一段 XML/JSON。
  const cleanText = stripToolCallSyntax(comment.text);

  return (
    <div
      className={cn(
        "rounded-[14px] border px-3 py-3 transition-colors",
        compact
          ? "border-[color:var(--border-faint)] bg-[color:var(--surface-console)]"
          : "border-[color:var(--border-faint)] bg-white",
        active &&
          "border-[rgba(7,193,96,0.18)] bg-[rgba(7,193,96,0.06)] shadow-[inset_3px_0_0_0_var(--brand-primary)]",
      )}
    >
      <div className="flex items-start gap-3">
        <AvatarChip
          name={comment.authorName}
          src={comment.authorAvatar}
          size={compact ? "sm" : "wechat"}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-medium text-[color:var(--text-primary)]">
              {comment.authorName}
            </span>
            <span
              className={cn(
                "rounded-md border px-2 py-0.5 text-[10px] font-medium",
                comment.authorType === "character"
                  ? "border-[rgba(7,193,96,0.12)] bg-[rgba(7,193,96,0.06)] text-[color:var(--brand-primary)]"
                  : "border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)]",
              )}
            >
              {comment.authorType === "character"
                ? t(msg`居民`)
                : t(msg`世界主人`)}
            </span>
            {compact ? (
              <span className="rounded-md bg-[rgba(15,23,42,0.06)] px-2 py-0.5 text-[10px] text-[color:var(--text-secondary)]">
                {t(msg`回复层`)}
              </span>
            ) : (
              <span className="rounded-md bg-[rgba(15,23,42,0.06)] px-2 py-0.5 text-[10px] text-[color:var(--text-secondary)]">
                {t(msg`主评论`)}
              </span>
            )}
            <span className="text-[color:var(--text-dim)]">
              {formatTimestamp(comment.createdAt)}
            </span>
          </div>
          <div className="mt-1 text-xs leading-6 text-[color:var(--text-secondary)]">
            {replyTargetName ? (
              <span className="text-[color:var(--text-muted)]">
                {t(msg`回复 ${replyTargetName}`)}
                {"："}
              </span>
            ) : null}
            {cleanText}
          </div>
          <div className="mt-2 flex items-center gap-4 text-[11px] text-[color:var(--text-muted)]">
            <button
              type="button"
              disabled={cannotInteract}
              onClick={() => onReplyToComment(comment)}
              className="transition hover:text-[color:var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t(msg`回复`)}
            </button>
            <button
              type="button"
              disabled={
                cannotInteract ||
                comment.likedByOwner ||
                likePendingCommentId === comment.id
              }
              onClick={() => onLikeComment(comment)}
              className={cn(
                "inline-flex items-center gap-1 transition disabled:cursor-not-allowed",
                comment.likedByOwner
                  ? "text-[color:var(--brand-primary)]"
                  : "hover:text-[color:var(--text-primary)]",
                cannotInteract && !comment.likedByOwner ? "opacity-50" : null,
              )}
            >
              <ThumbsUp size={12} />
              {likePendingCommentId === comment.id
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
}

function readStoredCollapsedChannelCommentThreads() {
  if (typeof window === "undefined") {
    return {} as Record<string, string[]>;
  }

  try {
    const rawValue = window.localStorage.getItem(
      DESKTOP_CHANNEL_COMMENT_THREAD_STORAGE_KEY,
    );
    if (!rawValue) {
      return {};
    }

    const parsed = JSON.parse(rawValue) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).map(([postId, threadIds]) => [
        postId,
        Array.isArray(threadIds)
          ? threadIds.filter((threadId): threadId is string => typeof threadId === "string")
          : [],
      ]),
    );
  } catch {
    return {};
  }
}

function writeStoredCollapsedChannelCommentThreads(
  collapsedThreadsByPostId: Record<string, string[]>,
) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const sanitized = Object.fromEntries(
      Object.entries(collapsedThreadsByPostId).filter(
        ([, threadIds]) => threadIds.length > 0,
      ),
    );
    if (!Object.keys(sanitized).length) {
      window.localStorage.removeItem(
        DESKTOP_CHANNEL_COMMENT_THREAD_STORAGE_KEY,
      );
      return;
    }

    window.localStorage.setItem(
      DESKTOP_CHANNEL_COMMENT_THREAD_STORAGE_KEY,
      JSON.stringify(sanitized),
    );
  } catch {
    return;
  }
}

function normalizeCollapsedThreadIds(
  threadIds: string[],
  availableThreadIds: string[],
) {
  const availableThreadIdSet = new Set(availableThreadIds);
  const nextThreadIds: string[] = [];

  threadIds.forEach((threadId) => {
    if (
      availableThreadIdSet.has(threadId) &&
      !nextThreadIds.includes(threadId)
    ) {
      nextThreadIds.push(threadId);
    }
  });

  return nextThreadIds;
}

function areThreadIdsEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((threadId, index) => threadId === right[index]);
}
