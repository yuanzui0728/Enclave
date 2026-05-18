import { useState } from "react";
import { msg } from "@lingui/macro";
import { Trans } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { translateRuntimeMessage } from "@yinjie/i18n";
import {
  Button,
  Card,
  ErrorBlock,
  LoadingBlock,
  StatusPill,
  TextAreaField,
  TextField,
} from "@yinjie/ui";
import { hasRole } from "../lib/auth-store";
import { useAuth } from "../lib/use-auth";
import {
  wikiApi,
  type WikiTalkPost,
  type WikiTalkThread,
} from "../lib/wiki-api";
import { formatDateTime } from "../lib/format";
import { useUsernameMap } from "../lib/use-username-map";
import { ReportButton } from "./report-button";

export function TalkPanel({ characterId }: { characterId: string }) {
  const t = translateRuntimeMessage;
  const { user } = useAuth();
  const qc = useQueryClient();
  const threadsQ = useQuery({
    queryKey: ["wiki", "talk", characterId, "threads"],
    queryFn: () => wikiApi.listThreads(characterId),
  });
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  // i18n-ignore-next-line: empty form state, not translatable copy.
  const [draft, setDraft] = useState({ title: "", body: "" });

  const newThreadMut = useMutation({
    mutationFn: () => wikiApi.createThread(characterId, draft.title, draft.body),
    onSuccess: (res) => {
      void qc.invalidateQueries({
        queryKey: ["wiki", "talk", characterId, "threads"],
      });
      setShowNew(false);
      // i18n-ignore-next-line: empty form state, not translatable copy.
      setDraft({ title: "", body: "" });
      setOpenThreadId(res.thread.id);
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="font-medium">
          <Trans>讨论页</Trans>
        </h2>
        {user && (
          <Button
            size="sm"
            variant="primary"
            className="ml-auto"
            onClick={() => setShowNew((v) => !v)}
          >
            {showNew ? t(msg`取消`) : t(msg`新建话题`)}
          </Button>
        )}
      </div>

      {showNew && user && (
        <Card className="p-3 space-y-2">
          <label className="block text-sm">
            <span className="block mb-1">
              <Trans>标题</Trans>
            </span>
            <TextField
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              maxLength={200}
            />
          </label>
          <label className="block text-sm">
            <span className="block mb-1">
              <Trans>正文</Trans>
            </span>
            <TextAreaField
              rows={4}
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            />
          </label>
          <Button
            variant="primary"
            className="w-full sm:w-auto"
            disabled={
              !draft.title.trim() || !draft.body.trim() || newThreadMut.isPending
            }
            onClick={() => newThreadMut.mutate()}
          >
            {newThreadMut.isPending ? t(msg`发布中...`) : t(msg`发布`)}
          </Button>
          {newThreadMut.isError && (
            <ErrorBlock message={(newThreadMut.error as Error).message} />
          )}
        </Card>
      )}

      {threadsQ.isLoading && <LoadingBlock />}
      {threadsQ.isError && (
        <ErrorBlock message={(threadsQ.error as Error).message} />
      )}
      {threadsQ.data?.length === 0 && (
        <Card className="p-4 text-sm text-[var(--text-muted)]">
          <Trans>还没有任何讨论。</Trans>
        </Card>
      )}
      <ul className="space-y-2">
        {threadsQ.data?.map((thread) => (
          <ThreadCard
            key={thread.id}
            thread={thread}
            isOpen={openThreadId === thread.id}
            onToggle={() =>
              setOpenThreadId(openThreadId === thread.id ? null : thread.id)
            }
          />
        ))}
      </ul>
    </div>
  );
}

function ThreadCard({
  thread,
  isOpen,
  onToggle,
}: {
  thread: WikiTalkThread;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <Card className="p-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 text-left"
      >
        <span className="break-all font-medium">{thread.title}</span>
        {thread.isLocked && (
          <StatusPill>
            <Trans>已锁定</Trans>
          </StatusPill>
        )}
        {thread.isResolved && (
          <StatusPill>
            <Trans>已解决</Trans>
          </StatusPill>
        )}
        <span className="ml-auto whitespace-nowrap text-xs text-[var(--text-muted)]">
          <Trans>
            {thread.postCount} 条 · 最近{" "}
            {thread.lastReplyAt
              ? formatDateTime(thread.lastReplyAt)
              : "—"}
          </Trans>
        </span>
      </button>
      {isOpen && <ThreadDetail threadId={thread.id} thread={thread} />}
    </Card>
  );
}

function ThreadDetail({
  threadId,
  thread,
}: {
  threadId: string;
  thread: WikiTalkThread;
}) {
  const t = translateRuntimeMessage;
  const { user } = useAuth();
  const qc = useQueryClient();
  const postsQ = useQuery({
    queryKey: ["wiki", "talk", "posts", threadId],
    queryFn: () => wikiApi.listPosts(threadId),
  });
  const [reply, setReply] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);

  const replyMut = useMutation({
    mutationFn: () => wikiApi.createPost(threadId, reply, replyTo),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ["wiki", "talk", "posts", threadId],
      });
      void qc.invalidateQueries({
        queryKey: ["wiki", "talk", thread.characterId, "threads"],
      });
      setReply("");
      setReplyTo(null);
    },
  });
  const deleteMut = useMutation({
    mutationFn: (postId: string) => wikiApi.deletePost(postId),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["wiki", "talk", "posts", threadId] }),
  });
  const flagsMut = useMutation({
    mutationFn: (flags: { isLocked?: boolean; isResolved?: boolean }) =>
      wikiApi.setThreadFlags(threadId, flags),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: ["wiki", "talk", thread.characterId, "threads"],
      }),
  });

  const isPatroller = hasRole(user, "patroller");
  const { resolve: resolveAuthor } = useUsernameMap(
    (postsQ.data ?? []).map((p) => p.authorId),
  );

  return (
    <div className="mt-3 space-y-2 border-t border-[var(--border-subtle)] pt-3">
      {isPatroller && (
        <div className="flex gap-2 text-xs">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => flagsMut.mutate({ isLocked: !thread.isLocked })}
          >
            {thread.isLocked ? t(msg`解锁`) : t(msg`锁定`)}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => flagsMut.mutate({ isResolved: !thread.isResolved })}
          >
            {thread.isResolved ? t(msg`标记未解决`) : t(msg`标记已解决`)}
          </Button>
        </div>
      )}
      {postsQ.isLoading && <LoadingBlock />}
      {postsQ.isError && (
        <ErrorBlock message={(postsQ.error as Error).message} />
      )}
      <PostTree
        posts={postsQ.data ?? []}
        resolveAuthor={resolveAuthor}
        onReply={(postId) => setReplyTo(postId)}
        onDelete={(postId) => {
          if (window.confirm(t(msg`确认删除这条回复？删除后会标记为「已删除」。`))) {
            deleteMut.mutate(postId);
          }
        }}
        canDelete={(post) =>
          (user?.id === post.authorId || isPatroller) && !post.deletedAt
        }
      />
      {user && !thread.isLocked && (
        <div className="space-y-2 pt-2">
          {replyTo && (
            <div className="text-xs text-[var(--text-muted)]">
              <Trans>回复楼中楼 · {replyTo.slice(0, 8)}…</Trans>{" "}
              <button
                type="button"
                className="underline"
                onClick={() => setReplyTo(null)}
              >
                <Trans>取消引用</Trans>
              </button>
            </div>
          )}
          <TextAreaField
            rows={3}
            placeholder={t(msg`写下你的回复`)}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
          />
          <Button
            size="sm"
            variant="primary"
            className="w-full sm:w-auto"
            disabled={!reply.trim() || replyMut.isPending}
            onClick={() => replyMut.mutate()}
          >
            {replyMut.isPending ? t(msg`回复中...`) : t(msg`回复`)}
          </Button>
          {replyMut.isError && (
            <ErrorBlock message={(replyMut.error as Error).message} />
          )}
        </div>
      )}
    </div>
  );
}

function PostTree({
  posts,
  resolveAuthor,
  onReply,
  onDelete,
  canDelete,
  parentId = null,
  depth = 0,
}: {
  posts: WikiTalkPost[];
  resolveAuthor: (id: string) => string;
  onReply: (id: string) => void;
  onDelete: (id: string) => void;
  canDelete: (post: WikiTalkPost) => boolean;
  parentId?: string | null;
  depth?: number;
}) {
  if (depth > 12) return null;
  const children = posts.filter((p) => (p.parentPostId ?? null) === parentId);
  if (children.length === 0) return null;
  // 移动端窄屏：每级缩进只给 8px（封顶 4 级 = 32px）。≥640px 桌面回 16px ×6。
  const isNarrow =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(max-width: 640px)").matches;
  const indentPx = isNarrow
    ? Math.min(depth, 4) * 8
    : Math.min(depth, 6) * 16;
  return (
    <ul className="space-y-2">
      {children.map((post) => (
        <li
          key={post.id}
          className="border-l-2 border-[var(--border-subtle)] pl-2 text-sm sm:pl-3"
          style={{ marginInlineStart: indentPx }}
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-muted)]">
            <strong className="text-[var(--text-primary)]">
              {resolveAuthor(post.authorId)}
            </strong>
            <span className="whitespace-nowrap">
              {formatDateTime(post.createdAt)}
            </span>
            {post.deletedAt && (
              <StatusPill>
                <Trans>已删除</Trans>
              </StatusPill>
            )}
            {!post.deletedAt && (
              <>
                <button
                  type="button"
                  className="ml-auto inline-flex min-h-[32px] items-center rounded-md px-2 py-1 underline hover:text-[var(--text-primary)]"
                  onClick={() => onReply(post.id)}
                >
                  <Trans>回复</Trans>
                </button>
                <ReportButton targetType="wiki_talk_post" targetId={post.id} />
                {canDelete(post) && (
                  <button
                    type="button"
                    className="inline-flex min-h-[32px] items-center rounded-md px-2 py-1 underline hover:text-[var(--state-danger-text)]"
                    onClick={() => onDelete(post.id)}
                  >
                    <Trans>删除</Trans>
                  </button>
                )}
              </>
            )}
          </div>
          <div className="mt-1 whitespace-pre-wrap break-words">{post.body}</div>
          <PostTree
            posts={posts}
            resolveAuthor={resolveAuthor}
            onReply={onReply}
            onDelete={onDelete}
            canDelete={canDelete}
            parentId={post.id}
            depth={depth + 1}
          />
        </li>
      ))}
    </ul>
  );
}
