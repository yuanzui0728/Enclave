import {
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { msg } from "@lingui/macro";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import {
  addMomentComment,
  getBlockedCharacters,
  getCharacter,
  getCharacterMoments,
  getFriends,
  isApiRequestError,
  toggleMomentLike,
  type Moment,
  type MomentComment,
  type MomentsPageResponse,
} from "@yinjie/contracts";
import { translateAppErrorCode } from "../lib/error-translate";
import { translateRuntimeMessage } from "@yinjie/i18n";

// 走查电脑端 R1：和 moments-page / profile-moments-page 同款 i18n 一致性兜底。
// 之前页面里 likeMutation / commentMutation 的 onError 已经走 translateAppErrorCode，
// 但传给 DesktopFriendMomentsWorkspace 的 loadErrorMessage / commentErrorMessage /
// composeErrorMessage / likeErrorMessage / errors[] 全是直拼 raw error.message，
// server 的 legacyMessage 永远是中文 ——非 zh-CN locale 用户拿到的就是裸中文，
// 跟同一屏 notice 通道里的本地化 toast 风格也不一致。统一走它。
function resolveMomentsErrorMessage(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  if (isApiRequestError(error)) {
    return translateAppErrorCode(error) ?? error.message;
  }
  return error.message;
}
import { AppPage, Button, ErrorBlock, LoadingBlock } from "@yinjie/ui";
import { RouteRedirectState } from "../components/route-redirect-state";
import { buildDesktopContactsRouteHash } from "../features/contacts/contacts-route-state";
import {
  hydrateDesktopFavoritesFromNative,
  readDesktopFavorites,
  removeDesktopFavorite,
  upsertDesktopFavorite,
} from "../features/favorites/favorites-storage";
import {
  buildDesktopFriendMomentsPath,
  buildDesktopFriendMomentsRouteHash,
  parseDesktopFriendMomentsRouteState,
} from "../features/moments/friend-moments-route-state";
import { coerceToMobileFriendMomentsRouteHash } from "../features/moments/mobile-friend-moments-route-state";
import { getFriendDisplayName } from "../features/contacts/contact-utils";
import { getMomentSummaryText } from "../features/moments/moment-content";
import {
  publishMomentComposeDraft,
  useMomentComposeDraft,
  type MomentImageDraft,
  type MomentVideoDraft,
} from "../features/moments/moment-compose-media";
import { useOptimisticMomentLikeHandlers } from "../features/moments/use-optimistic-like";
import { translateCharacterBio } from "../lib/character-i18n";
import { isDesktopOnlyPath, navigateBackOrFallback } from "../lib/history-back";
import { formatTimestamp } from "../lib/format";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

const t = translateRuntimeMessage;

const DesktopFriendMomentsWorkspace = lazy(async () => {
  const mod =
    await import("../features/desktop/moments/desktop-friend-moments-workspace");
  return { default: mod.DesktopFriendMomentsWorkspace };
});

const DesktopMessageAvatarPopover = lazy(async () => {
  const mod = await import("../features/chat/message-avatar-popover-shell");
  return { default: mod.DesktopMessageAvatarPopover };
});

export function FriendMomentsPage() {
  const { characterId } = useParams({
    from: "/desktop/friend-moments/$characterId",
  });
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
  const [showCompose, setShowCompose] = useState(false);
  // 失败也得走 notice 通道，不然之前点赞失败一律落到 ErrorBlock + 上一条
  // success 「朋友圈互动已更新。」绿条还挂着，用户同屏看到一红一绿两条提示
  // ——跟 contacts Round 3 (d61672ed)、mobile-friend-moments-page 同类 bug。
  // 用 tone-aware 状态，配合 workspace 已经支持的 noticeTone/noticeAction props。
  const [notice, setNotice] = useState<{
    tone: "success" | "info" | "danger";
    message: string;
    actionLabel?: string | null;
    action?: (() => void) | null;
  } | null>(null);
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
  const routeState = parseDesktopFriendMomentsRouteState(hash);
  const routeSelectedMomentId = routeState.momentId ?? null;

  useEffect(() => {
    setDesktopAvatarPopover(null);
  }, [characterId, hash, pathname]);

  const characterQuery = useQuery({
    queryKey: ["app-character", baseUrl, characterId],
    queryFn: () => getCharacter(characterId, baseUrl),
    enabled: isDesktopLayout,
    // 走查电脑端朋友圈 R3：和 mobile-friend-moments-page 同款 staleTime ——
    // 用户从 desktop 通讯录 / character-detail popover / 单聊页过来时该角色
    // 资料几秒前刚拉过；后退再进、或者在 friend-moments / chat / contacts
    // 之间来回切，cache 还是 fresh，不需要每次重打 RTT。15s 跟 chat-details /
    // contacts-page 等 8 处 staleTime 对齐。
    staleTime: 15_000,
  });
  const friendsQuery = useQuery({
    queryKey: ["app-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
    enabled: isDesktopLayout,
    // 同上 staleTime；好友列表变更频率低（手动添加好友 / 接受请求），15s
    // 让从 contacts 跳过来不二次 refetch。
    staleTime: 15_000,
  });
  // ?character=ID 服务端过滤，只回该角色发的 ≤几 KB ——之前 getMoments 全表
  // ~960KB 客户端 filter 出该角色 5-10 条，每次首进单个角色朋友圈页都付这
  // 流量（cache 命中要等 search 索引或别处先 getMoments 过）。
  // mobile-friend-moments-page 早就走 getCharacterMoments 这套了，桌面这条
  // 漏了一直在用全表。app-moments-character cache 跟 useOptimisticMomentLikeHandlers
  // 已经同步好的 4 把 key 之一，optimistic toggle 跨页面一致。
  const momentsQuery = useQuery({
    queryKey: ["app-moments-character", baseUrl, characterId],
    queryFn: () => getCharacterMoments(characterId, baseUrl),
    enabled: isDesktopLayout && Boolean(characterId),
  });
  const blockedQuery = useQuery({
    queryKey: ["app-moments-blocked-characters", baseUrl],
    queryFn: () => getBlockedCharacters(baseUrl),
    enabled: isDesktopLayout && Boolean(ownerId),
    // 走查电脑端朋友圈 R3：和 mobile-friend-moments-page R1 同款。屏蔽列表变更
    // 频率低（用户手动操作），15s staleTime 让 contacts / 朋友圈页之间互跳不
    // 每次都打这一次 RTT。
    staleTime: 15_000,
  });

  // 走查 R1：跟 moments-page / profile-moments-page / mobile-friend-moments-page 同思路 ——
  // 钉住 mutation 触发时刻的 baseUrl，mid-flight 切账户后旧账户的 success/danger toast
  // 不要落到新账户 UI。本页之前完全没有这层 guard，切到 B 后 A 的点赞/评论成功仍会冒
  // 「朋友圈互动已更新。」绿条；A 的点赞失败还会在 B 上挂「重试点赞」按钮（闭包指向
  // 旧 momentId，重试时 404）。
  const mutationBaseUrlRef = useRef(baseUrl);
  useEffect(() => {
    mutationBaseUrlRef.current = baseUrl;
  }, [baseUrl]);
  // 新走查 R3：跟 moments-page R2 同款同帧双击守卫。CDP 实测在主朋友圈页双击
  // 「发送」评论会发 2 次 POST /comment 写 2 条重复评论；friend-moments 走
  // 一样的 commentMutation 模板，肯定有同样 bug。提前加 ref 锁防 DB 脏写。
  const commentInflightRef = useRef<Record<string, boolean>>({});
  const likeInflightRef = useRef<Record<string, boolean>>({});
  const createMutation = useMutation({
    // 走查新 Round 1：跟 1b285789 / moments-page / profile-moments-page 同类 bug。
    // 慢网下旧 mutation 的 onSuccess 跑回来会抹掉用户重开后输入的新草稿。
    // snapshot draft 当 variables，onSuccess 用 reference equality 校验。
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
      // 钉住 publish 目标账户 —— mid-flight 切账户后 cache prepend / invalidate
      // 仍落到旧账户（切回去第一帧就能看到刚发的），但 toast / draft reset 留给当前账户。
      return { mutationBaseUrl: baseUrl };
    },
    onSuccess: (newMoment, input, context) => {
      const mutationBaseUrl = context?.mutationBaseUrl ?? baseUrl;
      // 立刻 prepend 到共享 flat / paged / mine 三套 cache：本页按好友 characterId 过滤
      // 不显示用户自己的动态，但用户随手切到 /tabs/moments、/profile/moments 时应该
      // 能直接看到刚发的内容。
      // 走查 Round 1：paged 之前只走 invalidate —— /tabs/moments 没挂载时只是把
      // cache 标 stale，用户下次跳过去仍要付一次 RTT refetch 才能看到新帖。改用
      // setQueryData 在 page 1 头部 prepend，命中 momentsData useMemo 的 id 去重
      // 兜底不会出现重复条；跟 moments-page.tsx createMutation 模板对齐。
      queryClient.setQueryData<Moment[]>(["app-moments", mutationBaseUrl], (current) =>
        current ? [newMoment, ...current] : current,
      );
      queryClient.setQueryData<Moment[]>(
        ["app-moments-mine", mutationBaseUrl],
        (current) => (current ? [newMoment, ...current] : current),
      );
      // 走查 R2：跟 moments-page R1 同款 —— pages[0].total 也要 +1，否则
      // /tabs/moments toolbar「已加载 X / 共 Y 条动态」在 invalidate refetch 落地
      // 前会显示陈旧的 Y。本页是发布到 paged cache 帮 /tabs/moments 第一帧能
      // 看到，同步 total 才不会让目标页"总数没动"。
      queryClient.setQueryData<InfiniteData<MomentsPageResponse>>(
        ["app-moments-paged", mutationBaseUrl],
        (current) =>
          current && current.pages.length > 0
            ? {
                pages: [
                  {
                    ...current.pages[0]!,
                    items: [newMoment, ...current.pages[0]!.items],
                    total: (current.pages[0]!.total ?? 0) + 1,
                  },
                ],
                pageParams: current.pageParams.slice(0, 1),
              }
            : current,
      );
      void queryClient.invalidateQueries({ queryKey: ["app-moments", mutationBaseUrl] });
      void queryClient.invalidateQueries({
        queryKey: ["app-moments-paged", mutationBaseUrl],
      });
      void queryClient.invalidateQueries({
        queryKey: ["app-moments-mine", mutationBaseUrl],
      });
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
      setNotice({ tone: "success", message: t(msg`朋友圈已发布。`) });
    },
  });
  const optimisticLike = useOptimisticMomentLikeHandlers({
    baseUrl,
    ownerId,
    ownerUsername,
    ownerAvatar,
  });
  const likeMutation = useMutation({
    mutationFn: (momentId: string) => toggleMomentLike(momentId, baseUrl),
    onMutate: (momentId: string) => {
      const mutationBaseUrl = baseUrl;
      const inner = optimisticLike.onMutate(momentId);
      return Promise.resolve(inner).then((snapshots) => ({
        ...snapshots,
        mutationBaseUrl,
      }));
    },
    onError: (error, momentId, context) => {
      optimisticLike.onError(error, momentId, context);
      // mid-flight 切账户：当时点赞的 momentId 在新账户里不存在，弹「重试点赞」按钮
      // 闭包指着旧 momentId（重试 → 新账户 404）只会把用户搞糊涂。和 moments-page
      // / mobile-friend-moments-page 的同思路：静默跳过。
      if (
        context &&
        (context as { mutationBaseUrl?: string }).mutationBaseUrl !==
          mutationBaseUrlRef.current
      ) {
        return;
      }
      // 失败统一走 danger notice + 重试按钮——之前只回滚 cache 不更新 notice，
      // 上一条 success "朋友圈互动已更新。" 还挂着 2.4s，新失败的 likeErrorMessage
      // 落到下方 ErrorBlock 显示成红条，一红一绿同屏。跟 mobile-friend-moments-page
      // (Round 5) / moments-page / chat Round 6 / contacts Round 3 同类 bug。
      // 走查 R1（本轮）：原文案直拼 raw error.message，server 的 legacyMessage 永远
      // 是中文，非 zh-CN locale 用户拿到的就是裸中文。优先 translateAppErrorCode
      // 命中 i18n 字典；miss 才回退 raw message，跟 moments-page R2 / profile-moments
      // R3 同模板。
      setNotice({
        tone: "danger",
        message: isApiRequestError(error)
          ? t(msg`点赞失败：${translateAppErrorCode(error) ?? error.message}`)
          : error instanceof Error
            ? t(msg`点赞失败：${error.message}`)
            : t(msg`点赞失败，请稍后重试。`),
        actionLabel: t(msg`重试点赞`),
        action: () => likeMutation.mutate(momentId),
      });
    },
    onSuccess: (_data, _momentId, context) => {
      if (
        context &&
        (context as { mutationBaseUrl?: string }).mutationBaseUrl !==
          mutationBaseUrlRef.current
      ) {
        return;
      }
      setNotice({ tone: "success", message: t(msg`朋友圈互动已更新。`) });
      // 点赞 toggle 是 boolean，optimistic 已把 likes 切对。完全省掉 invalidate，
      // 避免拉回 GET /api/moments 全量 + 30+ media 条件请求 RTT。
    },
  });
  // 走查 Round 1：mutationFn 不能再次读 commentDrafts —— onMutate 立刻 clear drafts，
  // 等 TanStack Query 调 mutationFn 时闭包里 drafts[momentId] 已经是 ""。
  // 在 onMutate 里把 text/target 写进 ref，mutationFn 直接读 ref。
  const commentSubmitArgsRef = useRef<
    Record<
      string,
      { text: string; target: { commentId: string; authorId: string } | null }
    >
  >({});
  const commentMutation = useMutation({
    // 走查 Round 1：之前没有 onMutate，公网隧道 ~600ms RTT 下用户提交评论后
    // 输入框 600ms 不消失 + 列表里也看不到自己刚发的评论，体感"评论卡住"。
    // 跟 moments-page.tsx Round 1 optimistic comment 模板对齐：4 把 cache 全
    // sync + ref 捕获 args + onError 回滚 drafts。
    onMutate: async (momentId: string) => {
      const text = commentDrafts[momentId]?.trim();
      if (!text || !ownerId) {
        return { skipped: true as const };
      }

      const replyTo =
        desktopReplyTarget && desktopReplyTarget.postId === momentId
          ? desktopReplyTarget
          : null;
      const target = replyTo
        ? { commentId: replyTo.commentId, authorId: replyTo.authorId }
        : null;

      commentSubmitArgsRef.current[momentId] = { text, target };

      await Promise.all([
        queryClient.cancelQueries({ queryKey: ["app-moments", baseUrl] }),
        queryClient.cancelQueries({
          queryKey: ["app-moments-paged", baseUrl],
        }),
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
      // 命中错的那条。加 random 后缀让碰撞概率退化到可忽略。跟 moments-page /
      // profile-moments-page 同模板。
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

      const savedDraft = commentDrafts[momentId] ?? "";
      const savedReply =
        desktopReplyTarget && desktopReplyTarget.postId === momentId
          ? desktopReplyTarget
          : null;
      // 钉住 mutation 触发时刻的 baseUrl —— mid-flight 切账户后 onError 比对，
      // 旧账户的失败不要在新账户里弹「评论失败」红条；onSuccess 也跳过避免在新
      // 账户冒「朋友圈互动已更新」绿条 + 往新账户 cache 写 temp 替换（no-op，
      // 但仍然要把 toast 错位拦下来）。
      const mutationBaseUrl = baseUrl;

      setCommentDrafts((current) => ({ ...current, [momentId]: "" }));
      setDesktopReplyTarget((current) =>
        current?.postId === momentId ? null : current,
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
        savedReply,
        mutationBaseUrl,
      };
    },
    mutationFn: (momentId: string) => {
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
    onError: (error, momentId, context) => {
      delete commentSubmitArgsRef.current[momentId];
      if (!context || context.skipped) {
        return;
      }
      // mid-flight 切账户：旧账户的失败不要在新账户里 reopen 一个指着别的账户帖子
      // 的状态，也不该弹「评论失败」红条。cache 回滚也跳过 —— 旧 baseUrl 的 cache
      // 用户已经看不到了。和 moments-page / mobile-friend-moments-page 同模板。
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
      // 恢复 drafts / reply target 让用户改后重发
      setCommentDrafts((current) => ({
        ...current,
        [context.momentId]: context.savedDraft,
      }));
      if (context.savedReply) {
        setDesktopReplyTarget(context.savedReply);
      }
      // 评论失败：danger notice，跟 like 失败同色调，避免红 ErrorBlock + 绿 notice 同屏。
      // 走查 R1：i18n 一致性，跟 likeMutation onError 同处理。
      setNotice({
        tone: "danger",
        message: isApiRequestError(error)
          ? t(msg`评论失败：${translateAppErrorCode(error) ?? error.message}`)
          : error instanceof Error
            ? t(msg`评论失败：${error.message}`)
            : t(msg`评论失败，请稍后重试。`),
      });
    },
    onSuccess: (realComment, momentId, context) => {
      delete commentSubmitArgsRef.current[momentId];
      if (
        context &&
        !context.skipped &&
        context.mutationBaseUrl !== mutationBaseUrlRef.current
      ) {
        return;
      }
      setNotice({ tone: "success", message: t(msg`朋友圈互动已更新。`) });
      // 把 optimistic temp 原地换成 server 真实评论 —— 跟 moments-page 一样
      // **完全省掉**一次 invalidate 触发的 GET /api/moments/character/X refetch
      // （公网隧道下还会带回 30+ media 条件请求 RTT），是评论后"页面又卡一下"的主因。
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

  const friendItem = useMemo(
    () =>
      (friendsQuery.data ?? []).find(
        (item) => item.character.id === characterId,
      ) ?? null,
    [characterId, friendsQuery.data],
  );
  const character = characterQuery.data ?? friendItem?.character ?? null;
  const isBlocked = Boolean(
    (blockedQuery.data ?? []).some((item) => item.characterId === characterId),
  );
  const displayName = friendItem
    ? getFriendDisplayName(friendItem)
    : character?.name || t(msg`角色朋友圈`);
  const signature =
    character?.currentStatus?.trim() ||
    translateCharacterBio(t, character?.bio) ||
    t(msg`这个角色还没有个性签名。`);
  const pendingLikeMomentId = likeMutation.isPending
    ? likeMutation.variables
    : null;
  const pendingCommentMomentId = commentMutation.isPending
    ? commentMutation.variables
    : null;
  // memo：之前每次 render 都 new Set + 两次 filter 把全表 N×3 跑一遍。
  // composeDraft.text 每个字符都触发 re-render，247+ moments 时白浪费 CPU。
  const blockedCharacterIds = useMemo(
    () => new Set((blockedQuery.data ?? []).map((item) => item.characterId)),
    [blockedQuery.data],
  );
  // 服务端按 character=ID 过滤已经只回这个角色的 moments，前端只剩 blocked
  // 兜底。blocked 后整页该角色 moments 隐藏，EmptyState 里另有专门文案
  // （「这位角色的朋友圈当前不可见」）。
  const friendMoments = useMemo(
    () =>
      blockedCharacterIds.has(characterId)
        ? []
        : (momentsQuery.data ?? []),
    [momentsQuery.data, characterId, blockedCharacterIds],
  );

  useEffect(() => {
    resetComposeDraft();
    setCommentDrafts({});
    setShowCompose(false);
    setNotice(null);
    // 走查 R1：跟 moments-page / profile-moments-page 同模板 —— 切账户 / 切角色时
    // mid-flight 评论 args 不能残留（onSuccess/onError 会清掉自己那条，但切走时
    // 仍 in-flight 的会泄漏），desktopReplyTarget 也得收（不然新角色页打开
    // 还挂着上一个角色帖子的 reply 状态，textarea placeholder 显示错误的目标）。
    commentSubmitArgsRef.current = {};
    setDesktopReplyTarget(null);
  }, [baseUrl, characterId, resetComposeDraft]);

  useEffect(() => {
    if (!isDesktopLayout) {
      return;
    }

    setFavoriteSourceIds(readDesktopFavorites().map((item) => item.sourceId));
  }, [isDesktopLayout]);

  useEffect(() => {
    if (!isDesktopLayout || !nativeDesktopFavorites) {
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
  }, [isDesktopLayout, nativeDesktopFavorites]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => setNotice(null), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function handleImageFilesSelected(files: FileList | null) {
    try {
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

  useEffect(() => {
    if (isDesktopLayout) {
      return;
    }

    const mobileRedirectHash = coerceToMobileFriendMomentsRouteHash(hash);

    void navigate({
      to: "/friend-moments/$characterId",
      params: { characterId },
      ...(mobileRedirectHash ? { hash: mobileRedirectHash } : {}),
      replace: true,
    });
  }, [characterId, hash, isDesktopLayout, navigate]);

  function navigateToRouteStateReturn() {
    if (!routeState.returnPath) {
      return false;
    }

    if (!isDesktopLayout && isDesktopOnlyPath(routeState.returnPath)) {
      return false;
    }

    void navigate({
      to: routeState.returnPath,
      ...(routeState.returnHash ? { hash: routeState.returnHash } : {}),
    });
    return true;
  }

  function handleBack() {
    navigateBackOrFallback(() => {
      if (navigateToRouteStateReturn()) {
        return;
      }

      if (routeState.source === "contacts") {
        void navigate({ to: "/tabs/contacts" });
        return;
      }

      if (routeState.source === "starred-friends") {
        if (isDesktopLayout) {
          void navigate({
            to: "/tabs/contacts",
            hash: buildDesktopContactsRouteHash({
              pane: "starred-friends",
              showWorldCharacters: false,
            }),
          });
          return;
        }

        void navigate({ to: "/contacts/starred" });
        return;
      }

      if (routeState.source === "tags") {
        if (isDesktopLayout) {
          void navigate({
            to: "/tabs/contacts",
            hash: buildDesktopContactsRouteHash({
              pane: "tags",
              showWorldCharacters: false,
            }),
          });
          return;
        }

        void navigate({ to: "/contacts/tags" });
        return;
      }

      if (routeState.source === "character-detail" && characterId) {
        void navigate({
          to: "/character/$characterId",
          params: { characterId },
        });
        return;
      }

      if (
        routeState.source === "chat-details" ||
        routeState.source === "avatar-popover"
      ) {
        void navigate({ to: "/tabs/chat" });
        return;
      }

      void navigate({ to: "/tabs/moments" });
    });
  }

  if (!isDesktopLayout) {
    return (
      <AppPage className="flex min-h-full items-center justify-center bg-[#f2f2f2] px-4 py-8">
        <LoadingBlock
          label={t(msg`正在切换到手机端角色朋友圈...`)}
          className="w-full max-w-[360px] rounded-[24px] border-[color:var(--border-faint)] bg-white py-8 shadow-[var(--shadow-section)]"
        />
      </AppPage>
    );
  }

  const errors: string[] = [];
  // 走查电脑端 R1：4 把 query 失败的 ErrorBlock 文案统一走 resolveMomentsErrorMessage
  // —— server legacyMessage 中文兜底，非 zh-CN locale 用户终于能看到本地化文案。
  const characterErrorMessage = resolveMomentsErrorMessage(
    characterQuery.error,
  );
  if (characterQuery.isError && characterErrorMessage) {
    errors.push(characterErrorMessage);
  }
  const friendsErrorMessage = resolveMomentsErrorMessage(friendsQuery.error);
  if (friendsQuery.isError && friendsErrorMessage) {
    errors.push(friendsErrorMessage);
  }
  const momentsLoadErrorMessage = resolveMomentsErrorMessage(
    momentsQuery.error,
  );
  // 走查电脑端 R3：momentsQuery 失败 + 列表 0 条时，下方
  // DesktopFriendMomentsWorkspace renderFeedContent 已经走「朋友圈暂时不可用 /
  // 重试读取」EmptyState（loadErrorMessage 路径）；此处再 push 到顶部 errors[]
  // ErrorBlock 就是同一段错误同屏两条红框（一窄一空态卡），用户读着像"系统
  // 连发两次错误"。和 moments-page.tsx 行 1371-1383 的 `visibleMoments.length > 0`
  // gate 同模板：仅在已经有 friendMoments 可渲染时才把 query error 推到 toolbar
  // 错误条（那时 EmptyState 不出现，toolbar 错误条做持久指示）；0 条让位给
  // EmptyState 的「重试读取」按钮。
  if (
    momentsQuery.isError &&
    momentsLoadErrorMessage &&
    friendMoments.length > 0
  ) {
    errors.push(momentsLoadErrorMessage);
  }
  const blockedErrorMessage = resolveMomentsErrorMessage(blockedQuery.error);
  if (blockedQuery.isError && blockedErrorMessage) {
    errors.push(blockedErrorMessage);
  }

  if (!character && (characterQuery.isLoading || friendsQuery.isLoading)) {
    return (
      <div className="flex h-full items-center justify-center bg-[rgba(244,247,246,0.98)] px-6">
        <LoadingBlock
          label={t(msg`正在读取角色朋友圈...`)}
          className="w-full max-w-[420px] rounded-[24px] border-[color:var(--border-faint)] bg-white py-10 shadow-[var(--shadow-section)]"
        />
      </div>
    );
  }

  if (!character) {
    return (
      <div className="flex h-full items-center justify-center bg-[rgba(244,247,246,0.98)] px-6">
        <div className="w-full max-w-[480px] rounded-[24px] border border-[color:var(--border-faint)] bg-white p-6 shadow-[var(--shadow-section)]">
          <div className="text-[18px] font-semibold text-[color:var(--text-primary)]">
            {t(msg`无法打开这位角色的朋友圈`)}
          </div>
          <div className="mt-2 text-[13px] leading-6 text-[color:var(--text-secondary)]">
            {t(msg`角色资料不存在，或者当前资料还没有同步完成。`)}
          </div>
          {errors.length > 0 ? (
            <div className="mt-4 space-y-3">
              {errors.map((message, index) => (
                <ErrorBlock key={`${message}-${index}`} message={message} />
              ))}
            </div>
          ) : null}
          <div className="mt-5 flex gap-2">
            <Button variant="secondary" onClick={handleBack}>
              {t(msg`返回上一页`)}
            </Button>
            <Button
              variant="primary"
              onClick={() => void navigate({ to: "/tabs/moments" })}
            >
              {t(msg`去朋友圈主页`)}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <RouteRedirectState
          title={t(msg`正在打开桌面好友朋友圈`)}
          description={t(msg`正在载入桌面好友朋友圈工作区，马上显示角色动态详情。`)}
          loadingLabel={t(msg`载入桌面好友朋友圈...`)}
        />
      }
    >
      <DesktopFriendMomentsWorkspace
        character={character}
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
        displayName={displayName}
        errors={errors}
        imageDrafts={composeDraft.imageDrafts}
        isBlocked={isBlocked}
        isLoading={momentsQuery.isLoading}
        // 首屏失败 + 未被拉黑 + 0 条时空态优先渲「重试读取」（feed Round 2 同款）。
        loadErrorMessage={
          momentsQuery.isError ? momentsLoadErrorMessage : null
        }
        onRetryLoad={() => {
          void momentsQuery.refetch();
        }}
        likeErrorMessage={
          likeMutation.isError
            ? resolveMomentsErrorMessage(likeMutation.error)
            : null
        }
        likePendingMomentId={pendingLikeMomentId}
        moments={friendMoments}
        ownerAvatar={ownerAvatar}
        ownerId={ownerId}
        ownerUsername={ownerUsername}
        scrollToMomentId={routeSelectedMomentId}
        showCompose={showCompose}
        signature={signature}
        notice={notice?.message}
        noticeTone={notice?.tone}
        noticeActionLabel={notice?.actionLabel ?? null}
        onNoticeAction={notice?.action ?? null}
        text={composeDraft.text}
        videoDraft={composeDraft.videoDraft}
        isMomentFavorite={(momentId) =>
          favoriteSourceIds.includes(`moment-${momentId}`)
        }
        commentReplyTarget={desktopReplyTarget}
        setShowCompose={setShowCompose}
        onBack={handleBack}
        onCancelCommentReply={() => setDesktopReplyTarget(null)}
        onCommentChange={(momentId, value) =>
          setCommentDrafts((current) => ({
            ...current,
            [momentId]: value,
          }))
        }
        onCommentSubmit={(momentId) => {
          // 新走查 R3：同帧 click 同步锁，见 moments-page R2 注释。
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
            // snapshot — 见 createMutation 注释。
            text: composeDraft.text,
            imageDrafts: composeDraft.imageDrafts,
            videoDraft: composeDraft.videoDraft,
          })
        }
        onImageFilesSelected={(files) => {
          void handleImageFilesSelected(files);
        }}
        onLike={(momentId) => {
          // 新走查 R3：同帧 click 同步锁，见 moments-page R2 注释。
          if (likeInflightRef.current[momentId]) return;
          likeInflightRef.current[momentId] = true;
          likeMutation.mutate(momentId, {
            onSettled: () => {
              delete likeInflightRef.current[momentId];
            },
          });
        }}
        onOpenMomentsHome={() => {
          void navigate({ to: "/tabs/moments" });
        }}
        onOpenProfilePopover={({ anchorElement, momentId }) => {
          setDesktopAvatarPopover({
            anchorElement,
            kind: "character",
            characterId,
            fallbackAvatar: character?.avatar,
            fallbackName: displayName,
            returnHash: buildDesktopFriendMomentsRouteHash({
              ...routeState,
              momentId: momentId ?? routeSelectedMomentId ?? undefined,
            }),
          });
        }}
        onOpenLikerPopover={({ anchorElement, momentId, like }) => {
          const returnHash = buildDesktopFriendMomentsRouteHash({
            ...routeState,
            momentId: momentId ?? routeSelectedMomentId ?? undefined,
          });
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
        onOpenProfile={() => {
          void navigate({
            to: "/tabs/contacts",
            hash: buildDesktopContactsRouteHash({
              pane: friendItem ? "friend" : "world-character",
              characterId,
              showWorldCharacters: !friendItem,
            }),
          });
        }}
        onTextChange={composeDraft.setText}
        onRemoveImage={(id) => composeDraft.removeImageDraft(id)}
        onRemoveVideo={() => composeDraft.clearVideoDraft()}
        onToggleFavorite={(momentId) => {
          const moment = friendMoments.find((item) => item.id === momentId);
          if (!moment) {
            return;
          }

          const sourceId = `moment-${moment.id}`;
          const collected = favoriteSourceIds.includes(sourceId);
          const nextFavorites = collected
            ? removeDesktopFavorite(sourceId)
            : upsertDesktopFavorite({
                id: `favorite-${sourceId}`,
                sourceId,
                category: "moments",
                title: moment.authorName,
                description: getMomentSummaryText(moment),
                meta: t(msg`朋友圈 · ${formatTimestamp(moment.postedAt)}`),
                to: buildDesktopFriendMomentsPath(characterId, {
                  momentId: moment.id,
                  source: "moments",
                }),
                badge: t(msg`朋友圈`),
                avatarName: moment.authorName,
                avatarSrc: moment.authorAvatar,
              });

          setFavoriteSourceIds(
            nextFavorites.map((favorite) => favorite.sourceId),
          );
        }}
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
                hideMomentsAction: desktopAvatarPopover.characterId === characterId,
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
