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
  // 走查 2026-05-19 第八轮 R1：mobile sheet 早就有 errorActionLabel / onErrorAction
  // 兜「重试读取评论 / 重试评论点赞 / 重试回复 / 重试发送」按钮（channels-page.tsx
  // L2858 / L2878），desktop drawer 一直只渲红条没 retry 入口。补这一对 prop 让父
  // 级把 retry chain 透下来；undefined 时按原行为不渲按钮（向后兼容）。
  commentsErrorActionLabel?: string;
  onCommentsErrorAction?: () => void;
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
  onCloseAuthor: () => void;
  onCancelCommentReply: () => void;
  onCommentChange: (postId: string, value: string) => void;
  onCommentSubmit: (postId: string) => void;
  onLike: (postId: string) => void;
  onLikeComment: (comment: FeedComment) => void;
  onOpenAuthor: (authorId: string) => void;
  onOpenAuthorPost: (postId: string, authorId: string) => void;
  onRefresh: () => void;
  // 走查 2026-05-19 第五轮 R3：home 读失败时让用户能重试。mobile MobileChannels
  // StatusCard 早就给了「重试读取」按钮（channels-page.tsx L2678-2698），desktop
  // workspace 一直只把 errorMessage 渲成 ErrorBlock 无 retry，用户只能刷新整页或
  // 切 section 才能再触发 channelsQuery —— 公网隧道一次 transient 500 / network
  // 断也卡死视频号入口。补可选回调；undefined 时按原行为不渲按钮。
  onRetryLoad?: () => void;
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
  commentsErrorActionLabel,
  onCommentsErrorAction,
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
  onCloseAuthor,
  onCancelCommentReply,
  onCommentChange,
  onCommentSubmit,
  onLike,
  onLikeComment,
  onOpenAuthor,
  onOpenAuthorPost,
  onRefresh,
  onRetryLoad,
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
  // 走查 2026-05-19 第十轮 R3：forwardNotice 历史只存 string，下面 ForwardNotice
  // 的 tone 判断走 `forwardNotice.includes("失败")` 把 toast 文案当 truth source ——
  // 这条 string-match 只在中文 locale 下有效。en-US 翻译是 "Failed to forward to X:
  // Y"（catalogs/app/en-US.po L8444），ja/ko 翻译类似不含「失败」字符，于是 en/ja/ko
  // 用户的转发失败 toast 全渲成 success 绿底（"已转发"的视觉）+ role="status"
  // (polite) 而不是 alert(assertive)，盲用 / 视觉用户都把失败误判为成功。
  // 改成 state 同时存 message + tone，onForwarded → tone="success"，onForwardFailed
  // → tone="danger"，跟 localization 完全解耦。ForwardNotice prop 也不再需要按字
  // 符串嗅探。
  const [forwardNotice, setForwardNotice] = useState<{
    message: string;
    tone: "success" | "danger";
  } | null>(null);
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
  // 每滑过一张 slide 都 fetch comments 一次浪费 RTT）。
  // 走查 2026-05-18 第三轮 R2：原注释说 onDrawerOpenChange 是 setState setter
  // identity 稳定 — 但事实上 channels-page 那里是内联箭头
  // `onDrawerOpenChange={(postId) => { setDesktopCommentDrawerPostId(postId);
  // if (postId === null) setDesktopReplyTarget(null); }}` —— 不是 raw setter，
  // 每次 channels-page re-render 都换 identity。视频号工作区里 IntersectionObserver
  // 切 selectedPostId / like/favorite/follow 乐观更新 / viewFeedPost mutation 完成
  // / forwardNotice 3s 计时器 触发的 channels-page re-render 每秒 4-8 次，本 effect
  // 跟着每次 re-fire 调 onDrawerOpenChange?.(commentDrawerPostId)，arrow 内部
  // setDesktopCommentDrawerPostId(same) Object.is 命中是 React no-op，但
  // conditional `if (postId === null) setDesktopReplyTarget(null)` 在 drawer 关
  // 着时每帧调 setDesktopReplyTarget(null)（虽然也是 no-op）— 累计 React scheduler
  // 工作量并非零。同 onSelectedPostChangeRef / onCloseAuthorRef 的 latest-ref 模式，
  // deps 只挂 commentDrawerPostId，回调走 ref 拿最新 identity。
  const onDrawerOpenChangeRef = useRef(onDrawerOpenChange);
  onDrawerOpenChangeRef.current = onDrawerOpenChange;
  useEffect(() => {
    onDrawerOpenChangeRef.current?.(commentDrawerPostId);
  }, [commentDrawerPostId]);

  // 走查 2026-05-17 新会话 R2：原依赖整个 posts 数组——每次 ChannelsPage 上
  // 的 like/favorite/follow 乐观更新让 React Query setQueryData 返回新数组，
  // 这条 effect 就把 IntersectionObserver 整张拆掉重建，下一帧再重新 observe
  // 当前所有 slide。lots of churn for nothing：slide id 集合没变，重建毫无意义。
  // 用 id 拼成的稳定 key 代替——只有真正插/删 slide 时才重建 observer。
  const slideIdsKey = useMemo(
    () => posts.map((post) => post.id).join(","),
    [posts],
  );

  // 走查 2026-05-19 第八轮 R3：用户从推荐 tab 滚到第 5 张 slide 然后点「朋友」
  // tab → channels-page handleSectionChange 切 activeSection + 清 desktopSelected
  // PostId + replace URL 把 hash 里的 post 锚点去掉（L2316-2328）→ routeSelected
  // PostId 变 null + posts 整张换新。但 workspace 这边的 scrollContainerRef 是
  // 同一个 DOM 节点不会 unmount，scrollTop 仍停在原推荐流第 5 张那个 offset
  // （~3200px）。新「朋友」流 posts 渲到 0/800/1600... offset 上，IO 在原 offset
  // 看到的是新 posts 里的第 4 / 5 张（按 viewport 高度算）→ setSelectedPostId
  // (slide_4_of_friends) → IO 同帧 echo 给 channels-page → URL hash 又把
  // post=slide_4_id 写回。结果用户切「朋友」tab 时本来期待"看到朋友圈的最新内
  // 容（第 1 条）"，实际看到的是朋友圈第 4-5 条（按之前推荐流的滚动深度），
  // 体感「这 tab 点了好像是滚动深度还跟着我」+ 第 1-3 条直接被跳过。同款问题
  // mobile MobileChannelsViewport 不存在，因为 mobile 每条 tab 走的是同一个 carousel，
  // scroll position 跟着 selectedPostId 反向同步。
  //
  // 修法：activeSection 真切到新值时同步把 scrollContainer 滚回顶端。useRef 跟
  // 踪 prev section —— prop 同帧来 / 父级 re-render 仅触发对应 effect 一次，避免
  // 每次 like / favorite 乐观更新都跳到顶。auto 不动画，避免 snap-mandatory 跟
  // smooth scroll 跨帧打架。Re-fire 时序：L470 slideIdsKey effect 先 disconnect
  // 旧 IO，本 effect 把 scrollTop=0 → 下一帧新 posts mount + 新 IO observe 在 0
  // offset 处自然找到 slide 0 → setSelectedPostId(slide_0)。无 routeSelectedPostId
  // 时这条路径 OK；有 routeSelectedPostId（深链场景）时 L520 那条 scrolledRouteId
  // Ref effect 会再把 viewport 跳到目标 post，scroll-top reset 不冲突（routeSel
  // PostId 变化触发的 effect 在同 commit 跑得更晚，scrollIntoView 会覆盖 0）。
  const prevActiveSectionRef = useRef(activeSection);
  useEffect(() => {
    if (prevActiveSectionRef.current === activeSection) {
      return;
    }
    prevActiveSectionRef.current = activeSection;
    const root = scrollContainerRef.current;
    if (!root) return;
    root.scrollTop = 0;
  }, [activeSection]);
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
      // 走查 2026-05-19 第十一轮 R3：IME composition 期间 Esc 是用户用来
      // 取消拼音 / 假名 / 한글候选词的标准键。原 handler 一律 preventDefault
      // + 关 drawer / author overlay，中日韩用户在评论 drawer 的 input 里
      // 输到一半按 Esc 想退出候选词 → 整个 drawer 直接被关掉，半截输入丢
      // 失 + 体感「我刚才不是只想退候选词怎么连面板都没了」。同款 panel
      // input 的 onKeyDown L3186-3196 早就 isComposing 早返 Enter，这条
      // Esc 漏了同款保护。检 KeyboardEvent.isComposing：true 时让 IME 自
      // 己消费 Esc，不抢；用户再按一次 Esc（候选词已退，isComposing=false）
      // 才走 modal 关闭路径。同款修法之后建议也下到 picker 的 Esc handler，
      // 不过 picker 无 input 不可能命中 IME composition，本轮只修 workspace。
      if (event.isComposing) {
        return;
      }
      // R1 续：forward picker 在最上层时把 Esc 让给它独家处理。
      if (forwardPickerOpenRef.current) {
        return;
      }
      event.preventDefault();
      // 走查 2026-05-18 第二轮 R14：原顺序是 drawer 先 author 后，但视觉层叠
      // 上是 author overlay (z-40) 盖在 drawer (z-30) 之上 — 用户在 drawer 打
      // 开的同时点 slide 上的作者头像（drawer 外层 pointer-events-none 让点击穿
      // 透到底层 slide），两者并存：drawer 在底（被覆盖看不到），author overlay
      // 在顶（可见）。原顺序按 Esc 先关 drawer（用户根本看不到，体感"按了 Esc
      // 没反应"），再按 Esc 才关 author。两个 Esc 才解掉一层可见 modal。
      // 修法：反转顺序。Esc 先关最顶层可见的（author overlay），下一个 Esc 再
      // 关露出来的 drawer。符合用户直觉 + 标准 modal 栈出栈语义。
      if (authorPanelVisible) {
        onCloseAuthorRef.current();
      } else if (commentDrawerPostId) {
        setCommentDrawerPostId(null);
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
  // 走查 2026-05-19 第十轮 R1：上一轮 R1（line 663）注释明确写「Home/End 兜首尾」，
  // 实际 keydown handler 只挂了 Arrow/PageDown/PageUp 四个 key，Home/End 一直没接
  // —— 用户按 Home 想跳回第 1 条 / 按 End 想跳到最后一条（抖音 / YouTube Shorts /
  // Bilibili 全屏纵向流的标准键盘行为）一律无效，键盘用户只能按 N 次 PageDown 慢
  // 慢挪。补 jumpTo(first|last) 配套 callback，跟 handlePrev/handleNext 一致走
  // ref → 稳定 identity，下面 keydown 用 latest-ref 模式拿当下最新 fn。
  const jumpToFirst = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }
    container.scrollTo({ top: 0, behavior: "smooth" });
  }, []);
  const jumpToLast = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, []);

  // 走查 2026-05-19 第五轮 R1：视频号工作区原来只能用鼠标滚轮 / Tab+Enter 到右
  // 下角箭头按钮来切换 slide。键盘用户每滑一条都要先 Tab 数次到 FeedNavArrows
  // 再按 Enter，对齐抖音 / Bilibili / YouTube 全屏纵向视频流的标准键盘体感
  // （ArrowUp/Down + PageUp/Down），桌面 channels 一直漏。补 window-level 监听：
  //   - Arrow/PageDown → 下一条；Arrow/PageUp → 上一条
  //   - Home → 第 1 条；End → 最后一条（走查第十轮 R1 补齐）
  //   - 任一 modal 打开（drawer / author overlay / forward picker）→ bail，
  //     让键盘焦点留给 modal（modal 内 Esc/Tab 各自有处理）
  //   - focus 在输入元素（INPUT/TEXTAREA/contenteditable）→ bail，不抢评论
  //     textarea / TextField 光标移动
  //   - 修饰键 Ctrl/Cmd/Alt 按下 → bail，留给浏览器原生快捷键
  // handlePrev/Next/jumpToFirst/jumpToLast 走 ref → 稳定 identity，依赖 modal 状态。
  const handlePrevRef = useRef(handlePrev);
  handlePrevRef.current = handlePrev;
  const handleNextRef = useRef(handleNext);
  handleNextRef.current = handleNext;
  const jumpToFirstRef = useRef(jumpToFirst);
  jumpToFirstRef.current = jumpToFirst;
  const jumpToLastRef = useRef(jumpToLast);
  jumpToLastRef.current = jumpToLast;
  useEffect(() => {
    if (commentDrawerPostId || authorPanelVisible || forwardPickerPost) {
      return;
    }
    const handler = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target.isContentEditable
        ) {
          return;
        }
      }
      // Space 故意不挂键盘 slide nav：Space 是浏览器原生 button 激活键
      // （focused 在 ChannelActionButton like/share/favorite/follow 上时按 Space
      // 等同 click），若 preventDefault 抢去做 scroll，用户按 Space 想点赞会被
      // 吞成"切下一条"，体感严重错位。Arrow / PageUp / PageDown 在 button focus
      // 下浏览器默认是 no-op，挂上 nav 无副作用。
      if (event.key === "ArrowDown" || event.key === "PageDown") {
        event.preventDefault();
        handleNextRef.current();
        return;
      }
      if (event.key === "ArrowUp" || event.key === "PageUp") {
        event.preventDefault();
        handlePrevRef.current();
        return;
      }
      // 走查第十轮 R1：Home/End 跳首尾。注意只在 modal 关闭且非输入元素时挂；
      // INPUT/TEXTAREA 上的 Home/End 是光标到行首/行末，已被上面 input gate 早返。
      if (event.key === "Home") {
        event.preventDefault();
        jumpToFirstRef.current();
        return;
      }
      if (event.key === "End") {
        event.preventDefault();
        jumpToLastRef.current();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [authorPanelVisible, commentDrawerPostId, forwardPickerPost]);

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-[rgba(244,247,246,0.98)]">
      <div className="border-b border-[color:var(--border-faint)] bg-white/92 backdrop-blur-xl">
        <div className="flex h-14 items-center justify-between gap-4 px-6">
          {/*
            走查 2026-05-18 新会话（本会话）R3：原 section tabs（推荐 / 朋友 / 关注
            / 直播）裸 <button> + aria-pressed，但这 4 颗按钮是 tab —— 它们互斥切
            换页面视图，不是独立 toggle。WAI-ARIA：aria-pressed 是 role=button
            toggle 状态属性（已点赞/已收藏这种），role=tab 的标准状态属性是
            aria-selected。原写法 NVDA / 部分 SR 会把按钮误念成 "推荐 pressed"，
            盲用用户体感"这控件是按钮还是 tab"。同 mobile 那边 channels-page L2562
            的 R1 修复 + channel-author-page L713 的 R1 修复对齐：外层 role=
            tablist + aria-label，内层 role=tab + aria-selected。

            走查 2026-05-19 第十一轮 R5：补 WAI-ARIA tab 模式 keyboard nav。原 4
            颗 tab 全部 tabindex=0（button 默认）—— 键盘用户从 logo / 顶栏 Tab
            进 tablist 后要按 4 次 Tab 才能跨过 tablist 抵达「换一批」/「直播伴
            侣」按钮，且 tablist 内部 ArrowLeft/Right 完全无效（标准 horizontal
            tablist 应该用箭头键在 tab 之间切焦点）。同 ArrowUp/Down 这条慢路径
            的痛感对齐。
            实现 roving tabindex：仅当前 active tab tabindex=0 进入 Tab 序，其它
            tabindex=-1 退出 Tab 序；tablist 内监听 ArrowLeft/Right 移焦点 + 自动
            activate（auto-activation 模式，符合 mouse click 单击即选中的 channels
            UX 一致性，避免"按了箭头光移焦点没切 tab"的两步割裂）；Home/End 兜
            首尾。tab 上的 onKeyDown 不挡 ArrowUp/Down 因为 slide nav handler 已
            经按 INPUT/TEXTAREA 早返但允许 button 上的 ArrowUp/Down 滚 slide ——
            tab focused 时按 ArrowDown 仍然滚 slide（"我看到 tab 列表想往下看内
            容"的自然意图），不与 tablist 内 Left/Right 冲突（horizontal 维度）。
          */}
          <div
            className="flex h-full items-stretch gap-7"
            role="tablist"
            aria-label={t(msg`视频号分组`)}
          >
            {sections.map((section, index) => {
              const active = activeSection === section.key;
              return (
                <button
                  key={section.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  tabIndex={active ? 0 : -1}
                  onClick={() => onSectionChange(section.key)}
                  onKeyDown={(event) => {
                    // ArrowLeft/Right + Home/End 跨 tab；ArrowUp/Down 留给上层
                    // window-level slide nav handler 滚 slide（horizontal tablist
                    // 模式垂直方向交给 tabpanel 内容）。
                    if (
                      event.key !== "ArrowLeft" &&
                      event.key !== "ArrowRight" &&
                      event.key !== "Home" &&
                      event.key !== "End"
                    ) {
                      return;
                    }
                    event.preventDefault();
                    event.stopPropagation();
                    let nextIndex = index;
                    if (event.key === "ArrowLeft") {
                      nextIndex = index === 0 ? sections.length - 1 : index - 1;
                    } else if (event.key === "ArrowRight") {
                      nextIndex =
                        index === sections.length - 1 ? 0 : index + 1;
                    } else if (event.key === "Home") {
                      nextIndex = 0;
                    } else if (event.key === "End") {
                      nextIndex = sections.length - 1;
                    }
                    const nextSection = sections[nextIndex];
                    if (!nextSection) return;
                    // 同步抓 tablist 引用 —— React 18+ 不池化 synthetic event
                    // 但 currentTarget 在 async callback 里仍可能成 null（async
                    // tick 已经返回 handler 函数）。先抓 closest tablist 节点
                    // 喂给 rAF，避免 nullable。
                    const tablist = (
                      event.currentTarget as HTMLElement | null
                    )?.closest('[role="tablist"]') ?? null;
                    // auto-activate：与 mouse click 单击切 tab 的 UX 对齐；同时
                    // 异步把焦点移到新 tab —— activate 同帧 setActiveSection 触发
                    // re-render，新 tab 的 tabIndex 翻 0，但焦点仍在旧 tab 上（now
                    // tabIndex=-1）。rAF 等 React commit 落定再 querySelector 新
                    // active tab 移焦点，符合"键盘用户跟着箭头按一下焦点就跟到"
                    // 的预期。fallback：找 role="tab" + aria-selected="true"。
                    onSectionChange(nextSection.key);
                    window.requestAnimationFrame(() => {
                      const nextTab =
                        tablist?.querySelector<HTMLButtonElement>(
                          '[role="tab"][aria-selected="true"]',
                        );
                      nextTab?.focus({ preventScroll: true });
                    });
                  }}
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
                // 走查 2026-05-18 新会话（本会话）R8：跟 mobile channels-page L2594
                // 的 R1 修复（commit 2d9cc82e6）同款 — InlineNotice 是裸 <div>，
                // 没有 role / aria-live。视频号 desktop workspace 顶部 toast 在
                // like / favorite / follow / 不感兴趣 / 转发 / 评论 / 评论赞 / 换
                // 一批 mutation onSuccess/onError 后冒出，但 desktop 这条 InlineNotice
                // 一直没挂 role，VoiceOver / TalkBack 完全收不到——同款 toast 在
                // mobile 早就 R1 修过，desktop 漏掉了同套修复。
                // tone===danger / warning（失败 / 阻塞约束）走 role="alert" →
                // aria-live=assertive 立刻打断当前播报；info / success / muted 走
                // role="status" → aria-live=polite 排队播报。
                role={
                  successNoticeTone === "danger" ||
                  successNoticeTone === "warning"
                    ? "alert"
                    : "status"
                }
                className="border-[color:var(--border-faint)] bg-white"
              >
                {successNotice}
              </InlineNotice>
            </div>
          ) : null}
          {errorMessage ? (
            <div className="pointer-events-auto">
              {/* R8 续：errorMessage 是 home / decorations 读取失败这种"整页性"
                  错误，desktop workspace 用 ErrorBlock 渲红色卡。同样裸 <div>，
                  没 role —— SR 用户进 channels 命中读取失败时听不到错误反馈，
                  视觉用户能看到红条但盲用用户摸不到。挂 role="alert" 立刻播报。
                  走查 2026-05-19 第五轮 R3：以前红条只有一行错误文字，没有重试
                  按钮。mobile MobileChannelsStatusCard 早就给了「重试读取」按
                  钮（channels-page.tsx L2678-2698）。补 Button 作为 ErrorBlock
                  children；onRetryLoad 没传时不显示按钮（向后兼容）。 */}
              <ErrorBlock message={errorMessage} role="alert">
                {onRetryLoad ? (
                  <div className="mt-2 flex">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={onRetryLoad}
                      className="rounded-full bg-white"
                    >
                      <RefreshCcw size={13} />
                      {t(msg`重试读取`)}
                    </Button>
                  </div>
                ) : null}
              </ErrorBlock>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="relative min-h-0 flex-1 overflow-hidden bg-[#101013]">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            {/* 走查 2026-05-18 第二轮 R5：LoadingBlock 是裸 <div>，没 role/aria-
                live。视频号 home 首次打开 / "换一批" 后 / baseUrl 切换重拉时整
                屏渲 "正在读取视频号内容..." 几百毫秒～几秒，盲用用户视觉上看
                不到 loading dot 动画，听不到任何反馈，体感"页面卡死"。挂 role=
                "status"（aria-live=polite）让 SR 进入 loading 态时排队播报。 */}
            <LoadingBlock
              role="status"
              label={t(msg`正在读取视频号内容...`)}
            />
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
                  // 走查 2026-05-19 第十一轮 R2：commentDrawerOpen 给 slide 内
                  // chat 图标按钮渲动态 aria-label + aria-expanded。drawer 关时
                  // 按钮的语义动作是"打开评论"，drawer 已开时按钮再点会关 drawer
                  //（handleSlideToggleCommentDrawer L300-304 toggle 语义）。原
                  // aria-label 写死"打开评论"，SR 用户 drawer 开着时听见"打开
                  // 评论 button"按 Enter 实际是关 drawer，体感「按了相反的动作」。
                  // 只有当 slide 是当前 active 时它的 drawer 才有可能被开（drawer
                  // 渲染条件 L1013：commentDrawerPostId === selectedPost.id），
                  // 非 active slide 的 commentDrawerOpen 恒为 false，shallow
                  // memo 比较 false===false 仍命中跳过 reconciliation；只有真正
                  // 切到该 post 上 drawer 开 / 关时这一张才重渲。
                  commentDrawerOpen={commentDrawerPostId === post.id}
                  isFavorite={Boolean(post.ownerState?.hasFavorited)}
                  likePending={likePendingPostId === post.id}
                  favoritePending={favoritePendingPostId === post.id}
                  followPending={followPendingAuthorId === post.authorId}
                  // 走查 2026-05-19 桌面端第十三轮 R1：原 `unmuted={unmuted}` 把全
                  // 局静音状态直传所有 slide —— 用户在 active slide 点视频左上角
                  // Volume 按钮 toggle global unmuted（或 ChannelVideoPlayer 整张
                  // <video> 被点 → onClick={onToggleUnmuted}），workspace
                  // setUnmuted 让所有 N 张 slide 拿到新 prop → ChannelFeedSlide memo
                  // 失效 → 全部 N 张 reconciliation。inactive slide 的 video 已经
                  // 被另一条 effect [isActive, url] pause + currentTime=0 + load()
                  // 释放 buffer + slide 本身 inert=true 用户不可交互 + IO 保证不
                  // 在视口，inactive 上的 unmuted 切换没有任何可感语义。
                  // 收紧到「只把真 unmuted 状态传给 active slide」：inactive 一律
                  // false（与 video.muted=true 一致）。toggle 全局静音时只有 active
                  // 一张 prop 真变 → 仅这张 re-render；切 active slide 时新旧两张
                  // 因 isActive 变本来就会重渲，本优化不引入额外开销。
                  // 当前 yuanzui0728 测试库只有 2 张 slide 收益小，但生产负载下
                  // recommended tab 一次拉 20+ slide，且 yz 等用户偏好快速 toggle
                  // 静音浏览，省 ~95% 的 unmute-induced 全列表 re-render。
                  unmuted={post.id === selectedPost?.id ? unmuted : false}
                  // 走查 2026-05-19 第十五轮 R3：avatar button 早在第十一轮 R2 补了
                  // aria-haspopup="dialog"（同 chat / share / 转发按钮一道），但漏
                  // 了配套的 aria-expanded — 同 slide 的 chat 按钮（L2094 commentDrawer
                  // Open）按 disclosure 模式同时挂 aria-haspopup + aria-expanded，让
                  // SR 知道"popup 当前是开/关"。avatar 按钮一直只挂 aria-haspopup
                  // 不挂 aria-expanded，author overlay 打开时 SR 听不到"已展开"反馈。
                  // 计算 authorOverlayOpenForThisAuthor：authorPanelVisible AND post.authorId
                  // 等于 routeSelectedAuthorId（overlay 显示的那位作者）。从 author
                  // overlay 内点 recent posts 列表跳到同作者的另一条 post 时，新 active
                  // slide 的 avatar 同样匹配 → 同样汇报 aria-expanded=true，对齐"多个
                  // disclosure 按钮控制同一 popup"的 ARIA 语义。其它 slide 恒 false
                  // shallow-compare 命中跳过 reconciliation；只有真正切到/离开匹配
                  // 作者的 slide 上这一张才重渲，零额外开销。
                  authorOverlayOpenForThisAuthor={
                    authorPanelVisible && post.authorId === routeSelectedAuthorId
                  }
                  // 走查 2026-05-19 第十五轮 R7：同 R3 avatar / chat 按钮的 disclosure
                  // 模式 — share 按钮第十一轮 R2 (commit 94b2d15ea) 已挂 aria-haspopup
                  // ="dialog" 但漏 aria-expanded。用户点 share 打开 ChannelsForwardPicker
                  // (z-110 全屏 modal) → 此刻该 slide 的 share 按钮的 popup 是"已展开"
                  // 状态，但 SR 用户回头 hover 这颗按钮仍听 "转发到聊天 button has
                  // popup dialog"，不知道 picker 当前在屏（picker 自动 focus trap 锁
                  // 焦点在自己内部，但 SR rotor 仍能游走到 listing button）。
                  // forwardPickerPost?.id 与 post.id 比对 — 仅当 picker 打开的那条
                  // post 的 share 按钮汇报 expanded=true，其它 slide 恒 false。memo
                  // 行为同 R3：非匹配 slide 上 prop 恒 false shallow-compare 跳过，
                  // 仅打开/关闭 picker 切换那条 post 的 slide 重渲。
                  sharePickerOpenForThisPost={forwardPickerPost?.id === post.id}
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
                commentsErrorActionLabel={commentsErrorActionLabel}
                onCommentsErrorAction={onCommentsErrorAction}
                commentsLoading={commentsLoading}
                draft={commentDrafts[selectedPost.id] ?? ""}
                likePendingCommentId={commentLikePendingId}
                replyTarget={commentReplyTarget}
                selectedPost={selectedPost}
                submitPending={commentPendingPostId === selectedPost.id}
                // 走查 2026-05-19 第十一轮 R1：drawer (z-30) 跟 author overlay
                // (z-40) / forward picker (z-110) 同时打开时（slide chat 图标开
                // drawer → 点头像开 author → 在 author 内点转发图标开 picker，
                // 多见于自己 author 主页的最近内容那条转发路径），每个 modal 的
                // focus trap (L2078-2106 / L2296-2327 / picker L209-240) 都是
                // document-level keydown listener，全部并行 fire 同一个 Tab key。
                // author 的 trap 把焦点 cycle 到 overlay 内下一个 → drawer 的
                // trap 紧接着判定 `active` 不在 drawer → preventDefault + focus
                // drawer 内首元素 → 用户在 author overlay 里按 Tab 焦点直接被
                // 甩到下层 drawer 的 X 关闭按钮，体感「我按 Tab 怎么 modal 切了」。
                // 同款问题 picker 在最顶层时 author / drawer 两个 trap 也会跟着
                // 抢焦点，三层 modal 互相打架。
                // 修法：每层 modal 只在自己是栈顶时才让 trap 生效。drawer 顶
                // 层条件 = author 没开 && picker 没开。trapTopmost 用 latest ref
                // 模式传给 drawer 内部，effect deps 不挂这个 bool（避免每次
                // open/close 切换重装 listener）。
                trapTopmost={!authorPanelVisible && !forwardPickerPost}
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
            // 走查 2026-05-19 第十一轮 R1：同 drawer trapTopmost 同款 — picker
            // (z-110) 浮在 author overlay (z-40) 之上时，author overlay 的 focus
            // trap 仍 fire 抢 picker 内的 Tab 焦点。author 顶层条件 = picker 没开。
            trapTopmost={!forwardPickerPost}
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
          // R3：tone 直接走 success，不再让下方 ForwardNotice 嗅字符串。
          setForwardNotice({
            message: t(msg`已转发给 ${target.name}。`),
            tone: "success",
          });
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
          // R3：tone 直接走 danger，不再让下方 ForwardNotice 嗅字符串。
          setForwardNotice({
            message: t(msg`转发给 ${input.targetName} 失败：${input.message}`),
            tone: "danger",
          });
        }}
      />
      {forwardNotice ? (
        <ForwardNotice
          message={forwardNotice.message}
          // 走查 2026-05-18 新会话（本会话）R7：forwardNotice 这条 toast 可以是
          // 成功（"已转发给 X 已转发"）也可以是失败（"转发给 X 失败：xxx"），
          // 同一个 state 跑两种语义。SR 用户读 toast 的关键是 role/aria-live，
          // success 走 status (polite)，failure 走 alert (assertive)。
          // 走查 2026-05-19 第十轮 R3：原 tone 走 `forwardNotice.includes("失败")`
          // 嗅 toast 文案 — 只在中文 locale 下有效。en-US 翻译"Failed to forward
          // to X: Y"（catalogs/app/en-US.po L8444）/ ja / ko 类似全不含「失败」，
          // 于是非中文用户的失败 toast 渲成 success 绿底 + role="status"(polite)。
          // 改用 state 里直接带的 tone（onForwarded → success / onForwardFailed →
          // danger），跟 localization 彻底解耦。
          tone={forwardNotice.tone}
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
  tone = "success",
  onDismiss,
}: {
  message: string;
  // R7：tone 决定 ARIA role —— success 走 status (polite，不打断当前播报)，
  // danger 走 alert (assertive，立即打断告知失败)。SR 用户能立刻知道转发到底
  // 成没成。视觉变体也跟着变 — 失败用红色背景对齐 InlineNotice danger tone。
  tone?: "success" | "danger";
  onDismiss: () => void;
}) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  useEffect(() => {
    const timer = window.setTimeout(() => onDismissRef.current(), 3000);
    return () => window.clearTimeout(timer);
  }, [message]);
  // R7：原 toast 一律 rgba(17,24,39,0.92) 深色背景 + 白字，可视用户没办法立刻
  // 区分成功 / 失败（都是黑底白字）。danger 改红底白字，对齐其它 danger toast。
  const isDanger = tone === "danger";
  return (
    <div
      role={isDanger ? "alert" : "status"}
      className={cn(
        "fixed left-1/2 top-6 z-[120] -translate-x-1/2 rounded-full px-4 py-2 text-[13px] text-white shadow-lg",
        isDanger
          ? "bg-[rgba(185,28,28,0.94)]"
          : "bg-[rgba(17,24,39,0.92)]",
      )}
    >
      {message}
    </div>
  );
}

function ChannelActionButton({
  active,
  ariaLabel,
  ariaExpanded,
  ariaHasPopup,
  icon,
  label,
  pending = false,
  surface = "light",
  onClick,
}: {
  // active===undefined 时本按钮不是 toggle（评论/转发只是动作入口，没有"已按下"
  // 状态），SR 不应该听到"未按下"。active===true|false 时是 toggle（赞/收藏），
  // aria-pressed 反映当前状态。
  active?: boolean;
  // 可视 label 只是计数数字（"17"、"29"），屏读出来就一个数字毫无上下文。
  // 调用方传 ariaLabel 才能让屏读读出"点赞，当前 17 赞"这种完整意图。
  ariaLabel?: string;
  // 走查 2026-05-19 第十一轮 R2：disclosure-of-popup 模式（评论按钮控制
  // dialog drawer，转发按钮控制 picker dialog）补 aria-expanded /
  // aria-haspopup 让 SR 知道这是个调出 popup 的入口、当前 popup 状态。
  ariaExpanded?: boolean;
  ariaHasPopup?: "dialog" | "menu" | "true";
  icon: ReactNode;
  label: string;
  pending?: boolean;
  surface?: "light" | "dark";
  onClick: () => void;
}) {
  const isDark = surface === "dark";
  // 走查 2026-05-18 新会话 R5（本轮）：原 `active = false` 默认让评论 / 转发
  // 两颗非 toggle 按钮也挂了 aria-pressed="false"，VoiceOver / TalkBack 读出
  // "未按下，评论"/"未按下，转发"——把一次性动作误报成可切换状态。把 aria-
  // pressed 改成只在调用方显式传 active 时输出（赞 / 收藏才传），评论 / 转发
  // 落空不挂 aria-pressed，对齐 WCAG 4.1.2 角色语义。
  return (
    <button
      type="button"
      aria-pressed={typeof active === "boolean" ? active : undefined}
      aria-label={ariaLabel}
      aria-expanded={
        typeof ariaExpanded === "boolean" ? ariaExpanded : undefined
      }
      aria-haspopup={ariaHasPopup}
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
    // 走查 2026-05-19 第八轮 R4：原 posterUrl / title 链一律 `??` —— `??` 只在
    // null/undefined 时穿越，empty string "" 会一路穿过 fallback 链卡死。contracts
    // normalizeMomentMediaAsset (client.ts L807-813) 把 asset.posterUrl 用
    // truthy guard 保留：== "" 时 normalized 仍是 ""（不 absolutize 路径），所以
    // server 返回 posterUrl="" 的情况会真的落到客户端。原来：
    //   - audioAsset.posterUrl="" + post.coverUrl="https://valid"
    //   - `audioAsset?.posterUrl ?? post.coverUrl ?? undefined` = ""
    //   - resolveAppMediaUrl("") = ""
    //   - backgroundCover gate truthy 检查 falsy → 不渲背景封面，但 post.coverUrl
    //     本该作为兜底 cover 显示出来（音乐贴的氛围层），现在静默丢失。
    //   - AudioCard 同样收到 posterUrl=""，内部 `posterUrl ? resolveAppMediaUrl(posterUrl) : undefined`
    //     gate 是 truthy 检查所以 fall back 到 undefined → 显 ♫ 占位（fail safe），
    //     但本来 post.coverUrl 完全可以填上去。
    //   - title 同款：audioAsset.title="" 不会 fall back 到 post.title。
    // 同 fallbackImage L1264 已经修过的 R5 同款 — 改用 `||` 让 ""/null/undefined
    // 都走下一档 fallback。R5 当时只修了 image 帖的 cover 兜底，audio 这条
    // 漏掉，本轮一并补上。
    const audioPosterUrl =
      audioAsset?.posterUrl || post.coverUrl || undefined;
    const backgroundCover = resolveAppMediaUrl(audioPosterUrl);
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
            // 走查 2026-05-18 第二轮 R8：BackgroundCoverImage 是 audio slide 的
            // blurred opacity-30 装饰背景层，跟 AudioCard 的可视 title 重复传
            // post.title 当 alt —— SR 用户用 image rotor 浏览图片时会先听到
            // "X·音乐 image"，再听到 AudioCard 的可视 title "X·音乐"，双重朗读
            // 体感"为什么页面读了两遍同样内容"。装饰层应该全 alt="" +
            // aria-hidden 让 SR 整张跳过。caller 不再传 alt（component 内部
            // 强制 alt=""）。
            isActive={isActive}
          />
        ) : null}
        <div className="relative">
          <AudioCard
            url={audioPlaybackUrl}
            posterUrl={audioPosterUrl}
            title={
              audioAsset?.title ||
              post.title ||
              `${post.authorName}·${t(msg`音乐`)}`
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
    // R4 续：同款 `??` → `||` 修复 — video poster 同样可能 posterUrl=""，原
    // 链路 `videoAsset?.posterUrl ?? post.coverUrl ?? undefined` 让 "" 卡住，
    // 视频 element 没 poster 显示纯黑等 metadata 加载。改用 || 让空字符串走
    // 下一档 fallback。
    const resolvedPoster = resolveAppMediaUrl(
      videoAsset?.posterUrl || post.coverUrl || undefined,
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
  // 走查 2026-05-19 第十五轮 R5：ChannelMediaSurface 历来不是 memo'd —— 父级
  // ChannelFeedSlide memo 跳过非匹配 prop 变化但 commentDrawerOpen / authorOverlay
  // OpenForThisAuthor / isActive / unmuted 任一改变都会让 slide re-render，
  // ChannelMediaSurface 跟着重渲。原 textContent 裸调 stripToolCallSyntax(post.text)
  // 每帧重跑 — 4 个 regex replace + 1 个 CoT-detection long regex。
  // 同款热点：用户开关评论 drawer / 滚到本 slide / 切静音 / open author overlay
  // → text-only slide 重渲 → regex 重跑一次。yuanzui0728 测试库 audio 帖占多，
  // text-only 不常见但生产负载下可能更多；CoT-detection 的长 regex 在含中英
  // prose 的 text 上累计 ms 级。
  // 同 DesktopThreadCommentCard R9 / DesktopCommentThreadReplies R10 /
  // PostReferenceCard R11 / R4 cleanTextByRecentPostId 已经成熟的 useMemo([text])
  // 模板。post.text 在 home refetch 才换 string（identity 同时也是 value 等
  // 价），memo 一次缓存，后续 N 帧 slide re-render 全 cache hit。
  // 注：父级 ChannelFeedSlide 已经为 bottom overlay 算过 slideBodyText
  //（同 stripToolCallSyntax 但带 title-equality 判断），本节点的 textContent
  // 不带 title-equality（让 if 外面 `textContent !== post.title` 兜），所以
  // 不能直接共用 slideBodyText；独立 useMemo 保持本组件功能内聚。
  const textContent = useMemo(
    () => stripToolCallSyntax(post.text ?? ""),
    [post.text],
  );
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
  isActive,
}: {
  src: string;
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
      // R8：装饰层固定 alt="" + aria-hidden 让 SR 整张跳过；AudioCard 的可视
      // title 已经承担信息传达，blurred opacity-30 背景纯视觉氛围。
      alt=""
      aria-hidden="true"
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
  }, [isActive, url]);

  // 走查 2026-05-19 第十轮 R5：deps 历来只挂 [unmuted, isActive]，但 <video>
  // 元素的 key=`video:${url}` 在 url 切换时会 remount（同一组件、新 DOM 节点） ——
  // setVideoNode 在 attach 阶段强制 muted=true（确保 autoplay 不被策略拦），随后
  // 这条 effect 本来该把 muted 校准回 !unmuted，但因为 deps 看不到 url 变化，
  // 校准 effect 不会重跑 → 用户在 slide A 上点了 unmute 后，A 的 url 因为 home
  // refetch 拿到新 cdn url 翻新 → 新 video 一律静音播放，左上角 mute 按钮还显
  // 示 Volume2（unmuted state 仍 true），用户体感「明明 icon 是有声的怎么没声
  // 音？再点静音按钮也救不回」（点静音按钮 toggle unmuted=false，effect 看 [u
  // nmuted, isActive] 都变了重跑把 video.muted=true 一致 + 不调 play() → 仍无
  // 声）。
  // 修法：把 url 加进 deps，url 切换时同款 muted 校准跑一次。同 setVideoNode +
  // 第一条 effect [isActive, url] 的协作链对齐，确保新 video 元素挂上 DOM 后
  // 立刻按用户偏好把声音打开（autoplay-with-sound 若被浏览器拦则 catch 兜回
  // muted，保留视觉播放）。
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
  }, [unmuted, isActive, url]);

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
  commentDrawerOpen,
  authorOverlayOpenForThisAuthor,
  sharePickerOpenForThisPost,
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
  // R2：当前 post 的评论 drawer 是否打开，给 chat 图标按钮反映动态语义
  // （aria-label / aria-expanded）。非 active slide 上恒 false。
  commentDrawerOpen: boolean;
  // 走查 2026-05-19 第十五轮 R3：author overlay 是否为本 slide 的 author 打开。
  // 由 workspace 计算 authorPanelVisible && post.authorId === routeSelectedAuthorId
  // 后传下来。给 avatar button 补 aria-expanded 跟 aria-haspopup="dialog" 配对。
  authorOverlayOpenForThisAuthor: boolean;
  // 走查 2026-05-19 第十五轮 R7：ChannelsForwardPicker 是否为本 slide 的 share
  // 按钮打开。同 R3 模板 — workspace 算 forwardPickerPost?.id === post.id，给
  // share 按钮挂 aria-expanded 跟它早就有的 aria-haspopup="dialog" 配对。
  sharePickerOpenForThisPost: boolean;
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
  // 走查 2026-05-18 第二轮（本会话）R3：原 ref 是内联箭头 `(node) =>
  // registerSlide(post.id, node)` —— 每次 ChannelFeedSlide re-render（isActive
  // 翻转 / likePending / favoritePending / followPending / unmuted / isFavorite
  // 等任一 prop 变化）都会重建箭头函数，React callback-ref 协议看到新 identity
  // 后先调老 ref(null) 再调新 ref(node)。这导致 slideRefs Map 在两次 callback
  // 之间瞬间丢掉这条 entry：
  //   - 同帧的 [routeSelectedPostId] effect 调 slideRefs.current.get(routeSel) 兜
  //     null → scrollIntoView 失败；
  //   - IntersectionObserver 仍观察的是 DOM 元素本身（不动），所以 IO 路径不
  //     受影响；
  //   - Map.delete + Map.set 本身 cheap 但每条 slide 在 20 张 home 上每秒可能
  //     re-render 数次（like 乐观 / IO 触发的 isActive 切换 / mute 切换），累计
  //     上千次 Map churn。
  // post.id 在一条 slide 生命周期内稳定，registerSlide 已经 useCallback 空 deps
  // 稳定 identity。useCallback([post.id, registerSlide]) 锁住 ref 函数 identity，
  // 同一条 slide 多次 re-render 不再触发 React 的 detach/attach。
  const slideRef = useCallback(
    (node: HTMLDivElement | null) => {
      registerSlide(post.id, node);
    },
    [post.id, registerSlide],
  );
  // 走查 2026-05-18 第四轮 R1：原 IIFE 在 slide overlay 里裸调
  // stripToolCallSyntax(post.text ?? "") + cleanText===post.title 比较，每次
  // ChannelFeedSlide re-render（即便 memo'd，post 在 like / favorite / follow /
  // viewCount tick / decorations refetch 时都换 identity → setQueryData 那条
  // clone 路径）都跑一遍 — 4 个 regex replace + 1 个 CoT-detection long regex。
  // 跟同文件 R9 DesktopThreadCommentCard / R10 DesktopCommentThreadReplies / R11
  // PostReferenceCard 的 useMemo([text]) 模板对齐；post.title 也吃进 deps —
  // title 极少变（一帖一生），含进去也不引发额外重算。
  const slideBodyText = useMemo(() => {
    const cleanText = stripToolCallSyntax(post.text ?? "");
    if (!cleanText || cleanText === post.title) {
      return null;
    }
    return cleanText;
  }, [post.text, post.title]);
  return (
    <div
      ref={slideRef}
      data-post-id={post.id}
      // 走查 2026-05-19 第九轮 R2：视频号桌面工作区一次性渲 20 张 slide 全挂在
      // 同一 snap-scroll 容器里 — 每张 slide 内有 5-6 个 focusable（作者按钮 +
      // 关注按钮 + 点赞 / 评论 / 转发 / 收藏 4 颗 action 按钮）。snap-mandatory
      // 视觉上一次只显示 active slide，但 DOM 里其它 19 张 slide 的 ~95 颗按钮
      // 全在 sequential Tab 序里。键盘用户从顶栏 section tabs Tab 进 slide 区
      // 后要按 95 次 Tab 才能到达底下 FeedNavArrows（实测 100+ 次到下一个 modal
      // 触发区），screen reader 同款痛 — virtual cursor 顺 DOM 念过去要听完几
      // 十张 offscreen 卡的"作者名 + 关注按钮 + 当前 N 赞..."才到当前可见 slide。
      // inert 是 HTML 标准 attr（React 19 原生支持作为 boolean prop），让整个子
      // 树退出 Tab 序 + SR / pointer interaction —— 当前 active slide
      // inert=false，其它 19 张 inert=true。snap-mandatory + IntersectionObserver
      // 协同：用户 scroll 到下一张 → IO 切 selectedPostId → isActive 翻转 →
      // inert 自动跟着转。pointer 边界：mid-scroll 部分可见的相邻 slide 一帧内
      // 仍 inert（点击 dead），但 snap 完成后立刻可用；视频号每条 800px+ 高度
      // 让"两条都半露"窗口仅 100-200ms，UX 影响可忽略。
      inert={!isActive}
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
                // 走查 2026-05-19 第十一轮 R2：作者按钮按下立即开 ChannelAuthor
                // Overlay (role=dialog) —— 同 chat / share 按钮一道补
                // aria-haspopup="dialog" 让 SR 念出"作者名 button has popup
                // dialog"，盲用用户预期到下一步是 modal 打开。
                aria-haspopup="dialog"
                // 走查 2026-05-19 第十五轮 R3：跟同 slide 的 chat 按钮（L2094
                // commentDrawerOpen 挂 aria-expanded） 模式对齐 — disclosure 按
                // 钮挂 aria-haspopup 必须配 aria-expanded 让 SR 知道 popup 当前是
                // 开/关。author overlay 打开时（且当前 slide 的 author 匹配 overlay
                // 的 routeSelectedAuthorId）汇报 expanded=true；其它情况 false。
                // 单纯挂 aria-haspopup 不挂 expanded 是 WAI-ARIA disclosure 不完整
                // 实现，SR 用户听到"... button has popup dialog"但不知道 dialog 当
                // 前在不在屏。
                aria-expanded={authorOverlayOpenForThisAuthor}
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
            {slideBodyText ? (
              // 视频号 audio post 后端常把 title 和 text 都填成 "X·音乐"，标题和
              // 正文重复出现没意义；slideBodyText useMemo（同 slide 顶部）已经把
              // "cleanText===title" 的情况返回 null，本节点只负责显隐渲染。
              <div className="mt-2 line-clamp-3 text-[13px] leading-6 text-white/82">
                {slideBodyText}
              </div>
            ) : null}
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
            // 走查 2026-05-19 第七轮 R2：desktop slide overlay 的点赞 ThumbsUp
            // 历来 outline-only，仅靠 ChannelActionButton 的 border / text 色变
            // 表达 active —— 但同款修复早在 mobile（channels-page L4352-4357）和
            // desktop 的 Bookmark（同文件 L1791-1794，R1 2026-05-17）都改成
            // fill-current 实心反馈了。desktop ThumbsUp 漏掉同款，跟 favorite
            // 视觉变体不一致，且夜色 slide overlay 上 outline icon 的绿色描边线
            // 跟未点赞态白边在 1.5px stroke 下区分度极弱，用户点完赞肉眼几乎判
            // 不出"已点赞"。补 fill-current 跟 mobile / desktop favorite 对齐。
            icon={
              <ThumbsUp
                size={18}
                className={
                  post.ownerState?.hasLiked ? "fill-current" : undefined
                }
              />
            }
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
            // R2：drawer 打开时按钮的语义动作翻成"关闭评论"；aria-expanded /
            // aria-haspopup="dialog" 让 SR 知道这个按钮控制一个 dialog disclosure。
            ariaLabel={
              commentDrawerOpen
                ? t(msg`关闭评论，当前 ${post.commentCount} 条`)
                : t(msg`打开评论，当前 ${post.commentCount} 条`)
            }
            ariaExpanded={commentDrawerOpen}
            ariaHasPopup="dialog"
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
            // R2：转发按钮按下立即开 ChannelsForwardPicker (role=dialog) ——
            // aria-haspopup="dialog" 让 SR 念出 "转发到聊天 button has popup
            // dialog"，盲用用户预期到下一步是 modal 而不是直接发送或导航。
            ariaHasPopup="dialog"
            // R7（第十五轮）：跟 chat / avatar 同 disclosure 模式 — picker 打开
            // 时该 slide 的 share 按钮汇报 expanded=true。其它 slide 恒 false。
            ariaExpanded={sharePickerOpenForThisPost}
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
  commentsErrorActionLabel,
  onCommentsErrorAction,
  commentsLoading,
  draft,
  likePendingCommentId,
  replyTarget,
  selectedPost,
  submitPending,
  trapTopmost = true,
  onCancelReply,
  onClose,
  onDraftChange,
  onLikeComment,
  onReplyToComment,
  onSubmit,
}: {
  comments: FeedComment[];
  commentsErrorMessage?: string | null;
  commentsErrorActionLabel?: string;
  onCommentsErrorAction?: () => void;
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
  // 走查 2026-05-19 第十一轮 R1：true=drawer 是当前最顶层 modal，focus trap
  // 正常工作。false=author overlay / forward picker 浮在上方，drawer 让出
  // Tab 不抢焦点，避免三层 modal 互相把焦点拉出彼此。
  trapTopmost?: boolean;
  onCancelReply: () => void;
  onClose: () => void;
  onDraftChange: (value: string) => void;
  onLikeComment: (comment: FeedComment) => void;
  onReplyToComment: (comment: FeedComment) => void;
  onSubmit: () => void;
}) {
  const t = useRuntimeTranslator();
  // 走查 2026-05-18 新会话 R7：drawer 视觉上是 modal 浮层（pointer-events-auto
  // 卡 + Esc 关），但裸 <div> 没有 dialog 语义。R7 已补 role="dialog" + aria-
  // modal="true" + aria-labelledby。
  //
  // 走查 2026-05-19 第七轮 R5：把 R7 deferred 的 focus restore + Tab trap 补
  // 上。drawer 内有 ~10+ focusable（关闭 X / 评论卡每张赞+回复 / 「楼中楼」
  // 展开/收起 / textarea / 发送），原来 Tab 越过最后一个 focusable 会漏到底
  // 层 slide 上的 ChannelActionButton / 作者头像，违反 modal Tab 应循环的语
  // 义；同款 ChannelsForwardPicker R1 / ChannelAuthorOverlay 第五轮 R4-R5 已
  // 经做过同套修法，drawer 一直漏。
  //
  // 1) previouslyFocusedRef 记下打开瞬间的焦点（典型场景：用户点 slide 上的
  //    chat 图标按钮触发 onToggleCommentDrawer，那颗按钮就是 prev focus），
  //    drawer 离场时 rAF 等 React commit 落定后归还。
  // 2) Tab cycling trap：监听 document keydown，焦点漏到 dialog 外时拉回；
  //    在首尾循环。Shift+Tab 同款。
  //
  // 走查 2026-05-19 第七轮 R6：focus 归还走 preventScroll:true —— drawer 会被
  // workspace 的 L427-431 effect 在 selectedPost?.id 改变时自动关掉（用户鼠标
  // 滚轮滚到新 slide 触发 IntersectionObserver setSelectedPostId）。auto-close
  // 时 prev focus 仍然指向打开 drawer 的"旧 slide chat-icon 按钮"，该按钮已经
  // 滚出视口；裸 .focus() 默认 scrollIntoView 会把页面甩回旧 slide，用户体感
  // "我刚刚明明滚到下一条，怎么自己又跳回去了"。preventScroll 让 viewport 保持
  // 在用户滚到的位置；focus 设到 hidden 元素本身仍然 a11y-correct（Tab 继续从
  // 那里前进，DOM 顺序最终走到当前可见 slide 的 focusable）。
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (typeof document === "undefined") return;
    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement &&
      document.activeElement !== document.body
        ? document.activeElement
        : null;
    // 走查 2026-05-19 桌面端 R1（第十二轮）：drawer 打开时焦点完全没移进 dialog —
    // DesktopChannelCommentsPanel 内有一条 [cannotInteract,selectedPostId,replyTarget]
    // effect 在 cannotInteract=false 时把焦点 rAF 落到 input 上（L2941-2947），
    // 但 cannotInteract=true（推荐流非好友帖，yuanzui0728 库里 80%+ 是 audio
    // canInteract=false 占大多数）时 input 是 disabled，那条 effect 早返不动。
    // 结果焦点停在打开 drawer 的"chat 图标"button 上 —— 该 button 现在被 z-30
    // drawer 视觉覆盖，键盘用户按 Tab 走的是 sequential focus 不在 dialog 内 —
    // trap 的 fallback 路径 (L2244-2248) 会兜一次 first.focus()，但 *第一次 Tab*
    // 前焦点没在 dialog 里，SR 用户的 dialog 上下文也丢了（aria-modal=true 在
    // <div> 上浏览器不自动迁焦点）。
    // 同款 ChannelAuthorOverlay R6（L2399-2424）早就做了"open 同帧 rAF 后 focus
    // 首 focusable"，drawer 一直漏。模板对齐：rAF 等 React commit 落定 + 入场
    // 动画/Suspense fallback 渲完 → focus dialog 内首 focusable（cannotInteract
    // 时 input disabled 跳过，落到关闭 X 按钮，符合 modal 退出 affordance 语义）；
    // 极端无 focusable 时 fall back 到 dialog 本身（tabIndex=-1 已挂）。
    // preventScroll：snap-y 容器 scrollTop 是当前 slide offset，让浏览器自动 scroll
    // into view 会甩页面跳一下；focus 设到 hidden 元素本身仍然 a11y-correct。
    const focusTimer = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      // canInteract=true 时 DesktopChannelCommentsPanel 内部的另一条 rAF 已经把
      // 焦点送到 input 上（L2941-2947 effect），子组件 effect 先 fire → rAF 队列
      // 里 input.focus 排前；这条 drawer 兜底 rAF 早返避免覆盖。cannotInteract
      // 时 input disabled 那条 effect 早返不动 → 这里兜到 close X 按钮（第一个
      // 非 disabled button）。
      if (dialog.contains(document.activeElement)) return;
      const firstFocusable = dialog.querySelector<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (firstFocusable) firstFocusable.focus({ preventScroll: true });
      else dialog.focus({ preventScroll: true });
    });
    return () => {
      window.cancelAnimationFrame(focusTimer);
      const prev = previouslyFocusedRef.current;
      previouslyFocusedRef.current = null;
      if (!prev || !document.contains(prev)) return;
      // 走查 2026-05-19 桌面端第十三轮 R2：drawer 关闭后焦点归还路径漏了 inert
      // 边界。drawer 关闭原因有 3 条：
      //   (a) 用户主动关（X / Esc）—— prev = 同 slide 的 chat-icon button，
      //       slide 仍 active 不 inert，焦点归还成功。
      //   (b) baseUrl 切换 workspace reset —— 整个 workspace 状态全清，prev 可能
      //       已 unmount，document.contains 兜住。
      //   (c) 用户用鼠标滚轮 / scroll 把视口滚到下一张 → IO setSelectedPostId →
      //       L447 effect 把 commentDrawerPostId 翻 null 触发 drawer auto-close。
      //       此时 prev（旧 slide 上的 chat-icon）还在 DOM 内，但旧 slide 因
      //       isActive=false 拿到 inert=true（L1925），整个 subtree 退出可聚焦
      //       序。.focus() 在 inert 内部元素上是 no-op，activeElement 落到 body。
      //       CDP 实测 100% 复现：drawer 开着 → scrollTop=scrollHeight → 1.5s 后
      //       activeElement.tagName === "BODY"。
      // 键盘用户在这个路径下"刚滚到下一张"立刻失去 focus 上下文：Tab 走 sequential
      // 顺序 → 从 document 头顶部 section tabs 开始，跟视觉位置脱节，必须按多次
      // Tab 才能回到当前可见的 slide。
      // 修法：cleanup 走 inert ancestor 检测，命中时把焦点改投给当前 active slide
      // 内的同款 chat-icon button（按 DOM 顺序的第二个 [aria-haspopup="dialog"]
      // 按钮 —— 第一个是作者头像 overlay 触发器，第二个是评论 drawer 触发器，
      // 第三个是 share picker 触发器，结构在每张 slide 里稳定）。命中失败兜回原
      // 行为（让浏览器自然落到 body / 下一个 sequential focusable）—— 不比当前
      // 差。
      let cursor: HTMLElement | null = prev;
      let prevIsInert = false;
      while (cursor) {
        if (cursor.hasAttribute("inert")) {
          prevIsInert = true;
          break;
        }
        cursor = cursor.parentElement;
      }
      if (prevIsInert) {
        // 当前 active slide 的 chat-icon button（结构索引 [1]，evergreen）。
        const activeSlide = document.querySelector<HTMLElement>(
          '[data-post-id]:not([inert])',
        );
        const dialogTriggers = activeSlide?.querySelectorAll<HTMLElement>(
          'button[aria-haspopup="dialog"]',
        );
        const newChatTrigger = dialogTriggers?.[1] ?? null;
        if (newChatTrigger) {
          window.requestAnimationFrame(() =>
            newChatTrigger.focus({ preventScroll: true }),
          );
        }
        return;
      }
      window.requestAnimationFrame(() =>
        prev.focus({ preventScroll: true }),
      );
    };
  }, []);
  // R1：trapTopmost 走 latest-ref 避免 effect deps 把 listener 每次都拆装 ——
  // open/close 切换栈顶状态时 handler 直接读最新 ref 即可。
  const trapTopmostRef = useRef(trapTopmost);
  trapTopmostRef.current = trapTopmost;
  useEffect(() => {
    if (typeof document === "undefined") return;
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      // R1：上层 modal 打开时让出 Tab，避免抢上层 modal 的焦点。
      if (!trapTopmostRef.current) return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (!active || !dialog.contains(active)) {
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
  }, []);
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center px-6">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="channels-comments-drawer-title"
        // R5 续：tabIndex=-1 让 dialog 自身可程序聚焦但不在 sequential Tab 序
        // 列里 —— focus trap 兜底：极端无 focusable child 时也能把焦点拉进来
        // 不漏。
        tabIndex={-1}
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
            // 走查 2026-05-18 新会话 R11：跟 desktop workspace R8 / live-companion
            // R9 / forward-picker R10 同款 — drawer 内部的 commentsErrorMessage
            // ErrorBlock 也是裸 <div> 没 role。用户点开 drawer 时若 listFeedComments
            // / commentMutation / likeCommentMutation 错（公网隧道断 / 服务端 500）
            // SR 用户只看到 drawer 标题"评论 N"但听不到"评论读取失败"，体感「评
            // 论怎么不出来」。挂 role="alert" 立即播报错误。
            //
            // 走查 2026-05-19 第八轮 R1：mobile sheet 早就有「重试读取评论 / 重
            // 试评论点赞 / 重试发送评论 / 重试回复评论」按钮 (channels-page.tsx
            // L1694-1739)，desktop drawer 一直只渲红条没 retry 入口 — 用户在
            // yuanzui0728 那条 142 条评论 post 公网隧道断了之后只能关 drawer /
            // 切 slide / 刷整页才能再触发请求。把父级算好的 retry action 拼到
            // ErrorBlock 下面；undefined 时按原行为不渲按钮（向后兼容）。
            <div className="mt-3" role="alert">
              <ErrorBlock message={commentsErrorMessage}>
                {commentsErrorActionLabel && onCommentsErrorAction ? (
                  <div className="mt-2 flex">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={onCommentsErrorAction}
                      className="rounded-full bg-white"
                    >
                      <RefreshCcw size={13} />
                      {commentsErrorActionLabel}
                    </Button>
                  </div>
                ) : null}
              </ErrorBlock>
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
  trapTopmost = true,
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
  // 走查 2026-05-19 第十一轮 R1：true=author overlay 是当前最顶层 modal。
  // false=forward picker 浮在上方，author 让出 Tab 不抢 picker 的焦点。
  trapTopmost?: boolean;
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
  //
  // 走查 2026-05-19 第五轮 R4：a11y modal 关闭归还焦点漏掉了。author overlay
  // 视觉上是 modal 但没有 focus 管理 —— 用户点 slide 头部作者按钮 → overlay
  // 打开 → 看完关掉（Esc / 「回到内容」/ backdrop 点击）→ focus 落到 body
  // （overlay 内 button 被卸载或 backdrop button 一闪即逝），SR / 键盘用户失
  // 去位置。同款 ChannelsForwardPicker 早就（line 161-195）做了「打开瞬间钉
  // 住 activeElement，关闭时 rAF 归还」的 focus-restore；author-overlay 一直
  // 漏。补一份精简版（不挂 focus trap—— overlay 内 Tab 顺序 backdrop button
  // → 「回到内容」/「+关注」/ recent posts 列表 → 实际焦点不容易漏出 modal，
  // 留到后续 round 处理）。
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (typeof document === "undefined") return;
    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement &&
      document.activeElement !== document.body
        ? document.activeElement
        : null;
    // 走查 2026-05-19 第八轮 R6：原 effect 里 L2143 注释明确写「不挂 focus
    // trap... 留到后续 round 处理」——其实 trap 在第五轮 R5 已经做了 (下方
    // useEffect)，但**打开 modal 时主动把焦点移进 dialog 内**一直漏。同款
    // ChannelsForwardPicker 早就（forward-picker L176-184）在 open 时 rAF 后
    // .focus() 到「取消」按钮。author overlay 一直只「记录 prev focus + 关闭
    // 时归还」，没在 open 时移焦进 dialog。
    // 后果：键盘用户点 slide 头部作者头像按钮 (Enter) 打开 overlay 后焦点仍
    // 停在那个按钮上（现在被 z-40 overlay 视觉覆盖）。第一次 Tab 走 sequential
    // 顺序 —— 焦点在原按钮，DOM 顺序下一个 focusable 可能是 slide 内的「+关
    // 注」/ comment 按钮 / nav arrow / drawer focusable —— 都还在 dialog
    // 外面，trap 兜底拉回 dialog 首元素。"先 Tab 一次才进 modal"对盲用户/键
    // 盘用户来说是额外认知负担，且 SR 阅读 modal 内容的连贯性被打断。
    // 修法：open 同帧 rAF 后把焦点 .focus() 到 dialog 首 focusable
    //（DesktopChannelAuthorPanel 顶部的「回到内容」Button —— overlay 的标准
    // 退出 affordance，对齐 picker 上焦点初始落到「取消」的语义）。rAF 等到
    // overlay 入场动画 + Suspense fallback 渲染稳定后再调，避免 focus 落到
    // 将被卸载元素。
    const focusTimer = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      const firstFocusable = dialog.querySelector<HTMLButtonElement>(
        "button:not([disabled])",
      );
      if (firstFocusable) firstFocusable.focus({ preventScroll: true });
      else dialog.focus({ preventScroll: true });
    });
    return () => {
      window.cancelAnimationFrame(focusTimer);
      const prev = previouslyFocusedRef.current;
      previouslyFocusedRef.current = null;
      if (!prev || !document.contains(prev)) return;
      // rAF 等到 overlay unmount commit 落定 — 同 frame 调 .focus() 时浏览器
      // 偶发把焦点丢到 body（commit 还在跑 cleanup）。
      //
      // 走查 2026-05-19 第七轮 R6：preventScroll:true —— 用户在 overlay 内点
      // recent posts 列表里的"非当前"post 时，URL 改 postId 让 workspace
      // selectedPostId 变化、L508-529 scrolledRouteIdRef effect 把视口滚到新
      // slide，但 overlay 仍打开（authorId 没动）。等用户最终关 overlay 时
      // prev 仍指向"原始"slide 的作者按钮 —— 那条 slide 早就滚出视口。裸
      // .focus() 默认 scrollIntoView 会把页面甩回去。preventScroll 让 view
      // port 保持在新 slide 不抖；focus 仍 a11y-correct。
      //
      // 走查 2026-05-19 桌面端第十三轮 R3：与 ChannelCommentsDrawer R2 同款的
      // inert 失焦边角。author overlay 的 auto-close 路径：用户在 slide A 上点
      // 头像打开 overlay（author=X），滚到 slide B 上属于 author=Y 的内容 →
      // channels-page syncedRouteSelectedAuthorId 比 desktopSelectedPost.authorId
      // !== routeSelectedAuthorId 落 undefined → URL author= 被抹掉 → routeSel
      // ectedAuthorId=null → authorPanelVisible 翻 false → ChannelAuthorOverlay
      // unmount → cleanup 跑 → prev = slide A 的作者头像 button。但 A 此刻
      // 已经 inert=true（L1925 跟 isActive 联动），.focus() no-op，activeElement
      // 落 body。键盘用户失去 a11y 上下文。
      // 同款修法：检测 prev 是否在 inert 子树，命中时 fall back 到当前 active
      // slide 的作者头像 button（DOM 顺序 [0] 个 [aria-haspopup="dialog"] —— 第
      // 一个是 author overlay 触发器，第二个是 chat-icon，第三个是 share）。
      let cursor: HTMLElement | null = prev;
      let prevIsInert = false;
      while (cursor) {
        if (cursor.hasAttribute("inert")) {
          prevIsInert = true;
          break;
        }
        cursor = cursor.parentElement;
      }
      if (prevIsInert) {
        const activeSlide = document.querySelector<HTMLElement>(
          '[data-post-id]:not([inert])',
        );
        const dialogTriggers = activeSlide?.querySelectorAll<HTMLElement>(
          'button[aria-haspopup="dialog"]',
        );
        const newAuthorTrigger = dialogTriggers?.[0] ?? null;
        if (newAuthorTrigger) {
          window.requestAnimationFrame(() =>
            newAuthorTrigger.focus({ preventScroll: true }),
          );
        }
        return;
      }
      window.requestAnimationFrame(() =>
        prev.focus({ preventScroll: true }),
      );
    };
  }, []);
  // 走查 2026-05-19 第五轮 R5：focus trap — author overlay 视觉上 modal 但
  // aria-modal=true 在 <div> 上浏览器不自动 trap focus（只有 <dialog>.showModal()
  // 才行）。用户 Tab 过 8 个 focusable（backdrop close 按钮 → 「回到内容」→
  // 「+关注」→ recent posts × 5）后下一次 Tab 漏到 modal 外的 header section
  // tabs / refresh / 直播伴侣按钮上（虽然视觉被 0.55 backdrop 半盖但仍可聚焦），
  // 键盘用户体感"我刚刚在 modal 里怎么 Tab 跳到顶部去了"。同款 ChannelsForward
  // Picker 早就（L198-229）做了 Tab cycling，author-overlay 一直漏。
  // R1：trapTopmost 走 latest-ref 让 picker 开关切换栈顶状态时不需要重装
  // listener；handler 内部 bail 即可。
  const trapTopmostRef = useRef(trapTopmost);
  trapTopmostRef.current = trapTopmost;
  useEffect(() => {
    if (typeof document === "undefined") return;
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      // R1：picker 浮在 author 之上时让出 Tab，避免抢 picker 内的焦点。
      if (!trapTopmostRef.current) return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      // 焦点已经飘出 dialog（用户 Tab 跑出 modal）→ Tab 一次拉回 dialog 内首
      // 元素；Shift+Tab 拉到末元素。
      if (!active || !dialog.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      // 在 dialog 内部，处理首尾循环。
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
  }, []);
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[rgba(0,0,0,0.55)] p-8 backdrop-blur-sm">
      {/* 走查 2026-05-19 第八轮 R5：和姊妹 R101-R104 同款 — backdrop <button>
          (absolute inset-0) 视觉不可见、纯 mouse"点击背景关闭"affordance，但
          DOM 顺序排在 dialog 子树第一位 + 没有 tabIndex={-1}。用户在视频号
          slide 点作者头像打开 overlay 后，第一次 Tab 焦点不是落到 dialog 内
          的「回到内容」/recent posts，而是先到这张不可见 backdrop；按 Enter
          会立刻关 overlay 体感"我刚刚 Tab 一下怎么 modal 没了"。同款问题在
          ChannelsForwardPicker 同 round 修，本节修 author overlay。 */}
      <button
        type="button"
        tabIndex={-1}
        aria-label={t(msg`关闭作者主页`)}
        onClick={onClose}
        className="absolute inset-0"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="channels-author-overlay-title"
        // tabIndex=-1 让 dialog 自身可程序聚焦但不在 sequential Tab 序列里 ——
        // focus trap 兜底：极端无 focusable child 时也能把焦点拉进来不漏。
        tabIndex={-1}
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
  // 走查 2026-05-19 第十五轮 R4：原 recent posts list 里每条 button 都用 IIFE
  // 调 stripToolCallSyntax(post.text ?? "")（L2906-2920）每帧重跑 — 4 个 regex
  // replace + 1 个 CoT-detection long regex × 5 张 button = 5 次/帧。
  // 触发场景：用户在 author overlay 打开期间滚 main feed slide →
  // IntersectionObserver setSelectedPostId → DesktopChannelsWorkspace re-render
  // → ChannelAuthorOverlay re-render（不是 memo'd）→ DesktopChannelAuthorPanel
  // re-render → 5 × stripToolCallSyntax 全跑一次。yuanzui0728 测试库小，但实
  // 测用户在 author overlay 内浏览作者最近 5 条同时滚 main slide 时单秒能触发
  // 8-10 帧 re-render（IO + onSelectedPostChange echo + URL hash 同步），等于
  // 40-50 次/秒纯浪费的 regex。
  // 同 DesktopThreadCommentCard R9 / DesktopCommentThreadReplies R10 已经成
  // 熟的 useMemo([text]) 模板，但本场景是 5 张 button 共用 — 用 Map 把所有
  // post.id → cleanText 一次性算好，单帧只重算"post.text 真变了"那一条。
  // recentPosts 在 author profile refetch 才换 identity（profile.recentPosts
  // 新 array），单 author overlay 生命周期内通常稳定 → map 重算非常稀。
  const cleanTextByRecentPostId = useMemo(() => {
    const map = new Map<string, string>();
    recentPosts.forEach((post) => {
      map.set(post.id, stripToolCallSyntax(post.text ?? ""));
    });
    return map;
  }, [recentPosts]);
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
          {/* R5：作者 overlay 打开时 SR 进入 modal 没听到 "正在读取作者主页"
              loading 反馈。挂 role="status" 让 SR 知道 modal 在等数据。 */}
          <LoadingBlock role="status" label={t(msg`正在读取作者主页...`)} />
        </div>
      ) : null}

      {errorMessage ? (
        // 走查 2026-05-18 新会话 R12：DesktopChannelAuthorPanel 作者主页加载失败时
        // 渲 ErrorBlock，跟前面 R8/R9/R11 同款无 role。盲用用户在视频号点头像
        // 打开作者 overlay，若 getChannelAuthorProfile 失败（404 / 角色被删 /
        // server 错），只看到 backdrop 全黑 + 上方"作者主页"标题，听不到为什么
        // 资料没出来。挂 role="alert" 立刻播报错误内容（CHARACTER_NOT_FOUND /
        // 网络错等技术原因），让用户清楚是临时错误还是这位作者已不在。
        <div className="mt-4" role="alert">
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
                    // 走查 2026-05-19 第十五轮 R2：recent posts 列表里 selectedPostId
                    // === post.id 的那条 button 历来只有"视觉高亮"（左 3px 绿色 inset
                    // border + 浅色背景）+ button 内 meta 行末尾追加 "· 当前内容" 绿
                    // 字。SR 用户 Tab 过 5 张 recent posts 时听到的是
                    // "{title} {kind} {timestamp} · {meta} · 当前内容 button" —— 必
                    // 须扫完整段 button label 才能知道哪条是 current，盲用用户在 5
                    // 条 button 间识别"我现在看的是哪条"得记很长的尾巴。同 codebase
                    // 早就给 desktop-chat-workspace 的会话列表 / desktop-create-group
                    // -dialog focused row / official-message-entry-row 挂了 aria-current
                    // (commit 678/715 等)，author overlay 这条 5 条列表一直漏。
                    // aria-current="true" 让 SR 在 button 名读完前就附加 "current" 语
                    // 义，对齐姊妹组件；可视用户视觉高亮不动。aria-current 是 ARIA
                    // 1.1 标准属性，跟 onClick={() => openPost(...)} 正交（点击仍跳同
                    // 一条 post 是 idempotent，不影响功能正确）。
                    aria-current={selectedPostId === post.id ? "true" : undefined}
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
                        {/*
                          走查 2026-05-19 第七轮 R3：原来只分 "直播回放" / "视频"
                          / "动态" 三类，audio (mediaType="audio") 跟 image
                          (mediaType="image") 跟 text 全落到 "动态" 通用文案。
                          mobile MobileChannelsCard L4586-4592 早就分了 短片 /
                          音乐 / 图集 / 内容卡片 四档。yuanzui0728 库里推荐流 80%
                          是 audio 帖（minimax generate 走 audio path），作者主
                          页 recent posts 一栏全标 "动态"，体感"看不出这条是听
                          的还是看的"。desktop 对齐 mobile 的 4 档划分，audio →
                          "音乐"、image → "图集"、其它（含 text）→ "动态"；
                          live_clip 仍最高优先级保持。
                        */}
                        {post.sourceKind === "live_clip"
                          ? t(msg`直播回放`)
                          : post.mediaType === "video"
                            ? t(msg`视频`)
                            : post.mediaType === "audio"
                              ? t(msg`音乐`)
                              : post.mediaType === "image"
                                ? t(msg`图集`)
                                : t(msg`动态`)}
                      </span>
                    </div>
                    {(() => {
                      // audio post 后端常把 title 和 text 都填成 "X·音乐"，
                      // recent posts list 里 title 已经在上面渲染了一遍，再渲染
                      // 一遍 text 就是重复——和 slide overlay / mobile card 那两处
                      // 一样处理。
                      // R4: cleanText 走父级 useMemo 算好的 Map（避免每帧滚 slide
                      // 触发 panel re-render 时 5 张 button 全跑 regex）。
                      const cleanText = cleanTextByRecentPostId.get(post.id) ?? "";
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
  // 走查 2026-05-19 第七轮 R1：onLikeComment / onReplyToComment 从 channels-page
  // 一路是内联箭头透下来——父组件每次 re-render（commentDrafts setState 等）
  // 都换 identity。配合下方 DesktopThreadCommentCard / DesktopCommentThreadReplies
  // 的 memo（同 R1 一起加）才能真正断流：稳定 identity 让 memo shallow-compare
  // 命中，pure typing 不会再 cascade 142 张卡 reconciliation。latest-ref 模式
  // 同 workspace 顶部 handlerRefs / onSelectedPostChangeRef / onCloseAuthorRef。
  const onLikeCommentRef = useRef(onLikeComment);
  onLikeCommentRef.current = onLikeComment;
  const stableOnLikeComment = useCallback((comment: FeedComment) => {
    onLikeCommentRef.current(comment);
  }, []);
  const onReplyToCommentRef = useRef(onReplyToComment);
  onReplyToCommentRef.current = onReplyToComment;
  const stableOnReplyToComment = useCallback((comment: FeedComment) => {
    onReplyToCommentRef.current(comment);
  }, []);
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

  // R1 续：updateCollapsedThreadIds 原来是裸 function 声明，每次 panel
  // re-render 都换 identity——下面用它构造 DesktopCommentThreadReplies 的
  // onToggleCollapsed 内联箭头同样跟着每帧换，破 memo。useCallback 锁到
  // [selectedPostId, threadIdsWithReplies]（这俩在 typing 期间 stable）。
  const updateCollapsedThreadIds = useCallback(
    (updater: string[] | ((current: string[]) => string[])) => {
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
    },
    [selectedPostId, threadIdsWithReplies],
  );
  // R1 续：把 thread-collapse toggle 拍成稳定回调（接 rootCommentId 当参数）
  // 避免每条 thread 渲一个 fresh 箭头给 DesktopCommentThreadReplies。
  const onToggleCollapsedById = useCallback(
    (rootCommentId: string) => {
      updateCollapsedThreadIds((current) =>
        current.includes(rootCommentId)
          ? current.filter((threadId) => threadId !== rootCommentId)
          : [...current, rootCommentId],
      );
    },
    [updateCollapsedThreadIds],
  );

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
        // 走查 2026-05-18 第二轮 R7：同 R5 / R6 同款 — 评论 drawer 内 "正在读
        // 取评论..." loading 卡裸 <div>，SR 用户打开 drawer 时只听到 dialog
        // 标题 "评论 N"，然后听不到 loading 反馈。yuanzui0728 那条积了 142 条
        // 评论的 post 公网隧道 500-800ms 全量 listFeedComments，SR 用户体感
        // "drawer 打开了但里面空着"。挂 role="status" + aria-live=polite 让 SR
        // 知道在等评论数据。
        <div
          role="status"
          className="rounded-[14px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-4 py-4 text-xs leading-6 text-[color:var(--text-muted)]"
        >
          {t(msg`正在读取评论...`)}
        </div>
      ) : null}
      {/*
        走查 2026-05-17 R5：原条件只看 !commentsLoading && !comments.length，
        commentsErrorMessage 设值时（ChannelCommentsDrawer 顶部已经渲了红色
        ErrorBlock），这条空态卡也会同时冒出来。用户既看到错误又看到「还没
        有评论」，矛盾且会让人以为真的没人评论（同移动端 R1 修复同款问题）。

        走查 2026-05-19 第八轮 R2：空态条件历来只看 `!comments.length` —— 但
        renderableComments 的 stripToolCallSyntax 过滤会把"纯 AI thinking-prose"
        评论抠成空串（CoT detection > 80 字 + 第三人称"用户/我需要/let me..."），
        实测 yuanzui0728 库 eb9c88ce 帖有 1019 字 CoT 漏出全被过滤。当 raw comments
        全是 CoT prose（commentCount=5 但 renderableComments=[]）时：
          - drawer header 仍渲 "评论 5"
          - commentThreads.length=0 → 不渲 threads 块
          - !comments.length 是 false（comments.length=5）→ 不渲空态
          - 用户在 drawer 里看到「评论 5」但下面一片空白，textarea 显隐正常，
            体感「明明说有 5 条评论但一条都看不到」。
        改用 `!commentThreads.length` 当空态触发：renderableComments=[] 时也
        正确显示「这条内容还没有评论，你可以先开口」CTA 引导发评论。原 raw
        comments 含 CoT-prose 但 commentThreads 仍有内容时，CoT 卡被过滤掉
        但其它正常评论照常渲，空态不冒。
      */}
      {!commentsLoading && !commentThreads.length && !commentsHasError ? (
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
                onLikeComment={stableOnLikeComment}
                onReplyToComment={stableOnReplyToComment}
              />
              {replies.length ? (
                <DesktopCommentThreadReplies
                  cannotInteract={cannotInteract}
                  collapsed={collapsedThreadIds.includes(rootComment.id)}
                  replies={replies}
                  replyTarget={replyTarget}
                  rootCommentId={rootComment.id}
                  commentAuthorNameMap={commentAuthorNameMap}
                  likePendingCommentId={likePendingCommentId}
                  onLikeComment={stableOnLikeComment}
                  onReplyToComment={stableOnReplyToComment}
                  onToggleCollapsedById={onToggleCollapsedById}
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
              // 走查 2026-05-18 第二轮 R12：原 visible label 只是 "取消"，SR 用
              // 户 Tab 到这里听到 "取消 button" 无上下文 — 取消啥？同一 drawer
              // 内还有顶部"关闭评论" X 按钮、textarea、发送按钮，多个 cancel-
              // adjacent 控件让 SR 用户得回头读前面那条 "正在回复 X" chip 才
              // 能拼出语义。aria-label 显式带回作者名："取消回复 X" 把语境闭
              // 合在一个 ARIA 节点里，盲用用户 Tab 立刻就知道做什么。
              aria-label={t(msg`取消回复 ${replyTarget.authorName}`)}
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

// 走查 2026-05-19 第七轮 R1：memo 包住，配合 DesktopChannelCommentsPanel 内的
// stableOnLikeComment / stableOnReplyToComment / onToggleCollapsedById 全套稳
// 定 identity——typing 期间 commentDrafts setState 不再 cascade 142 张 thread
// 包装层的 reconciliation。collapsed / replyTarget 等真正变化的 prop 仍会让
// memo 失效让该重渲的 thread 重渲。
const DesktopCommentThreadReplies = memo(function DesktopCommentThreadReplies({
  cannotInteract,
  collapsed,
  commentAuthorNameMap,
  likePendingCommentId,
  onLikeComment,
  onReplyToComment,
  onToggleCollapsedById,
  replies,
  replyTarget,
  rootCommentId,
}: {
  cannotInteract: boolean;
  collapsed: boolean;
  commentAuthorNameMap: Map<string, string>;
  likePendingCommentId: string | null;
  onLikeComment: (comment: FeedComment) => void;
  onReplyToComment: (comment: FeedComment) => void;
  // R1：从父级接 stable 回调 + 自己的 rootCommentId，避免每渲一帧给本组件 fresh
  // 内联 onToggleCollapsed 箭头破 memo。
  onToggleCollapsedById: (rootCommentId: string) => void;
  replies: FeedComment[];
  replyTarget: {
    authorId: string;
    authorName: string;
    commentId: string;
    postId: string;
  } | null;
  rootCommentId: string;
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
  //
  // 走查 2026-05-18 第二轮 R10：跟 R9 DesktopThreadCommentCard 同款热点 —
  // DesktopCommentThreadReplies 在 panel 内为每个有 replies 的 thread 渲一份，
  // panel 每帧 re-render（commentDrafts setState 等） 都跑 stripToolCallSyntax
  // 一次。yuanzui0728 库里活跃 thread 实测 ~20 条带 replies，drawer 打开期
  // 每帧 20 × regex（含 CoT-detection long regex）。8 字/秒打字时 160 次/秒。
  // useMemo([latestReplyText]) 锁住，只在 latestReply 真换（新 reply 落地）
  // 时重算。
  //
  // 走查 2026-05-19 第十一轮 R4：原 deps `[latestReply?.text]` 触发 react-hooks/
  // exhaustive-deps warning（rule 想要 latestReply 本体也在 deps 里，因为
  // 函数 body 用了 `latestReply ?` 当 gate）。先把 text 提取成变量再传给 memo
  // —— ESLint 看到 `latestReplyText` 闭包变量已经在 deps 里，rule 满意；语义
  // 等价（latestReply 仅用于 gate "是否有 reply"，text 是真实输入）。
  const latestReplyText = latestReply?.text ?? "";
  const latestReplyCleanText = useMemo(
    () => (latestReplyText ? stripToolCallSyntax(latestReplyText) : ""),
    [latestReplyText],
  );

  return (
    <div className="mt-3 rounded-[14px] border border-[rgba(7,193,96,0.12)] bg-white px-3 py-3">
      <button
        type="button"
        // 走查 2026-05-18 第二轮 R13："楼中楼" 折叠/展开按钮是经典的 disclosure
        // 模式，但原裸 <button> 没挂 aria-expanded。SR 用户听到 "楼中楼 / 展开 N
        // 条跟帖 button" / "楼中楼 / 收起 N 条跟帖 button"，靠 visible label 区分
        // 当前状态 — 但 label 写的是"动作意图"（下一步要做什么）而不是"当前
        // 状态"（现在是展开还是折叠的），盲用用户听到 "展开 5 条跟帖"会误以为
        // "下方已经展开了 5 条" 而事实上是反的（collapsed=true 时显示"展开"，意
        // 思是按下后会展开）。
        // 标准 WAI-ARIA accordion / disclosure pattern：aria-expanded={!collapsed}，
        // SR 念出 "楼中楼 button collapsed" / "楼中楼 button expanded"，状态语
        // 义清晰；visible 文字保持"展开/收起 N 条跟帖"的动作引导不动。
        aria-expanded={!collapsed}
        onClick={() => onToggleCollapsedById(rootCommentId)}
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
});

// 走查 2026-05-19 第七轮 R1：memo 包住单卡 —— 是 typing 期间的真热点（panel
// 内 142 张卡全 cascade）。配合 panel 内的 stableOnLikeComment /
// stableOnReplyToComment / 上面 R1 给 commentAuthorNameMap 的 useMemo 一起，
// pure typing 直接 shallow-compare 命中跳过整张卡 reconciliation。
const DesktopThreadCommentCard = memo(function DesktopThreadCommentCard({
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
  //
  // 走查 2026-05-18 第二轮 R9：原来裸调 stripToolCallSyntax(comment.text) 每次
  // re-render 都跑一遍 regex（4 个 replace + 1 个 long CoT-detection test）。
  // yuanzui0728 那条 post 积了 142 条评论，drawer 打开时面板里 142 张
  // DesktopThreadCommentCard 全部 mount —— DesktopChannelCommentsPanel 不是 memo'd
  // 且 onLikeComment / onReplyToComment 来自 channels-page 内联箭头（每帧换
  // identity），导致 panel 每次父帧 re-render（commentDrafts setState
  // / mutation 乐观更新 / focusEffect等）都 cascade 142 张卡的 render，每张卡
  // 都跑 1 次 stripToolCallSyntax —— 142 次 regex / 帧。
  // 实测用户在 drawer textarea 里按 8 字/秒打字，每个 keystroke 触发
  // setCommentDrafts → 142 × stripToolCallSyntax = 1136 次 regex/秒。CoT detection
  // 那条 80+ 字阈值的长 regex 在含中文 / 英文 prose 的 142 条评论上累计 ~10-20ms/
  // 帧，typing latency 在 yuanzui0728 库的 post 上肉眼可见。
  // 修法：useMemo([comment.text]) 锁住 cleanText，只在 comment.text 真变化时重
  // 算。同帧多次 re-render（commentDrafts 变 / mutation 乐观更新等）共享 memo。
  // 同款 hoist 也应用到 replyTargetName / replyToAuthorName lookup（commentAuthor
  // NameMap.get 是 cheap，但 deps 化也省一次比较）。但 cleanText 是热点，优先
  // 这条；replyTargetName 留 inline。
  const cleanText = useMemo(
    () => stripToolCallSyntax(comment.text),
    [comment.text],
  );

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
});

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
