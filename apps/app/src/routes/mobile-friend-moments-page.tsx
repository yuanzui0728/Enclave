import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
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
import { describeRequestError } from "../lib/request-error";
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
  // 走查本轮 R2：同帧双击守卫 —— 和 moments-page / profile-moments-page R5 同
  // 模板。likeMutation onError 把「重试点赞」按钮挂到 notice.action 上，原版是
  // 裸 `() => likeMutation.mutate(momentId)`：用户在 InlineNotice 上双击「重试
  // 点赞」会同帧触发 2 次 mutate，React 没来得及 commit isPending=true，stale
  // closure 两次都通过 → 2 个 POST /api/moments/{id}/like 同时飞 → toggle 多翻
  // 一轮（点赞失败状态在 cache 里被回滚到"未赞"，重试两次反而又翻成"已赞"，但
  // 用户的语义只是"再试一次"）。按 momentId 维度分别记账让不同 moment 互不影响。
  const likeInflightRef = useRef<Record<string, boolean>>({});
  // 走查移动端朋友圈/Round 4 R1：同帧双击守卫 —— 跟 likeInflightRef 同模板，
  // 之前只挂到 notice 重试按钮上漏了 onSubmit 主提交路径。WeChatCommentBar 内的
  // submittingRef 是 bar 自己的本地 ref，对接 onSubmit 之外不可达；但 commentBar
  // 在 onMutate 同步 setCommentBarTarget(null) 之后会 unmount，bar 内 submittingRef
  // 直接随 unmount 丢掉，下一次开同条 moment 的 bar 又是 fresh ref —— 真正 mid-flight
  // 期间用户重开 bar 再次点发送（同条 moment / 跨条 moment）时 submittingRef 已经
  // false，会真的再发一次。改用页面级 commentInflightRef，按 momentId 维度记账，
  // 跟 moments-page / profile-moments-page 同模板。
  const commentInflightRef = useRef<Record<string, boolean>>({});
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
          ? t(msg`点赞失败：${translateAppErrorCode(error) ?? describeRequestError(error)}`)
          : error instanceof Error
            ? t(msg`点赞失败：${describeRequestError(error)}`)
            : t(msg`点赞失败，请稍后重试。`),
        actionLabel: t(msg`重试点赞`),
        // 本轮 R2：双击守卫——见 likeInflightRef 注释。
        // 走查再一轮 R1（防御）：和 moments-page (desktop) onError retry 同款 try-catch
        // 兜底——同一把 likeInflightRef 跨 3 处入口共用（重试 / onDoubleTapLike / 行动菜单
        // onLike）；任一入口 mutate() 同步抛错都会让该 momentId 的 ref 卡 true，其余 2 处
        // 入口对同条 moment 的点心操作全被 ref guard 早返"假死"，只能整页刷新。
        action: () => {
          if (likeInflightRef.current[momentId]) return;
          likeInflightRef.current[momentId] = true;
          try {
            likeMutation.mutate(momentId, {
              onSettled: () => {
                delete likeInflightRef.current[momentId];
              },
            });
          } catch (mutateError) {
            delete likeInflightRef.current[momentId];
            throw mutateError;
          }
        },
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
        // 走查移动端发现-朋友圈/新一轮 R1：和 use-optimistic-like.ts L107 /
        // moments-page.tsx L759 同款修法 —— `??` 只 catch null/undefined；
        // ownerUsername 为 "" / "   "（store setter 用 nullish coalescing 可能
        // 保留显式 ""）时 optimistic comment 的 authorName 落地为空，wechat-
        // moment-card 渲染评论行是 `<span>{authorName}</span>...<span>：{cleanCommentText}</span>`，
        // authorName 为空时 UI 上是 "：评论内容"（前面没人，看着像 UI 坏）。
        // 用 `?.trim() ||` 兜下空字符串。
        authorName: ownerUsername?.trim() || t(msg`我`),
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
          ? t(msg`评论失败：${translateAppErrorCode(error) ?? describeRequestError(error)}`)
          : error instanceof Error
            ? t(msg`评论失败：${describeRequestError(error)}`)
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
        //
        // 本轮 R1 (perf)：早返放行——「空胶水帖」只可能发生在 text-only moment
        // 上；只要 moment 有 media 或 location，最终 return true 的分支已经盖死，
        // 不需要走一遍 stripToolCallSyntax 正则。和 moments-page.tsx mobile 主页
        // 同 R5 修法对齐：图文 moment 跑这条 useMemo 时不烧无谓正则，输入评论
        // 草稿那种高频父级 re-render 路径上能省下毫秒级的主线程占用。
        if (moment.media.length > 0 || moment.location) {
          return true;
        }
        const stripped = stripToolCallSyntax(moment.text);
        if (!stripped) {
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
    return friendMoments.map((moment, index) => {
      // 走查移动端朋友圈/Round 5 R1：和 profile-moments-page R1 同模板对齐 ——
      // 之前每条 moment 都画日期列，同一天发的多条 moment 会 stack 出多个一样
      // 的 "23 May"，跟 WeChat / profile-moments 的"同一天只显示在第一条"惯例
      // 不一致。后续 moment 的日期格仍占 w-12 宽度保持卡片对齐，但内容留空。
      const previous = index > 0 ? friendMoments[index - 1] : null;
      const showDate =
        !previous || !isSameLocalDay(previous.postedAt, moment.postedAt);
      if (!showDate) {
        return { showDate: false as const, dayLabel: "", monthLabel: "" };
      }
      const date = new Date(moment.postedAt);
      if (Number.isNaN(date.getTime())) {
        return { showDate: true as const, dayLabel: "--", monthLabel: "--" };
      }
      return {
        showDate: true as const,
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
      return translateAppErrorCode(error) ?? describeRequestError(error);
    }
    return describeRequestError(error);
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
    // 走查本轮 R1：mutation reset 跟 moments-page line 1313-1316 同模板补齐 ——
    // 角色 A 上评论 moment X 失败后 commentMutation.isError / .variables / .error
    // 全挂着；用户切到 B 再切回 A 再点 moment X 评论：commentBarTarget.momentId === X
    // 命中 errorMessage gate (line 1199-1202)，old A 的失败原文重新冒到 bar 里冒红条
    // 误导成"我刚打开 bar 就出错"。同款问题：likeMutation 失败后 notice 已清但 isError
    // 残留——本页没直接拿它渲 UI（重试按钮挂在 notice.action 里），但 hygiene 上随手清。
    // reset() 只清状态不取消 in-flight；in-flight 后续 onError/onSuccess 还有 mutationGuard
    // 拦住，安全。
    likeMutation.reset();
    commentMutation.reset();
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
  //
  // 走查移动端朋友圈/新一轮 R1：之前 deps `[actionBubble, commentBarTarget,
  // shareMomentId]` 让 effect 每次状态对象身份变化都 unregister + re-register
  // 一遍。例如评论从 moment X 切到 moment Y（commentBarTarget 对象引用变），
  // 或快速连点 ⋯ 切换 actionBubble 锚卡片 → interceptor add/remove。和
  // moments-page.tsx (MobileMomentsView 内 line 2591-2628) 已经走的 hasOverlay
  // 布尔 + backInterceptorRef 模式对齐：interceptor 只在 overlay 整体开/关
  // 翻转时挂一次，中间状态切换走 ref 读最新值，避免 listener cleanup-storm。
  const backInterceptorRef = useRef({
    commentBarTarget,
    actionBubble,
    setCommentBarTarget,
    setActionBubble,
    setShareMomentId,
  });
  useEffect(() => {
    backInterceptorRef.current = {
      commentBarTarget,
      actionBubble,
      setCommentBarTarget,
      setActionBubble,
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
        ctx.setCommentBarTarget(null);
        return true;
      }
      if (ctx.actionBubble) {
        ctx.setActionBubble(null);
        return true;
      }
      ctx.setShareMomentId(null);
      return true;
    });
  }, [hasOverlay]);

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

  // 走查移动端发现-朋友圈/新一轮 R1 (perf)：cover 的 onAvatarTap 走稳定引用 ——
  // 见 WeChatMomentsCover 用处的注释。这里只读 mutationGuardRef.current 与 navigate
  // 做导航，handler 本身不需要 deps，整个生命周期内引用稳定，memo 命中率最高。
  const handleCoverAvatarTap = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      const guard = mutationGuardRef.current;
      if (!guard.characterId) return;
      void navigate({
        to: "/character/$characterId",
        params: { characterId: guard.characterId },
        hash: buildCharacterDetailRouteHash({
          returnPath: `/friend-moments/${guard.characterId}`,
          returnHash: currentRouteHash || undefined,
        }),
      });
    },
    [navigate, currentRouteHash],
  );

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
      //
      // 走查移动端朋友圈/新一轮 R1：钉住触发时刻的 baseUrl/characterId —— 4 个
      // refetch 并发跑期间（公网慢链路 1-3s）用户可能切账户 / 切到别的角色，
      // 旧上下文的 refetch 失败若把红条冒到新页面就是误导（"我刚开角色 B 看到红条
      // 写刷新失败，但我什么都没做"）。和 moments-page mobile 下拉刷新 baseUrl-
      // guard (line 2371-2376) / mutation onError mutationGuardRef 同模板。
      const guardBaseUrl = baseUrl;
      const guardCharacterId = resolvedCharacterId;
      const results = await Promise.all([
        momentsQuery.refetch(),
        blockedQuery.refetch(),
        friendsQuery.refetch(),
        characterQuery.refetch(),
      ]);
      const currentGuard = mutationGuardRef.current;
      if (
        guardBaseUrl !== currentGuard.baseUrl ||
        guardCharacterId !== currentGuard.characterId
      ) {
        return;
      }
      const failed = results.find((r) => r.isError && r.error instanceof Error);
      if (failed?.error instanceof Error) {
        const failedError = failed.error;
        setNotice({
          tone: "danger",
          // 走查 R2：translateAppErrorCode 同 mutation onError 处理。
          message: isApiRequestError(failedError)
            ? t(
                msg`刷新失败：${translateAppErrorCode(failedError) ?? describeRequestError(failedError)}`,
              )
            : t(msg`刷新失败：${describeRequestError(failedError)}`),
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
            // 走查移动端发现-朋友圈/新一轮 R1 (perf)：WeChatMomentsCover 是 memo
            // 包裹的，但 onAvatarTap 之前是 inline 箭头，每次父组件 re-render（评论
            // 草稿 setCommentDrafts 每键、点赞 optimistic、notice 2.4s 自清、share
            // modal 开关）都换一份新 fn 引用 → memo 浅比 fail → cover 整张重渲：
            // safeNickname trim + Array.from initial 取首字 + 几段 cn 都白跑。
            // wechat-moments-cover.tsx 自己注释也说"传也是 stable arrow（父级有
            // useCallback）"——这里之前漏了 useCallback。挂稳后 commentDrafts
            // 高频 setState 不再带动 cover 重渲。
            onAvatarTap={handleCoverAvatarTap}
          />

          {notice ? (
            <div className="px-4 pt-3">
              <InlineNotice
                tone={notice.tone}
                // 走查本轮 R3 (a11y)：和 profile-moments / moments-page mobile 同模板 ——
                // 之前 InlineNotice 无 role，点赞/评论/刷新失败这类反馈 SR 用户完全
                // 错过。danger → alert（assertive 立即朗读），success/info → status
                // （polite 待空隙）。
                role={notice.tone === "danger" ? "alert" : "status"}
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

          {/*
            走查移动端朋友圈/Round 3 R1：和 moments-page mobile R1（行 2143-2161）
            同款 —— 之前只看 momentsQuery.isError 就盖整张「朋友圈暂时不可用 +
            重试读取 + 返回上一页」大空态卡，把已经加载好的 friendMoments 整页吃
            掉（行 1075-1078 gate 同时 require !momentsQuery.isError → moments
            列表被错误态压没）。两条真实场景假爆：
              1) react-query 默认 staleTime=0 + refetchOnMount=true，用户从角色
                 详情进 friend-moments → 返回 → 再进同一角色 friend-moments 时
                 后台 refetch；公网断流 / cloud-api 抖一下 refetch 失败但 data
                 还是 cached 的：visibleMoments 有内容 + isError → 大空态卡盖
                 整页，用户看不到原本已经能看的 8-30 条角色朋友圈，体感「我刚
                 看过的内容凭空消失了」。
              2) 用户 pull-to-refresh 失败时已经走 setNotice danger 红条兜底
                 （行 803-815），同步又冒一张大空态卡形成双错误 UI。
            gate 加 !friendMoments.length，错误态只在真·初次空仓时显示；有 cached
            内容时静默用 stale data（同 react-query 默认体验），用户仍然能 pull-
            refresh 重试。下方 friendMoments 列表 gate 同时去掉 !momentsQuery.isError
            限制，让 error+data 路径继续渲染列表。
          */}
          {character &&
          !timelineLoading &&
          momentsQuery.isError &&
          !friendMoments.length ? (
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

          {/*
            Round 3 R1：去掉 !momentsQuery.isError gate 让 error+cached data 路径
            继续渲染。空仓 error 已被上方大空态卡承包；列表 + cached data 共存
            时 stale 内容仍可见。空仓 + 无 error 路径仍走「还没有发表朋友圈」
            兜底（line 1060 gate 不动）。
          */}
          {character &&
          !timelineLoading &&
          !isBlocked &&
          friendMoments.length
            ? friendMoments.map((moment, index) => {
                const label = momentDateLabels[index] ?? {
                  showDate: true as const,
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
                      <div
                        className="w-12 shrink-0 pt-1 text-right"
                        aria-hidden={!label.showDate}
                      >
                        {label.showDate ? (
                          <>
                            <div className="text-[26px] font-semibold leading-none text-[#1A1A1A]">
                              {label.dayLabel}
                            </div>
                            <div className="mt-1 text-[11px] tracking-[0.04em] text-[#9A9A9A]">
                              {label.monthLabel}
                            </div>
                          </>
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <WeChatMomentCard
                          cardId={`moment-post-${moment.id}`}
                          moment={moment}
                          ownerId={ownerId}
                          // 走查移动端朋友圈/最新一轮 R1：synthesizeMomentNarration
                          // 没拿到 apiBaseUrl 时走全局默认 URL，跨账户 / 私有部署
                          // 命错 cloud-api。和 likeMutation 等写路径同款透传。
                          apiBaseUrl={baseUrl}
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
                            // 走查移动端朋友圈/Round 3 R1：toggle —— 见 moments-page 同模板。
                            setActionBubble((current) =>
                              current?.momentId === moment.id
                                ? null
                                : {
                                    momentId: moment.id,
                                    anchorRect: rect,
                                  },
                            )
                          }
                          onDoubleTapLike={() => {
                            // 走查移动端朋友圈/Round 4 R1：双击守卫 —— 之前裸
                            // mutate 同帧双击触发 2 次 POST /like 把 toggle 多翻
                            // 一轮，跟 moments-page / profile-moments-page 同模板。
                            // 走查再一轮 R1（防御）：try-catch 兜底——见上方 notice
                            // 重试 action 同款 try-catch 注释。
                            if (likeInflightRef.current[moment.id]) return;
                            likeInflightRef.current[moment.id] = true;
                            try {
                              likeMutation.mutate(moment.id, {
                                onSettled: () => {
                                  delete likeInflightRef.current[moment.id];
                                },
                              });
                            } catch (mutateError) {
                              delete likeInflightRef.current[moment.id];
                              throw mutateError;
                            }
                          }}
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
            // 走查移动端朋友圈/Round 4 R1：双击守卫 —— 跟 onDoubleTapLike / notice
            // 重试按钮 / moments-page / profile-moments-page 同模板。action bubble
            // onClick 顺序是 onLike() → onClose()，onClose 会 setActionBubble(null)
            // 把 bubble unmount；但同帧第二次 click 在 React 还没 commit 之前 bubble
            // DOM 还在，会再触发一次 onLike → 2 个 POST /like 飞出去。
            // 走查再一轮 R1（防御）：try-catch 兜底——见上方 notice 重试 action
            // 同款 try-catch 注释。同一把 likeInflightRef 跨 3 处共用。
            const id = actionBubble.momentId;
            if (likeInflightRef.current[id]) return;
            likeInflightRef.current[id] = true;
            try {
              likeMutation.mutate(id, {
                onSettled: () => {
                  delete likeInflightRef.current[id];
                },
              });
            } catch (mutateError) {
              delete likeInflightRef.current[id];
              throw mutateError;
            }
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
            // 走查移动端朋友圈/Round 4 R1：commentInflightRef 同帧双击守卫 ——
            // 见上方 ref 注释。和 moments-page / profile-moments-page 同模板。
            // 走查再一轮 R1（防御）：try-catch 兜底——同 likeInflightRef
            // 注释，commentMutation.mutate() 同步抛错会让该 momentId 的评论入口
            // 卡 true，用户在同条 moment 上无法再发评论，只能整页刷新。
            const id = commentBarTarget.momentId;
            if (commentInflightRef.current[id]) return;
            commentInflightRef.current[id] = true;
            try {
              commentMutation.mutate(id, {
                onSettled: () => {
                  delete commentInflightRef.current[id];
                },
              });
            } catch (mutateError) {
              delete commentInflightRef.current[id];
              throw mutateError;
            }
          }
        }}
        onClose={() => setCommentBarTarget(null)}
      />
    </AppPage>
  );
}

// 走查移动端朋友圈/Round 5 R1：和 profile-moments-page 同模板的 local helper。
// 不导出 / 不抽公共 lib —— profile-moments 也是 local 写法，先保持双份一致；
// 真要做去重等下次有第三处需要时再抽 lib/format。
function isSameLocalDay(aIso: string, bIso: string): boolean {
  const a = new Date(aIso);
  const b = new Date(bIso);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) {
    return false;
  }
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
