import { useEffect, useMemo, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  type MomentLike,
} from "@yinjie/contracts";
import { translateAppErrorCode } from "../lib/error-translate";
import { translateRuntimeMessage, useAppLocale } from "@yinjie/i18n";
import {
  AppPage,
  Button,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
} from "@yinjie/ui";
import { ArrowLeft } from "lucide-react";
import { MomentShareCardModal } from "../components/moment-share-card-modal";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { WeChatActionBubble } from "../components/wechat-action-bubble";
import {
  WeChatCommentBar,
  type WeChatCommentBarReplyTarget,
} from "../components/wechat-comment-bar";
import { WeChatMomentCard } from "../components/wechat-moment-card";
import { WeChatMomentsCover } from "../components/wechat-moments-cover";
import { buildCharacterDetailRouteHash } from "../features/contacts/character-detail-route-state";
import { getFriendDisplayName } from "../features/contacts/contact-utils";
import {
  buildMobileFriendMomentsRouteHash,
  parseMobileFriendMomentsRouteState,
} from "../features/moments/mobile-friend-moments-route-state";
import { stripToolCallSyntax } from "../features/moments/moment-content";
import { usePullToRefresh } from "../features/moments/use-pull-to-refresh";
import { useOptimisticMomentLikeHandlers } from "../features/moments/use-optimistic-like";
import { isDesktopOnlyPath, navigateBackOrFallback } from "../lib/history-back";
import { registerAndroidBackInterceptor } from "../runtime/android-back-button";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

const t = translateRuntimeMessage;

export function MobileFriendMomentsPage() {
  const { characterId } = useParams({
    strict: false,
  }) as {
    characterId?: string;
  };
  const navigate = useNavigate();
  const hash = useRouterState({ select: (state) => state.location.hash });
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const ownerId = useWorldOwnerStore((state) => state.id);
  const ownerUsername = useWorldOwnerStore((state) => state.username);
  const ownerAvatar = useWorldOwnerStore((state) => state.avatar);
  const resolvedCharacterId = characterId ?? "";
  const routeState = useMemo(
    () => parseMobileFriendMomentsRouteState(hash),
    [hash],
  );
  const safeReturnPath =
    routeState.returnPath && !isDesktopOnlyPath(routeState.returnPath)
      ? routeState.returnPath
      : undefined;
  const safeReturnHash = safeReturnPath ? routeState.returnHash : undefined;
  const statusBackLabel = safeReturnPath
    ? t(msg`返回上一页`)
    : resolvedCharacterId
      ? t(msg`查看角色资料`)
      : t(msg`回朋友圈主页`);
  const currentRouteHash = useMemo(
    () =>
      buildMobileFriendMomentsRouteHash({
        returnPath: safeReturnPath,
        returnHash: safeReturnHash,
      }),
    [safeReturnHash, safeReturnPath],
  );
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>(
    {},
  );
  const [actionBubble, setActionBubble] = useState<{
    momentId: string;
    anchorRect: DOMRect;
  } | null>(null);
  const [commentBarTarget, setCommentBarTarget] = useState<{
    momentId: string;
    replyTo: WeChatCommentBarReplyTarget | null;
  } | null>(null);
  const [notice, setNotice] = useState<{
    tone: "success" | "info" | "danger";
    message: string;
    actionLabel?: string;
    action?: () => void;
  } | null>(null);
  // 「分享图卡」目标 — 点 ⋯ → 分享时把 momentId 存下来。
  // 用 id 而不是整个对象，friendMoments 后续刷新时预览也会跟着新。
  const [shareMomentId, setShareMomentId] = useState<string | null>(null);

  const characterQuery = useQuery({
    queryKey: ["app-character", baseUrl, resolvedCharacterId],
    queryFn: () => getCharacter(resolvedCharacterId, baseUrl),
    enabled: Boolean(resolvedCharacterId),
    // 走查 R1：跟 friendsQuery 同款 15s staleTime —— 用户从 contacts /
    // character-detail 过来时该角色资料几秒前刚拉过，回退再进不需要重打 RTT。
    staleTime: 15_000,
  });
  const friendsQuery = useQuery({
    queryKey: ["app-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
    // 走查第七轮 R1：跟 character-detail / contacts-page / chat-details 对齐
    // 15s staleTime——用户在资料页点「TA 的朋友圈」过来，刚才上一个页面已经
    // 拉过 friend 列表，这里不需要再 refetch 一次。
    staleTime: 15_000,
  });
  // ?character=ID 服务端过滤，只回该角色发的几条 ≤几KB，省掉之前 getMoments
  // 全表 ~724KB 的浪费。和「我的朋友圈」（mine=true）走同一类模式，但每个角色
  // 一个独立 cache，避免互相覆盖。
  const momentsQuery = useQuery({
    queryKey: ["app-moments-character", baseUrl, resolvedCharacterId],
    queryFn: () => getCharacterMoments(resolvedCharacterId, baseUrl),
    enabled: Boolean(resolvedCharacterId),
  });
  const blockedQuery = useQuery({
    queryKey: ["app-moments-blocked-characters", baseUrl],
    queryFn: () => getBlockedCharacters(baseUrl),
    enabled: Boolean(resolvedCharacterId),
    // 走查 R1：屏蔽列表变更频率低（用户手动操作），15s staleTime 让 contacts /
    // 朋友圈页之间互跳不每次都打这一次 RTT。
    staleTime: 15_000,
  });

  const optimisticLike = useOptimisticMomentLikeHandlers({
    baseUrl,
    ownerId,
    ownerUsername,
    ownerAvatar,
  });
  // mutation 闭包外的 ref，用来在 onError 里判断 mid-flight 是否切走（切账户 /
  // 切角色）。和 moments-page 主页 mutationBaseUrlRef 同模式 —— 切走后旧账户
  // 的失败不要在新页面冒红条 / 挂重试按钮（按钮闭包指着旧 momentId，重试会 404）。
  const mutationGuardRef = useRef({ baseUrl, characterId: resolvedCharacterId });
  useEffect(() => {
    mutationGuardRef.current = { baseUrl, characterId: resolvedCharacterId };
  }, [baseUrl, resolvedCharacterId]);
  const likeMutation = useMutation({
    mutationFn: (momentId: string) => toggleMomentLike(momentId, baseUrl),
    onMutate: (momentId: string) => {
      const inner = optimisticLike.onMutate(momentId);
      const captured = {
        baseUrl,
        characterId: resolvedCharacterId,
      };
      return Promise.resolve(inner).then((snapshots) => ({
        ...snapshots,
        ...captured,
      }));
    },
    onError: (error, momentId, context) => {
      optimisticLike.onError(error, momentId, context);
      // mid-flight 切到别的角色 / 切账户：当时点赞那条帖子在新页面不存在，
      // 红条 + 「重试点赞」按钮（按钮闭包还指着旧 momentId → 重试也是 404）
      // 只会把用户搞糊涂。和 R7/R8/R9 mid-flight 关 sheet 失败时静默吞错同思路。
      const guard = mutationGuardRef.current;
      if (
        context &&
        (context.baseUrl !== guard.baseUrl ||
          context.characterId !== guard.characterId)
      ) {
        return;
      }
      setNotice({
        tone: "danger",
        // 走查 R2：translateAppErrorCode 优先按 errorCode 命中 i18n 字典出
        // 当前 locale 文案；非 AppError / 字典 miss 时回退到 raw err.message
        // （server legacyMessage 中文兜底）。和 moments-page 主页同模式，把
        // 非 zh-CN 用户看到的硬编码中文错误堵掉。
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
      // mid-flight 切角色 / 切账户：成功 toast 冒在新页面里没有任何对应 UI 变化，
      // 反而误导。和 onError 同 guard。
      const guard = mutationGuardRef.current;
      if (
        context &&
        (context.baseUrl !== guard.baseUrl ||
          context.characterId !== guard.characterId)
      ) {
        return;
      }
      setNotice({
        tone: "success",
        message: t(msg`朋友圈互动已更新。`),
      });
      // 点赞 toggle 是 boolean，optimistic 已把 likes 切对。完全省掉 invalidate，
      // 避免拉回 GET /api/moments 全量 + 30+ media 条件请求 RTT。
    },
  });
  // mutationFn 不能再次读 commentDrafts 取文本：onMutate 里的 setCommentDrafts(clear)
  // 会在 onMutate 返回的微任务边界被 React 18 flush 掉，等 TanStack Query 调
  // mutationFn 时闭包里的 commentDrafts[momentId] 已经是空串。和 moments-page
  // 主页一样：在 onMutate 里把 text/target 写进 ref，mutationFn 直接读 ref。
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
    // onMutate: optimistic 插入临时评论 + 清输入/回复目标 + 关闭评论条。公网隧道
    // ~600ms RTT 下，原 onSuccess 才清/关会让用户体感"卡好几秒"。临时 id 以
    // 'optimistic-comment-' 前缀打标，onSuccess 把它原地换成 server 真实 comment；
    // onError 回滚整个 snapshot 并恢复 draft / commentBar，让用户能改后重发。
    onMutate: async (momentId: string) => {
      const text = commentDrafts[momentId]?.trim();
      if (!text || !ownerId) {
        return { skipped: true as const };
      }
      const target =
        commentBarTarget?.momentId === momentId
          ? commentBarTarget.replyTo
          : null;
      commentSubmitArgsRef.current[momentId] = {
        text,
        target: target
          ? { commentId: target.commentId, authorId: target.authorId }
          : null,
      };

      // 这页只用 character cache 做主显示，但点赞/评论后扁平 + paged 也得跟，
      // 否则用户切到主朋友圈 / profile 还得等 600ms refetch 才看到新评论。
      await Promise.all([
        queryClient.cancelQueries({
          queryKey: ["app-moments-character", baseUrl, resolvedCharacterId],
        }),
        queryClient.cancelQueries({ queryKey: ["app-moments", baseUrl] }),
        queryClient.cancelQueries({
          queryKey: ["app-moments-paged", baseUrl],
        }),
      ]);

      const characterSnapshots = queryClient.getQueriesData<Moment[]>({
        queryKey: ["app-moments-character", baseUrl],
      });
      const flatSnapshots = queryClient.getQueriesData<Moment[]>({
        queryKey: ["app-moments", baseUrl],
      });
      const pagedSnapshots = queryClient.getQueriesData<unknown>({
        queryKey: ["app-moments-paged", baseUrl],
      });

      // 走查 R1：Date.now() 同毫秒能撞 —— 用户快速回复两条评论 / 公网慢链路下
      // 评论 mutation 失败后立刻重试，前后两次 tempId 落到同一毫秒会让 onSuccess
      // 找到错误的 optimistic 行替换。加 random 后缀让碰撞概率退化到可忽略。
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

      characterSnapshots.forEach(([key, data]) => {
        if (!data) return;
        queryClient.setQueryData<Moment[]>(key, data.map(appendComment));
      });
      flatSnapshots.forEach(([key, data]) => {
        if (!data) return;
        queryClient.setQueryData<Moment[]>(key, data.map(appendComment));
      });
      // paged 用 InfiniteData，结构稍复杂，独立处理避免 TS narrow 噪音。
      pagedSnapshots.forEach(([key, raw]) => {
        const data = raw as
          | { pages: Array<{ items: Moment[] } & Record<string, unknown>>; pageParams: unknown[] }
          | undefined;
        if (!data) return;
        queryClient.setQueryData(key, {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.map(appendComment),
          })),
        });
      });

      const savedDraft = commentDrafts[momentId] ?? "";
      const savedBar =
        commentBarTarget?.momentId === momentId ? commentBarTarget : null;
      // 钉住触发时刻的 baseUrl / characterId —— mid-flight 切走时 onError 比对，
      // 旧 context 不要 reopen 一个指着别的角色 / 别的账户帖子的 commentBar。
      const mutationBaseUrl = baseUrl;
      const mutationCharacterId = resolvedCharacterId;
      setCommentDrafts((current) => ({ ...current, [momentId]: "" }));
      setCommentBarTarget((current) =>
        current?.momentId === momentId ? null : current,
      );

      return {
        skipped: false as const,
        characterSnapshots,
        flatSnapshots,
        pagedSnapshots,
        tempId,
        momentId,
        savedDraft,
        savedBar,
        mutationBaseUrl,
        mutationCharacterId,
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
    onSuccess: (realComment, momentId, context) => {
      delete commentSubmitArgsRef.current[momentId];
      // mid-flight 切走（角色 / 账户）：success toast 在新页面里冒「朋友圈互动已
      // 更新」很误导（用户在这里啥都没做），下面的 setQueriesData 也用的是当前
      // baseUrl，往 wrong cache 里写「temp 评论替换成 realComment」是 no-op
      // （新页面 cache 里压根没那条 moment），顺手跳过省一次空操作。
      const guard = mutationGuardRef.current;
      if (
        context &&
        !context.skipped &&
        (context.mutationBaseUrl !== guard.baseUrl ||
          context.mutationCharacterId !== guard.characterId)
      ) {
        return;
      }
      setNotice({
        tone: "success",
        message: t(msg`朋友圈互动已更新。`),
      });
      // 把 optimistic temp（id=optimistic-comment-*）原地替换为 server 真实评论。
      // 完全省掉一次 invalidate 触发的 GET /api/moments + paged refetch
      // ——公网隧道下 refetch 会带回 30+ media 条件请求 RTT，是评论后体感
      // "页面又卡一下"的主要原因。staleTime 期间用户拿不到其它 NPC 同时段写
      // 的评论，但 pull-to-refresh / re-mount 都能补；可接受。
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
          { queryKey: ["app-moments-character", baseUrl] },
          (data) => (data ? data.map(replaceComment) : data),
        );
        queryClient.setQueriesData<Moment[]>(
          { queryKey: ["app-moments", baseUrl] },
          (data) => (data ? data.map(replaceComment) : data),
        );
        queryClient.setQueriesData(
          { queryKey: ["app-moments-paged", baseUrl] },
          (raw) => {
            const data = raw as
              | {
                  pages: Array<
                    { items: Moment[] } & Record<string, unknown>
                  >;
                  pageParams: unknown[];
                }
              | undefined;
            if (!data) return data;
            return {
              ...data,
              pages: data.pages.map((page) => ({
                ...page,
                items: page.items.map(replaceComment),
              })),
            };
          },
        );
      }
    },
    onError: (error, momentId, context) => {
      delete commentSubmitArgsRef.current[momentId];
      // mid-flight 切角色 / 切账户：当时 reply 的那条帖子在新页面不存在，
      // 既不能 reopen commentBar（弹出来悬空指向不存在的 moment），也不该弹
      // 「评论失败」红条 —— 用户已经离开当时的对话语境了，把红条递到新页面
      // 上跟当前操作完全不相干。和 R7 (e9b10ad8) 同模式：mid-flight 关 sheet
      // 失败时静默吞错。cache 回滚也跳过 —— 旧 baseUrl/character cache 用户
      // 已经看不到了，恢复回 optimistic 之前没意义。
      const guard = mutationGuardRef.current;
      if (
        context &&
        !context.skipped &&
        (context.mutationBaseUrl !== guard.baseUrl ||
          context.mutationCharacterId !== guard.characterId)
      ) {
        return;
      }
      if (context && !context.skipped) {
        context.characterSnapshots.forEach(([key, data]) => {
          queryClient.setQueryData(key, data);
        });
        context.flatSnapshots.forEach(([key, data]) => {
          queryClient.setQueryData(key, data);
        });
        context.pagedSnapshots.forEach(([key, data]) => {
          queryClient.setQueryData(key, data);
        });
        // 恢复 drafts / commentBar，让用户能改后重发。
        setCommentDrafts((current) => ({
          ...current,
          [context.momentId]: context.savedDraft,
        }));
        if (context.savedBar) {
          setCommentBarTarget(context.savedBar);
        }
      }
      // 失败走顶 notice danger 红条 + 「评论失败：」前缀。不挂「重试」按钮：
      // commentBar 已经被恢复到 onError 之前的状态，用户直接在评论框里点
      // 「发送」就能再试，跟主朋友圈页处理一致。
      setNotice({
        tone: "danger",
        // 走查 R2：同 likeMutation 的 translateAppErrorCode 处理。
        message: isApiRequestError(error)
          ? t(msg`评论失败：${translateAppErrorCode(error) ?? error.message}`)
          : error instanceof Error
            ? t(msg`评论失败：${error.message}`)
            : t(msg`评论失败，请稍后重试。`),
      });
    },
  });

  const friendItem = useMemo(
    () =>
      (friendsQuery.data ?? []).find(
        (item) => item.character.id === resolvedCharacterId,
      ) ?? null,
    [friendsQuery.data, resolvedCharacterId],
  );
  const character = characterQuery.data ?? friendItem?.character ?? null;
  const isBlocked = Boolean(
    (blockedQuery.data ?? []).some(
      (item) => item.characterId === resolvedCharacterId,
    ),
  );
  const displayName = friendItem
    ? getFriendDisplayName(friendItem)
    : character?.name || t(msg`角色朋友圈`);
  const blockedCharacterIds = useMemo(
    () => new Set((blockedQuery.data ?? []).map((item) => item.characterId)),
    [blockedQuery.data],
  );
  // 服务端按 ?character=ID 已经把非该角色的帖子过滤掉了，且 ORDER BY postedAt
  // DESC —— 这里只需要再过一遍黑名单（防御性：用户刚把该角色加黑时立刻清空
  // 朋友圈卡片，比等服务端 refetch 快）。客户端再 sort 一遍是冗余 ——
  // 8 条帖子 16 次 new Date 影响不大，但输入评论草稿时父组件每次按键都
  // re-render，叠加 N 个 useMemo 重算会把高频 setState 路径多吃几 ms。
  const friendMoments = useMemo(
    () =>
      (momentsQuery.data ?? []).filter((moment) => {
        if (blockedCharacterIds.has(moment.authorId)) return false;
        // 第二次走查 R1：跟主朋友圈页同款——AI 角色偶尔把 [TOOL_CALL] /
        // <tool_call> 当正文发，wechat-moment-card 把 text strip 成空 +
        // 无 media → 卡片只剩头像/时间戳/⋯ + 评论挂着孤儿。父层先过滤掉
        // 整张「空胶水」卡片。
        const stripped = stripToolCallSyntax(moment.text);
        if (!stripped && moment.media.length === 0 && !moment.location) {
          return false;
        }
        return true;
      }),
    [blockedCharacterIds, momentsQuery.data],
  );
  // 时间线左边那列「日 / 月」的预格式化。之前在 friendMoments.map 内联里每条
  // moment 渲染时都 new 一个 Intl.DateTimeFormat —— 30 条 × 父组件每个 setState
  // 都重渲一次 = 海量 ICU 实例化，输入评论草稿那种高频 re-render 直接吃掉
  // 主线程几十 ms。把 formatter 抬出 map + 整批 useMemo 缓存。
  const { locale: activeLocale } = useAppLocale();
  const momentDateLabels = useMemo(() => {
    const monthFormatter = new Intl.DateTimeFormat(activeLocale, {
      month: "long",
    });
    return friendMoments.map((moment) => {
      const date = new Date(moment.postedAt);
      if (Number.isNaN(date.getTime())) {
        return { dayLabel: "--", monthLabel: "--" };
      }
      return {
        dayLabel: `${date.getDate()}`.padStart(2, "0"),
        monthLabel: monthFormatter.format(date),
      };
    });
  }, [activeLocale, friendMoments]);
  const relationshipLoading = friendsQuery.isLoading || blockedQuery.isLoading;
  const timelineLoading = momentsQuery.isLoading || relationshipLoading;
  const pendingCommentMomentId = commentMutation.isPending
    ? commentMutation.variables
    : null;

  // 走查 R3：跟 mutation onError 同一类 i18n 一致化——4 个 query 失败信息显示
  // 在 ErrorBlock 列表上，之前直拼 server legacyMessage（始终中文），非 zh-CN
  // locale 用户看到的就是中文。和 profile-moments-page 同模式：先按 errorCode
  // 命中字典，miss 才回退 raw message。
  const resolveQueryErrorMessage = (error: unknown): string | null => {
    if (!(error instanceof Error)) return null;
    if (isApiRequestError(error)) {
      return translateAppErrorCode(error) ?? error.message;
    }
    return error.message;
  };
  const errors: string[] = [];
  if (characterQuery.isError) {
    const m = resolveQueryErrorMessage(characterQuery.error);
    if (m) errors.push(m);
  }
  if (friendsQuery.isError) {
    const m = resolveQueryErrorMessage(friendsQuery.error);
    if (m) errors.push(m);
  }
  if (momentsQuery.isError) {
    const m = resolveQueryErrorMessage(momentsQuery.error);
    if (m) errors.push(m);
  }
  if (blockedQuery.isError) {
    const m = resolveQueryErrorMessage(blockedQuery.error);
    if (m) errors.push(m);
  }

  useEffect(() => {
    setCommentDrafts({});
    setNotice(null);
    setCommentBarTarget(null);
    setActionBubble(null);
    // shareMomentId 也要清——同一个 MobileFriendMomentsPage 实例在 characterId 变
    // 化时只 re-render 不 unmount（TanStack Router 同 route 复用组件），如果在
    // 角色 A 上打开了分享卡片然后导航到 B：B 的 friendMoments 里找不到 A 的
    // 那条 moment → shareMoment === null → MomentShareCardModal 隐藏。但
    // shareMomentId 仍然挂在 "A 的 momentId"。一旦再返回 A 的 moments 加载回
    // 来，shareMoment 又能 find 到，分享卡片自动重开，体验是"我没点为啥
    // 突然冒出来"。
    setShareMomentId(null);
    // pending 的评论 ref 也清——同样道理：A 上还没结算的评论 ref 残留到 B，
    // 虽然 mutationFn 用 momentId 拿对应 args，但 ref 占内存且语义上属于
    // 上一个角色页。onSuccess/onError 也会清，这里只是兜底防御。
    commentSubmitArgsRef.current = {};
  }, [baseUrl, resolvedCharacterId]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => setNotice(null), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // Android 硬件 Back：弹层打开时先收弹层（评论条 > 行动菜单 > 分享卡片），
  // 与 publish / chat 系列最近的 Back 行为对齐——别把整页退掉。
  useEffect(() => {
    const hasOverlay = Boolean(
      commentBarTarget || actionBubble || shareMomentId,
    );
    if (!hasOverlay) return;
    return registerAndroidBackInterceptor((event) => {
      event.preventDefault();
      if (commentBarTarget) {
        setCommentBarTarget(null);
        return true;
      }
      if (actionBubble) {
        setActionBubble(null);
        return true;
      }
      setShareMomentId(null);
      return true;
    });
  }, [actionBubble, commentBarTarget, shareMomentId]);

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

  function openCharacterDetail() {
    if (!resolvedCharacterId) {
      return false;
    }

    void navigate({
      to: "/character/$characterId",
      params: { characterId: resolvedCharacterId },
      hash: buildCharacterDetailRouteHash({
        returnPath: `/friend-moments/${resolvedCharacterId}`,
        returnHash: currentRouteHash || undefined,
      }),
    });
    return true;
  }

  function openLikerCharacterDetail(like: MomentLike) {
    if (like.authorType === "user") {
      // 用户自己点赞过的帖子，点击赞列表里自己的名字 — 之前 silently no-op，
      // 链接样式 (蓝色 + 下划线 hover) 又把名字渲染成可点击的按钮，看起来像
      // 一个坏掉的按钮。带到 /profile/moments（我的朋友圈），跟点击角色名字
      // 跳角色资料的语义对齐 ——「点谁的名字看谁的朋友圈」。
      void navigate({ to: "/profile/moments" });
      return;
    }
    if (like.authorType !== "character") {
      return;
    }
    void navigate({
      to: "/character/$characterId",
      params: { characterId: like.authorId },
      hash: buildCharacterDetailRouteHash({
        returnPath: `/friend-moments/${resolvedCharacterId}`,
        returnHash: currentRouteHash || undefined,
      }),
    });
  }

  function handleBack() {
    const expectedPreviousPath =
      safeReturnPath ??
      (resolvedCharacterId
        ? `/character/${resolvedCharacterId}`
        : "/discover/moments");
    navigateBackOrFallback(
      () => {
        if (navigateToRouteStateReturn()) {
          return;
        }

        if (openCharacterDetail()) {
          return;
        }

        void navigate({ to: "/discover/moments" });
      },
      expectedPreviousPath,
    );
  }

  function handleRetryLoad() {
    void momentsQuery.refetch();
    void blockedQuery.refetch();
  }

  const { containerRef, state: pullState } = usePullToRefresh({
    onRefresh: async () => {
      // 走查 R2：refetch() 在 TanStack Query v5 默认不会 reject —— 错误落到
      // result.error 而不是抛出，Promise.all 也就吞不掉错误。之前网络挂死时
      // 用户看到指示器走完一遍消失，但根本不知道列表没换。和 moments-page mobile
      // 下拉刷新失败的 danger notice 通道对齐：每个 refetch 单独看 result.error，
      // 任何一个失败都冒到顶部红条 2.4s 自动收。
      const results = await Promise.all([
        momentsQuery.refetch(),
        blockedQuery.refetch(),
        friendsQuery.refetch(),
        characterQuery.refetch(),
      ]);
      const failed = results.find((r) => r.isError && r.error instanceof Error);
      if (failed?.error instanceof Error) {
        const failedError = failed.error;
        setNotice({
          tone: "danger",
          // 走查 R2：translateAppErrorCode 同 mutation onError 处理。
          message: isApiRequestError(failedError)
            ? t(
                msg`刷新失败：${translateAppErrorCode(failedError) ?? failedError.message}`,
              )
            : t(msg`刷新失败：${failedError.message}`),
        });
      }
    },
    enabled: Boolean(resolvedCharacterId),
  });

  if (!resolvedCharacterId) {
    return (
      <AppPage className="space-y-0 px-0 py-0">
        <TabPageTopBar
          title={t(msg`朋友圈`)}
          subtitle={t(msg`好友`)}
          titleAlign="center"
          className="mx-0 mb-0 mt-0 border-b border-[#ECECEC] bg-white px-4 pb-1.5 pt-1.5 text-[#1A1A1A] shadow-none"
          leftActions={
            <Button
              onClick={handleBack}
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full border-0 bg-transparent text-[#1A1A1A] active:bg-black/[0.05]"
              aria-label={t(msg`返回`)}
            >
              <ArrowLeft size={17} />
            </Button>
          }
        />
        <div className="px-4 py-6">
          <ErrorBlock message={t(msg`角色资料不存在，暂时无法打开朋友圈。`)} />
        </div>
      </AppPage>
    );
  }

  const activeMoment = actionBubble
    ? friendMoments.find((moment) => moment.id === actionBubble.momentId) ??
      null
    : null;
  // 用 authorId === ownerId 而不是 authorType === "user"——跟 moments-page
  // 主页一致。authorType==='user' 的语义是"任何用户类型点赞者"，单世界主人
  // 架构下两个判定等价，但若 cache 残留多用户脏数据（历史 multi-owner 实验 /
  // 帐号切换残值）会把 actionBubble 错显示成"已赞"。
  const liked = Boolean(
    ownerId && activeMoment?.likes.some((like) => like.authorId === ownerId),
  );

  const shareMoment = shareMomentId
    ? friendMoments.find((moment) => moment.id === shareMomentId) ?? null
    : null;
  const shareLiked = Boolean(
    ownerId && shareMoment?.likes.some((like) => like.authorId === ownerId),
  );

  const onCommentTap = (momentId: string, comment: MomentComment | null) => {
    setCommentBarTarget({
      momentId,
      replyTo: comment
        ? {
            authorId: comment.authorId,
            authorName: comment.authorName,
            commentId: comment.id,
          }
        : null,
    });
  };

  return (
    <AppPage className="relative space-y-0 bg-white px-0 pb-0 pt-0">
      <TabPageTopBar
        title={displayName}
        titleAlign="center"
        className="mx-0 mb-0 mt-0 border-b border-[#ECECEC] bg-white px-4 pb-1.5 pt-1.5 text-[#1A1A1A] shadow-none"
        leftActions={
          <Button
            onClick={handleBack}
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full border-0 bg-transparent text-[#1A1A1A] active:bg-black/[0.05]"
            aria-label={t(msg`返回`)}
          >
            <ArrowLeft size={17} />
          </Button>
        }
      />

      <div
        ref={containerRef}
        className="relative flex-1 overflow-y-auto overscroll-contain bg-white"
        style={{ overflowAnchor: "none" }}
      >
        {pullState.offset || pullState.refreshing ? (
          <div
            className="pointer-events-none absolute left-0 right-0 z-10 flex items-center justify-center text-[12px] text-[#9A9A9A]"
            style={{ top: 0, height: `${pullState.offset || 60}px` }}
          >
            <span>
              {pullState.refreshing
                ? t(msg`正在刷新...`)
                : pullState.offset >= 64
                  ? t(msg`松手刷新`)
                  : t(msg`下拉刷新`)}
            </span>
          </div>
        ) : null}

        <div
          style={{
            transform: `translateY(${pullState.offset}px)`,
            transition: pullState.pulling ? "none" : "transform 220ms ease-out",
          }}
        >
          <WeChatMomentsCover
            nickname={displayName}
            avatarUrl={character?.avatar}
            onAvatarTap={(event) => {
              event.stopPropagation();
              openCharacterDetail();
            }}
          />

          {notice ? (
            <div className="px-4 pt-3">
              <InlineNotice
                tone={notice.tone}
                className="rounded-[8px] px-3 py-2 text-[12px] shadow-none"
              >
                {notice.action && notice.actionLabel ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 flex-1">{notice.message}</span>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-7 shrink-0 rounded-full border-[#E5E5E5] bg-white px-3 text-[11px]"
                      onClick={notice.action}
                    >
                      {notice.actionLabel}
                    </Button>
                  </div>
                ) : (
                  notice.message
                )}
              </InlineNotice>
            </div>
          ) : null}

          {!character && (characterQuery.isLoading || friendsQuery.isLoading) ? (
            <div className="px-4 pt-10">
              <LoadingBlock
                label={t(msg`正在读取角色朋友圈...`)}
                className="border-0 bg-transparent py-2 shadow-none"
              />
            </div>
          ) : null}

          {!character &&
          !characterQuery.isLoading &&
          !friendsQuery.isLoading ? (
            <section className="mx-4 mt-4 rounded-[12px] border border-[#ECECEC] bg-white px-4 py-5">
              <div className="text-[16px] font-semibold text-[#1A1A1A]">
                {t(msg`无法打开这位角色的朋友圈`)}
              </div>
              <div className="mt-2 text-[13px] leading-6 text-[#9A9A9A]">
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
                  onClick={() => {
                    if (navigateToRouteStateReturn()) return;
                    if (openCharacterDetail()) return;
                    void navigate({ to: "/discover/moments" });
                  }}
                >
                  {safeReturnPath
                    ? t(msg`回到来源页`)
                    : resolvedCharacterId
                      ? t(msg`查看角色资料`)
                      : t(msg`去朋友圈主页`)}
                </Button>
              </div>
            </section>
          ) : null}

          {character && timelineLoading && !friendMoments.length ? (
            <div className="px-4 pt-10 pb-12 text-center text-[12px] text-[#9A9A9A]">
              {t(msg`正在刷新这位角色的朋友圈`)}
            </div>
          ) : null}

          {character && !timelineLoading && momentsQuery.isError ? (
            <div className="px-4 pt-10 pb-12 text-center">
              <div className="text-[14px] font-medium text-[#1A1A1A]">
                {t(msg`朋友圈暂时不可用`)}
              </div>
              <div className="mt-2 text-[12px] text-[#9A9A9A]">
                {resolveQueryErrorMessage(momentsQuery.error) ??
                  t(msg`读取这位角色的朋友圈时出错了。`)}
              </div>
              <div className="mt-4 flex justify-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 rounded-full border-[#E5E5E5] bg-white px-3.5 text-[11px]"
                  onClick={handleRetryLoad}
                >
                  {t(msg`重试读取`)}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 rounded-full border-[#E5E5E5] bg-white px-3.5 text-[11px]"
                  onClick={handleBack}
                >
                  {statusBackLabel}
                </Button>
              </div>
            </div>
          ) : null}

          {character && !timelineLoading && !momentsQuery.isError && isBlocked ? (
            <div className="px-4 pt-10 pb-12 text-center">
              <div className="text-[14px] font-medium text-[#1A1A1A]">
                {t(msg`这位角色的朋友圈当前不可见`)}
              </div>
              <div className="mt-2 text-[12px] text-[#9A9A9A]">
                {t(msg`你已经将这位角色加入黑名单，相关朋友圈内容会先隐藏。`)}
              </div>
            </div>
          ) : null}

          {character &&
          !timelineLoading &&
          !momentsQuery.isError &&
          !isBlocked &&
          !friendMoments.length ? (
            <div className="px-4 pt-12 pb-16 text-center">
              <div className="text-[14px] font-medium text-[#1A1A1A]">
                {t(msg`${displayName} 还没有发表朋友圈`)}
              </div>
              <div className="mt-2 text-[12px] text-[#9A9A9A]">
                {t(msg`先把这页留着，等 TA 下次更新时再回来看看。`)}
              </div>
            </div>
          ) : null}

          {character &&
          !timelineLoading &&
          !momentsQuery.isError &&
          !isBlocked &&
          friendMoments.length
            ? friendMoments.map((moment, index) => {
                const { dayLabel, monthLabel } = momentDateLabels[index] ?? {
                  dayLabel: "--",
                  monthLabel: "--",
                };
                return (
                  <div
                    key={moment.id}
                    className={
                      index === 0
                        ? "yj-list-item-virtual-card"
                        : "yj-list-item-virtual-card border-t border-[#ECECEC]"
                    }
                  >
                    <div className="flex items-start gap-2 px-4 py-3.5">
                      <div className="w-12 shrink-0 pt-1 text-right">
                        <div className="text-[26px] font-semibold leading-none text-[#1A1A1A]">
                          {dayLabel}
                        </div>
                        <div className="mt-1 text-[11px] tracking-[0.04em] text-[#9A9A9A]">
                          {monthLabel}
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <WeChatMomentCard
                          cardId={`moment-post-${moment.id}`}
                          moment={moment}
                          ownerId={ownerId}
                          liked={Boolean(
                            ownerId &&
                              moment.likes.some(
                                (like) => like.authorId === ownerId,
                              ),
                          )}
                          hideAuthor
                          flush
                          onAuthorTap={openCharacterDetail}
                          onOpenActionMenu={(rect) =>
                            setActionBubble({
                              momentId: moment.id,
                              anchorRect: rect,
                            })
                          }
                          onDoubleTapLike={() =>
                            likeMutation.mutate(moment.id)
                          }
                          onCommentTap={(comment) =>
                            onCommentTap(moment.id, comment)
                          }
                          onLikeAuthorTap={openLikerCharacterDetail}
                        />
                      </div>
                    </div>
                  </div>
                );
              })
            : null}

          {/* like/comment 失败统一上提到顶部 notice（danger 红条 + 失败前缀 +
              点赞带「重试点赞」），不再单独挂底部一块永驻的 tone="info" 错误块。
              和 chat Round 6 / 主朋友圈页失败提示色调一致。 */}

          <div className="h-[calc(env(safe-area-inset-bottom,0px)+24px)]" />
        </div>
      </div>

      <WeChatActionBubble
        open={Boolean(actionBubble)}
        anchorRect={actionBubble?.anchorRect ?? null}
        liked={liked}
        onLike={() => {
          if (actionBubble) {
            likeMutation.mutate(actionBubble.momentId);
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
        onClose={() => setActionBubble(null)}
      />

      <MomentShareCardModal
        moment={shareMoment}
        liked={shareLiked}
        ownerId={ownerId}
        // 走查 R3：watermark "{name} 的 AI 朋友圈" 里的 name 是**世界主人**的
        // 用户名（"我的 AI 世界"品牌），不是被分享的那位角色名。之前传 displayName
        // （角色名 / 备注名）会让用户在分享 陆远 朋友圈卡片时水印写"陆远 的 AI 朋友圈"，
        // 跟主朋友圈页 (moments-page) 与"我的朋友圈" (profile-moments-page) 一致改成
        // ownerUsername || 世界主人 兜底。
        ownerDisplayName={ownerUsername?.trim() || t(msg`世界主人`)}
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
            setCommentDrafts((current) => ({
              ...current,
              [commentBarTarget.momentId]: value,
            }));
          }
        }}
        pending={
          commentBarTarget
            ? pendingCommentMomentId === commentBarTarget.momentId
            : false
        }
        errorMessage={
          // 走查 R1：跟主朋友圈页同款——评论失败时 onError 把 savedBar 重新
          // 设回去，但失败信息只在顶 notice 里显示，被 bar 的 z=1000 backdrop
          // 盖死。透传给 bar 内 textarea 上方 errorMessage 槽；用 variables ===
          // 当前 bar 上的 momentId gate 住，切到另一条 moment 重开 bar 不带旧错误。
          // 走查 R4：用 resolveQueryErrorMessage 走 i18n 字典，让非 zh-CN 用户
          // 看到本地化文案而不是 server legacyMessage 的中文。
          commentMutation.isError &&
          commentMutation.variables === commentBarTarget?.momentId
            ? resolveQueryErrorMessage(commentMutation.error)
            : null
        }
        onSubmit={() => {
          if (commentBarTarget) {
            commentMutation.mutate(commentBarTarget.momentId);
          }
        }}
        onClose={() => setCommentBarTarget(null)}
      />
    </AppPage>
  );
}
