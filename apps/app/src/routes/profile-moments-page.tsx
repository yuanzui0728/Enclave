import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Camera } from "lucide-react";
import {
  addMomentComment,
  deleteMoment,
  getOwnMoments,
  isApiRequestError,
  toggleMomentLike,
  type Moment,
  type MomentComment,
  type MomentLike,
  type MomentsPageResponse,
} from "@yinjie/contracts";
import { translateAppErrorCode } from "../lib/error-translate";

// 走查 R3：和 moments-page / mobile-friend-moments-page / mobile-moments-publish-page
// 同款 i18n 一致性兜底。把 mutation/query.error 优先按 errorCode 命中 i18n 字典
// 取当前 locale 文案；非 AppError / 字典 miss 时回退到 raw err.message
// （server legacyMessage 中文）。该页有 7 处直接拼 err.message，全部统一走它。
function resolveMomentsErrorMessage(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  if (isApiRequestError(error)) {
    return translateAppErrorCode(error) ?? error.message;
  }
  return error.message;
}
import { useAppLocale, useRuntimeTranslator } from "@yinjie/i18n";
import {
  AppPage,
  Button,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
} from "@yinjie/ui";
import { EmptyState } from "../components/empty-state";
import { RouteRedirectState } from "../components/route-redirect-state";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { MomentShareCardModal } from "../components/moment-share-card-modal";
import { WeChatActionBubble } from "../components/wechat-action-bubble";
import {
  WeChatCommentBar,
  type WeChatCommentBarReplyTarget,
} from "../components/wechat-comment-bar";
import { WeChatMomentCard } from "../components/wechat-moment-card";
import { WeChatMomentsCover } from "../components/wechat-moments-cover";
import { buildCharacterDetailRouteHash } from "../features/contacts/character-detail-route-state";
import {
  hydrateDesktopFavoritesFromNative,
  readDesktopFavorites,
  removeDesktopFavorite,
  upsertDesktopFavorite,
} from "../features/favorites/favorites-storage";
import { getMomentSummaryText } from "../features/moments/moment-content";
import {
  publishMomentComposeDraft,
  useMomentComposeDraft,
  type MomentImageDraft,
  type MomentVideoDraft,
} from "../features/moments/moment-compose-media";
import { consumeMomentPublishFlash } from "../features/moments/moment-publish-flash";
import { useOptimisticMomentLikeHandlers } from "../features/moments/use-optimistic-like";
import { buildMobileMomentsPublishRouteHash } from "../features/moments/mobile-moments-publish-route-state";
import { usePullToRefresh } from "../features/moments/use-pull-to-refresh";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { formatTimestamp } from "../lib/format";
import { navigateBackOrFallback } from "../lib/history-back";
import { describeRequestError } from "../lib/request-error";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

const DesktopProfileMomentsWorkspace = lazy(async () => {
  const mod = await import(
    "../features/desktop/moments/desktop-profile-moments-workspace"
  );
  return { default: mod.DesktopProfileMomentsWorkspace };
});

const DesktopMessageAvatarPopover = lazy(async () => {
  const mod = await import("../features/chat/message-avatar-popover-shell");
  return { default: mod.DesktopMessageAvatarPopover };
});

const PUBLISH_RETURN_HASH = buildMobileMomentsPublishRouteHash({
  returnPath: "/profile/moments",
});

export function ProfileMomentsPage() {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const isDesktopLayout = useDesktopLayout();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const nativeDesktopFavorites = runtimeConfig.appPlatform === "desktop";
  const ownerId = useWorldOwnerStore((state) => state.id);
  const ownerName = useWorldOwnerStore((state) => state.username);
  const ownerAvatar = useWorldOwnerStore((state) => state.avatar);
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
  const [desktopReplyTarget, setDesktopReplyTarget] = useState<{
    authorId: string;
    authorName: string;
    commentId: string;
    postId: string;
  } | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [favoriteSourceIds, setFavoriteSourceIds] = useState<string[]>([]);
  // 「分享图卡」目标 —— 之前在 mobile 分支里宣告，导致顶部 useEffect([baseUrl])
  // 想清弹层状态时引用不到 setShareMomentId。提到组件顶部 useState 区，
  // 桌面分支不用就一直是 null；mobile 分支引用同一份 setter。
  const [shareMomentId, setShareMomentId] = useState<string | null>(null);
  // 走查电脑端 R2：和 friend-moments-page / moments-page notice 通道对齐 ——
  // 之前 profile-moments-page 的 notice 只有 tone/message，danger 红条没法挂
  // 「重试点赞」「重试删除」按钮。点赞失败 / 删除失败时用户只能盯着红条 2.4s
  // 自清，要重试得自己再去戳一遍头像 → 重新对到那张被回滚的 moment → 再点心
  // / 再开 ⋯ 菜单 / 再 confirm，体感比其它两个朋友圈页差一截。补 actionLabel/action
  // 字段，下方 likeMutation / deleteMutation onError 顺便接上重试 closure。
  const [notice, setNotice] = useState<{
    tone: "success" | "info" | "danger";
    message: string;
    actionLabel?: string | null;
    action?: (() => void) | null;
  } | null>(null);
  const [desktopAvatarPopover, setDesktopAvatarPopover] = useState<
    | {
        anchorElement: HTMLButtonElement;
        kind: "character";
        characterId: string;
        fallbackAvatar?: string | null;
        fallbackName: string;
      }
    | {
        anchorElement: HTMLButtonElement;
        kind: "owner";
      }
    | null
  >(null);
  const composeDraft = useMomentComposeDraft();

  // 服务端按 authorType='user' AND authorId=owner.id 过滤；前端不再做 filter，
  // 也不复用 "app-moments" 这把全量 key——后者会拉 248+ 条 ~960KB 全表去
  // 找自己那几条。
  const momentsQuery = useQuery({
    queryKey: ["app-moments-mine", baseUrl],
    queryFn: () => getOwnMoments(baseUrl),
  });

  const ownMoments = useMemo(() => {
    if (!momentsQuery.data || !ownerId) {
      return [];
    }
    // 服务端已 where 过 authorId=owner.id，这里防御性再过一遍——避免老 cache
    // 在 ownerId 切换那一帧把别人的 moment 漏给「我的朋友圈」。
    return momentsQuery.data.filter(
      (moment) => moment.authorType === "user" && moment.authorId === ownerId,
    );
  }, [momentsQuery.data, ownerId]);

  // 走查 R1：日期列预格式化。之前 PersonalAlbumRow 里每行每次 render 都
  // new Intl.DateTimeFormat —— 评论草稿每按一键父组件 setState 重渲，
  // N 条 moment × 每键一次 ICU 实例化在 30+ 条时主线程能吃几十 ms。
  // 跟 mobile-friend-moments-page.tsx 同模板：activeLocale 切换或列表
  // 变化才重算；同一天的"日／月"只显示在第一条上，后续留空保留对齐宽度。
  const { locale: activeLocale } = useAppLocale();
  const ownMomentDateLabels = useMemo(() => {
    const monthFormatter = new Intl.DateTimeFormat(activeLocale, {
      month: "long",
    });
    return ownMoments.map((moment, index) => {
      const previous = index > 0 ? ownMoments[index - 1] : null;
      const showDate =
        !previous || !isSameLocalDay(previous.postedAt, moment.postedAt);
      if (!showDate) {
        return { showDate: false as const, day: "", monthLabel: "" };
      }
      const date = new Date(moment.postedAt);
      if (Number.isNaN(date.getTime())) {
        return { showDate: true as const, day: "--", monthLabel: "--" };
      }
      return {
        showDate: true as const,
        day: `${date.getDate()}`.padStart(2, "0"),
        monthLabel: monthFormatter.format(date),
      };
    });
  }, [activeLocale, ownMoments]);

  const optimisticLike = useOptimisticMomentLikeHandlers({
    baseUrl,
    ownerId,
    ownerUsername: ownerName,
    ownerAvatar,
  });
  // 走查 R1：mid-flight 切账户 guard。和 moments-page / mobile-friend-moments-page
  // 同思路 —— 旧 baseUrl 上的 mutation 完成时不能在新账户 UI 上冒
  // 「朋友圈互动已更新」/「点赞失败」红条，也不该把新账户的 cache
  // 当成 ownMoments 的 cache 写。在 onMutate 捕获 baseUrl，onError / onSuccess
  // 比对 ref；不一致直接跳过 UI 反馈。
  const mutationBaseUrlRef = useRef(baseUrl);
  useEffect(() => {
    mutationBaseUrlRef.current = baseUrl;
  }, [baseUrl]);
  // 新走查 R3：同款同帧双击守卫（见 moments-page R2 注释）。CDP 实测主页
  // 双击「发送」评论会写 2 条重复评论，profile-moments / friend-moments 走
  // 同样的 commentMutation 模板必有同 bug。提前加 ref 锁防 DB 脏写 + RTT 浪费。
  // 三把：comment / like / delete 都按 momentId 分别记账。
  const commentInflightRef = useRef<Record<string, boolean>>({});
  const likeInflightRef = useRef<Record<string, boolean>>({});
  const deleteInflightRef = useRef<Record<string, boolean>>({});
  // 走查电脑端朋友圈 R2（本轮，新一轮）：同 moments-page / friend-moments-page ——
  // compose「发布」按钮 disabled={createPending} 同帧双击 stale closure 双发 mutate
  // → DB 写 2 条重复朋友圈。单 boolean ref 锁，onSettled 释放。
  const createInflightRef = useRef(false);
  const likeMutation = useMutation({
    mutationFn: (momentId: string) => toggleMomentLike(momentId, baseUrl),
    onMutate: (momentId: string) => {
      const inner = optimisticLike.onMutate(momentId);
      return Promise.resolve(inner).then((snapshots) => ({
        ...snapshots,
        mutationBaseUrl: baseUrl,
      }));
    },
    onError: (error, momentId, context) => {
      // 先回滚 optimistic（cache 写回原状态），再把失败原因抛到 toast，
      // 否则用户看到的只是"心标闪了一下又弹回去"。
      optimisticLike.onError(error, momentId, context);
      // mid-flight 切账户：当时点赞的 momentId 在新账户的 ownMoments 里不存在；
      // 在新 UI 弹「点赞失败」是错的，闭包指着旧 momentId。和 moments-page
      // / mobile-friend-moments-page 同处理：静默跳过。
      if (
        context &&
        context.mutationBaseUrl !== mutationBaseUrlRef.current
      ) {
        return;
      }
      // 走查电脑端 R2：和 moments-page / friend-moments-page 同款 ——
      // 1) translateAppErrorCode 优先走 i18n 字典命中本地化文案，miss 才退到
      //    describeRequestError 的网络/401/403 兜底；之前直接 describeRequestError
      //    会把 server AppError 的 legacyMessage（中文）原样塞给非 zh-CN 用户。
      // 2) 失败 toast 挂「重试点赞」按钮，下方 desktop 入口已经把 actionLabel/action
      //    透传到 notice 通道，用户不用自己找回那条被回滚的 moment 再戳一遍。
      const localized =
        (isApiRequestError(error) ? translateAppErrorCode(error) : null) ??
        describeRequestError(error, t(msg`点赞失败，请稍后重试。`));
      setNotice({
        tone: "danger",
        message: localized,
        actionLabel: t(msg`重试点赞`),
        // 走查电脑端朋友圈 R5：跟 moments-page / friend-moments-page R5 同款 ——
        // retry action 之前裸 mutate，双击「重试点赞」会发 2 个 POST /like
        // → toggle 翻回原状（用户以为"再试一次"反倒撤销了刚成功的状态）。
        action: () => {
          if (likeInflightRef.current[momentId]) return;
          likeInflightRef.current[momentId] = true;
          likeMutation.mutate(momentId, {
            onSettled: () => {
              delete likeInflightRef.current[momentId];
            },
          });
        },
      });
    },
    onSuccess: (_data, _momentId, context) => {
      if (
        context &&
        context.mutationBaseUrl !== mutationBaseUrlRef.current
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

  // 走查 Round 1：跟 friend-moments-page / moments-page Round 1 模板对齐：
  // ref 捕获 args + onMutate 4-cache optimistic 插入 + onError 回滚。
  // 之前评论提交后输入框 ~600ms 不消失 + 列表里看不到自己刚发的评论，体感"卡住"。
  const commentSubmitArgsRef = useRef<
    Record<
      string,
      { text: string; target: { commentId: string; authorId: string } | null }
    >
  >({});
  const commentMutation = useMutation({
    onMutate: async (momentId: string) => {
      const text = commentDrafts[momentId]?.trim();
      if (!text || !ownerId) {
        return { skipped: true as const };
      }

      const desktopTarget =
        desktopReplyTarget?.postId === momentId ? desktopReplyTarget : null;
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

      // 走查 R1：Date.now() 同毫秒能撞 —— 同 mobile-friend-moments / moments-page。
      const tempId = `optimistic-comment-${ownerId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const tempComment: MomentComment = {
        id: tempId,
        postId: momentId,
        authorId: ownerId,
        authorName: ownerName ?? t(msg`我`),
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
      const savedDesktopReply =
        desktopReplyTarget?.postId === momentId ? desktopReplyTarget : null;
      // 钉住触发时刻的 baseUrl —— mid-flight 切账户后 onError / onSuccess 比对，
      // 旧账户的失败不要在新账户里 reopen commentBar / 弹红条；成功也不要在
      // 新账户的 cache 里写「temp 评论替换成 realComment」（新账户压根没那条
      // moment，是 no-op，但更重要的是 toast 不要错位）。
      const mutationBaseUrl = baseUrl;

      setCommentDrafts((current) => ({ ...current, [momentId]: "" }));
      setCommentBarTarget(null);
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
        savedDesktopReply,
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
    onSuccess: (realComment, momentId, context) => {
      delete commentSubmitArgsRef.current[momentId];
      // mid-flight 切账户：success toast 在新账户里冒「朋友圈互动已更新」很
      // 误导（用户在新账户没做交互），下面的 setQueriesData 用新 baseUrl 的 cache
      // 写「temp 评论替换成 realComment」也是 no-op（新 cache 里压根没这条
      // moment），顺手跳过省一次空操作。
      if (
        context &&
        !context.skipped &&
        context.mutationBaseUrl !== mutationBaseUrlRef.current
      ) {
        return;
      }
      setNotice({
        tone: "success",
        message: t(msg`朋友圈互动已更新。`),
      });
      // 把 optimistic temp 原地换成 server 真实评论 —— 跟 moments-page / friend-moments-page
      // Round 1 一样**完全省掉** invalidate 触发的 mine / paged refetch。
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
    onError: (error, momentId, context) => {
      delete commentSubmitArgsRef.current[momentId];
      // 走查电脑端 R2：和上面 likeMutation onError 同款 ——
      // 先走 translateAppErrorCode 命中 i18n 字典；miss 才退回 describeRequestError
      // 的网络/401/403 兜底。之前直接 describeRequestError 会把 server AppError 的
      // legacyMessage（中文）原样塞给非 zh-CN 用户。评论失败不放「重试」按钮 ——
      // commentBar / desktopReplyTarget 已经被恢复，用户直接在评论框点「发送」即可
      // （和 moments-page commentMutation onError 同模式）。
      const localized =
        (isApiRequestError(error) ? translateAppErrorCode(error) : null) ??
        describeRequestError(error, t(msg`评论失败，请稍后重试。`));
      if (!context || context.skipped) {
        setCommentBarTarget(null);
        setNotice({ tone: "danger", message: localized });
        return;
      }
      // mid-flight 切账户：旧账户的失败不要在新账户里 reopen 一个指着别的
      // 账户帖子的 commentBar，也不该弹「评论失败」红条。cache 回滚也跳过 ——
      // 旧 baseUrl 的 cache 用户已经看不到了。和 moments-page / mobile-friend-moments-page
      // 同模板。
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
      // 恢复 desktop drafts / reply target；mobile sheet 继续按原逻辑关闭 + 红条
      setCommentDrafts((current) => ({
        ...current,
        [context.momentId]: context.savedDraft,
      }));
      if (context.savedDesktopReply) {
        setDesktopReplyTarget(context.savedDesktopReply);
      }
      setCommentBarTarget(null);
      setNotice({ tone: "danger", message: localized });
    },
  });

  const createMutation = useMutation({
    // 走查新 Round 1：mutationFn 之前直接闭包读 composeDraft；onSuccess 又无脑
    // reset() + setShowCompose(false)。慢网下用户发完 ESC 关掉重开输入新草稿，
    // 旧 mutation 的 onSuccess 跑回来会抹掉新草稿。跟 1b285789 / moments-page
    // 同类 bug；snapshot draft 当 variables、onSuccess 用 reference equality 校验。
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
      // onMutate 同步跑：钉住 publish 发到的目标账户。和 mobile-moments-publish-page
      // 同模板 —— mid-flight 切账户后，prepend / invalidate 要落到旧账户
      // 的 cache 上，但 toast / draft reset 留给当前页（旧账户）。
      return { mutationBaseUrl: baseUrl };
    },
    onSuccess: (newMoment, input, context) => {
      const mutationBaseUrl = context?.mutationBaseUrl ?? baseUrl;
      // cache 写到 mutation 触发时刻的 baseUrl —— 切到 B 后切回 A 时第一帧
      // 就能看到刚发的；不要污染新账户 B 的 cache。
      queryClient.setQueryData<Moment[]>(
        ["app-moments", mutationBaseUrl],
        (current) => (current ? [newMoment, ...current] : current),
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
      void queryClient.invalidateQueries({
        queryKey: ["app-moments", mutationBaseUrl],
      });
      void queryClient.invalidateQueries({
        queryKey: ["app-moments-paged", mutationBaseUrl],
      });
      void queryClient.invalidateQueries({
        queryKey: ["app-moments-mine", mutationBaseUrl],
      });
      // mid-flight 切账户：剩下的 draft reset / toast / compose 关都属于当前
      // 页面的 UI 反馈 —— 用户已经切到 B 了不该让他看到 A 的「朋友圈已发布」绿条。
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
      setNotice({
        tone: "success",
        message: t(msg`朋友圈已发布。`),
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (momentId: string) => deleteMoment(momentId, baseUrl),
    onMutate: async (momentId) => {
      // 同步 cancel + snapshot 三把 cache：本页绑 mine（删完要立刻消失），
      // 全量 flat 给 search 索引 / share 用，paged 给 /tabs/moments 用 ——
      // 之前漏了 paged：用户在 /profile/moments 删一条自己的动态后立刻切到
      // /tabs/moments，那条已删的帖子在 paged 里还挂着 ~600ms 直到 onSuccess
      // 的 invalidate refetch 走完。跟 moments-page Round 4 同模板。
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ["app-moments", baseUrl] }),
        queryClient.cancelQueries({
          queryKey: ["app-moments-mine", baseUrl],
        }),
        queryClient.cancelQueries({
          queryKey: ["app-moments-paged", baseUrl],
        }),
      ]);
      const flatSnapshots = queryClient.getQueriesData<Moment[]>({
        queryKey: ["app-moments", baseUrl],
      });
      const mineSnapshots = queryClient.getQueriesData<Moment[]>({
        queryKey: ["app-moments-mine", baseUrl],
      });
      const pagedSnapshots = queryClient.getQueriesData<
        InfiniteData<MomentsPageResponse>
      >({
        queryKey: ["app-moments-paged", baseUrl],
      });
      const snapshots = [...flatSnapshots, ...mineSnapshots];
      snapshots.forEach(([key, data]) => {
        if (!data) {
          return;
        }
        queryClient.setQueryData<Moment[]>(
          key,
          data.filter((item) => item.id !== momentId),
        );
      });
      pagedSnapshots.forEach(([key, data]) => {
        if (!data) return;
        // 走查 R2：跟 moments-page R1 同款 —— pages[0].total 也要 -1，否则
        // /tabs/moments toolbar「已加载 X / 共 Y 条动态」在 invalidate refetch
        // (~600ms+) 落地前会显示陈旧的 Y。本页删除自己的 moment 后用户切到
        // /tabs/moments，总数应该立刻反映出"少了一条"。仅 pages[0] 上下移 ——
        // total 是服务端跨页累计值，不属于任何具体一页。
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
      return { snapshots, pagedSnapshots, mutationBaseUrl: baseUrl };
    },
    onError: (error, momentId, context) => {
      // mid-flight 切账户：旧账户的失败不该在新账户里弹「删除失败」红条 ——
      // 用户已经看不到原 moment 了。cache 回滚也跳过（旧 baseUrl 的 cache 用户已
      // 经看不到了）。和 moments-page / mobile-friend-moments-page 同模板。
      if (context && context.mutationBaseUrl !== mutationBaseUrlRef.current) {
        return;
      }
      // 先回滚 optimistic（被删的 moment 在 flat / mine / paged cache 里恢复），
      // 再给用户一个红条提示——否则用户只会看到"删过的 moment 又自己冒出来"，
      // 没法判断是网络 / 权限 / 还是被服务端拒了。
      context?.snapshots.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
      context?.pagedSnapshots.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
      // 走查电脑端 R2：同 likeMutation onError ——
      // translateAppErrorCode 走 i18n 字典优先；挂「重试删除」按钮，省得用户
      // 重新开 ⋯ 菜单 + confirm 一遍。
      const localized =
        (isApiRequestError(error) ? translateAppErrorCode(error) : null) ??
        describeRequestError(error, t(msg`删除失败，请稍后重试。`));
      setNotice({
        tone: "danger",
        message: localized,
        actionLabel: t(msg`重试删除`),
        // 走查电脑端朋友圈 R5：跟 moments-page R5 同款 ——
        // retry action 之前裸 mutate，双击「重试删除」会发 2 个 DELETE
        // （第二次会被 server 404 但仍付 RTT + 覆盖红条，体感"再发一条错误"）。
        action: () => {
          if (deleteInflightRef.current[momentId]) return;
          deleteInflightRef.current[momentId] = true;
          deleteMutation.mutate(momentId, {
            onSettled: () => {
              delete deleteInflightRef.current[momentId];
            },
          });
        },
      });
    },
    onSuccess: (_data, _momentId, context) => {
      const mutationBaseUrl = context?.mutationBaseUrl ?? baseUrl;
      // invalidate 落到 mutation 触发时刻的 baseUrl —— 删除发生在 A 但用户切到 B 了，
      // 不要 invalidate B 账户的 cache（B 完全不该被这次 A 的删除牵动）。
      void queryClient.invalidateQueries({
        queryKey: ["app-moments", mutationBaseUrl],
      });
      void queryClient.invalidateQueries({
        queryKey: ["app-moments-paged", mutationBaseUrl],
      });
      void queryClient.invalidateQueries({
        queryKey: ["app-moments-mine", mutationBaseUrl],
      });
      if (mutationBaseUrl !== mutationBaseUrlRef.current) {
        return;
      }
      setNotice({
        tone: "success",
        message: t(msg`已删除这条朋友圈。`),
      });
    },
  });

  const pendingCommentMomentId = commentMutation.isPending
    ? commentMutation.variables
    : null;
  const pendingLikeMomentId = likeMutation.isPending
    ? likeMutation.variables
    : null;
  const pendingDeleteMomentId = deleteMutation.isPending
    ? deleteMutation.variables
    : null;

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // 走查 R1：切账户时清所有挂在「上一个 baseUrl」的交互态，否则在 A 账户里
  // 打开了 ⋯ 弹出 actionBubble、写一半评论、开着分享卡片 → 切到 B 账户后这些
  // 弹层还浮在屏幕上、anchorRect 指着上一个账户的卡片位置；点 like / 评论
  // 会用旧 momentId 走 mutation → 在新账户里 404 → 弹红条；mutation guard 已经
  // 拦住 toast，但弹层本身的 UI 残留还是错的。和 moments-page / mobile-friend-moments-page
  // 同模板。
  useEffect(() => {
    setActionBubble(null);
    setCommentBarTarget(null);
    setDesktopReplyTarget(null);
    setCommentDrafts({});
    setShareMomentId(null);
    // 走查电脑端朋友圈 R1（新一轮）：desktopAvatarPopover 之前完全没有清理路径
    // —— 这页根本没有专门按 hash/pathname 翻转清弹层的 useEffect（moments-page
    // / friend-moments-page 还有那一支，profile-moments-page 直接漏）。切账户后
    // baseUrl 变了，旧账户挂着的 liker popover 仍然飘在屏幕上，anchorRect 指着
    // 旧账户已 unmount 的卡片位置；popover 内部 lazy 加载的 query 按新 baseUrl
    // 拉 characterId（旧账户的角色 id），新账户根本没那个角色 → 404 或裸 loading
    // 卡住，跟 moments-page / friend-moments-page 同款 bug 一并修。
    setDesktopAvatarPopover(null);
    // mid-flight 评论 args 也清——onSuccess/onError 会清自己那条，但切账户时
    // 如果还有 mid-flight，旧 args 会残留在内存，长期跑就是泄漏。
    commentSubmitArgsRef.current = {};
    // 走查新一轮 R4：旧 baseUrl 的失败 mutation 状态也得清。workspace 的
    // likeErrorMessage / commentErrorMessage / deleteErrorMessage / composeErrorMessage
    // 都串 `mutation.isError ? resolveMomentsErrorMessage(mutation.error) : null` ——
    // 切账户后 notice 自清后第一帧就会冒「评论失败：在 A 账户那条 moment 上的
    // 失败原文」挂在 B 账户工作区顶部，文案完全跟新账户对不上。mutation.reset()
    // 只清状态、不取消 in-flight；后续 onError/onSuccess 还有 baseUrl-guard 拦住
    // 副作用，安全。和 moments-page / friend-moments-page 同模板。
    likeMutation.reset();
    commentMutation.reset();
    deleteMutation.reset();
    createMutation.reset();
  }, [baseUrl]);

  // 从 /discover/moments/publish 走 returnPath=/profile/moments 回到本页时，
  // 发布页只往 sessionStorage 塞 flash 不会自己跳 toast。本页之前不消费——
  // 用户在「我的朋友圈」点相机发完一条，落地这里既看不到「朋友圈已发布」
  // 提示，sessionStorage 里这条 flash 也会留到下次进 /discover/moments 才被
  // 错位消费（用户那时候并没刚发，反而冒出来很突兀）。
  useEffect(() => {
    const flash = consumeMomentPublishFlash();
    if (flash) {
      setNotice({ tone: "success", message: flash });
    }
  }, [baseUrl]);

  useEffect(() => {
    if (!isDesktopLayout) return;
    setFavoriteSourceIds(
      readDesktopFavorites().map((item) => item.sourceId),
    );
  }, [isDesktopLayout]);

  // 走查新一轮 R7：跟 moments-page / friend-moments-page 同款 ——
  // Tauri 桌面版收藏放在 native 存储（不只是 localStorage）；mount 时
  // readDesktopFavorites() 只读 localStorage 缓存，page 长期挂着时若别的窗口
  // / 系统菜单 / 收藏面板改了 native，本页看不到更新。focus / visibilitychange
  // 监听跟其它两个 moments 页对齐——回到本窗口或 tab 切回前台时再 hydrate 一次
  // 把 native → localStorage → state 串通。enabled 双 gate：必须 desktop layout
  // 且 Tauri 平台才挂；浏览器走 noop。
  useEffect(() => {
    if (!isDesktopLayout || !nativeDesktopFavorites) {
      return;
    }

    let cancelled = false;

    async function syncFavoriteSourceIds() {
      const next = (await hydrateDesktopFavoritesFromNative()).map(
        (item) => item.sourceId,
      );
      if (cancelled) {
        return;
      }
      setFavoriteSourceIds((current) =>
        JSON.stringify(current) === JSON.stringify(next) ? current : next,
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

  const { containerRef, state: pullState } = usePullToRefresh({
    onRefresh: async () => {
      // 走查 R2：和 mobile-friend-moments-page R2 / moments-page mobile 同款 ——
      // refetch() 在 TanStack Query v5 默认不抛错（错误落到 result.error），
      // 之前裸 await 网络挂死时用户只看指示器走完一遍消失，根本不知道列表
      // 没换。和其它朋友圈页 pull-to-refresh 失败的 danger notice 通道对齐。
      const result = await momentsQuery.refetch();
      if (result.isError && result.error instanceof Error) {
        const localized = resolveMomentsErrorMessage(result.error) ?? "";
        setNotice({
          tone: "danger",
          message: t(msg`刷新失败：${localized}`),
        });
      }
    },
    enabled: !isDesktopLayout,
  });

  const goBack = () =>
    navigateBackOrFallback(
      () => navigate({ to: "/tabs/profile", replace: true }),
      "/tabs/profile",
    );

  const openLikerCharacterDetail = (like: MomentLike) => {
    if (like.authorType !== "character") {
      return;
    }
    void navigate({
      to: "/character/$characterId",
      params: { characterId: like.authorId },
      hash: buildCharacterDetailRouteHash({
        returnPath: "/profile/moments",
      }),
    });
  };

  const goPublish = () =>
    navigate({
      to: "/discover/moments/publish",
      hash: PUBLISH_RETURN_HASH,
    });

  const displayName = ownerName?.trim() || t(msg`世界主人`);

  if (isDesktopLayout) {
    const desktopErrors: string[] = [];
    // 走查电脑端 R3：momentsQuery 失败 + 列表 0 条时，下方 renderFeedContent 走
    // 「朋友圈暂时不可用 / 重试读取」EmptyState（loadErrorMessage 路径）；此处再
    // push 到 desktopErrors[] ErrorBlock 就是同一段错误同屏两条红框。和
    // moments-page.tsx 行 1371-1383 / friend-moments-page R3 同模板：仅在已经
    // 有 ownMoments 可渲染时才推到 toolbar 错误条，否则让位给 EmptyState。
    if (momentsQuery.isError && ownMoments.length > 0) {
      const localized = resolveMomentsErrorMessage(momentsQuery.error);
      if (localized) {
        desktopErrors.push(localized);
      }
    }

    async function handleDesktopImageFilesSelected(files: FileList | null) {
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

    async function handleDesktopVideoFileSelected(file: File | null) {
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

    return (
      <Suspense
        fallback={
          <RouteRedirectState
            title={t(msg`正在打开桌面我的朋友圈`)}
            description={t(msg`正在打开桌面端我的朋友圈。`)}
            loadingLabel={t(msg`正在打开桌面我的朋友圈...`)}
          />
        }
      >
        <DesktopProfileMomentsWorkspace
          commentDrafts={commentDrafts}
          commentErrorMessage={
            commentMutation.isError
              ? resolveMomentsErrorMessage(commentMutation.error)
              : null
          }
          commentPendingMomentId={pendingCommentMomentId}
          commentReplyTarget={desktopReplyTarget}
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
          errors={desktopErrors}
          imageDrafts={composeDraft.imageDrafts}
          isLoading={momentsQuery.isLoading}
          // 首屏失败 + 0 条时空态优先渲「重试读取」（feed Round 2 同款）。
          loadErrorMessage={
            momentsQuery.isError
              ? resolveMomentsErrorMessage(momentsQuery.error)
              : null
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
          moments={ownMoments}
          ownerAvatar={ownerAvatar}
          ownerId={ownerId ?? null}
          ownerName={displayName}
          showCompose={showCompose}
          notice={notice?.message}
          noticeTone={notice?.tone}
          // 走查电脑端 R2：danger notice 上的「重试点赞 / 重试删除」按钮
          // —— workspace InlineNotice 早就支持这两条 prop，profile-moments-page
          // 之前从来没传过，所以 desktop 上 like/delete 失败用户没重试入口；
          // 现在和 friend-moments-page 同模板把 actionLabel / action 透下去。
          noticeActionLabel={notice?.actionLabel ?? null}
          onNoticeAction={notice?.action ?? null}
          text={composeDraft.text}
          videoDraft={composeDraft.videoDraft}
          isMomentFavorite={(momentId) =>
            favoriteSourceIds.includes(`moment-${momentId}`)
          }
          setShowCompose={setShowCompose}
          onBack={goBack}
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
          onCreate={() => {
            // 走查电脑端朋友圈 R2（本轮，新一轮）：ref 同步锁兜同帧双击。
            if (createInflightRef.current) return;
            createInflightRef.current = true;
            createMutation.mutate(
              {
                // snapshot — 见 createMutation 注释。
                text: composeDraft.text,
                imageDrafts: composeDraft.imageDrafts,
                videoDraft: composeDraft.videoDraft,
              },
              {
                onSettled: () => {
                  createInflightRef.current = false;
                },
              },
            );
          }}
          onDelete={(momentId) => {
            // 新走查 R3：同帧 click 同步锁——行内 DesktopMomentRow 有 confirm，
            // 但确认 OK 同帧双击仍可能落到这。
            if (deleteInflightRef.current[momentId]) return;
            deleteInflightRef.current[momentId] = true;
            deleteMutation.mutate(momentId, {
              onSettled: () => {
                delete deleteInflightRef.current[momentId];
              },
            });
          }}
          onImageFilesSelected={(files) => {
            void handleDesktopImageFilesSelected(files);
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
          onOpenLikerPopover={({ anchorElement, like }) => {
            if (like.authorType === "character") {
              setDesktopAvatarPopover({
                anchorElement,
                kind: "character",
                characterId: like.authorId,
                fallbackAvatar: like.authorAvatar,
                fallbackName: like.authorName,
              });
            } else if (like.authorType === "user") {
              setDesktopAvatarPopover({
                anchorElement,
                kind: "owner",
              });
            }
          }}
          onRemoveImage={(id) => composeDraft.removeImageDraft(id)}
          onRemoveVideo={() => composeDraft.clearVideoDraft()}
          onStartCommentReply={({ momentId, comment }) =>
            setDesktopReplyTarget({
              authorId: comment.authorId,
              authorName: comment.authorName,
              commentId: comment.id,
              postId: momentId,
            })
          }
          onTextChange={composeDraft.setText}
          onToggleFavorite={(momentId) => {
            const moment = ownMoments.find((item) => item.id === momentId);
            if (!moment) return;
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
                  meta: formatTimestamp(moment.postedAt),
                  to: "/profile/moments",
                  badge: t(msg`朋友圈`),
                  avatarName: moment.authorName,
                  avatarSrc: moment.authorAvatar,
                });
            setFavoriteSourceIds(
              nextFavorites.map((favorite) => favorite.sourceId),
            );
          }}
          onVideoFileSelected={(file) => {
            void handleDesktopVideoFileSelected(file);
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
                // 走查新一轮 R8：之前完全没传 navigationContext —— popover 里
                // 「查看资料」/「朋友圈」按钮调 buildCharacterDetailRouteHash /
                // buildDesktopFriendMomentsRouteHash 时 returnPath 走默认值
                // "/tabs/chat"（见 desktop-message-avatar-popover.tsx 行 104-107
                // fallback）。结果用户在 /profile/moments 点 liker 头像 → 看资料
                // → 资料页"返回上一页"跳 /tabs/chat 而不是 /profile/moments，
                // 用户上下文丢失。和 moments-page / friend-moments-page 同模式
                // 把 /profile/moments 当 returnPath 传下去。本页没有 hash 携带
                // momentId，returnHash 留 undefined（popover fallback 也是
                // undefined）。
                navigationContext={{
                  momentsReturnPath: "/profile/moments",
                  profileReturnPath: "/profile/moments",
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

  const activeMoment = actionBubble
    ? ownMoments.find((moment) => moment.id === actionBubble.momentId) ?? null
    : null;
  const liked = Boolean(
    ownerId && activeMoment?.likes.some((like) => like.authorId === ownerId),
  );

  // 「分享图卡」目标 — 点 ⋯ → 分享时把 momentId 存下来。shareMomentId
  // 已在组件顶部宣告（见上方），方便 baseUrl reset useEffect 一并清。
  const shareMoment = shareMomentId
    ? ownMoments.find((moment) => moment.id === shareMomentId) ?? null
    : null;
  const shareLiked = Boolean(
    ownerId && shareMoment?.likes.some((like) => like.authorId === ownerId),
  );

  return (
    <AppPage className="relative space-y-0 bg-white px-0 py-0">
      <TabPageTopBar
        title={t(msg`我的朋友圈`)}
        titleAlign="center"
        className="mx-0 mb-0 mt-0 border-b border-[#ECECEC] bg-white px-4 pb-1.5 pt-1.5 text-[#1A1A1A] shadow-none"
        leftActions={
          <button
            type="button"
            onClick={goBack}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[#1A1A1A] transition-colors active:bg-black/[0.05]"
            aria-label={t(msg`返回`)}
          >
            <ArrowLeft size={17} />
          </button>
        }
        rightActions={
          <button
            type="button"
            onClick={goPublish}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[#1A1A1A] transition-colors active:bg-black/[0.05]"
            aria-label={t(msg`发条朋友圈`)}
          >
            <Camera size={20} strokeWidth={1.6} />
          </button>
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
          <WeChatMomentsCover nickname={displayName} avatarUrl={ownerAvatar} />

          {notice ? (
            <div className="px-4 pt-3">
              <InlineNotice
                tone={notice.tone}
                className="rounded-[8px] border border-[#ECECEC] bg-white px-3 py-2 text-[12px] shadow-none"
              >
                {notice.message}
              </InlineNotice>
            </div>
          ) : null}

          {momentsQuery.isLoading ? (
            <div className="px-4 pt-10">
              <LoadingBlock label={t(msg`正在加载我的朋友圈`)} />
            </div>
          ) : null}

          {momentsQuery.isError && momentsQuery.error ? (
            <div className="px-4 pt-10">
              <ErrorBlock message={describeRequestError(momentsQuery.error)}>
                <div className="mt-3">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8 rounded-full border-[#E5E5E5] bg-white px-3.5 text-[12px]"
                    onClick={() => {
                      void momentsQuery.refetch();
                    }}
                    disabled={momentsQuery.isFetching}
                  >
                    {momentsQuery.isFetching ? t(msg`重新加载中...`) : t(msg`重试`)}
                  </Button>
                </div>
              </ErrorBlock>
            </div>
          ) : null}

          {!momentsQuery.isLoading &&
          !momentsQuery.isError &&
          ownMoments.length === 0 ? (
            <div className="px-4 pt-12">
              <EmptyState
                title={t(msg`还没有发布过朋友圈`)}
                description={t(msg`记录此刻，你的朋友圈会出现在这里。`)}
                action={
                  <Button
                    variant="primary"
                    className="rounded-full bg-[#07C160] px-5 text-[13px] text-white shadow-none hover:bg-[#06ad56]"
                    onClick={goPublish}
                  >
                    {t(msg`发条朋友圈`)}
                  </Button>
                }
              />
            </div>
          ) : null}

          {ownMoments.map((moment, index) => {
            // 微信样式：同一天发的多条只在第一条显示「日／月」，避免左侧
            // 「15 五月」「15 五月」连续重复。日期标签已经在父级 useMemo 里
            // 按 ownMoments + activeLocale 一次性预算好（见 ownMomentDateLabels），
            // 评论草稿高频 re-render 时不会再每行 new 一份 Intl.DateTimeFormat。
            const dateLabel = ownMomentDateLabels[index] ?? {
              showDate: true as const,
              day: "--",
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
                <PersonalAlbumRow
                  moment={moment}
                  ownerId={ownerId}
                  showDate={dateLabel.showDate}
                  dayLabel={dateLabel.day}
                  monthLabel={dateLabel.monthLabel}
                  onOpenActionMenu={(rect) =>
                    setActionBubble({ momentId: moment.id, anchorRect: rect })
                  }
                  onDoubleTapLike={() => {
                    // 新走查 R3：同帧 click 同步锁，见 moments-page R2 注释。
                    if (likeInflightRef.current[moment.id]) return;
                    likeInflightRef.current[moment.id] = true;
                    likeMutation.mutate(moment.id, {
                      onSettled: () => {
                        delete likeInflightRef.current[moment.id];
                      },
                    });
                  }}
                  onCommentTap={(comment) => onCommentTap(moment.id, comment)}
                  onLikeAuthorTap={openLikerCharacterDetail}
                  onDelete={() => {
                    // 新走查 R3：ref 同步锁要在 confirm 之前 set——confirm
                    // 阻塞期间排队的第二个 click 拿旧闭包跑出来时 isPending 仍
                    // 是 false（跟 moments-page mobileDeleteInflightRef 同理）。
                    if (deleteInflightRef.current[moment.id]) return;
                    if (deleteMutation.isPending) return;
                    deleteInflightRef.current[moment.id] = true;
                    if (
                      typeof window !== "undefined" &&
                      !window.confirm(t(msg`确定删除这条朋友圈吗？`))
                    ) {
                      delete deleteInflightRef.current[moment.id];
                      return;
                    }
                    deleteMutation.mutate(moment.id, {
                      onSettled: () => {
                        delete deleteInflightRef.current[moment.id];
                      },
                    });
                  }}
                />
              </div>
            );
          })}

          <div className="h-[calc(env(safe-area-inset-bottom,0px)+24px)]" />
        </div>
      </div>

      <WeChatActionBubble
        open={Boolean(actionBubble)}
        anchorRect={actionBubble?.anchorRect ?? null}
        liked={liked}
        onLike={() => {
          if (actionBubble) {
            // 新走查 R3：同帧 click 同步锁，见 moments-page R2 注释。
            const id = actionBubble.momentId;
            if (likeInflightRef.current[id]) return;
            likeInflightRef.current[id] = true;
            likeMutation.mutate(id, {
              onSettled: () => {
                delete likeInflightRef.current[id];
              },
            });
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
        ownerDisplayName={displayName}
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
          // 走查 R1：跟主朋友圈页同款——评论失败时 savedBar 被 onError 重新设
          // 回去，但失败信息只走顶 notice，被 bar 的 z=1000 backdrop 盖死。透
          // 传给 bar 内 textarea 上方 errorMessage 槽；variables === 当前 bar
          // 上的 momentId gate 住，切到另一条 moment 重开 bar 不带旧错误。
          // 走查 R3：先走 resolveMomentsErrorMessage 做 i18n 一致化。
          commentMutation.isError &&
          commentMutation.variables === commentBarTarget?.momentId
            ? resolveMomentsErrorMessage(commentMutation.error)
            : null
        }
        onSubmit={() => {
          if (commentBarTarget) {
            // 新走查 R3：同帧 click 同步锁，见 moments-page R2 注释。
            const id = commentBarTarget.momentId;
            if (commentInflightRef.current[id]) return;
            commentInflightRef.current[id] = true;
            commentMutation.mutate(id, {
              onSettled: () => {
                delete commentInflightRef.current[id];
              },
            });
          }
        }}
        onClose={() => setCommentBarTarget(null)}
      />
    </AppPage>
  );
}

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

function PersonalAlbumRow({
  moment,
  ownerId,
  showDate,
  dayLabel,
  monthLabel,
  onOpenActionMenu,
  onDoubleTapLike,
  onCommentTap,
  onLikeAuthorTap,
  onDelete,
}: {
  moment: Moment;
  ownerId: string | null;
  showDate: boolean;
  dayLabel: string;
  monthLabel: string;
  onOpenActionMenu: (rect: DOMRect) => void;
  onDoubleTapLike: () => void;
  onCommentTap: (comment: MomentComment | null) => void;
  onLikeAuthorTap: (like: MomentLike) => void;
  onDelete?: () => void;
}) {
  // 日期标签由父级 useMemo 一次性算好（按 activeLocale + ownMoments 缓存），
  // 这里只负责画——避免每条 moment、每次 parent re-render 都 new Intl.DateTimeFormat。
  return (
    <div className="flex items-start gap-2 px-4 py-3.5">
      <div className="w-12 shrink-0 pt-1 text-right" aria-hidden={!showDate}>
        {showDate ? (
          <>
            <div className="text-[26px] font-semibold leading-none text-[#1A1A1A]">
              {dayLabel}
            </div>
            <div className="mt-1 text-[11px] tracking-[0.04em] text-[#9A9A9A]">
              {monthLabel}
            </div>
          </>
        ) : null}
      </div>
      <div className="min-w-0 flex-1 pr-4">
        <WeChatMomentCard
          cardId={`moment-post-${moment.id}`}
          moment={moment}
          ownerId={ownerId}
          liked={
            Boolean(ownerId) &&
            moment.likes.some((like) => like.authorId === ownerId)
          }
          hideAuthor
          flush
          onOpenActionMenu={onOpenActionMenu}
          onDoubleTapLike={onDoubleTapLike}
          onCommentTap={onCommentTap}
          onLikeAuthorTap={onLikeAuthorTap}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
}

