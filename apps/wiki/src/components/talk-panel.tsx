import { useEffect, useState } from "react";
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
  // aria-expanded 单独挂在控件上 SR 只能知道 "expanded / collapsed"，但不知道
  // 展开的是哪个面板。配套 aria-controls 指向具体 panel id，SR 在念按钮时能补
  // 一句 "controls thread-xxx-panel"，盲用用户可以按 SR 的快捷键直接跳到展开
  // 内容。原写法漏配，导致 NVDA + ChromeVox 在长列表里听不出按钮和它影响的
  // 内容的从属关系。
  const panelId = `wiki-talk-thread-panel-${thread.id}`;
  return (
    <Card className="p-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={panelId}
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
      {isOpen && (
        <div id={panelId}>
          <ThreadDetail threadId={thread.id} thread={thread} />
        </div>
      )}
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
  const isNarrow = useIsNarrowViewport();

  return (
    <div className="mt-3 space-y-2 border-t border-[var(--border-subtle)] pt-3">
      {isPatroller && (
        <div className="flex gap-2 text-xs">
          {/* 原写法两个 flagsMut 按钮没有 disabled，patroller 点"锁定"后回包
              还没回来 thread.isLocked 仍是 false，再点一下就会发第二个 mutation
              （并且和"标记已解决"也能跨调，两个 mutation 互相覆盖 thread row）。
              加 isPending 守门 + 错误兜底 InlineNotice，避免误操作和静默失败。 */}
          <Button
            size="sm"
            variant="ghost"
            disabled={flagsMut.isPending}
            onClick={() => flagsMut.mutate({ isLocked: !thread.isLocked })}
          >
            {thread.isLocked ? t(msg`解锁`) : t(msg`锁定`)}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={flagsMut.isPending}
            onClick={() => flagsMut.mutate({ isResolved: !thread.isResolved })}
          >
            {thread.isResolved ? t(msg`标记未解决`) : t(msg`标记已解决`)}
          </Button>
        </div>
      )}
      {flagsMut.isError && (
        <ErrorBlock message={(flagsMut.error as Error).message} />
      )}
      {deleteMut.isError && (
        <ErrorBlock message={(deleteMut.error as Error).message} />
      )}
      {postsQ.isLoading && <LoadingBlock />}
      {postsQ.isError && (
        <ErrorBlock message={(postsQ.error as Error).message} />
      )}
      <PostTree
        posts={postsQ.data ?? []}
        resolveAuthor={resolveAuthor}
        isNarrow={isNarrow}
        onReply={(postId) => setReplyTo(postId)}
        onDelete={(postId) => {
          // deleteMut.isPending 时 onDelete 不再触发新一次 confirm + mutate ——
          // 多条回复在 200ms 内连点会并发删除，每条都触发 invalidate + refetch
          // 三遍。带个简单 guard。
          if (deleteMut.isPending) return;
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

function useIsNarrowViewport(): boolean {
  // 在 PostTree 内部 inline 算 isNarrow 有两个问题：
  // 1) 递归每层都重新 evaluate matchMedia，50 层楼中楼 = 50 次 MQL 构造，废 GC。
  // 2) 窄→宽窗口拖动时 indent 不更新，要等下一次状态变化才重新算 → 用户体感
  //    "缩进卡住"。把 isNarrow 提到一个 hook 里，addListener 订阅 change 事件，
  //    递归的 PostTree 通过 prop 共享同一份值，resize 时立刻刷新 indent。
  const [narrow, setNarrow] = useState(() => {
    if (typeof window === "undefined") return false;
    if (typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(max-width: 640px)").matches;
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia("(max-width: 640px)");
    const onChange = (event: MediaQueryListEvent) => setNarrow(event.matches);
    // 老 Safari 没 addEventListener('change')，回落到 addListener
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, []);
  return narrow;
}

function PostTree({
  posts,
  resolveAuthor,
  onReply,
  onDelete,
  canDelete,
  parentId = null,
  depth = 0,
  isNarrow,
}: {
  posts: WikiTalkPost[];
  resolveAuthor: (id: string) => string;
  onReply: (id: string) => void;
  onDelete: (id: string) => void;
  canDelete: (post: WikiTalkPost) => boolean;
  parentId?: string | null;
  depth?: number;
  isNarrow?: boolean;
}) {
  if (depth > 12) return null;
  const children = posts.filter((p) => (p.parentPostId ?? null) === parentId);
  if (children.length === 0) return null;
  // 移动端窄屏：每级缩进只给 8px（封顶 4 级 = 32px）。≥640px 桌面回 16px ×6。
  // isNarrow 由顶层 ThreadDetail 通过 useIsNarrowViewport 算好向下传，避免递归
  // 重复 matchMedia 调用 + 让窗口 resize 时缩进同步更新。
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
          {/* 后端 wiki-talk soft-delete 时把 body 直接覆盖成中文字面量 "[已删除]"
              （api/src/modules/wiki/services/wiki-talk.service.ts 第 231 行）。
              直接渲染 post.body 会让 en/ja/ko 用户在 talk page 看到一句裸中文，
              跟同行 <StatusPill>「已删除」</StatusPill> 也重复。这里在前端识别
              deletedAt 后渲染本地化占位符，让后端的中文字面量不再泄漏。 */}
          {post.deletedAt ? (
            <div className="mt-1 italic text-[var(--text-muted)]">
              <Trans>（此回复已被删除）</Trans>
            </div>
          ) : (
            <div className="mt-1 whitespace-pre-wrap break-words">
              {post.body}
            </div>
          )}
          <PostTree
            posts={posts}
            resolveAuthor={resolveAuthor}
            isNarrow={isNarrow}
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
