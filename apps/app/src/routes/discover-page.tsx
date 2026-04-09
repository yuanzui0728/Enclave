import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  addFeedComment,
  createFeedPost,
  getBlockedCharacters,
  getFeed,
  likeFeedPost,
  sendFriendRequest,
  shake,
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
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

const scenes = [
  { id: "coffee_shop", label: "咖啡馆" },
  { id: "gym", label: "健身房" },
  { id: "library", label: "图书馆" },
  { id: "park", label: "公园" },
];

type MobileDiscoverEntry = {
  key: "moments" | "encounter" | "scene" | "feed";
  label: string;
  description: string;
  icon: typeof Users;
  iconClassName: string;
  to: "/discover/moments" | "/discover/encounter" | "/discover/scene" | "/discover/feed";
};

const mobileDiscoverGroups: MobileDiscoverEntry[][] = [
  [
    {
      key: "moments",
      label: "朋友圈",
      description: "熟人动态",
      icon: Users,
      iconClassName: "bg-[linear-gradient(135deg,#64c466,#2fa43a)] text-white",
      to: "/discover/moments",
    },
  ],
  [
    {
      key: "encounter",
      label: "摇一摇",
      description: "随机相遇",
      icon: Sparkles,
      iconClassName: "bg-[linear-gradient(135deg,#ffb45f,#ff7b54)] text-white",
      to: "/discover/encounter",
    },
    {
      key: "scene",
      label: "场景相遇",
      description: "地点触发",
      icon: Compass,
      iconClassName: "bg-[linear-gradient(135deg,#54b8ff,#2f7cff)] text-white",
      to: "/discover/scene",
    },
  ],
  [
    {
      key: "feed",
      label: "广场动态",
      description: "公共发现",
      icon: Newspaper,
      iconClassName: "bg-[linear-gradient(135deg,#9097ff,#5963ff)] text-white",
      to: "/discover/feed",
    },
  ],
];

export function DiscoverPage() {
  const isDesktopLayout = useDesktopLayout();
  const queryClient = useQueryClient();
  const ownerId = useWorldOwnerStore((state) => state.id);
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [feedText, setFeedText] = useState("");
  const [shakeMessage, setShakeMessage] = useState("");
  const [sceneMessage, setSceneMessage] = useState("");
  const [feedCommentDrafts, setFeedCommentDrafts] = useState<Record<string, string>>({});
  const [successNotice, setSuccessNotice] = useState("");

  const feedQuery = useQuery({
    queryKey: ["app-feed", baseUrl],
    queryFn: () => getFeed(1, 20, baseUrl),
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
    onSuccess: async (result) => {
      if (!result) {
        setShakeMessage("附近暂时没有新的相遇。");
        return;
      }

      setSuccessNotice("新的好友申请已发送。");
      setShakeMessage(`${result.character.name} 向你发来了一句招呼：${result.greeting}`);
      await queryClient.invalidateQueries({ queryKey: ["app-friend-requests", baseUrl] });
    },
  });

  const sceneMutation = useMutation({
    mutationFn: async (scene: string) => {
      const request = await triggerSceneFriendRequest(
        {
          scene,
        },
        baseUrl,
      );
      return { request, scene };
    },
    onSuccess: async ({ request, scene }) => {
      const sceneLabel = scenes.find((item) => item.id === scene)?.label ?? scene;
      if (!request) {
        setSceneMessage(`${sceneLabel} 里暂时没有新的相遇。`);
        return;
      }

      setSuccessNotice("场景相遇已写入好友申请列表。");
      setSceneMessage(`${request.characterName} 在${sceneLabel}注意到了你：${request.greeting ?? "对你产生了兴趣。"}`);
      await queryClient.invalidateQueries({ queryKey: ["app-friend-requests", baseUrl] });
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
          text: (feedCommentDrafts[postId] ?? "").trim(),
        },
        baseUrl,
      ),
    onSuccess: async (_, postId) => {
      setFeedCommentDrafts((current) => ({ ...current, [postId]: "" }));
      setSuccessNotice("广场互动已更新。");
      await queryClient.invalidateQueries({ queryKey: ["app-feed", baseUrl] });
    },
  });

  const blockedCharacterIds = new Set((blockedQuery.data ?? []).map((item) => item.characterId));
  const visiblePosts = (feedQuery.data?.posts ?? []).filter(
    (post) => post.authorType !== "character" || !blockedCharacterIds.has(post.authorId),
  );
  const pendingLikePostId = likeFeedMutation.isPending ? likeFeedMutation.variables : null;
  const pendingCommentPostId = commentFeedMutation.isPending ? commentFeedMutation.variables : null;

  useEffect(() => {
    setFeedText("");
    setShakeMessage("");
    setSceneMessage("");
    setFeedCommentDrafts({});
    setSuccessNotice("");
  }, [baseUrl]);

  useEffect(() => {
    if (!successNotice) {
      return;
    }

    const timer = window.setTimeout(() => setSuccessNotice(""), 2400);
    return () => window.clearTimeout(timer);
  }, [successNotice]);

  if (isDesktopLayout) {
    return (
      <AppPage className="space-y-5 px-6 py-6">
        <AppHeader
          eyebrow="发现"
          title="把相遇和广场拆开来处理"
          description="桌面端保留摇一摇、场景相遇和广场动态三个面板，移动端仍然从发现入口进入二级页。"
        />

        <div className="grid gap-5 xl:grid-cols-[0.92fr_1.08fr]">
          <div className="space-y-5">
            <AppSection className="space-y-4 bg-[color:var(--brand-soft)]">
              <div>
                <div className="text-sm font-medium text-[color:var(--text-primary)]">随机相遇</div>
                <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">
                  把摇一摇和场景相遇集中在一起，便于连续触发新的社交线索。
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button onClick={() => shakeMutation.mutate()} disabled={shakeMutation.isPending} variant="primary">
                  {shakeMutation.isPending ? "正在寻找..." : "摇一摇"}
                </Button>
                <div className="text-xs text-[color:var(--text-muted)]">相遇结果会自动写入好友申请列表。</div>
              </div>

              {shakeMessage ? <InlineNotice tone="success">{shakeMessage}</InlineNotice> : null}
              {shakeMutation.isError && shakeMutation.error instanceof Error ? (
                <ErrorBlock message={shakeMutation.error.message} />
              ) : null}

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

              {sceneMessage ? <InlineNotice tone="info">{sceneMessage}</InlineNotice> : null}
              {sceneMutation.isError && sceneMutation.error instanceof Error ? (
                <ErrorBlock message={sceneMutation.error.message} />
              ) : null}
            </AppSection>

            <AppSection className="space-y-4">
              <div>
                <div className="text-sm font-medium text-[color:var(--text-primary)]">发布广场动态</div>
                <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">
                  在桌面端直接写一条动态，右侧立刻看到广场回流。
                </div>
              </div>

              <TextAreaField
                value={feedText}
                onChange={(event) => setFeedText(event.target.value)}
                placeholder="分享你此刻想说的话..."
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
              <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">
                过滤掉已屏蔽角色后，只保留当前世界真正可见的公共内容。
              </div>
            </div>

            {successNotice ? <InlineNotice tone="success">{successNotice}</InlineNotice> : null}
            {feedQuery.isLoading ? <LoadingBlock label="正在读取广场动态..." /> : null}
            {feedQuery.isError && feedQuery.error instanceof Error ? <ErrorBlock message={feedQuery.error.message} /> : null}

            {visiblePosts.map((post) => (
              <SocialPostCard
                key={post.id}
                authorName={post.authorName}
                authorAvatar={post.authorAvatar}
                meta={post.aiReacted ? "AI 已参与互动" : "等待 AI 参与"}
                body={post.text}
                summary={`${post.likeCount} 赞 · ${post.commentCount} 评论`}
                actions={
                  <Button
                    disabled={likeFeedMutation.isPending}
                    onClick={() => likeFeedMutation.mutate(post.id)}
                    variant="secondary"
                    size="sm"
                  >
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

            {likeFeedMutation.isError && likeFeedMutation.error instanceof Error ? (
              <ErrorBlock message={likeFeedMutation.error.message} />
            ) : null}
            {commentFeedMutation.isError && commentFeedMutation.error instanceof Error ? (
              <ErrorBlock message={commentFeedMutation.error.message} />
            ) : null}

            {!feedQuery.isLoading && !feedQuery.isError && !visiblePosts.length ? (
              <EmptyState
                title="广场里还没有新动态"
                description="先发一条，或者去触发一次新的相遇，公共内容会慢慢长出来。"
              />
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
              return (
                <Link
                  key={item.key}
                  to={item.to}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
                    "bg-white hover:bg-[color:var(--surface-soft)]",
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
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </AppPage>
  );
}
