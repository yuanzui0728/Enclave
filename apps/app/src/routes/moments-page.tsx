import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  type Moment,
  addMomentComment,
  createUserMoment,
  getBlockedCharacters,
  getMoments,
  toggleMomentLike,
} from "@yinjie/contracts";
import { ChevronLeft, Pencil } from "lucide-react";
import {
  Button,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  TextAreaField,
} from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { EmptyState } from "../components/empty-state";
import { MomentPostCard } from "../components/moment-post-card";
import { DesktopMomentsWorkspace } from "../features/desktop/moments/desktop-moments-workspace";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

export function MomentsPage() {
  const isDesktopLayout = useDesktopLayout();
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const ownerId = useWorldOwnerStore((state) => state.id);
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const ownerUsername = useWorldOwnerStore((state) => state.username);
  const ownerAvatar = useWorldOwnerStore((state) => state.avatar);
  const [text, setText] = useState("");
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>(
    {},
  );
  const [successNotice, setSuccessNotice] = useState("");
  const [showCompose, setShowCompose] = useState(false);

  const momentsQuery = useQuery({
    queryKey: ["app-moments", baseUrl],
    queryFn: () => getMoments(baseUrl),
  });
  const blockedQuery = useQuery({
    queryKey: ["app-moments-blocked-characters", baseUrl],
    queryFn: () => getBlockedCharacters(baseUrl),
    enabled: Boolean(ownerId),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createUserMoment(
        {
          text: text.trim(),
        },
        baseUrl,
      ),
    onSuccess: async () => {
      setText("");
      setShowCompose(false);
      setSuccessNotice("朋友圈已发布。");
      await momentsQuery.refetch();
    },
  });

  const likeMutation = useMutation({
    mutationFn: (momentId: string) => toggleMomentLike(momentId, baseUrl),
    onSuccess: async () => {
      setSuccessNotice("朋友圈互动已更新。");
      await momentsQuery.refetch();
    },
  });

  const commentMutation = useMutation({
    mutationFn: (momentId: string) =>
      addMomentComment(
        momentId,
        {
          text: commentDrafts[momentId].trim(),
        },
        baseUrl,
      ),
    onSuccess: async (_, momentId) => {
      setCommentDrafts((current) => ({ ...current, [momentId]: "" }));
      setSuccessNotice("朋友圈互动已更新。");
      await momentsQuery.refetch();
    },
  });

  const pendingLikeMomentId = likeMutation.isPending
    ? likeMutation.variables
    : null;
  const pendingCommentMomentId = commentMutation.isPending
    ? commentMutation.variables
    : null;
  const blockedCharacterIds = new Set(
    (blockedQuery.data ?? []).map((item) => item.characterId),
  );
  const visibleMoments: Moment[] = (momentsQuery.data ?? []).filter(
    (moment) =>
      moment.authorType !== "character" ||
      !blockedCharacterIds.has(moment.authorId),
  );
  const isDiscoverSubPage = pathname === "/discover/moments";
  const dataErrors = [
    momentsQuery.isError && momentsQuery.error instanceof Error
      ? momentsQuery.error.message
      : null,
    blockedQuery.isError && blockedQuery.error instanceof Error
      ? blockedQuery.error.message
      : null,
  ].filter((message): message is string => Boolean(message));
  const createErrorMessage =
    createMutation.isError && createMutation.error instanceof Error
      ? createMutation.error.message
      : null;
  const likeErrorMessage =
    likeMutation.isError && likeMutation.error instanceof Error
      ? likeMutation.error.message
      : null;
  const commentErrorMessage =
    commentMutation.isError && commentMutation.error instanceof Error
      ? commentMutation.error.message
      : null;

  useEffect(() => {
    setText("");
    setCommentDrafts({});
    setSuccessNotice("");
    setShowCompose(false);
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
      <DesktopMomentsWorkspace
        commentDrafts={commentDrafts}
        commentErrorMessage={commentErrorMessage}
        commentPendingMomentId={pendingCommentMomentId}
        composeErrorMessage={createErrorMessage}
        createPending={createMutation.isPending}
        errors={dataErrors}
        isLoading={momentsQuery.isLoading}
        likeErrorMessage={likeErrorMessage}
        likePendingMomentId={pendingLikeMomentId}
        moments={visibleMoments}
        ownerAvatar={ownerAvatar}
        ownerId={ownerId}
        ownerUsername={ownerUsername}
        setShowCompose={setShowCompose}
        showCompose={showCompose}
        successNotice={successNotice}
        text={text}
        onCommentChange={(momentId, value) =>
          setCommentDrafts((current) => ({
            ...current,
            [momentId]: value,
          }))
        }
        onCommentSubmit={(momentId) => commentMutation.mutate(momentId)}
        onCreate={() => createMutation.mutate()}
        onLike={(momentId) => likeMutation.mutate(momentId)}
        onRefresh={() => {
          void momentsQuery.refetch();
          void blockedQuery.refetch();
        }}
        onTextChange={setText}
      />
    );
  }

  return (
    <MobileMomentsPage
      commentDrafts={commentDrafts}
      commentErrorMessage={commentErrorMessage}
      commentPendingMomentId={pendingCommentMomentId}
      createErrorMessage={createErrorMessage}
      createPending={createMutation.isPending}
      dataErrors={dataErrors}
      isDiscoverSubPage={isDiscoverSubPage}
      isLoading={momentsQuery.isLoading}
      likeErrorMessage={likeErrorMessage}
      likePendingMomentId={pendingLikeMomentId}
      navigateBack={() => navigate({ to: "/tabs/discover" })}
      ownerAvatar={ownerAvatar}
      ownerUsername={ownerUsername}
      showCompose={showCompose}
      successNotice={successNotice}
      text={text}
      visibleMoments={visibleMoments}
      onCommentChange={(momentId, value) =>
        setCommentDrafts((current) => ({ ...current, [momentId]: value }))
      }
      onCommentSubmit={(momentId) => commentMutation.mutate(momentId)}
      onCreate={() => createMutation.mutate()}
      onLike={(momentId) => likeMutation.mutate(momentId)}
      onShowComposeChange={setShowCompose}
      onTextChange={setText}
    />
  );
}

type MobileMomentsPageProps = {
  commentDrafts: Record<string, string>;
  commentErrorMessage: string | null;
  commentPendingMomentId: string | null;
  createErrorMessage: string | null;
  createPending: boolean;
  dataErrors: string[];
  isDiscoverSubPage: boolean;
  isLoading: boolean;
  likeErrorMessage: string | null;
  likePendingMomentId: string | null;
  ownerAvatar?: string | null;
  ownerUsername?: string | null;
  showCompose: boolean;
  successNotice: string;
  text: string;
  visibleMoments: Moment[];
  navigateBack: () => void;
  onCommentChange: (momentId: string, value: string) => void;
  onCommentSubmit: (momentId: string) => void;
  onCreate: () => void;
  onLike: (momentId: string) => void;
  onShowComposeChange: (nextValue: boolean) => void;
  onTextChange: (value: string) => void;
};

function MobileMomentsPage({
  commentDrafts,
  commentErrorMessage,
  commentPendingMomentId,
  createErrorMessage,
  createPending,
  dataErrors,
  isDiscoverSubPage,
  isLoading,
  likeErrorMessage,
  likePendingMomentId,
  navigateBack,
  ownerAvatar,
  ownerUsername,
  showCompose,
  successNotice,
  text,
  visibleMoments,
  onCommentChange,
  onCommentSubmit,
  onCreate,
  onLike,
  onShowComposeChange,
  onTextChange,
}: MobileMomentsPageProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-[#f7f7f7]">
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-[rgba(0,0,0,0.08)] bg-white/95 px-4 py-3 backdrop-blur-sm">
        {isDiscoverSubPage ? (
          <button
            type="button"
            onClick={navigateBack}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--text-primary)] transition-colors hover:bg-[rgba(0,0,0,0.05)]"
          >
            <ChevronLeft size={22} />
          </button>
        ) : (
          <div className="w-9" />
        )}
        <span className="text-[17px] font-semibold text-[color:var(--text-primary)]">
          朋友圈
        </span>
        <button
          type="button"
          onClick={() => onShowComposeChange(true)}
          className="flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--text-primary)] transition-colors hover:bg-[rgba(0,0,0,0.05)]"
        >
          <Pencil size={20} />
        </button>
      </div>

      <div className="relative h-[190px] overflow-hidden bg-[linear-gradient(160deg,rgba(251,191,36,0.92),rgba(249,115,22,0.88),rgba(16,185,129,0.70))]">
        <div className="absolute inset-0 bg-[rgba(0,0,0,0.12)]" />
        <div className="absolute bottom-4 right-4 flex flex-col items-end gap-2">
          <span className="text-[13px] font-medium text-white drop-shadow-sm">
            {ownerUsername ?? "我"}
          </span>
          <AvatarChip
            name={ownerUsername}
            src={ownerAvatar || null}
            size="lg"
          />
        </div>
      </div>

      <div className="mt-2 bg-white">
        {successNotice ? (
          <div className="px-4 pt-3">
            <InlineNotice tone="success">{successNotice}</InlineNotice>
          </div>
        ) : null}

        {dataErrors.length > 0 ? (
          <div className="space-y-2 px-4 py-4">
            {dataErrors.map((message, index) => (
              <ErrorBlock key={`${message}-${index}`} message={message} />
            ))}
          </div>
        ) : null}

        {isLoading ? (
          <div className="py-8">
            <LoadingBlock label="正在读取朋友圈..." />
          </div>
        ) : null}

        {likeErrorMessage ? (
          <div className="px-4 py-2">
            <ErrorBlock message={likeErrorMessage} />
          </div>
        ) : null}

        {commentErrorMessage ? (
          <div className="px-4 py-2">
            <ErrorBlock message={commentErrorMessage} />
          </div>
        ) : null}

        {visibleMoments.map((moment) => (
          <MomentPostCard
            key={moment.id}
            authorName={moment.authorName}
            authorAvatar={moment.authorAvatar}
            text={moment.text}
            location={moment.location}
            postedAt={moment.postedAt}
            likes={moment.likes}
            comments={moment.comments}
            onLike={() => onLike(moment.id)}
            likeLoading={likePendingMomentId === moment.id}
            commentDraft={commentDrafts[moment.id] ?? ""}
            onCommentChange={(value) => onCommentChange(moment.id, value)}
            onCommentSubmit={() => onCommentSubmit(moment.id)}
            commentLoading={commentPendingMomentId === moment.id}
          />
        ))}

        {!isLoading && !dataErrors.length && !visibleMoments.length ? (
          <div className="px-4 py-8">
            <EmptyState
              title="朋友圈还很安静"
              description="你先发一条，或者等世界里的其他人先开口。"
            />
          </div>
        ) : null}
      </div>

      {showCompose ? (
        <div
          className="fixed inset-0 z-50 bg-[rgba(0,0,0,0.45)]"
          onClick={() => onShowComposeChange(false)}
        >
          <div
            className="absolute bottom-0 left-0 right-0 rounded-t-[20px] bg-white px-5 pb-10 pt-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => onShowComposeChange(false)}
                className="text-[15px] text-[color:var(--text-muted)]"
              >
                取消
              </button>
              <span className="text-[16px] font-semibold text-[color:var(--text-primary)]">
                发朋友圈
              </span>
              <Button
                disabled={!text.trim() || createPending}
                onClick={onCreate}
                variant="primary"
                size="sm"
              >
                {createPending ? "发布中..." : "发布"}
              </Button>
            </div>
            <TextAreaField
              value={text}
              onChange={(event) => onTextChange(event.target.value)}
              placeholder="这一刻的想法..."
              className="min-h-[120px] resize-none"
              autoFocus
            />
            {createErrorMessage ? (
              <div className="mt-3">
                <ErrorBlock message={createErrorMessage} />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
