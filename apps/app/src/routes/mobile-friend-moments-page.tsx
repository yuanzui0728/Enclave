import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  addMomentComment,
  getBlockedCharacters,
  getCharacter,
  getFriends,
  getMoments,
  toggleMomentLike,
  type Moment,
} from "@yinjie/contracts";
import {
  AppPage,
  Button,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  TextField,
  cn,
} from "@yinjie/ui";
import { ArrowLeft, Heart, MapPin, MessageCircle } from "lucide-react";
import { AvatarChip } from "../components/avatar-chip";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { getFriendDisplayName } from "../features/contacts/contact-utils";
import { formatTimestamp } from "../lib/format";
import { navigateBackOrFallback } from "../lib/history-back";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function MobileFriendMomentsPage() {
  const { characterId } = useParams({
    strict: false,
  }) as {
    characterId?: string;
  };
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const resolvedCharacterId = characterId ?? "";
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>(
    {},
  );
  const [notice, setNotice] = useState<{
    tone: "success" | "info";
    message: string;
  } | null>(null);

  const characterQuery = useQuery({
    queryKey: ["app-character", baseUrl, resolvedCharacterId],
    queryFn: () => getCharacter(resolvedCharacterId, baseUrl),
    enabled: Boolean(resolvedCharacterId),
  });
  const friendsQuery = useQuery({
    queryKey: ["app-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
  });
  const momentsQuery = useQuery({
    queryKey: ["app-moments", baseUrl],
    queryFn: () => getMoments(baseUrl),
  });
  const blockedQuery = useQuery({
    queryKey: ["app-moments-blocked-characters", baseUrl],
    queryFn: () => getBlockedCharacters(baseUrl),
    enabled: Boolean(resolvedCharacterId),
  });

  const likeMutation = useMutation({
    mutationFn: (momentId: string) => toggleMomentLike(momentId, baseUrl),
    onSuccess: async () => {
      setNotice({
        tone: "success",
        message: "朋友圈互动已更新。",
      });
      await queryClient.invalidateQueries({
        queryKey: ["app-moments", baseUrl],
      });
    },
  });
  const commentMutation = useMutation({
    mutationFn: (momentId: string) => {
      const text = commentDrafts[momentId]?.trim();
      if (!text) {
        throw new Error("请先输入评论内容。");
      }

      return addMomentComment(
        momentId,
        {
          text,
        },
        baseUrl,
      );
    },
    onSuccess: async (_, momentId) => {
      setCommentDrafts((current) => ({ ...current, [momentId]: "" }));
      setNotice({
        tone: "success",
        message: "朋友圈互动已更新。",
      });
      await queryClient.invalidateQueries({
        queryKey: ["app-moments", baseUrl],
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
  const isFriend = Boolean(friendItem?.friendship);
  const isBlocked = Boolean(
    (blockedQuery.data ?? []).some(
      (item) => item.characterId === resolvedCharacterId,
    ),
  );
  const displayName = friendItem
    ? getFriendDisplayName(friendItem)
    : character?.name || "好友朋友圈";
  const signature =
    character?.currentStatus?.trim() ||
    character?.bio?.trim() ||
    (isFriend ? "这个朋友还没有个性签名。" : "加为好友后可查看这位角色的朋友圈。");
  const blockedCharacterIds = useMemo(
    () => new Set((blockedQuery.data ?? []).map((item) => item.characterId)),
    [blockedQuery.data],
  );
  const friendMoments = useMemo(
    () =>
      (momentsQuery.data ?? [])
        .filter(
          (moment) =>
            (moment.authorType !== "character" ||
              !blockedCharacterIds.has(moment.authorId)) &&
            moment.authorId === resolvedCharacterId,
        )
        .sort(
          (left, right) =>
            new Date(right.postedAt).getTime() - new Date(left.postedAt).getTime(),
        ),
    [blockedCharacterIds, momentsQuery.data, resolvedCharacterId],
  );
  const latestMoment = friendMoments[0] ?? null;
  const relationshipLoading = friendsQuery.isLoading || blockedQuery.isLoading;
  const timelineLoading = momentsQuery.isLoading || relationshipLoading;
  const pendingLikeMomentId = likeMutation.isPending
    ? likeMutation.variables
    : null;
  const pendingCommentMomentId = commentMutation.isPending
    ? commentMutation.variables
    : null;

  const errors: string[] = [];
  if (characterQuery.isError && characterQuery.error instanceof Error) {
    errors.push(characterQuery.error.message);
  }
  if (friendsQuery.isError && friendsQuery.error instanceof Error) {
    errors.push(friendsQuery.error.message);
  }
  if (momentsQuery.isError && momentsQuery.error instanceof Error) {
    errors.push(momentsQuery.error.message);
  }
  if (blockedQuery.isError && blockedQuery.error instanceof Error) {
    errors.push(blockedQuery.error.message);
  }

  useEffect(() => {
    setCommentDrafts({});
    setNotice(null);
  }, [baseUrl, resolvedCharacterId]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => setNotice(null), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function handleBack() {
    navigateBackOrFallback(() => {
      if (resolvedCharacterId) {
        void navigate({
          to: "/character/$characterId",
          params: { characterId: resolvedCharacterId },
        });
        return;
      }

      void navigate({ to: "/discover/moments" });
    });
  }

  if (!resolvedCharacterId) {
    return (
      <AppPage className="space-y-0 px-0 py-0">
        <TabPageTopBar
          title="朋友圈"
          subtitle="好友"
          titleAlign="center"
          className="mx-0 mb-0 mt-0 border-b border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.94)] px-4 pb-1.5 pt-1.5 text-[color:var(--text-primary)] shadow-none"
          leftActions={
            <Button
              onClick={handleBack}
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full border-0 bg-transparent text-[color:var(--text-primary)] active:bg-black/[0.05]"
            >
              <ArrowLeft size={17} />
            </Button>
          }
        />
        <div className="px-4 py-6">
          <ErrorBlock message="好友资料不存在，暂时无法打开朋友圈。" />
        </div>
      </AppPage>
    );
  }

  return (
    <AppPage className="space-y-0 bg-[#f2f2f2] px-0 pb-0 pt-0">
      <TabPageTopBar
        title={displayName}
        subtitle="朋友圈"
        titleAlign="center"
        className="mx-0 mb-0 mt-0 border-b border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.94)] px-4 pb-1.5 pt-1.5 text-[color:var(--text-primary)] shadow-none"
        leftActions={
          <Button
            onClick={handleBack}
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full border-0 bg-transparent text-[color:var(--text-primary)] active:bg-black/[0.05]"
          >
            <ArrowLeft size={17} />
          </Button>
        }
      />

      <div className="space-y-3 px-3 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-3">
        {notice ? (
          <InlineNotice
            tone={notice.tone}
            className="rounded-[14px] border border-[color:var(--border-faint)] bg-white px-3 py-2 text-[12px] shadow-none"
          >
            {notice.message}
          </InlineNotice>
        ) : null}

        <section className="overflow-hidden rounded-[26px] border border-[rgba(0,0,0,0.05)] bg-white shadow-[0_12px_40px_rgba(15,23,42,0.06)]">
          <div className="relative h-44 overflow-hidden bg-[linear-gradient(135deg,#778f7c_0%,#a8b9a1_46%,#d6c8b1_100%)]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.28),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(20,83,45,0.18),transparent_42%)]" />
            <div className="absolute bottom-6 right-[5.9rem] left-4 text-right">
              <div className="truncate text-[22px] font-semibold tracking-[0.01em] text-white [text-shadow:0_2px_12px_rgba(0,0,0,0.18)]">
                {displayName}
              </div>
              <div className="mt-1 line-clamp-2 text-[12px] leading-5 text-white/85 [text-shadow:0_2px_12px_rgba(0,0,0,0.16)]">
                {signature}
              </div>
            </div>
            <div className="absolute bottom-4 right-4">
              <AvatarChip name={displayName} src={character?.avatar} size="xl" />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-3.5 text-[12px] text-[color:var(--text-secondary)]">
            <div className="min-w-0">
              <div className="font-medium text-[color:var(--text-primary)]">
                {relationshipLoading
                  ? "正在确认可见范围..."
                  : isFriend
                    ? `${friendMoments.length} 条朋友圈`
                    : "仅好友可见"}
              </div>
              <div className="mt-1 truncate text-[11px] text-[color:var(--text-muted)]">
                {relationshipLoading
                  ? "稍等一下，正在同步这位好友的资料权限。"
                  : latestMoment
                  ? `最近更新 ${formatTimestamp(latestMoment.postedAt)}`
                  : isFriend
                    ? "这位好友最近还没有发布新的朋友圈。"
                    : "先加为好友，再像微信手机版那样查看 TA 的朋友圈。"}
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="h-8 rounded-full border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] px-3 text-[11px]"
              onClick={() =>
                void navigate({
                  to: "/character/$characterId",
                  params: { characterId: resolvedCharacterId },
                })
              }
            >
              查看资料
            </Button>
          </div>
        </section>

        {!character && (characterQuery.isLoading || friendsQuery.isLoading) ? (
          <div className="rounded-[24px] border border-[color:var(--border-faint)] bg-white px-4 py-8">
            <LoadingBlock
              label="正在读取好友朋友圈..."
              className="border-0 bg-transparent py-2 shadow-none"
            />
          </div>
        ) : null}

        {!character &&
        !characterQuery.isLoading &&
        !friendsQuery.isLoading ? (
          <section className="rounded-[24px] border border-[color:var(--border-faint)] bg-white px-4 py-5">
            <div className="text-[18px] font-semibold text-[color:var(--text-primary)]">
              无法打开这位好友的朋友圈
            </div>
            <div className="mt-2 text-[13px] leading-6 text-[color:var(--text-secondary)]">
              角色资料不存在，或者当前资料还没有同步完成。
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
                返回上一页
              </Button>
              <Button
                variant="primary"
                onClick={() => void navigate({ to: "/discover/moments" })}
              >
                去朋友圈主页
              </Button>
            </div>
          </section>
        ) : null}

        {character ? (
          <section className="space-y-3">
            <div className="px-1">
              <div className="text-[11px] text-[color:var(--text-muted)]">最近内容</div>
              <div className="mt-1 text-[12px] leading-5 text-[color:var(--text-secondary)]">
                这里只看 {displayName} 的朋友圈，不再复用发现页里的大流筛选。
              </div>
            </div>

            {timelineLoading ? (
              <MobileFriendMomentsStateCard
                badge="读取中"
                title="正在刷新这位好友的朋友圈"
                description="稍等一下，正在同步 TA 最近发布的动态。"
              />
            ) : null}

            {!timelineLoading && momentsQuery.isError ? (
              <MobileFriendMomentsStateCard
                badge="读取失败"
                title="朋友圈暂时不可用"
                description={
                  momentsQuery.error instanceof Error
                    ? momentsQuery.error.message
                    : "读取这位好友的朋友圈时出错了。"
                }
                tone="danger"
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 rounded-full border-[color:var(--border-subtle)] bg-white px-3.5 text-[11px]"
                    onClick={() => {
                      void momentsQuery.refetch();
                      void blockedQuery.refetch();
                    }}
                  >
                    重新加载
                  </Button>
                }
              />
            ) : null}

            {!timelineLoading && !momentsQuery.isError && !isFriend ? (
              <MobileFriendMomentsStateCard
                badge="权限"
                title="加为好友后可查看"
                description="这位角色的朋友圈仅对好友开放，先回到资料页完成加好友。"
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 rounded-full border-[color:var(--border-subtle)] bg-white px-3.5 text-[11px]"
                    onClick={() =>
                      void navigate({
                        to: "/character/$characterId",
                        params: { characterId: resolvedCharacterId },
                      })
                    }
                  >
                    回到资料页
                  </Button>
                }
              />
            ) : null}

            {!timelineLoading &&
            !momentsQuery.isError &&
            isFriend &&
            isBlocked ? (
              <MobileFriendMomentsStateCard
                badge="已隐藏"
                title="这位好友的朋友圈当前不可见"
                description="你已经将这位好友加入黑名单，相关朋友圈内容会先隐藏。"
              />
            ) : null}

            {!timelineLoading &&
            !momentsQuery.isError &&
            isFriend &&
            !isBlocked &&
            !friendMoments.length ? (
              <MobileFriendMomentsStateCard
                badge="好友朋友圈"
                title={`${displayName} 还没有发表朋友圈`}
                description="先把这页留着，等 TA 下次更新时再回来看看。"
              />
            ) : null}

            {!timelineLoading &&
            !momentsQuery.isError &&
            isFriend &&
            !isBlocked &&
            friendMoments.length ? (
              <div className="space-y-3">
                {friendMoments.map((moment) => (
                  <MobileFriendMomentCard
                    key={moment.id}
                    moment={moment}
                    commentDraft={commentDrafts[moment.id] ?? ""}
                    commentPending={pendingCommentMomentId === moment.id}
                    likePending={pendingLikeMomentId === moment.id}
                    onCommentChange={(value) =>
                      setCommentDrafts((current) => ({
                        ...current,
                        [moment.id]: value,
                      }))
                    }
                    onCommentSubmit={() => commentMutation.mutate(moment.id)}
                    onLike={() => likeMutation.mutate(moment.id)}
                  />
                ))}
              </div>
            ) : null}

            {likeMutation.isError && likeMutation.error instanceof Error ? (
              <InlineNotice
                tone="info"
                className="rounded-[14px] border border-[color:var(--border-faint)] bg-white px-3 py-2 text-[12px] shadow-none"
              >
                {likeMutation.error.message}
              </InlineNotice>
            ) : null}

            {commentMutation.isError && commentMutation.error instanceof Error ? (
              <InlineNotice
                tone="info"
                className="rounded-[14px] border border-[color:var(--border-faint)] bg-white px-3 py-2 text-[12px] shadow-none"
              >
                {commentMutation.error.message}
              </InlineNotice>
            ) : null}
          </section>
        ) : null}
      </div>
    </AppPage>
  );
}

function MobileFriendMomentCard({
  moment,
  commentDraft,
  commentPending,
  likePending,
  onCommentChange,
  onCommentSubmit,
  onLike,
}: {
  moment: Moment;
  commentDraft: string;
  commentPending: boolean;
  likePending: boolean;
  onCommentChange: (value: string) => void;
  onCommentSubmit: () => void;
  onLike: () => void;
}) {
  const dateLabel = formatTimelineDate(moment.postedAt);

  return (
    <article className="flex items-start gap-3">
      <div className="w-10 shrink-0 pt-1 text-center">
        <div className="text-[22px] font-semibold leading-none text-[color:var(--text-primary)]">
          {dateLabel.day}
        </div>
        <div className="mt-1 text-[10px] tracking-[0.08em] text-[color:var(--text-muted)]">
          {dateLabel.month}
        </div>
      </div>
      <div className="min-w-0 flex-1 overflow-hidden rounded-[22px] border border-[rgba(0,0,0,0.05)] bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
        <div className="text-[15px] leading-7 text-[color:var(--text-primary)]">
          {moment.text}
        </div>
        {moment.location ? (
          <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-[rgba(15,23,42,0.04)] px-2.5 py-1 text-[11px] text-[color:var(--text-secondary)]">
            <MapPin size={12} />
            <span>{moment.location}</span>
          </div>
        ) : null}
        <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-[color:var(--text-muted)]">
          <span>{formatTimestamp(moment.postedAt)}</span>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="h-8 rounded-full border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] px-3 text-[11px]"
              onClick={onLike}
              disabled={likePending}
            >
              <Heart size={14} className="mr-1" />
              {likePending ? "处理中..." : "赞"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="h-8 rounded-full border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] px-3 text-[11px]"
              onClick={onCommentSubmit}
              disabled={!commentDraft.trim() || commentPending}
            >
              <MessageCircle size={14} className="mr-1" />
              {commentPending ? "发送中..." : "评论"}
            </Button>
          </div>
        </div>
        {moment.likes.length > 0 || moment.comments.length > 0 ? (
          <div className="mt-3 space-y-2 rounded-[18px] bg-[rgba(15,23,42,0.035)] px-3 py-3">
            {moment.likes.length > 0 ? (
              <div className="text-[12px] leading-6 text-[color:var(--text-secondary)]">
                <span className="font-medium text-[color:var(--text-primary)]">
                  赞
                </span>
                {` · ${moment.likes.map((item) => item.authorName).join("，")}`}
              </div>
            ) : null}
            {moment.comments.map((comment) => (
              <div
                key={comment.id}
                className="text-[12px] leading-6 text-[color:var(--text-secondary)]"
              >
                <span className="font-medium text-[color:var(--text-primary)]">
                  {comment.authorName}
                </span>
                {`：${comment.text}`}
              </div>
            ))}
          </div>
        ) : null}
        <div className="mt-3 flex items-center gap-2">
          <TextField
            value={commentDraft}
            onChange={(event) => onCommentChange(event.target.value)}
            placeholder="说点什么..."
            className="min-w-0 flex-1 rounded-full py-1.5 text-[12px]"
          />
        </div>
      </div>
    </article>
  );
}

function MobileFriendMomentsStateCard({
  badge,
  title,
  description,
  action,
  tone = "default",
}: {
  badge: string;
  title: string;
  description: string;
  action?: ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <section
      className={cn(
        "rounded-[24px] border bg-white px-4 py-5 shadow-[0_8px_24px_rgba(15,23,42,0.05)]",
        tone === "danger"
          ? "border-[rgba(220,38,38,0.14)]"
          : "border-[color:var(--border-faint)]",
      )}
    >
      <div
        className={cn(
          "inline-flex rounded-full px-2.5 py-1 text-[10px] font-medium",
          tone === "danger"
            ? "bg-[rgba(220,38,38,0.08)] text-[#b42318]"
            : "bg-[rgba(15,23,42,0.06)] text-[color:var(--text-secondary)]",
        )}
      >
        {badge}
      </div>
      <div className="mt-3 text-[17px] font-semibold text-[color:var(--text-primary)]">
        {title}
      </div>
      <div className="mt-2 text-[13px] leading-6 text-[color:var(--text-secondary)]">
        {description}
      </div>
      {action ? <div className="mt-4">{action}</div> : null}
    </section>
  );
}

function formatTimelineDate(value: string) {
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return { month: "--", day: "--" };
  }

  return {
    month: `${parsedDate.getMonth() + 1}月`,
    day: `${parsedDate.getDate()}`.padStart(2, "0"),
  };
}
