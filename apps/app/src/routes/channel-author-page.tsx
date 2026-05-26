import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { msg } from "@lingui/macro";
import {
  ArrowLeft,
  Clapperboard,
  MessageCircleMore,
  Music2,
  PlaySquare,
  RadioTower,
  Users,
} from "lucide-react";
import {
  SELF_CHARACTER_ID,
  followChannelAuthor,
  getChannelAuthorProfile,
  unfollowChannelAuthor,
  type FeedPostListItem,
} from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import {
  AppPage,
  Button,
  InlineNotice,
  LoadingBlock,
  cn,
} from "@yinjie/ui";

type Translator = ReturnType<typeof useRuntimeTranslator>;
import { AvatarChip } from "../components/avatar-chip";
import { EmptyState } from "../components/empty-state";
import { RouteRedirectState } from "../components/route-redirect-state";
import { stripToolCallSyntax } from "../features/moments/moment-content";
import { resolveAppMediaUrl } from "../lib/media-url";
import {
  buildDesktopChannelsRouteHash,
  parseDesktopChannelsRouteHash,
} from "../features/channels/channels-route-state";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { formatTimestamp } from "../lib/format";
import { isDesktopOnlyPath, navigateBackOrFallback } from "../lib/history-back";
import { describeRequestError } from "../lib/request-error";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

type ChannelAuthorCollectionTab =
  | "all"
  | "videos"
  | "audio"
  | "updates"
  | "live";
const CHANNEL_AUTHOR_COLLECTION_STORAGE_KEY =
  "yinjie:channels:author-collections";

export function ChannelAuthorPage() {
  const t = useRuntimeTranslator();
  const { authorId } = useParams({ from: "/channels/authors/$authorId" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const isDesktopLayout = useDesktopLayout();
  const hash = useRouterState({
    select: (state) => state.location.hash,
  });
  const baseUrl = runtimeConfig.apiBaseUrl;
  const routeState = useMemo(() => parseDesktopChannelsRouteHash(hash), [hash]);
  const normalizedDesktopReturnPath =
    isDesktopLayout && routeState.returnPath === "/discover/channels"
      ? "/tabs/channels"
      : routeState.returnPath;
  const safeReturnPath =
    routeState.returnPath &&
    !isDesktopOnlyPath(routeState.returnPath) &&
    normalizedDesktopReturnPath &&
    !isDesktopOnlyPath(normalizedDesktopReturnPath)
      ? normalizedDesktopReturnPath
      : undefined;
  const safeReturnHash = safeReturnPath ? routeState.returnHash : undefined;
  const sourceChannelsRouteState = useMemo(
    () => parseDesktopChannelsRouteHash(safeReturnHash ?? ""),
    [safeReturnHash],
  );
  const fallbackChannelsHash = useMemo(
    () =>
      buildDesktopChannelsRouteHash({
        section: routeState.section ?? sourceChannelsRouteState.section,
      }),
    [routeState.section, sourceChannelsRouteState.section],
  );
  const [notice, setNotice] = useState<{
    message: string;
    tone: "success" | "info";
  } | null>(null);
  // 走查 R5（新一轮）：原来 useState("all") + 一对 read/write useEffect 串联：
  // mount commit 里两个 effect 按声明顺序执行——读 effect 把 LS 里 "audio" 灌
  // setActiveCollection 是 *scheduled* 的状态更新，下一个 effect 立刻 fire 时
  // activeCollection 还是 useState 初值 "all"，写 effect 把 LS 直接覆盖回 "all"。
  // 接着 StrictMode 双跑 effect 时再读到的就是 "all"（自己刚写进去的），灌一次
  // 等价状态变更，再写一次 "all"。用户上次留下的 "audio" 永远被 mount 重置成 "all"。
  // 用户重现：作者页切去音乐 → 返回视频号 → 再次进同一作者页 → 退回到全部 tab。
  // 改成 useState 用 lazy initializer 一次性把 LS 里的值灌成初值，写改成
  // changeCollection helper 在 click 时同时调 setState + LS write，effect 不再
  // 兜任何写。authorId 变化（路由切换到新作者）时再走一个独立 read effect。
  const [activeCollection, setActiveCollection] = useState<ChannelAuthorCollectionTab>(
    () => readStoredChannelAuthorCollection(authorId),
  );
  const lastReadAuthorIdRef = useRef(authorId);
  // 走查 2026-05-18（新一轮）R1：和 channels-page R1 同款 mid-flight 切账户守卫。
  // 慢网下用户在 A 账户作者页点 +关注/已关注（200-500ms RTT）期间切到 B 账户：
  // onSuccess/onError 跑回时闭包 baseUrl 已是 B —— 「已关注该视频号作者」notice
  // 冒到 B 账户用户眼前（"我刚来 B 怎么收到了关注成功"），invalidate B 的
  // channel-author/home/decorations 触发不必要的 B 端 refetch；该 invalidate 的
  // A 反而漏掉，A 那条 author profile 一直停在乐观状态（按钮 已关注 / 计数 +1）
  // 直到下次回 A 主动重进作者页。onError 的 setQueryData(rollback) 同理：把 A
  // 的 previous 写到 B 的 cache 上，B 用户后续再进同一 authorId 会看到 A 的 stale
  // 数据。
  // 模板：onMutate 钉 mutationBaseUrl 进 context；onError/onSuccess 用
  // mutationBaseUrl 做 cache 落点 + 比对 mutationBaseUrlRef.current 决定 toast
  // 是否冒出。
  const mutationBaseUrlRef = useRef(baseUrl);
  useEffect(() => {
    mutationBaseUrlRef.current = baseUrl;
  }, [baseUrl]);

  const profileQuery = useQuery({
    queryKey: ["app-channel-author", baseUrl, authorId],
    queryFn: () => getChannelAuthorProfile(authorId, baseUrl),
    enabled: !isDesktopLayout,
  });
  const followMutation = useMutation({
    // 走查 2026-05-18 R1（新一轮）：原 mutationFn 直接读 `profileQuery.data?.
    // isFollowing` 决定 follow / unfollow ——但 onMutate 在 mutationFn 之前已
    // 经把 cache 里 isFollowing 翻成相反值（optimistic）。React Query v5 中
    // `await queryClient.cancelQueries(...)` 留 microtask 边界，React 18 batched
    // setState 可能在 await 期间被 flush，导致 useQuery 的 profileQuery.data
    // 走新一轮 render 的 snapshot —— 此时 isFollowing 已是 optimistic 后的值。
    // mutationFn 闭包绑定的就是最新一次 render 的 profileQuery，于是用户点
    // 「+关注」却调到 unfollow（or vice versa）。和 channels-page.tsx 的
    // followMutation 同款修复：把 `following` 作为 mutate 入参传入，从点击瞬
    // 间读 profile（pre-optimistic）值固定下来，闭包/render 时序怎么变都无关。
    // 调用点改成 followMutation.mutate({ following: profile.isFollowing })，
    // handleRetryFollow 也按 profile.isFollowing 读真实状态。
    mutationFn: (input: { following: boolean }) =>
      input.following
        ? unfollowChannelAuthor(authorId, baseUrl)
        : followChannelAuthor(authorId, baseUrl),
    // optimistic：channels-page 主 feed 的 followMutation 已经做了 per-author 乐观，
    // 但作者主页这条独立路径之前没接，关注按钮要等 mutation 落地 + invalidate +
    // refetch 整条链路才翻状态（实测公网 ~400ms），用户连点会以为按钮没响应。
    // 同步翻 profile cache 的 isFollowing + followerCount。
    onMutate: async (input) => {
      // 走查 2026-05-18 新一轮 R3：authorId 也要进 context — 移动端 channel-author
      // 这条路由切作者（/channels/authors/X → /channels/authors/Y）是 in-place
      // 切（TanStack Router 默认复用相同路径组件实例），同一 ChannelAuthorPage
      // 实例 useParams 拿到新 authorId 但 followMutation hook 持续不重建。
      // 慢网下用户：
      //   1. 打开 author X 页 → 点 +关注 → mutation 飞（200-500ms RTT 公网）；
      //   2. 立刻点 X 简介里某个跳转 → 路由切到 author Y → 同一组件再渲，
      //      闭包 authorId 已经是 Y；
      //   3. X 的 mutation 落地 → onSuccess 跑回 → invalidate(["...", A, Y])
      //      把 Y 的 cache 标 stale → Y refetch 一次（白浪费 RTT），而真正
      //      改了的 X 的 cache 留 stale 直到下次回 X 主动重进。
      //   onError 的 setQueryData(rollback) 同理会把 X 的 previous 写到 Y 的
      //   cache 上 — Y 用户立刻看到一坨 X 的 profile 字段（authorName/bio/
      //   avatar 全错）直到下一帧 profileQuery 重新落地矫正。
      // 跟 mutationBaseUrl 同款做法，把 authorId 也钉进 context。
      const mutationBaseUrl = baseUrl;
      const mutationAuthorId = authorId;
      await queryClient.cancelQueries({
        queryKey: ["app-channel-author", mutationBaseUrl, mutationAuthorId],
      });
      const previous = queryClient.getQueryData<typeof profileQuery.data>([
        "app-channel-author",
        mutationBaseUrl,
        mutationAuthorId,
      ]);
      if (previous) {
        // 走查 2026-05-18 R1（新一轮）：optimistic flip 同样按 input.following
        // 走（pre-optimistic 真值）—— 跟上面 mutationFn 一致，杜绝 cache 已
        // 经被别处改成 optimistic 后再次 onMutate 时读到错误起点的可能。
        queryClient.setQueryData(
          ["app-channel-author", mutationBaseUrl, mutationAuthorId],
          {
            ...previous,
            isFollowing: !input.following,
            followerCount: input.following
              ? Math.max(0, previous.followerCount - 1)
              : previous.followerCount + 1,
          },
        );
      }
      return { previous, mutationBaseUrl, mutationAuthorId };
    },
    onError: (_error, _input, context) => {
      // 回滚 profile cache。home 那边的 mutation 是另一条独立链路，不需要这里回滚。
      // cache key 走 mutationBaseUrl + mutationAuthorId，回到该写入的 A 账户 + X
      // author；切到 B 或切到 Y author 时 onError 闭包的 baseUrl/authorId 已变，
      // 硬写到当前会污染当前账户 + 当前 author 的 cache。
      const mutationBaseUrl = context?.mutationBaseUrl ?? baseUrl;
      const mutationAuthorId = context?.mutationAuthorId ?? authorId;
      if (context?.previous) {
        queryClient.setQueryData(
          ["app-channel-author", mutationBaseUrl, mutationAuthorId],
          context.previous,
        );
      }
    },
    onSuccess: async (_data, input, context) => {
      const mutationBaseUrl = context?.mutationBaseUrl ?? baseUrl;
      const mutationAuthorId = context?.mutationAuthorId ?? authorId;
      const sameAccount = mutationBaseUrl === mutationBaseUrlRef.current;
      // 同时也要 sameAuthor — 用户已经切到别的 author 时，"已关注 X" notice
      // 冒到当前 Y 的页面也错（用户看到「已关注」以为是 Y 的，其实是 X）。
      const sameAuthor = mutationAuthorId === authorId;
      if (sameAccount && sameAuthor) {
        // input.following 是「点击瞬间是否已关注」的 pre-optimistic 值 —— true 表
        // 示点击时已关注、本次走的是 unfollow；false 表示点击时未关注、本次走的
        // 是 follow。比读 profileQuery.data.isFollowing（optimistic 后的最新值）
        // 更直接，且不依赖 React 18 batched render 时序。
        setNotice({
          message: input.following
            ? t(msg`已取消关注。`)
            : t(msg`已关注该视频号作者。`),
          tone: "success",
        });
      }
      //
      //
      // 新一轮走查 R3：原来只 invalidate home 主接口，没动 decorations。home
      // 的 4 个 tab 计数（推荐/朋友/关注/直播）来源是 decorations.sections.count，
      // 而 关注 tab 数 = sectionCounts.following = followedAuthorIds 命中数。
      // 在作者页点 +关注 / 已关注 → server 端 follow 表加/减一行 → 用户回到
      // home 时关注 tab 数应该 +1 / -1，但因为这条链路没碰 decorations，那个
      // 数字一直保持作者页点之前的旧值，直到用户切个 tab 触发重新进 home。
      // channels-page 自己的 followMutation 早就把这两个都 invalidate 了（line 652-654），
      // 这里跟它对齐。
      //
      // invalidate 落 mutationBaseUrl + mutationAuthorId —— 标错账户/作者的 cache
      // stale 完全错（这条 follow 实际改的是 A 上的 X），且会触发不必要的
      // refetch；真正该刷新的 cache 反而漏掉，下次回 A/X 永远停在乐观值。
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-channel-author", mutationBaseUrl, mutationAuthorId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-channels-home", mutationBaseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-channels-home-decorations", mutationBaseUrl],
        }),
      ]);
    },
  });

  useEffect(() => {
    setNotice(null);
    // 走查 2026-05-18 R3：原来 baseUrl 切换（账户切换）时只清 notice，但
    // followMutation 的 isError/error/isPending 状态留在 hook 内不重置——
    // 用户在 A 账户的作者页点 +关注 失败 → 红色「关注失败」error card 渲出
    // → 顶栏切到 B 账户 → profileQuery 用新 baseUrl/同 authorId 重新拉数据
    // （B 账户里同一 char-id 可能根本不在）→ followMutation.isError 仍 true
    // → 「关注失败」error card 继续盖在简介卡上头，文案是 A 账户的错误信息
    // （往往是 'CHARACTER_NOT_FOUND' 之类技术细节），B 用户体感「我刚进作
    // 者页就报 404，账户连不上」。reset() 把 hook 内 status 清回 idle，让
    // 错误条只跟当前账户的真实操作绑定。
    followMutation.reset();
    // 切到新 authorId（路由 in-place 切作者）时再读一次 LS；初次 mount 已经
    // 由 useState lazy initializer 处理过，不要在这里再 set 同样的初值——会
    // 触发 unnecessary re-render，也避开 mount + StrictMode 把覆盖 bug 重新引回。
    if (lastReadAuthorIdRef.current !== authorId) {
      lastReadAuthorIdRef.current = authorId;
      setActiveCollection(readStoredChannelAuthorCollection(authorId));
    }
    // followMutation 是 useMutation 返回的稳定 reference，安全略过 deps lint
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorId, baseUrl]);

  // 走查 R2：success notice 之前一直挂着不消，跟主视频号页 2.4s 自动消失的
  // 体验对不上。用户连续按 +关注/已关注/+关注 会看到三层通知或残影的成功
  // 文案叠在简介卡顶端，盖到 followerCount 的更新。统一 2.4s 后自动清掉。
  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => {
      setNotice(null);
    }, 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // 写改成 click 时同时调 setState + LS write —— 见 changeCollection helper。
  // 不要再用 useEffect 兜写：mount commit 里 effect 顺序会让初始 "all" 覆盖
  // 用户上次留下的真实选择，下方读 effect 的 setState 又来不及在 StrictMode
  // 双跑前生效，最终 LS 被刷回 "all"，体感 collection tab 永远没记住。
  const changeCollection = (tab: ChannelAuthorCollectionTab) => {
    setActiveCollection(tab);
    writeStoredChannelAuthorCollection(authorId, tab);
  };

  useEffect(() => {
    if (!isDesktopLayout) {
      return;
    }

    void navigate({
      to: "/tabs/channels",
      hash: buildDesktopChannelsRouteHash({
        postId: routeState.postId,
        authorId,
        returnHash: safeReturnHash,
        returnPath: safeReturnPath,
        section: routeState.section,
      }),
      replace: true,
    });
  }, [
    authorId,
    isDesktopLayout,
    navigate,
    routeState.postId,
    safeReturnHash,
    safeReturnPath,
    routeState.section,
  ]);

  function navigateBackToChannels() {
    if (isDesktopLayout) {
      void navigate({ to: "/tabs/channels" });
      return;
    }

    navigateBackOrFallback(() => {
      if (safeReturnPath) {
        void navigate({
          to: safeReturnPath,
          ...(safeReturnHash ? { hash: safeReturnHash } : {}),
        });
        return;
      }

      void navigate({ to: "/discover/channels" });
    });
  }

  function handleStatusBack() {
    if (safeReturnPath) {
      void navigate({
        to: safeReturnPath,
        ...(safeReturnHash ? { hash: safeReturnHash } : {}),
      });
      return;
    }

    void navigate({
      to: "/discover/channels",
      ...(fallbackChannelsHash ? { hash: fallbackChannelsHash } : {}),
    });
  }

  function handleRetryLoad() {
    void profileQuery.refetch();
  }

  function handleRetryFollow() {
    if (!profileQuery.data) {
      return;
    }

    setNotice(null);
    // 走查 2026-05-18 R1（新一轮）：mutationFn 改成按 input.following 决定走 follow
    // 还是 unfollow。这里读 server 端真值（profileQuery.data.isFollowing）—— mutation
    // 已经在前次失败时回滚过 cache，profileQuery.data 现在跟 server 一致。
    followMutation.mutate({ following: profileQuery.data.isFollowing });
  }

  function openChannelPost(post: FeedPostListItem) {
    const hash = buildDesktopChannelsRouteHash({
      postId: post.id,
      returnPath: sourceChannelsRouteState.returnPath,
      returnHash: sourceChannelsRouteState.returnHash,
      section: routeState.section ?? sourceChannelsRouteState.section,
    });

    if (isDesktopLayout) {
      void navigate({
        to: "/tabs/channels",
        hash,
      });
      return;
    }

    void navigate({
      to: safeReturnPath ?? "/discover/channels",
      hash,
    });
  }

  const profile = profileQuery.data;
  const fallbackBio =
    profile?.authorType === "character"
      ? t(msg`这位居民暂时还没有填写视频号简介。`)
      : t(msg`这个视频号作者暂时还没有填写简介。`);
  const collectionTabs = useMemo(
    () =>
      (
        [
          { key: "all", label: t(msg`全部`) },
          { key: "videos", label: t(msg`视频`) },
          // 音乐 tab：之前所有 audio 帖都被归到「动态」里，但「动态」语义跟
          // 文字 / 图集 / 心情 post 重叠。视频号当前 100% audio，把音乐拆出来
          // 让用户能直接定位作者的音乐合集。
          { key: "audio", label: t(msg`音乐`) },
          { key: "updates", label: t(msg`动态`) },
          { key: "live", label: t(msg`直播回放`) },
        ] satisfies Array<{
          key: ChannelAuthorCollectionTab;
          label: string;
        }>
      ).map((tab) => ({
        ...tab,
        count: (profile?.recentPosts ?? []).filter((post) =>
          matchesChannelAuthorCollection(post, tab.key),
        ).length,
      })),
    [profile?.recentPosts, t],
  );
  const visiblePosts = useMemo(
    () =>
      (profile?.recentPosts ?? []).filter((post) =>
        matchesChannelAuthorCollection(post, activeCollection),
      ),
    [activeCollection, profile?.recentPosts],
  );
  const activeCollectionLabel =
    collectionTabs.find((tab) => tab.key === activeCollection)?.label ??
    t(msg`全部`);
  const featuredLivePost = useMemo(
    () =>
      (profile?.recentPosts ?? []).find((post) => post.sourceKind === "live_clip") ??
      null,
    [profile?.recentPosts],
  );
  // 走查 2026-05-22 R2：featuredLivePost hero 卡和下面 visiblePosts 列表常常撞
  // 车。原条件只判 activeCollection !== "live"——"全部"tab 下 visiblePosts 包含
  // 所有帖（含 live_clip），用户先看到 hero 卡又在列表里看到同一条 live 帖，两
  // 次点击进同一个 post detail，体感「这条占了两个位置」。"动态" tab 在极端情况
  // （live_clip 帖 mediaType=image/text 而非 video）下同样会撞。改成 id 集合查
  // 重：featuredLivePost 在 visiblePosts 里就让位给列表渲染，hero 只在"它没出现
  // 在当前 tab 列表"时露出（典型场景：视频/音乐 tab 把 live_clip 过滤掉，hero
  // 仍然把作者最近一次直播亮出来）。
  const featuredLivePostInVisible =
    featuredLivePost &&
    visiblePosts.some((post) => post.id === featuredLivePost.id);

  if (isDesktopLayout) {
    return (
      <RouteRedirectState
        title={t(msg`正在切换到桌面视频号`)}
        description={t(msg`正在把作者页收回桌面视频号工作区，并恢复当前内容上下文。`)}
        loadingLabel={t(msg`切换桌面视频号...`)}
      />
    );
  }

  return (
    <AppPage
      className={cn(
        "space-y-0 px-0 py-0",
        isDesktopLayout ? "bg-[rgba(244,247,246,0.98)]" : "bg-[#f5f1e6]",
      )}
    >
      <TabPageTopBar
        title={profile?.authorName ?? t(msg`视频号作者`)}
        subtitle={t(msg`作者主页`)}
        titleAlign="center"
        className="mx-0 mb-0 mt-0 border-b border-[color:var(--border-faint)] bg-[rgba(250, 245, 237,0.94)] px-4 pb-1.5 pt-1.5 text-[color:var(--text-primary)] shadow-none"
        leftActions={
          <Button
            onClick={navigateBackToChannels}
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full border-0 bg-transparent text-[color:var(--text-primary)] active:bg-black/[0.05]"
            aria-label={t(msg`返回`)}
          >
            <ArrowLeft size={17} />
          </Button>
        }
      />

      <div className={cn("mx-auto w-full", isDesktopLayout ? "max-w-[1180px] px-6 py-6" : "px-4 py-4")}>
        {notice ? (
          <InlineNotice
            tone={notice.tone}
            className="mb-4 rounded-[16px] border-[color:var(--border-faint)] bg-[color:var(--surface-card)]"
          >
            {notice.message}
          </InlineNotice>
        ) : null}
        {profileQuery.isLoading ? (
          <div className="rounded-[24px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-5 py-8 shadow-[var(--shadow-section)]">
            <LoadingBlock label={t(msg`正在读取作者主页...`)} />
          </div>
        ) : null}
        {profileQuery.isError && profileQuery.error instanceof Error ? (
          <div className="rounded-[24px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-5 py-8 shadow-[var(--shadow-section)]">
            <MobileChannelAuthorStatusCard
              badge={t(msg`读取失败`)}
              title={t(msg`作者主页暂时不可用`)}
              description={describeRequestError(profileQuery.error)}
              tone="danger"
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 rounded-full border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-3.5 text-[11px]"
                    onClick={handleRetryLoad}
                  >
                    {t(msg`重试读取`)}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 rounded-full border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-3.5 text-[11px]"
                    onClick={handleStatusBack}
                  >
                    {safeReturnPath ? t(msg`返回上一页`) : t(msg`返回视频号`)}
                  </Button>
                </div>
              }
            />
          </div>
        ) : null}
        {followMutation.isError && followMutation.error instanceof Error ? (
          <div className="mb-4 rounded-[24px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-5 py-5 shadow-[var(--shadow-section)]">
            <MobileChannelAuthorStatusCard
              badge={t(msg`关注失败`)}
              title={t(msg`作者状态暂未更新`)}
              description={describeRequestError(followMutation.error)}
              tone="danger"
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {profileQuery.data ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-8 rounded-full border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-3.5 text-[11px]"
                      onClick={handleRetryFollow}
                    >
                      {profileQuery.data.isFollowing
                        ? t(msg`重试取消关注`)
                        : t(msg`重试关注`)}
                    </Button>
                  ) : null}
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 rounded-full border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-3.5 text-[11px]"
                    onClick={handleStatusBack}
                  >
                    {safeReturnPath ? t(msg`返回上一页`) : t(msg`返回视频号`)}
                  </Button>
                </div>
              }
            />
          </div>
        ) : null}

        {!profileQuery.isLoading && !profileQuery.isError && profile ? (
          <div className="mx-auto max-w-[820px] overflow-hidden rounded-[24px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] shadow-[var(--shadow-section)]">
            <section
              className={cn(
                "bg-[linear-gradient(180deg,#ffffff,#f7faf8)]",
                isDesktopLayout ? "px-6 pb-6 pt-6" : "px-4 pb-5 pt-5",
              )}
            >
              <div className="flex items-start gap-4">
                <AvatarChip
                  name={profile.authorName}
                  src={profile.authorAvatar}
                  size="xl"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="truncate text-[24px] font-semibold text-[color:var(--text-primary)]">
                      {profile.authorName}
                    </div>
                    <span className="rounded-full bg-[rgba(180, 130, 20, 0.06)] px-2.5 py-1 text-[11px] text-[color:var(--text-secondary)]">
                      {profile.authorType === "character"
                        ? t(msg`居民作者`)
                        : t(msg`世界主人`)}
                    </span>
                  </div>
                  <div className="mt-2 text-[13px] leading-6 text-[color:var(--text-secondary)]">
                    {profile.bio?.trim() || fallbackBio}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <ChannelAuthorHeaderStat
                      icon={<Users size={14} />}
                      label={t(msg`关注者`)}
                      value={String(profile.followerCount)}
                    />
                    <ChannelAuthorHeaderStat
                      icon={<Clapperboard size={14} />}
                      label={t(msg`最近内容`)}
                      value={String(profile.recentPosts.length)}
                    />
                    <ChannelAuthorHeaderStat
                      icon={<RadioTower size={14} />}
                      label={t(msg`直播回放`)}
                      value={String(
                        (profile.recentPosts ?? []).filter(
                          (post) => post.sourceKind === "live_clip",
                        ).length,
                      )}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {/* 「我自己」是用户的代理角色（char-default-self ≠ owner.id）；
                    后端 followChannelAuthor 对 owner===authorId 才 no-op，
                    char-default-self 会被真插一行 follow → 按钮在 +关注/已关注
                    之间反复横跳，没语义。和移动端卡片里的逻辑保持一致：隐掉。

                    走查 R2（本轮）：用户自己也可以发 surface='channels' post，
                    点自己头像进作者主页 → 老逻辑 authorId !== SELF_CHARACTER_ID
                    通过，按钮露出 → 点 +关注 / server 端 owner.id 分支 no-op
                    + isFollowing 永远 false → 按钮停在 "+关注" 不动，看着像
                    "我点了但没生效"。authorType==='user' 时一并隐掉。 */}
                {profile.authorId !== SELF_CHARACTER_ID &&
                profile.authorType !== "user" ? (
                  <Button
                    variant={profile.isFollowing ? "secondary" : "primary"}
                    size="lg"
                    disabled={followMutation.isPending}
                    onClick={() =>
                      followMutation.mutate({ following: profile.isFollowing })
                    }
                    className={cn(
                      "h-11 rounded-full px-5 shadow-none",
                      profile.isFollowing
                        ? "border-[color:var(--border-faint)] bg-[color:var(--surface-card)] text-[color:var(--text-secondary)]"
                        : "bg-[color:var(--brand-primary)] text-white hover:opacity-95",
                    )}
                  >
                    {followMutation.isPending
                      ? t(msg`处理中...`)
                      : profile.isFollowing
                        ? t(msg`已关注`)
                        : t(msg`+关注`)}
                  </Button>
                ) : null}
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={navigateBackToChannels}
                  className="h-11 rounded-full border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-5 text-[color:var(--text-primary)] shadow-none"
                >
                  {t(msg`返回视频号`)}
                </Button>
              </div>
            </section>

            {/*
              走查 R1（本轮）：原 featuredLivePost hero 卡无条件渲染，但用户点击
              「直播回放」tab 后，下面 visiblePosts 也按 sourceKind==='live_clip'
              过滤——featuredLivePost 是 recentPosts.find(live_clip)，正是 visiblePosts
              的第一条。结果同一条直播回放在 hero 卡 + 列表第一行各显示一次，
              用户两次点击进同一个 post detail，体感像 "为什么这条占两个位置"。

              走查 2026-05-22 R2：原 `activeCollection !== "live"` 守卫只能挡掉
              「直播回放」tab，但"全部"tab 下 visiblePosts 同样包含 live_clip 帖
              ——hero 又跟列表第一行撞车。换成「post 出现在当前 tab 列表里就让位
              给列表」的精确判断，"全部"/"动态" 边角同样兜住。
            */}
            {featuredLivePost && !featuredLivePostInVisible ? (
              <button
                type="button"
                onClick={() => openChannelPost(featuredLivePost)}
                className="flex w-full items-start justify-between gap-3 border-t border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(127,29,29,0.04),rgba(127,29,29,0.01))] px-4 py-4 text-left transition hover:bg-[rgba(127,29,29,0.06)]"
              >
                <div className="min-w-0 flex-1">
                  <div className="inline-flex items-center gap-2 rounded-full bg-[rgba(127,29,29,0.08)] px-3 py-1 text-[11px] font-medium text-[#7f1d1d]">
                    <RadioTower size={13} />
                    {t(msg`最近直播回放`)}
                  </div>
                  <div className="mt-3 line-clamp-1 text-[16px] font-semibold text-[color:var(--text-primary)]">
                    {featuredLivePost.title?.trim() ||
                      t(msg`查看作者最近一次直播回放`)}
                  </div>
                  <div className="mt-1 text-[12px] text-[color:var(--text-muted)]">
                    {t(
                      msg`${formatTimestamp(featuredLivePost.createdAt)} · ${featuredLivePost.viewCount} 播放`,
                    )}
                  </div>
                  {(() => {
                    // 走查 2026-05-18 R3（本轮）：featuredLivePost hero 卡同款问题——
                    // text 偶有 CoT prose 被抠空，标题下面会空着一块 line-clamp-2 占位。
                    // featuredLivePost 的 title 是上面那个绿色"最近直播回放"标签，post
                    // 本身的 title 已经渲在上面，cleanText 跟 title 撞车的几率低，主要
                    // 是兜空文本。
                    const cleanText = stripToolCallSyntax(featuredLivePost.text);
                    if (!cleanText) return null;
                    return (
                      <div className="mt-2 line-clamp-2 text-[13px] leading-6 text-[color:var(--text-secondary)]">
                        {cleanText}
                      </div>
                    );
                  })()}
                </div>
                <span className="shrink-0 rounded-full border border-[rgba(127,29,29,0.12)] bg-[color:var(--surface-card)] px-3 py-1 text-[11px] font-medium text-[#7f1d1d]">
                  {t(msg`查看回放`)}
                </span>
              </button>
            ) : null}

            <section>
              {/*
                走查 2026-05-18 R1：collection tabs 跟 channels-page 的 section
                tab 同款问题——只是普通 <button>，没有 role="tab" / aria-selected
                / aria-pressed，VoiceOver / TalkBack 念出"音乐 12 button"听不出
                谁是当前选中，盲用用户只能靠 tab 序列推断。补齐 tablist / tab
                role + 当前态。
              */}
              <div className="border-y border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3">
                <div className="flex overflow-x-auto" role="tablist" aria-label={t(msg`作者内容分栏`)}>
                  {collectionTabs.map((tab) => {
                    const selected = activeCollection === tab.key;
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        // 走查 2026-05-18 [本轮] R1：跟 channels-page section tab
                        // 同款 a11y 修复 —— role="tab" 的标准状态属性是
                        // aria-selected，aria-pressed 是 role=button toggle 用的；
                        // 同时挂会让 NVDA / 部分 SR 念出「tab selected pressed」
                        // 双重状态声明，用户体感「这控件是 tab 还是按钮」。
                        onClick={() => changeCollection(tab.key)}
                        className={cn(
                          "relative shrink-0 px-4 py-3 text-[14px] transition",
                          selected
                            ? "font-medium text-[color:var(--text-primary)]"
                            : "text-[color:var(--text-secondary)]",
                        )}
                      >
                        {tab.label}
                        <span className="ml-1 text-[11px] opacity-70">
                          {tab.count}
                        </span>
                        {selected ? (
                          <span className="absolute inset-x-4 bottom-0 h-[2px] rounded-full bg-[color:var(--brand-primary)]" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="bg-[color:var(--surface-console)] px-4 py-3 text-[12px] text-[color:var(--text-secondary)]">
                {t(
                  msg`当前分栏：${activeCollectionLabel}，共 ${visiblePosts.length} 条内容。`,
                )}
              </div>

              {visiblePosts.length ? (
                <div className="divide-y divide-[color:var(--border-faint)] bg-[color:var(--surface-card)]">
                  {visiblePosts.map((post) => {
                    const postStatus = resolveChannelPostCardStatus(t, post);

                    return (
                      <button
                        key={post.id}
                        type="button"
                        onClick={() => openChannelPost(post)}
                        className="flex w-full items-start gap-4 px-4 py-4 text-left transition hover:bg-[rgba(180, 130, 20, 0.02)]"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={cn(
                                "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-medium",
                                postStatus.primaryBadgeClassName,
                              )}
                            >
                              {postStatus.label}
                            </span>
                            <span
                              className={cn(
                                "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px]",
                                postStatus.secondaryBadgeClassName,
                              )}
                            >
                              {postStatus.secondaryLabel}
                            </span>
                          </div>
                          <div className="mt-2 flex items-center gap-2 text-[10px] text-[color:var(--text-dim)]">
                            <span>{formatTimestamp(post.createdAt)}</span>
                            <span>·</span>
                            <span>{postStatus.metaLabel}</span>
                          </div>
                          {post.title ? (
                            <div className="mt-2 line-clamp-2 text-[16px] font-semibold leading-6 text-[color:var(--text-primary)]">
                              {post.title}
                            </div>
                          ) : null}
                          {(() => {
                            // 走查 2026-05-18 R3（本轮）：原 line-clamp-3 文本框
                            // 无条件渲染 stripToolCallSyntax(post.text)——
                            //   - audio post 后端常把 title 和 text 都填 "X·音乐"
                            //     (channels-page card 那条早就 `cleanText === post.title
                            //     return null`)，作者主页这里没做同款判断，标题下方又
                            //     重复一行同样的文字；
                            //   - 偶有纯 CoT thinking-prose 的 post.text（DB 实测最长
                            //     1019 字），stripToolCallSyntax 整段抠空，rendered 是
                            //     一个空白 mt-2 div，视觉上像"标题和 topic tags 之间
                            //     有个没读完的间隙"；
                            // 跟卡片 (channels-page) 同款条件：cleanText 空 / 跟 title
                            // 一样时直接 null。
                            const cleanText = stripToolCallSyntax(post.text);
                            if (!cleanText || cleanText === post.title) {
                              return null;
                            }
                            return (
                              <div className="mt-2 line-clamp-3 text-[13px] leading-6 text-[color:var(--text-secondary)]">
                                {cleanText}
                              </div>
                            );
                          })()}
                          {post.topicTags?.length ? (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {post.topicTags.slice(0, 3).map((tag) => (
                                <span
                                  key={tag}
                                  className="rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-2 py-1 text-[10px] text-[color:var(--text-secondary)]"
                                >
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-[color:var(--text-muted)]">
                            <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--surface-console)] px-2.5 py-1">
                              <PlaySquare size={12} />
                              {t(msg`${post.viewCount} 播放`)}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--surface-console)] px-2.5 py-1">
                              <MessageCircleMore size={12} />
                              {t(msg`${post.commentCount} 评论`)}
                            </span>
                          </div>
                        </div>
                        <ChannelPostCover post={post} />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-[color:var(--surface-card)] p-6">
                  <EmptyState
                    title={t(msg`${activeCollectionLabel}分栏暂时没有内容`)}
                    description={t(msg`切换其他分栏看看，或者等作者发布新的内容后再回来。`)}
                  />
                </div>
              )}
            </section>
          </div>
        ) : null}
      </div>
    </AppPage>
  );
}

function ChannelAuthorHeaderStat({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3.5 py-2 text-[color:var(--text-primary)]">
      <div className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[rgba(245, 158, 11,0.1)] text-[color:var(--brand-primary)]">
        {icon}
      </div>
      <div>
        <div className="text-[14px] font-semibold">{value}</div>
        <div className="text-[11px] text-[color:var(--text-secondary)]">
          {label}
        </div>
      </div>
    </div>
  );
}

function ChannelPostCover({ post }: { post: FeedPostListItem }) {
  const t = useRuntimeTranslator();
  const coverPresentation = resolveChannelPostCoverPresentation(t, post);
  // 走查 R1 新一轮：post.coverUrl 偶发 404 / cloud-api 反代 401（token expire
  // 边界）/ minimax 资源被回收。原本直接渲染破图占位，作者主页列表里每条 row
  // 都是一张破图缩略图，体感整页都坏了。失败回退到下方 panelClassName 渐变面板
  // （resolveChannelPostCoverPresentation 已经按 mediaType / live_clip 给好色卡
  // 与图标），跟"无 coverUrl"分支视觉一致。
  const [coverFailed, setCoverFailed] = useState(false);

  if (post.coverUrl?.trim() && !coverFailed) {
    // 经 normalizeFeedPost 后 coverUrl 已是绝对 URL，但走 cloud-api 多租户反代时
    // <img src> 这类标签拿不到 Authorization header，必须用 resolveAppMediaUrl
    // 把 token 拼到 query string，否则 CloudClientAuthGuard 401，封面变破图。
    return (
      <div className="relative h-[8.75rem] w-[7rem] shrink-0 overflow-hidden rounded-[20px] bg-[#d8e5de]">
        <img
          src={resolveAppMediaUrl(post.coverUrl)}
          alt={post.title || post.authorName}
          loading="lazy"
          decoding="async"
          onError={() => setCoverFailed(true)}
          className="h-full w-full object-cover"
        />
        <div
          className={cn(
            "absolute inset-x-0 top-0 flex items-center justify-between px-2.5 py-2 text-white",
            coverPresentation.overlayClassName,
          )}
        >
          <div
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium",
              coverPresentation.badgeClassName,
            )}
          >
            {coverPresentation.icon}
            {coverPresentation.label}
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,rgba(15,23,42,0),rgba(15,23,42,0.86))] px-2.5 py-2">
          <div className="text-[10px] text-white/88">
            {coverPresentation.secondaryLabel}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-[8.75rem] w-[7rem] shrink-0 flex-col justify-between rounded-[20px] px-3 py-3 text-white",
        coverPresentation.panelClassName,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/12">
          {coverPresentation.icon}
        </div>
        <div
          className={cn(
            "rounded-full px-2 py-1 text-[10px] font-medium",
            coverPresentation.badgeClassName,
          )}
        >
          {coverPresentation.label}
        </div>
      </div>
      <div>
        <div className="text-[11px] font-medium text-white/86">
          {coverPresentation.title}
        </div>
        <div className="mt-1 text-[10px] text-white/62">
          {coverPresentation.secondaryLabel}
        </div>
      </div>
    </div>
  );
}

function matchesChannelAuthorCollection(
  post: FeedPostListItem,
  tab: ChannelAuthorCollectionTab,
) {
  if (tab === "all") {
    return true;
  }

  if (tab === "live") {
    return post.sourceKind === "live_clip";
  }

  if (tab === "videos") {
    return post.mediaType === "video" && post.sourceKind !== "live_clip";
  }

  if (tab === "audio") {
    // 音乐 tab：只放真正的 audio 帖，不含 live 回放（live_clip 已经在 直播回放
    // tab 里独立呈现，不重复）。
    return post.mediaType === "audio" && post.sourceKind !== "live_clip";
  }

  // updates 兜底：现在剔掉 video 和 audio，剩下图集 / 文本 / 其他更新。
  return post.mediaType !== "video" && post.mediaType !== "audio";
}

function resolveChannelPostCoverPresentation(t: Translator, post: FeedPostListItem) {
  if (post.sourceKind === "live_clip") {
    return {
      badgeClassName: "bg-[rgba(255,255,255,0.14)] text-white",
      icon: <RadioTower size={14} />,
      label: t(msg`直播回放`),
      overlayClassName:
        "bg-[linear-gradient(180deg,rgba(120,24,24,0.82),rgba(120,24,24,0))]",
      panelClassName:
        "bg-[linear-gradient(180deg,#7f1d1d,#451a03)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
      secondaryLabel: t(
        msg`${formatTimestamp(post.createdAt)} · ${post.viewCount} 播放`,
      ),
      title: t(msg`直播精选`),
    };
  }

  if (post.mediaType === "video") {
    return {
      badgeClassName: "bg-[rgba(255,255,255,0.14)] text-white",
      icon: <PlaySquare size={14} />,
      label: t(msg`视频`),
      overlayClassName:
        "bg-[linear-gradient(180deg,rgba(15,23,42,0.76),rgba(15,23,42,0))]",
      panelClassName:
        "bg-[linear-gradient(180deg,#1f2937,#0f172a)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
      secondaryLabel: post.durationMs
        ? t(
            msg`${Math.max(1, Math.round(post.durationMs / 1000))} 秒 · ${post.viewCount} 播放`,
          )
        : t(msg`${post.viewCount} 播放`),
      title: t(msg`视频号短片`),
    };
  }

  // 音乐帖：之前直接 fall through 到下面"动态"分支，badge 打成"动态" + 绿色 +
  // MessageCircleMore 评论图标，跟主 feed 卡 / formatChannelMeta 里"音乐"标签
  // 完全对不上。视频号 18 条当前全是 audio，作者主页把每条 audio 都标"动态"
  // 既误导分类又跟整套 audio 沉浸式播放 UI 不一致。给 audio 一套独立陈述。
  if (post.mediaType === "audio") {
    return {
      badgeClassName: "bg-[rgba(255,255,255,0.18)] text-white",
      icon: <Music2 size={14} />,
      label: t(msg`音乐`),
      overlayClassName:
        "bg-[linear-gradient(180deg,rgba(67,32,87,0.78),rgba(67,32,87,0))]",
      panelClassName:
        "bg-[linear-gradient(180deg,#3b1d52,#1d1140)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
      secondaryLabel: post.durationMs
        ? t(
            msg`${Math.max(1, Math.round(post.durationMs / 1000))} 秒 · ${post.viewCount} 播放`,
          )
        : t(msg`${post.viewCount} 播放`),
      title: t(msg`视频号音乐`),
    };
  }

  return {
    badgeClassName: "bg-[rgba(245, 158, 11,0.18)] text-white",
    icon: <MessageCircleMore size={14} />,
    label: t(msg`动态`),
    overlayClassName:
      "bg-[linear-gradient(180deg,rgba(22,101,52,0.72),rgba(22,101,52,0))]",
    panelClassName:
      "bg-[linear-gradient(180deg,#166534,#14532d)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
    secondaryLabel: t(msg`${formatTimestamp(post.createdAt)} · 内容更新`),
    title: t(msg`内容卡片`),
  };
}

function resolveChannelPostCardStatus(t: Translator, post: FeedPostListItem) {
  if (post.sourceKind === "live_clip") {
    return {
      label: t(msg`直播回放`),
      metaLabel: t(msg`直播精选`),
      primaryBadgeClassName:
        "border-[rgba(185,28,28,0.12)] bg-[rgba(185,28,28,0.08)] text-[#991b1b]",
      secondaryBadgeClassName:
        "border-[rgba(127,29,29,0.1)] bg-[rgba(127,29,29,0.05)] text-[#7f1d1d]",
      secondaryLabel: post.durationMs
        ? t(msg`${Math.max(1, Math.round(post.durationMs / 60000))} 分钟回放`)
        : t(msg`作者直播内容`),
    };
  }

  if (post.mediaType === "video") {
    return {
      label: t(msg`视频`),
      metaLabel: t(msg`短片更新`),
      primaryBadgeClassName:
        "border-[rgba(180, 130, 20, 0.08)] bg-[rgba(180, 130, 20, 0.05)] text-[#0f172a]",
      secondaryBadgeClassName:
        "border-[rgba(180, 130, 20, 0.08)] bg-[color:var(--surface-console)] text-[color:var(--text-secondary)]",
      secondaryLabel: post.durationMs
        ? t(msg`${Math.max(1, Math.round(post.durationMs / 1000))} 秒短片`)
        : t(msg`视频号短片`),
    };
  }

  // 同 resolveChannelPostCoverPresentation：audio 帖独立分支，列表行的 primary
  // badge 也走 "音乐"，避免列表头一行打"动态"和卡片缩略图 overlay 上"音乐"自相矛盾。
  if (post.mediaType === "audio") {
    return {
      label: t(msg`音乐`),
      metaLabel: t(msg`音乐更新`),
      primaryBadgeClassName:
        "border-[rgba(67,32,87,0.14)] bg-[rgba(67,32,87,0.08)] text-[#3b1d52]",
      secondaryBadgeClassName:
        "border-[rgba(67,32,87,0.1)] bg-[color:var(--surface-console)] text-[color:var(--text-secondary)]",
      secondaryLabel: post.durationMs
        ? t(msg`${Math.max(1, Math.round(post.durationMs / 1000))} 秒音乐`)
        : t(msg`视频号音乐`),
    };
  }

  return {
    label: t(msg`动态`),
    metaLabel: t(msg`内容卡片`),
    primaryBadgeClassName:
      "border-[rgba(245, 158, 11,0.14)] bg-[rgba(245, 158, 11,0.08)] text-[color:var(--brand-primary)]",
    secondaryBadgeClassName:
      "border-[color:var(--border-faint)] bg-[color:var(--surface-console)] text-[color:var(--text-secondary)]",
    secondaryLabel: post.topicTags?.length
      ? `#${post.topicTags[0]}`
      : t(msg`内容更新`),
  };
}

function readStoredChannelAuthorCollection(authorId: string) {
  if (typeof window === "undefined") {
    return "all" as ChannelAuthorCollectionTab;
  }

  try {
    const rawValue = window.localStorage.getItem(
      CHANNEL_AUTHOR_COLLECTION_STORAGE_KEY,
    );
    if (!rawValue) {
      return "all";
    }

    const parsed = JSON.parse(rawValue) as Record<string, string>;
    const storedValue = parsed[authorId];
    // R1 加了 "audio" tab 但这里 whitelist 没跟着改，用户选"音乐"刷新后掉回"全部"。
    if (
      storedValue === "videos" ||
      storedValue === "audio" ||
      storedValue === "updates" ||
      storedValue === "live"
    ) {
      return storedValue;
    }
  } catch {
    return "all";
  }

  return "all";
}

function writeStoredChannelAuthorCollection(
  authorId: string,
  tab: ChannelAuthorCollectionTab,
) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const rawValue = window.localStorage.getItem(
      CHANNEL_AUTHOR_COLLECTION_STORAGE_KEY,
    );
    const currentMap = rawValue
      ? (JSON.parse(rawValue) as Record<string, string>)
      : {};

    currentMap[authorId] = tab;
    window.localStorage.setItem(
      CHANNEL_AUTHOR_COLLECTION_STORAGE_KEY,
      JSON.stringify(currentMap),
    );
  } catch {
    return;
  }
}

function MobileChannelAuthorStatusCard({
  badge,
  title,
  description,
  tone = "default",
  action,
}: {
  badge: string;
  title: string;
  description: string;
  tone?: "default" | "danger";
  action?: ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-[20px] border px-4 py-5 text-center shadow-none",
        tone === "danger"
          ? "border-[color:var(--border-danger)] bg-[linear-gradient(180deg,rgba(255,245,245,0.96),rgba(254,242,242,0.94))]"
          : "border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]",
      )}
    >
      <div
        className={cn(
          "mx-auto inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-medium tracking-[0.04em]",
          tone === "danger"
            ? "bg-[rgba(220,38,38,0.08)] text-[color:var(--state-danger-text)]"
            : "bg-[rgba(180, 130, 20, 0.06)] text-[color:var(--text-secondary)]",
        )}
      >
        {badge}
      </div>
      <div className="mt-3 text-[16px] font-medium text-[color:var(--text-primary)]">
        {title}
      </div>
      <p className="mx-auto mt-1.5 max-w-[17rem] text-[12px] leading-6 text-[color:var(--text-secondary)]">
        {description}
      </p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </section>
  );
}
