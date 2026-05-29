import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { msg } from "@lingui/macro";
import {
  getFeedPost,
  type FeedComment,
  type FeedPostListItem,
} from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { DesktopFeedComposePanel } from "./desktop-feed-compose-panel";
import { DesktopFeedList } from "./desktop-feed-list";
import { DesktopFeedToolbar } from "./desktop-feed-toolbar";
import { type FeedCommentReplyTarget } from "./feed-types";
import {
  type MomentImageDraft,
  type MomentVideoDraft,
} from "../../moments/moment-compose-media";

type DesktopFeedWorkspaceProps = {
  canAddImages: boolean;
  canAddVideo: boolean;
  baseUrl?: string;
  commentDrafts: Record<string, string>;
  commentErrorMessage?: string | null;
  /** 走查 Round 4：单个 string|null 只能追最后一次 mutate 的 postId，桌面端
   *  并发提交时旧 row 的 loading 状态会被新 row 顶掉、按钮被解锁出现重复发
   *  送。改成 Set 让每条 row 各自检查自己的 postId 是否在飞。 */
  commentPendingPostIds: ReadonlySet<string>;
  composeErrorMessage?: string | null;
  createPending: boolean;
  errors?: string[];
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  /** fetchNextPage 失败后 react-query 留的标记；和移动端 isFetchNextPageError 一致。 */
  isFetchNextPageError?: boolean;
  imageDrafts: MomentImageDraft[];
  isLoading: boolean;
  likeErrorMessage?: string | null;
  /** Round 5：likeMutation 同样多 row 并发的坑，Set 让每条 row 各查各的。 */
  likePendingPostIds: ReadonlySet<string>;
  ownerAvatar?: string | null;
  ownerUsername?: string | null;
  posts: FeedPostListItem[];
  /** 后端给的 raw 条数（含被屏蔽过滤掉的）。posts.length=0 但 rawLoadedCount>0
   *  时区分「真空」vs「全被屏蔽 + 还在自动翻页」，用于专门的 loading 空态。 */
  rawLoadedCount?: number;
  /** feedQuery 首屏失败的错误信息；空 = 没失败。空态优先渲「重试读取」。 */
  feedErrorMessage?: string | null;
  /** 服务端汇报的广场总数；不传或 <= posts.length 时按已加载条数显示。 */
  serverTotal?: number;
  onRequestMore?: () => void;
  /** 用户点击「加载更多失败 · 重试」时调用；通常等价于 onRequestMore 但语义更明确。 */
  onRetryNextPage?: () => void;
  onSelectedPostChange?: (postId: string | null) => void;
  routeSelectedPostId?: string | null;
  showCompose: boolean;
  successNotice?: string;
  text: string;
  videoDraft: MomentVideoDraft | null;
  commentReplyTarget?: FeedCommentReplyTarget | null;
  isPostFavorite: (postId: string) => boolean;
  setShowCompose: (nextValue: boolean) => void;
  onCancelCommentReply?: () => void;
  onCommentChange: (postId: string, value: string) => void;
  // (postId, text)：row 把 commentDraft 顺手传上来给 page，page 的回调不再
  // 闭包 commentDrafts state → 键盘敲一下 onCommentSubmit identity 不变，
  // DesktopFeedRow 的 React.memo 才不会被穿透。
  onCommentSubmit: (postId: string, text: string) => void;
  onCreate: () => void;
  onStartCommentReply?: (comment: FeedComment) => void;
  onSelectCommentAuthor?: (
    event: ReactMouseEvent<HTMLButtonElement>,
    comment: FeedComment,
  ) => void;
  onSelectPostAuthor?: (input: {
    anchorElement: HTMLButtonElement;
    post: FeedPostListItem;
  }) => void;
  onImageFilesSelected: (files: FileList | null) => void;
  onLike: (postId: string) => void;
  /** 「广场动态都被你屏蔽了」空态的兜底动作 — 把用户带到通讯录解除屏蔽。 */
  onOpenContacts?: () => void;
  onRemoveImage: (id: string) => void;
  onRemoveVideo: () => void;
  onRefresh: () => void;
  /** 顶部 toolbar 错误条上的「重试发送」回调；与移动端 InlineNotice 行为对齐。 */
  onRetryComment?: () => void;
  /** 顶部 toolbar 错误条上的「重试点赞」回调。 */
  onRetryLike?: () => void;
  /** 可选 — 点击行内「分享图卡」时上抛 postId，由 page 弹出 modal。 */
  onShare?: (postId: string) => void;
  onTextChange: (value: string) => void;
  onToggleFavorite: (postId: string) => void;
  onVideoFileSelected: (file: File | null) => void;
};

export function DesktopFeedWorkspace({
  canAddImages,
  canAddVideo,
  baseUrl,
  commentDrafts,
  commentErrorMessage,
  commentPendingPostIds,
  composeErrorMessage,
  createPending,
  errors = [],
  hasNextPage = false,
  isFetchingNextPage = false,
  isFetchNextPageError = false,
  imageDrafts,
  isLoading,
  likeErrorMessage,
  likePendingPostIds,
  ownerAvatar,
  ownerUsername,
  posts,
  rawLoadedCount = 0,
  feedErrorMessage = null,
  serverTotal,
  onRequestMore,
  onRetryNextPage,
  onSelectedPostChange,
  routeSelectedPostId = null,
  showCompose,
  successNotice,
  text,
  videoDraft,
  commentReplyTarget = null,
  isPostFavorite,
  setShowCompose,
  onCancelCommentReply,
  onCommentChange,
  onCommentSubmit,
  onCreate,
  onImageFilesSelected,
  onStartCommentReply,
  onSelectCommentAuthor,
  onSelectPostAuthor,
  onLike,
  onOpenContacts,
  onRemoveImage,
  onRemoveVideo,
  onRefresh,
  onRetryComment,
  onRetryLike,
  onShare,
  onTextChange,
  onToggleFavorite,
  onVideoFileSelected,
}: DesktopFeedWorkspaceProps) {
  const t = useRuntimeTranslator();
  const [selectedPostId, setSelectedPostId] = useState<string | null>(
    routeSelectedPostId,
  );
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);

  // 滚到接近底部时调用 onRequestMore（page 层 fetchNextFeedPage）。
  // root=scrollViewportRef 让观察器跟桌面滚动容器对齐而不是 window；rootMargin
  // 320px 提前触发避免触底空等。
  // 命中 fetchNextPage 错误后直接关掉 observer：父级 desktopRequestMore 虽然
  // 已经 gate 在 isFetchNextPageError 上做了 no-op，但 sentinel 一直在视口里
  // 时观察器每次都会再发一次 onRequestMore，徒增 React commit 噪音。
  useEffect(() => {
    if (!onRequestMore) return;
    if (!hasNextPage || isFetchingNextPage) return;
    if (isFetchNextPageError) return;
    const sentinel = loadMoreSentinelRef.current;
    const root = scrollViewportRef.current;
    if (!sentinel || !root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onRequestMore();
        }
      },
      { root, rootMargin: "320px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, onRequestMore]);

  useEffect(() => {
    setSelectedPostId((current) =>
      current === routeSelectedPostId ? current : routeSelectedPostId,
    );
  }, [routeSelectedPostId]);

  const detailQuery = useQuery({
    queryKey: ["app-feed-post", baseUrl, selectedPostId],
    queryFn: async () => {
      if (!selectedPostId) {
        return null;
      }

      return (await getFeedPost(selectedPostId, baseUrl)) ?? null;
    },
    enabled: Boolean(selectedPostId),
    // 同一条 post 的完整评论 30 秒内不再重拉：用户在 A 和 B 之间反复切「查看
    // 全部」时不再每次都 RTT，本端 commentMutation 走乐观更新也会把 detail
    // cache 跟着追加，新评论本会同步可见。
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!selectedPostId) {
      return;
    }

    // posts 还没拉到时（首屏 query 在路上）别清 selectedPostId——清了 parent
    // 的 desktopSelectedPostId 会被同步抹掉，URL 上的 #post=<id> hash 跟着没，
    // 滚动定位失败。posts 有内容后还找不到才说明那条真的不在列表里。
    if (posts.length === 0) {
      return;
    }
    // 深链 /tabs/feed#post=X 落到第 5 页时：首页 20 条加载完→X 不在里面，
    // 之前这里直接 setSelectedPostId(null)；但 page 层的 deep-link prefetch
    // effect 还在分页拉后续页找 X。selection 被提前杀掉 → URL hash 被反向
    // 同步擦掉 → page 层条件不再满足，prefetch effect 停止 → 用户的深链
    // 彻底丢。还有 hasNextPage 时给 prefetch 留时间，hasNextPage=false 才认
    // 输并清掉。
    if (hasNextPage) {
      return;
    }
    if (!posts.some((post) => post.id === selectedPostId)) {
      setSelectedPostId(null);
    }
  }, [posts, selectedPostId, hasNextPage]);

  useEffect(() => {
    onSelectedPostChange?.(selectedPostId);
  }, [onSelectedPostChange, selectedPostId]);

  // 已经为当前 selectedPostId 滚过一次后就不再重滚——避免 posts 增量加载时
  // (infinite-scroll 又拼了一页) 还活在同一个 selectedPostId 上又被弹回顶部。
  const scrolledForPostIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedPostId || typeof document === "undefined") {
      return;
    }
    if (scrolledForPostIdRef.current === selectedPostId) {
      return;
    }
    // posts 刚拉到第 1 帧时元素可能还没渲染，依赖 posts 让这个 effect 跟着
    // 列表增量重新触发，直到该 id 的节点真出现在 DOM 里再 scrollIntoView。
    const target = document.getElementById(
      `desktop-feed-post-${selectedPostId}`,
    );
    if (!target) {
      return;
    }
    // 走查新 Round 8：ref 必须在 rAF *回调里* 才标"已滚过"，不能 schedule
    // 完就标。否则深链 #post=<id> 命中首页后：effect 跑 → 找到 target →
    // schedule rAF #1 → 立刻标 ref=id；下一刻 auto-prefetch 把 page 2 拼进
    // posts → 这个 effect 跟着 posts 重跑 → cleanup 把 rAF #1 取消掉 → ref
    // 已经是 id 了所以 early return → 新 rAF 不调度，scroll 永远不发生，
    // 用户进来卡在 feed 顶部看不到自己点开的那条 post。把 ref-set 放进 rAF
    // 回调，cancel 的情况下 ref 仍是 null，下次 effect 还能重新调度。
    const frame = window.requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      scrolledForPostIdRef.current = selectedPostId;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedPostId, posts]);

  useEffect(() => {
    // selectedPostId 一变就放开锁，下次进来同一个 id 也能再触发一次滚动
    // （比如先选 A 再切 B 再回 A）。
    if (scrolledForPostIdRef.current !== selectedPostId) {
      scrolledForPostIdRef.current = null;
    }
  }, [selectedPostId]);

  // workspace 内部 callback 也要 stable —— Row 用 React.memo 跳过非自己条目的
  // 重渲，但 workspace 每次 re-render（commentDrafts 变会触发）都新建内联箭头
  // 当 onLoadFullComments 传下去，所有 row 的 prop identity 都换 → memo 失效。
  // detailQuery.refetch 在 RQ 内 memoize；isError 是 primitive；selectedPostId
  // 是本地 state；这一套 dep 在敲键码时不变。
  const detailQueryRefetch = detailQuery.refetch;
  const detailQueryIsError = detailQuery.isError;
  // 走查新一轮 Round 7（perf）：handleLoadFullComments 原来 deps 包含 selectedPostId
  // 和 detailQueryIsError —— selectedPostId 在用户点任一 row 「查看全部」时立刻翻
  // 新值；detailQueryIsError 在 detailQuery 完成/失败时翻 boolean。任一变化都
  // 让 callback identity 翻新 → workspace → list → 60 条 memo'd Row 的 onLoadFullComments
  // prop 全换 → 整张 list 重渲（其中 59 条根本不是「查看全部」目标）。同款
  // 套路：用 ref 兜最新值，callback 只依赖 stable refetch 即可。
  const selectedPostIdRef = useRef(selectedPostId);
  useEffect(() => {
    selectedPostIdRef.current = selectedPostId;
  }, [selectedPostId]);
  const detailQueryIsErrorRef = useRef(detailQueryIsError);
  useEffect(() => {
    detailQueryIsErrorRef.current = detailQueryIsError;
  }, [detailQueryIsError]);
  const handleLoadFullComments = useCallback(
    (postId: string) => {
      // 已经选中同一条 post 时 setState 是 no-op：React 跳过更新 →
      // useQuery 不会重跑。detailQuery 上一次失败、ErrorBlock 已经
      // 渲染出来时，用户点「查看全部」想重试，过去只能刷新整个页面。
      // 这里显式 refetch，让那条 button 真当"重试入口"用。
      if (
        selectedPostIdRef.current === postId &&
        detailQueryIsErrorRef.current
      ) {
        void detailQueryRefetch();
        return;
      }
      // 走查新一轮 R1：在 setSelectedPostId 之前把 scrolledForPostIdRef
      // 钉到 postId，抑制下面的 scrollIntoView effect 这一次执行。用户
      // 点「查看全部 N 条评论」时这条 row 本来就在视口里——他只是想看
      // 评论展开，把行强滚到 viewport 顶端会把按钮位置 + 阅读位置一并
      // 顶飞（block:"start" 配 ~360px 的 row 高度直接把滚动条往上推
      // 半屏），是与深链 #post= 从首屏外滑到目标完全不同的语义。
      // 深链路径仍正常 scroll：routeSelectedPostId 改变会先走上面 line
      // 189-193 的 setSelectedPostId(current => routeSelectedPostId)，
      // 那条不经手这里，scrolledForPostIdRef 保持 null → scroll 照旧。
      scrolledForPostIdRef.current = postId;
      setSelectedPostId(postId);
    },
    [detailQueryRefetch],
  );
  const handleOpenCompose = useCallback(
    () => setShowCompose(true),
    [setShowCompose],
  );
  const handleBackToTop = useCallback(() => {
    scrollViewportRef.current?.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }, []);
  // 走查新一轮 R1：点 toolbar「刷新」时 page 的 onRefresh 会先把 cache 砍回 page 1
  // 再 refetch —— 列表从 ~80 条 (auto-prefetch 三页 + 用户滚出来的额外页) 一下子
  // 缩成 20 条，但 scrollViewportRef.scrollTop 仍停在 ~2000px 处。用户视感是「点
  // 完刷新页面变空白 + 自己也不知道滚回顶部就能看到新内容」。和 mobile 端下拉
  // 刷新天然贴顶不同，desktop refresh 按钮可以在任何滚动位置触发。包一层让
  // 刷新同步触发 backToTop，保持「刷新 = 看到顶部最新」的直觉。
  const handleRefresh = useCallback(() => {
    handleBackToTop();
    onRefresh();
  }, [handleBackToTop, onRefresh]);
  // 走查新一轮 R2：cloud-console 切账户时 baseUrl 翻新，DesktopFeedWorkspace 同
  // 实例继续挂着，scrollViewportRef.scrollTop 留在旧账户读到第 N 条的位置；新账
  // 户 feedQuery 重 fetch（首屏 20 条 + auto-prefetch 至多 60 条），scrollHeight
  // 短暂变小被 browser clamp 再变大，用户落到新账户列表中段 / 偶尔落在 Loading
  // 下方的空白区。和 desktop-moments-workspace L172-174 已经做过的同款修复对齐
  // (该处 dep=[ownerId])；feed workspace 拿不到 ownerId 但 baseUrl 跟账户一一
  // 对应，依赖 baseUrl 同效。
  useEffect(() => {
    scrollViewportRef.current?.scrollTo({ top: 0 });
  }, [baseUrl]);

  return (
    <div className="relative flex h-full min-h-0 bg-[color:var(--surface-section)]">
      <section className="min-w-0 flex-1 bg-[color:var(--surface-section)]">
        <div className="flex h-full min-h-0 flex-col">
          <DesktopFeedToolbar
            commentErrorMessage={commentErrorMessage}
            errors={errors}
            likeErrorMessage={likeErrorMessage}
            successNotice={successNotice}
            loadedCount={posts.length}
            serverTotal={serverTotal}
            hasNextPage={hasNextPage}
            onBackToTop={handleBackToTop}
            onOpenCompose={handleOpenCompose}
            onRetryComment={onRetryComment}
            onRetryLike={onRetryLike}
            onRefresh={handleRefresh}
          />

          <div
            ref={scrollViewportRef}
            className="min-h-0 flex-1 overflow-auto px-7 py-6"
          >
            <div className="mx-auto w-full max-w-[760px]">
              <DesktopFeedList
                commentDrafts={commentDrafts}
                commentPendingPostIds={commentPendingPostIds}
                commentReplyTarget={commentReplyTarget}
                detailErrorMessage={
                  detailQuery.isError && detailQuery.error instanceof Error
                    ? detailQuery.error.message
                    : null
                }
                detailLoading={detailQuery.isLoading}
                detailPost={detailQuery.data ?? null}
                selectedPostId={selectedPostId}
                isLoading={isLoading}
                hasFilteredOutPosts={
                  posts.length === 0 && rawLoadedCount > 0
                }
                hasNextPage={hasNextPage}
                isFetchingNextPage={isFetchingNextPage}
                isFetchNextPageError={isFetchNextPageError}
                onRetryNextPage={onRetryNextPage}
                feedErrorMessage={feedErrorMessage}
                onRetryFeed={handleRefresh}
                likePendingPostIds={likePendingPostIds}
                posts={posts}
                isPostFavorite={isPostFavorite}
                onCancelCommentReply={onCancelCommentReply}
                onCommentChange={onCommentChange}
                onCommentSubmit={onCommentSubmit}
                onLoadFullComments={handleLoadFullComments}
                onLike={onLike}
                onOpenCompose={handleOpenCompose}
                onOpenContacts={onOpenContacts}
                onShare={onShare}
                onStartCommentReply={onStartCommentReply}
                onSelectCommentAuthor={onSelectCommentAuthor}
                onSelectPostAuthor={onSelectPostAuthor}
                onToggleFavorite={onToggleFavorite}
              />
              {posts.length > 0 ? (
                <>
                  <div
                    ref={loadMoreSentinelRef}
                    className="h-1 w-full"
                    aria-hidden="true"
                  />
                  {isFetchingNextPage ? (
                    <div className="py-4 text-center text-[length:var(--text-caption)] text-[color:var(--text-muted)]">
                      {t(msg`正在加载更多…`)}
                    </div>
                  ) : isFetchNextPageError ? (
                    // fetchNextPage 失败时旧版桌面 workspace 什么都不渲染，sentinel
                    // 还原地挂在视口里 → observer 持续触发已经被 page 层 gate 死的
                    // requestMore（净空转）。用户视角是「滚到底部一片空白，看不到
                    // 失败提示也不知道怎么继续」，与移动端「加载更多失败 · 点击重试」
                    // 行为割裂。
                    <button
                      type="button"
                      onClick={() => onRetryNextPage?.()}
                      className="block w-full py-4 text-center text-[length:var(--text-caption)] font-medium text-[color:var(--brand-primary)] hover:opacity-80"
                    >
                      {t(msg`加载更多失败 · 点击重试`)}
                    </button>
                  ) : !hasNextPage ? (
                    <div className="py-4 text-center text-[length:var(--text-caption)] text-[color:var(--text-muted)]">
                      {t(msg`已经到底了`)}
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {showCompose ? (
        <DesktopFeedComposePanel
          canAddImages={canAddImages}
          canAddVideo={canAddVideo}
          createPending={createPending}
          errorMessage={composeErrorMessage}
          imageDrafts={imageDrafts}
          ownerAvatar={ownerAvatar}
          ownerUsername={ownerUsername}
          text={text}
          videoDraft={videoDraft}
          onClose={() => setShowCompose(false)}
          onCreate={onCreate}
          onImageFilesSelected={onImageFilesSelected}
          onRemoveImage={onRemoveImage}
          onRemoveVideo={onRemoveVideo}
          onTextChange={onTextChange}
          onVideoFileSelected={onVideoFileSelected}
        />
      ) : null}
    </div>
  );
}
