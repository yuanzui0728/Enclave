import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addFeedComment,
  addMomentComment,
  createFeedPost,
  createUserMoment,
  getBlockedCharacters,
  getFeed,
  getMoments,
  likeFeedPost,
  sendFriendRequest,
  shake,
  toggleMomentLike,
  triggerSceneFriendRequest,
} from "@yinjie/contracts";
import { ChevronRight, Compass, Newspaper, Sparkles, Users } from "lucide-react";
import {
  AppHeader,
  AppPage,
  AppSection,
  Button,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  TextAreaField,
  TextField,
  cn,
} from "@yinjie/ui";
import { EmptyState } from "../components/empty-state";
import { SocialPostCard } from "../components/social-post-card";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { formatTimestamp } from "../lib/format";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

const scenes = [
  { id: "coffee_shop", label: "咖啡馆" },
  { id: "gym", label: "健身房" },
  { id: "library", label: "图书馆" },
  { id: "park", label: "公园" },
];

type MobileDiscoverPanel = "moments" | "encounter" | "scene" | "feed";

type MobileDiscoverEntry = {
  key: MobileDiscoverPanel;
  label: string;
  description: string;
  icon: typeof Users;
  iconClassName: string;
};

const mobileDiscoverGroups: MobileDiscoverEntry[][] = [
  [
    {
      key: "moments",
      label: "朋友圈",
      description: "熟人动态",
      icon: Users,
      iconClassName: "bg-[linear-gradient(135deg,#64c466,#2fa43a)] text-white",
    },
  ],
  [
    {
      key: "encounter",
      label: "摇一摇",
      description: "随机相遇",
      icon: Sparkles,
      iconClassName: "bg-[linear-gradient(135deg,#ffb45f,#ff7b54)] text-white",
    },
    {
      key: "scene",
      label: "场景相遇",
      description: "地点触发",
      icon: Compass,
      iconClassName: "bg-[linear-gradient(135deg,#54b8ff,#2f7cff)] text-white",
    },
  ],
  [
    {
      key: "feed",
      label: "广场动态",
      description: "公共发现",
      icon: Newspaper,
      iconClassName: "bg-[linear-gradient(135deg,#9097ff,#5963ff)] text-white",
    },
  ],
];

const mobilePanelTitles: Record<MobileDiscoverPanel, string> = {
  moments: "朋友圈",
  encounter: "摇一摇",
  scene: "场景相遇",
  feed: "广场动态",
};

export function DiscoverPage() {
  const isDesktopLayout = useDesktopLayout();
  const queryClient = useQueryClient();
  const ownerId = useWorldOwnerStore((state) => state.id);
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl ?? "default";
  const [mobilePanel, setMobilePanel] = useState<MobileDiscoverPanel>("moments");
  const [momentText, setMomentText] = useState("");
  const [feedText, setFeedText] = useState("");
  const [shakeMessage, setShakeMessage] = useState("");
  const [sceneMessage, setSceneMessage] = useState("");
  const [momentCommentDrafts, setMomentCommentDrafts] = useState<Record<string, string>>({});
  const [feedCommentDrafts, setFeedCommentDrafts] = useState<Record<string, string>>({});
  const [successNotice, setSuccessNotice] = useState("");

  const feedQuery = useQuery({
    queryKey: ["app-feed", baseUrl],
    queryFn: () => getFeed(1, 20),
  });
  const momentsQuery = useQuery({
    queryKey: ["app-moments", baseUrl],
    queryFn: () => getMoments(baseUrl),
  });
  const blockedQuery = useQuery({
    queryKey: ["app-discover-blocked-characters", baseUrl],
    queryFn: () => getBlockedCharacters(baseUrl),
    enabled: Boolean(ownerId),
  });

  const createFeedPostMutation = useMutation({
    mutationFn: () =>
      createFeedPost(
        {
          text: feedText.trim(),
        },
        baseUrl,
      ),
    onSuccess: async () => {
      setFeedText("");
      setSuccessNotice("广场动态已发布。");
      await queryClient.invalidateQueries({ queryKey: ["app-feed", baseUrl] });
    },
  });

  const createMomentMutation = useMutation({
    mutationFn: () =>
      createUserMoment(
        {
          text: momentText.trim(),
        },
        baseUrl,
      ),
    onSuccess: async () => {
      setMomentText("");
      setSuccessNotice("朋友圈已发布。");
      await queryClient.invalidateQueries({ queryKey: ["app-moments", baseUrl] });
    },
  });

  const shakeMutation = useMutation({
    mutationFn: async () => {
      const result = await shake(baseUrl);
      if (!result) {
        return null;
      }
      await sendFriendRequest(
        {
          characterId: result.character.id,
          greeting: result.greeting,
        },
        baseUrl,
      );
      return result;
    },
    onSuccess: (result) => {
      if (!result) {
        setShakeMessage("附近暂时没有新的相遇。");
        return;
      }

      setSuccessNotice("新的好友申请已发送。");
      setShakeMessage(`${result.character.name} 向你发来了好友申请：${result.greeting}`);
      void queryClient.invalidateQueries({ queryKey: ["app-friend-requests", baseUrl] });
    },
  });

  const sceneMutation = useMutation({
    mutationFn: async (scene: string) => {
      const result = await triggerSceneFriendRequest(
        {
          scene,
        },
        baseUrl,
      );
      return { request: result, scene };
    },
    onSuccess: ({ request, scene }) => {
      const sceneLabel = scenes.find((item) => item.id === scene)?.label ?? scene;

      if (!request) {
        setSceneMessage(`${sceneLabel} 里暂时没有新的相遇。`);
        return;
      }

      setSuccessNotice("场景相遇已写入好友申请列表。");
      setSceneMessage(`${request.characterName} 在${sceneLabel}里注意到了你：${request.greeting ?? "对你产生了兴趣。"}`);
      void queryClient.invalidateQueries({ queryKey: ["app-friend-requests", baseUrl] });
    },
  });

  const likeFeedMutation = useMutation({
    mutationFn: (postId: string) => likeFeedPost(postId, baseUrl),
    onSuccess: async () => {
      setSuccessNotice("广场互动已更新。");
      await queryClient.invalidateQueries({ queryKey: ["app-feed", baseUrl] });
    },
  });

  const commentFeedMutation = useMutation({
    mutationFn: (postId: string) =>
      addFeedComment(
        postId,
        {
          text: feedCommentDrafts[postId].trim(),
        },
        baseUrl,
      ),
    onSuccess: async (_, postId) => {
      setFeedCommentDrafts((current) => ({ ...current, [postId]: "" }));
      setSuccessNotice("广场互动已更新。");
      await queryClient.invalidateQueries({ queryKey: ["app-feed", baseUrl] });
    },
  });

  const likeMomentMutation = useMutation({
    mutationFn: (momentId: string) => toggleMomentLike(momentId, baseUrl),
    onSuccess: async () => {
      setSuccessNotice("朋友圈互动已更新。");
      await queryClient.invalidateQueries({ queryKey: ["app-moments", baseUrl] });
    },
  });

  const commentMomentMutation = useMutation({
    mutationFn: (momentId: string) =>
      addMomentComment(
        momentId,
        {
          text: momentCommentDrafts[momentId].trim(),
        },
        baseUrl,
      ),
    onSuccess: async (_, momentId) => {
      setMomentCommentDrafts((current) => ({ ...current, [momentId]: "" }));
      setSuccessNotice("朋友圈互动已更新。");
      await queryClient.invalidateQueries({ queryKey: ["app-moments", baseUrl] });
    },
  });

  const blockedCharacterIds = new Set((blockedQuery.data ?? []).map((item) => item.characterId));
  const visiblePosts = (feedQuery.data?.posts ?? []).filter(
    (post) => post.authorType !== "character" || !blockedCharacterIds.has(post.authorId),
  );
  const visibleMoments = (momentsQuery.data ?? []).filter(
    (moment) => moment.authorType !== "character" || !blockedCharacterIds.has(moment.authorId),
  );
  const pendingLikePostId = likeFeedMutation.isPending ? likeFeedMutation.variables : null;
  const pendingCommentPostId = commentFeedMutation.isPending ? commentFeedMutation.variables : null;
  const pendingLikeMomentId = likeMomentMutation.isPending ? likeMomentMutation.variables : null;
  const pendingCommentMomentId = commentMomentMutation.isPending ? commentMomentMutation.variables : null;

  useEffect(() => {
    setMomentText("");
    setFeedText("");
    setShakeMessage("");
    setSceneMessage("");
    setMomentCommentDrafts({});
    setFeedCommentDrafts({});
    setSuccessNotice("");
    setMobilePanel("moments");
  }, [baseUrl]);

  useEffect(() => {
    if (!successNotice) {
      return;
    }

    const timer = window.setTimeout(() => setSuccessNotice(""), 2400);
    return () => window.clearTimeout(timer);
  }, [successNotice]);

  const mobilePanelContent =
    mobilePanel === "moments" ? (
      <>
        <AppSection className="space-y-4">
          <div>
            <div className="text-sm font-medium text-[color:var(--text-primary)]">发一条朋友圈</div>
            <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">把熟人视角里的这一刻留下来。</div>
          </div>
          <TextAreaField
            value={momentText}
            onChange={(event) => setMomentText(event.target.value)}
            placeholder="这一刻的想法..."
            className="min-h-28 resize-none"
          />
          <Button disabled={!momentText.trim() || createMomentMutation.isPending} onClick={() => createMomentMutation.mutate()} variant="primary">
            {createMomentMutation.isPending ? "正在发布..." : "发布"}
          </Button>
          {createMomentMutation.isError && createMomentMutation.error instanceof Error ? (
            <ErrorBlock message={createMomentMutation.error.message} />
          ) : null}
        </AppSection>

        <AppSection className="space-y-4">
          {momentsQuery.isLoading ? <LoadingBlock label="正在读取朋友圈..." /> : null}
          {momentsQuery.isError && momentsQuery.error instanceof Error ? <ErrorBlock message={momentsQuery.error.message} /> : null}
          {visibleMoments.map((moment) => (
            <SocialPostCard
              key={moment.id}
              authorName={moment.authorName}
              authorAvatar={moment.authorAvatar}
              meta={formatTimestamp(moment.postedAt)}
              body={moment.text}
              summary={`${moment.likeCount} 赞 · ${moment.commentCount} 评论`}
              actions={
                <Button disabled={likeMomentMutation.isPending} onClick={() => likeMomentMutation.mutate(moment.id)} variant="secondary" size="sm">
                  {pendingLikeMomentId === moment.id ? "处理中..." : "点赞"}
                </Button>
              }
              secondary={
                moment.comments.length > 0 ? (
                  <div className="space-y-2 rounded-[22px] bg-[color:var(--surface-soft)] p-3">
                    {moment.comments.slice(-3).map((comment) => (
                      <div key={comment.id} className="text-xs leading-6 text-[color:var(--text-secondary)]">
                        <span className="text-[color:var(--text-primary)]">{comment.authorName}</span>
                        {`：${comment.text}`}
                      </div>
                    ))}
                  </div>
                ) : null
              }
              composer={
                <>
                  <TextField
                    value={momentCommentDrafts[moment.id] ?? ""}
                    onChange={(event) =>
                      setMomentCommentDrafts((current) => ({
                        ...current,
                        [moment.id]: event.target.value,
                      }))
                    }
                    placeholder="写评论..."
                    className="min-w-0 flex-1 rounded-full py-2 text-xs"
                  />
                  <Button
                    disabled={!(momentCommentDrafts[moment.id] ?? "").trim() || commentMomentMutation.isPending}
                    onClick={() => commentMomentMutation.mutate(moment.id)}
                    variant="primary"
                    size="sm"
                  >
                    {pendingCommentMomentId === moment.id ? "发送中..." : "发送"}
                  </Button>
                </>
              }
            />
          ))}
          {likeMomentMutation.isError && likeMomentMutation.error instanceof Error ? <ErrorBlock message={likeMomentMutation.error.message} /> : null}
          {commentMomentMutation.isError && commentMomentMutation.error instanceof Error ? (
            <ErrorBlock message={commentMomentMutation.error.message} />
          ) : null}
          {!momentsQuery.isLoading && !momentsQuery.isError && !visibleMoments.length ? (
            <EmptyState title="朋友圈还很安静" description="你先发一条，或者等世界里的其他人先开口。" />
          ) : null}
        </AppSection>
      </>
    ) : mobilePanel === "encounter" ? (
      <AppSection className="space-y-4 bg-[color:var(--brand-soft)]">
        <div>
          <div className="text-sm font-medium text-[color:var(--text-primary)]">随机相遇</div>
          <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">像微信的发现入口一样，先点进去，再决定今天想不想打断世界。</div>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => shakeMutation.mutate()} disabled={shakeMutation.isPending} variant="primary">
            {shakeMutation.isPending ? "正在寻找..." : "摇一摇"}
          </Button>
          <div className="text-xs text-[color:var(--text-muted)]">随机相遇会从不同场景里发生。</div>
        </div>
        {shakeMessage ? <InlineNotice className="mt-3" tone="success">{shakeMessage}</InlineNotice> : null}
        {shakeMutation.isError && shakeMutation.error instanceof Error ? <ErrorBlock className="mt-3" message={shakeMutation.error.message} /> : null}
      </AppSection>
    ) : mobilePanel === "scene" ? (
      <AppSection className="space-y-4 bg-[color:var(--brand-soft)]">
        <div>
          <div className="text-sm font-medium text-[color:var(--text-primary)]">场景相遇</div>
          <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">选一个地方，看看这个世界会不会给你安排新的故事。</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {scenes.map((scene) => (
            <Button
              key={scene.id}
              onClick={() => sceneMutation.mutate(scene.id)}
              disabled={sceneMutation.isPending}
              variant="secondary"
              size="sm"
            >
              {sceneMutation.isPending && sceneMutation.variables === scene.id ? `正在前往${scene.label}...` : scene.label}
            </Button>
          ))}
        </div>
        {sceneMessage ? <InlineNotice className="mt-3" tone="info">{sceneMessage}</InlineNotice> : null}
        {sceneMutation.isError && sceneMutation.error instanceof Error ? <ErrorBlock className="mt-3" message={sceneMutation.error.message} /> : null}
      </AppSection>
    ) : (
      <>
        <AppSection className="space-y-4">
          <div>
            <div className="text-sm font-medium text-[color:var(--text-primary)]">发一条广场动态</div>
            <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">公共广场更偏向开放内容，熟人内容留在朋友圈。</div>
          </div>
          <TextAreaField
            value={feedText}
            onChange={(event) => setFeedText(event.target.value)}
            placeholder="分享你的想法..."
            className="min-h-28 resize-none"
          />
          <Button
            disabled={!feedText.trim() || createFeedPostMutation.isPending}
            onClick={() => createFeedPostMutation.mutate()}
            variant="primary"
          >
            {createFeedPostMutation.isPending ? "正在发布..." : "发布"}
          </Button>
          {createFeedPostMutation.isError && createFeedPostMutation.error instanceof Error ? (
            <ErrorBlock message={createFeedPostMutation.error.message} />
          ) : null}
        </AppSection>

        <AppSection className="space-y-4">
          {feedQuery.isLoading ? <LoadingBlock label="正在读取广场动态..." /> : null}
          {feedQuery.isError && feedQuery.error instanceof Error ? <ErrorBlock message={feedQuery.error.message} /> : null}
          {visiblePosts.map((post) => (
            <SocialPostCard
              key={post.id}
              authorName={post.authorName}
              authorAvatar={post.authorAvatar}
              meta={post.aiReacted ? "AI 已响应" : "等待 AI 互动"}
              body={post.text}
              summary={`${post.likeCount} 赞 · ${post.commentCount} 评论`}
              actions={
                <Button disabled={likeFeedMutation.isPending} onClick={() => likeFeedMutation.mutate(post.id)} variant="secondary" size="sm">
                  {pendingLikePostId === post.id ? "处理中..." : "点赞"}
                </Button>
              }
              composer={
                <>
                  <TextField
                    value={feedCommentDrafts[post.id] ?? ""}
                    onChange={(event) =>
                      setFeedCommentDrafts((current) => ({
                        ...current,
                        [post.id]: event.target.value,
                      }))
                    }
                    placeholder="写评论..."
                    className="min-w-0 flex-1 rounded-full py-2 text-xs"
                  />
                  <Button
                    disabled={!(feedCommentDrafts[post.id] ?? "").trim() || commentFeedMutation.isPending}
                    onClick={() => commentFeedMutation.mutate(post.id)}
                    variant="primary"
                    size="sm"
                  >
                    {pendingCommentPostId === post.id ? "发送中..." : "发送"}
                  </Button>
                </>
              }
            />
          ))}
          {likeFeedMutation.isError && likeFeedMutation.error instanceof Error ? <ErrorBlock message={likeFeedMutation.error.message} /> : null}
          {commentFeedMutation.isError && commentFeedMutation.error instanceof Error ? (
            <ErrorBlock message={commentFeedMutation.error.message} />
          ) : null}
          {!feedQuery.isLoading && !feedQuery.isError && !visiblePosts.length ? (
            <EmptyState title="广场还没有新动态" description="你先发一条，或者再摇一摇看看会遇到谁。" />
          ) : null}
        </AppSection>
      </>
    );

  if (isDesktopLayout) {
    return (
      <AppPage className="space-y-5 px-6 py-6">
        <AppHeader
          eyebrow="发现"
          title="在更大的画布里安排相遇"
          description="随机相遇、场景相遇和广场动态拆开排布，不再堆在一条手机长页里。"
        />

        <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-5">
            <AppSection className="space-y-4 bg-[color:var(--brand-soft)]">
              <div>
                <div className="text-sm font-medium text-[color:var(--text-primary)]">随机相遇</div>
                <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">把偶遇、场景和反馈放在同一块桌面面板中。</div>
              </div>
              <div className="flex items-center gap-3">
                <Button onClick={() => shakeMutation.mutate()} disabled={shakeMutation.isPending} variant="primary">
                  {shakeMutation.isPending ? "正在寻找..." : "摇一摇"}
                </Button>
                <div className="text-xs text-[color:var(--text-muted)]">随机相遇会从不同场景里发生。</div>
              </div>
              {shakeMessage ? <InlineNotice className="mt-3" tone="success">{shakeMessage}</InlineNotice> : null}
              {shakeMutation.isError && shakeMutation.error instanceof Error ? (
                <ErrorBlock className="mt-3" message={shakeMutation.error.message} />
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                {scenes.map((scene) => (
                  <Button
                    key={scene.id}
                    onClick={() => sceneMutation.mutate(scene.id)}
                    disabled={sceneMutation.isPending}
                    variant="secondary"
                    size="sm"
                  >
                    {sceneMutation.isPending && sceneMutation.variables === scene.id ? `正在前往${scene.label}...` : scene.label}
                  </Button>
                ))}
              </div>
              {sceneMessage ? <InlineNotice className="mt-3" tone="info">{sceneMessage}</InlineNotice> : null}
              {sceneMutation.isError && sceneMutation.error instanceof Error ? (
                <ErrorBlock className="mt-3" message={sceneMutation.error.message} />
              ) : null}
            </AppSection>

            <AppSection className="space-y-4">
              <div>
                <div className="text-sm font-medium text-[color:var(--text-primary)]">发一条发现页动态</div>
                <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">左侧负责动作和发布，右侧专注内容流。</div>
              </div>
              <TextAreaField
                value={feedText}
                onChange={(event) => setFeedText(event.target.value)}
                placeholder="分享你的想法..."
                className="min-h-36 resize-none"
              />
              <Button
                disabled={!feedText.trim() || createFeedPostMutation.isPending}
                onClick={() => createFeedPostMutation.mutate()}
                variant="primary"
              >
                {createFeedPostMutation.isPending ? "正在发布..." : "发布"}
              </Button>
              {createFeedPostMutation.isError && createFeedPostMutation.error instanceof Error ? (
                <ErrorBlock message={createFeedPostMutation.error.message} />
              ) : null}
            </AppSection>
          </div>

          <AppSection className="space-y-4">
            <div>
              <div className="text-sm font-medium text-[color:var(--text-primary)]">广场动态</div>
              <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">在桌面端保留更宽正文和更清晰的互动区。</div>
            </div>
            {successNotice ? <InlineNotice tone="success">{successNotice}</InlineNotice> : null}
            {feedQuery.isLoading ? <LoadingBlock label="正在读取发现页动态..." /> : null}
            {feedQuery.isError && feedQuery.error instanceof Error ? <ErrorBlock message={feedQuery.error.message} /> : null}
            {visiblePosts.map((post) => (
              <SocialPostCard
                key={post.id}
                authorName={post.authorName}
                authorAvatar={post.authorAvatar}
                meta={post.aiReacted ? "AI 已响应" : "等待 AI 互动"}
                body={post.text}
                summary={`${post.likeCount} 赞 · ${post.commentCount} 评论`}
                actions={
                  <Button disabled={likeFeedMutation.isPending} onClick={() => likeFeedMutation.mutate(post.id)} variant="secondary" size="sm">
                    {pendingLikePostId === post.id ? "处理中..." : "点赞"}
                  </Button>
                }
                composer={
                  <>
                    <TextField
                      value={feedCommentDrafts[post.id] ?? ""}
                      onChange={(event) =>
                        setFeedCommentDrafts((current) => ({
                          ...current,
                          [post.id]: event.target.value,
                        }))
                      }
                      placeholder="写评论..."
                      className="min-w-0 flex-1 rounded-full py-2 text-xs"
                    />
                    <Button
                      disabled={!(feedCommentDrafts[post.id] ?? "").trim() || commentFeedMutation.isPending}
                      onClick={() => commentFeedMutation.mutate(post.id)}
                      variant="primary"
                      size="sm"
                    >
                      {pendingCommentPostId === post.id ? "发送中..." : "发送"}
                    </Button>
                  </>
                }
              />
            ))}
            {likeFeedMutation.isError && likeFeedMutation.error instanceof Error ? <ErrorBlock message={likeFeedMutation.error.message} /> : null}
            {commentFeedMutation.isError && commentFeedMutation.error instanceof Error ? (
              <ErrorBlock message={commentFeedMutation.error.message} />
            ) : null}
            {!feedQuery.isLoading && !feedQuery.isError && !visiblePosts.length ? (
              <EmptyState title="发现页还没有新动态" description="你先发一条，或者再摇一摇看看会遇到谁。" />
            ) : null}
          </AppSection>
        </div>
      </AppPage>
    );
  }

  return (
    <AppPage className="space-y-5">
      <TabPageTopBar title="发现" titleAlign="center" />

      <div className="space-y-3">
        {mobileDiscoverGroups.map((group, groupIndex) => (
          <div
            key={`group-${groupIndex}`}
            className="overflow-hidden rounded-[24px] border border-[color:var(--border-faint)] bg-white shadow-[var(--shadow-soft)]"
          >
            {group.map((item, itemIndex) => {
              const Icon = item.icon;
              const active = mobilePanel === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setMobilePanel(item.key)}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
                    active ? "bg-[color:var(--brand-soft)]" : "bg-white",
                    itemIndex < group.length - 1 ? "border-b border-[color:var(--border-faint)]" : undefined,
                  )}
                >
                  <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", item.iconClassName)}>
                    <Icon size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-medium text-[color:var(--text-primary)]">{item.label}</div>
                    <div className="mt-0.5 text-xs text-[color:var(--text-muted)]">{item.description}</div>
                  </div>
                  <ChevronRight size={16} className="shrink-0 text-[color:var(--text-dim)]" />
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="space-y-4">
        <div className="px-1 text-sm font-medium text-[color:var(--text-primary)]">{mobilePanelTitles[mobilePanel]}</div>
        {successNotice ? <InlineNotice tone="success">{successNotice}</InlineNotice> : null}
        {mobilePanelContent}
      </div>
    </AppPage>
  );
}
