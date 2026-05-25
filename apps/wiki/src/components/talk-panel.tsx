import { useEffect, useMemo, useState } from "react";
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

// 楼中楼递归渲染的安全阀（纯防 React 递归过深，不是内容上限）。真实楼层受写额度
// 限制（newcomer 5/h、autoconfirmed 30/h）几乎不可能堆到几十层；阈值给到 60，
// 60 层 React 递归毫无压力，realistic thread 永远到不了。超过时不再静默吞帖（见
// PostTree 内注释），而是渲染一条可见的「已折叠」提示。
const MAX_TALK_RENDER_DEPTH = 60;

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
            <ErrorBlock role="alert" message={(newThreadMut.error as Error).message} />
          )}
        </Card>
      )}

      {threadsQ.isLoading && <LoadingBlock />}
      {threadsQ.isError && (
        <ErrorBlock role="alert" message={(threadsQ.error as Error).message} />
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
  // replyTo 只是 postId。原写法 hint 拼 `{replyTo.slice(0, 8)}…`，给用户看的是
  // post id 的前 8 char（uuid 形态），用户根本不知道在回谁。改成查 postsQ.data
  // 对应行 + resolveAuthor 拿到作者名展示。postsQ.data 还没回来或者那条 post
  // 刚好被刷掉时退回到 8-char id 兜底。
  const replyToAuthor = useMemo(() => {
    if (!replyTo) return null;
    const post = (postsQ.data ?? []).find((p) => p.id === replyTo);
    return post ? resolveAuthor(post.authorId) : null;
  }, [replyTo, postsQ.data, resolveAuthor]);
  // 按 parentPostId 分桶给 PostTree 用：原写法 PostTree 每层都 posts.filter()
  // 是 O(N) 扫表，递归 D 层等于 O(N·D)。一个 30 帖的 thread 楼中楼 12 层就是
  // 360 次比较 + 重复创建临时数组。预先在 ThreadDetail 这里做一次 O(N) 分桶，
  // 递归里就只是 Map.get → O(1)。root 桶用 "__root__" 哨兵（UUID 不会有下划
  // 线，永远不会碰撞）；原写法用 " root"（前导空格），编辑历史里一次手抖把
  // 写入侧空格替成了 NUL byte (\x00)，键值变 "\0root"，读取侧仍是 " root"，
  // 两 key 永远 mismatch → PostTree 一条 post 都不渲染（thread 标题里 postCount
  // 显示 3 但展开后只剩 patroller 按钮 + 回复框，3 条 post 全消失）。换 ASCII
  // 哨兵堵住该类不可见字符 bug。
  const childrenByParent = useMemo(() => {
    const map = new Map<string, WikiTalkPost[]>();
    for (const p of postsQ.data ?? []) {
      const key = p.parentPostId ?? "__root__";
      const bucket = map.get(key);
      if (bucket) bucket.push(p);
      else map.set(key, [p]);
    }
    return map;
  }, [postsQ.data]);

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
        <ErrorBlock role="alert" message={(flagsMut.error as Error).message} />
      )}
      {deleteMut.isError && (
        <ErrorBlock role="alert" message={(deleteMut.error as Error).message} />
      )}
      {postsQ.isLoading && <LoadingBlock />}
      {postsQ.isError && (
        <ErrorBlock role="alert" message={(postsQ.error as Error).message} />
      )}
      <PostTree
        childrenByParent={childrenByParent}
        resolveAuthor={resolveAuthor}
        isNarrow={isNarrow}
        // 逐帖「回复」按钮的显隐必须和下方 composer 完全同条件：composer 只在
        // user && !isLocked 时渲染，否则点「回复」只 setReplyTo 而 composer 不
        // 出现 = 死按钮（锁定串 / 未登录访客都会撞上）。
        canReply={Boolean(user) && !thread.isLocked}
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
            <div id={`reply-hint-${threadId}`} className="text-xs text-[var(--text-muted)]">
              {replyToAuthor ? (
                <Trans>回复 @{replyToAuthor} 的楼中楼</Trans>
              ) : (
                <Trans>回复楼中楼 · {replyTo.slice(0, 8)}…</Trans>
              )}{" "}
              <button
                type="button"
                className="underline"
                onClick={() => setReplyTo(null)}
              >
                <Trans>取消引用</Trans>
              </button>
            </div>
          )}
          {/* aria-label：placeholder Safari/JAWS 不当 accessible name 用，且
              <TextAreaField> 没有外层 <label> 包裹。原写法 SR 进 textarea 只
              听到 "edit textarea"。replyTo 不为空时配 aria-describedby 让 SR
              再补播 "回复楼中楼 …" 上下文。 */}
          <TextAreaField
            rows={3}
            aria-label={t(msg`回复内容`)}
            aria-describedby={replyTo ? `reply-hint-${threadId}` : undefined}
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
            <ErrorBlock role="alert" message={(replyMut.error as Error).message} />
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
  childrenByParent,
  resolveAuthor,
  onReply,
  onDelete,
  canDelete,
  canReply,
  parentId = null,
  depth = 0,
  isNarrow,
}: {
  childrenByParent: Map<string, WikiTalkPost[]>;
  resolveAuthor: (id: string) => string;
  onReply: (id: string) => void;
  onDelete: (id: string) => void;
  canDelete: (post: WikiTalkPost) => boolean;
  canReply: boolean;
  parentId?: string | null;
  depth?: number;
  isNarrow?: boolean;
}) {
  const t = translateRuntimeMessage;
  // 原写法 `if (depth > 12) return null` 会把第 13 层以下的楼中楼**静默吞掉**：
  // 深层回复凭空消失，而 thread.postCount 仍计入它们 →「N 条」与展开后可见楼数
  // 对不上（2026-05-25 深度走查发现，18 层链只渲染到第 12 层）。缩进早被下方
  // Math.min(depth,6/4) 钳住、撑不破布局，这个 cutoff 纯粹是递归安全阀。阈值抬到
  // MAX_TALK_RENDER_DEPTH，且超过时不再 return null 而是给一条**可见**的「已折叠」
  // 提示——深层内容要么照常显示、要么有明确交代，绝不无声消失。
  if (depth > MAX_TALK_RENDER_DEPTH) {
    return (
      <p className="py-1 text-xs italic text-[var(--text-muted)]">
        <Trans>回复层级过深，更深的楼层已折叠。</Trans>
      </p>
    );
  }
  // root 桶用 "__root__" 哨兵——必须和 ThreadDetail childrenByParent 写入侧
  // 完全一致，否则递归读不到 root 帖，整 thread 一条都不渲染。
  const children = childrenByParent.get(parentId ?? "__root__") ?? [];
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
                {/* ml-auto 间隔条把操作按钮整体推到右侧。独立 spacer 而不是把
                    ml-auto 挂在「回复」上——锁定串 / 未登录访客隐藏「回复」后，
                    剩下的举报 / 删除仍能保持右对齐，不会塌回左侧。 */}
                <span className="ml-auto" aria-hidden="true" />
                {/* per-post 操作按钮的可访问名要把作者名嵌进去。N 条回复都叫
                    "回复 按钮" / "删除 按钮"，SR 用户在长 thread 里没法判断点
                    的是哪一条；用 aria-label 显式带上作者名，视觉文案保留短。
                    canReply=false（锁定串 / 未登录）时不渲染「回复」，避免点了
                    没有 composer 出现的死按钮。举报按钮自身已对未登录返回 null，
                    且锁定串仍允许举报，所以不随 canReply 一起关。 */}
                {canReply && (
                  <button
                    type="button"
                    aria-label={t(msg`回复 ${resolveAuthor(post.authorId)} 的发言`)}
                    className="inline-flex min-h-[32px] items-center rounded-md px-2 py-1 underline hover:text-[var(--text-primary)]"
                    onClick={() => onReply(post.id)}
                  >
                    <Trans>回复</Trans>
                  </button>
                )}
                <ReportButton targetType="wiki_talk_post" targetId={post.id} />
                {canDelete(post) && (
                  <button
                    type="button"
                    aria-label={t(msg`删除 ${resolveAuthor(post.authorId)} 的发言`)}
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
            childrenByParent={childrenByParent}
            resolveAuthor={resolveAuthor}
            isNarrow={isNarrow}
            onReply={onReply}
            onDelete={onDelete}
            canDelete={canDelete}
            canReply={canReply}
            parentId={post.id}
            depth={depth + 1}
          />
        </li>
      ))}
    </ul>
  );
}
