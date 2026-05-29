import { useEffect, useId, useMemo, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import { Search, X } from "lucide-react";
import {
  type ConversationListItem,
  type FavoriteNoteAsset,
} from "@yinjie/contracts";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { Button, ErrorBlock, LoadingBlock, TextField } from "@yinjie/ui";
import { AvatarChip } from "../../../components/avatar-chip";
import { EmptyState } from "../../../components/empty-state";
import { GroupAvatarChip } from "../../../components/group-avatar-chip";
import { getConversationDisplayTitle } from "../../../lib/conversation-preview";
import {
  getConversationThreadLabel,
  isPersistedGroupConversation,
} from "../../../lib/conversation-route";
import { formatMessageTimestamp, parseTimestamp } from "../../../lib/format";
import { resolveAppMediaUrl } from "../../../lib/media-url";

export type DesktopNoteSendDialogNote = {
  noteId: string;
  title: string;
  excerpt: string;
  tags: string[];
  assets: FavoriteNoteAsset[];
  updatedAt: string;
};

type DesktopNoteSendDialogProps = {
  open: boolean;
  note: DesktopNoteSendDialogNote | null;
  conversations: ConversationListItem[];
  loading?: boolean;
  pending?: boolean;
  error?: string | null;
  onClose: () => void;
  onSend: (conversation: ConversationListItem) => void;
};

export function DesktopNoteSendDialog({
  open,
  note,
  conversations,
  loading = false,
  pending = false,
  error,
  onClose,
  onSend,
}: DesktopNoteSendDialogProps) {
  const t = translateRuntimeMessage;
  const [searchTerm, setSearchTerm] = useState("");
  const titleId = useId();
  const descId = useId();
  // 走查新一轮 R2：会话行按钮原本只靠 disabled={pending} 兜双击，pending 是
  // 父组件 sendMutation.isPending 经 React commit 才进 DOM。同帧连点同一行 2 次
  // 同时通过 disabled=false → 两次 onSend(conversation) → sendMutation 飞 2 次，
  // 单聊走 emitChatMessage 直接给对端发 2 条一样的笔记卡片，群聊走 POST 也是
  // 2 条。和 forward-dialog 的 forwardSubmittingRef 同款修法。
  const sendSubmittingRef = useRef(false);
  useEffect(() => {
    if (!pending) {
      sendSubmittingRef.current = false;
    }
  }, [pending]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setSearchTerm("");
  }, [open]);

  // 走查电脑端单聊新一轮 R1：和姊妹 desktop-message-forward-dialog
  // (line 131-152) / desktop-create-group-dialog / desktop-chat-confirm-dialog
  // / desktop-chat-text-edit-dialog 一票 dialog 同款 ESC 处理已修过，本
  // note-send-dialog 完全没挂 keydown listener —— 用户从 composer「+ → 收藏
  //  → 笔记」或者 notes-workspace 右键「发送给」打开本 dialog 时，按 Esc
  // 不会关 dialog；workspace 那条 window keydown 兜底（queueMicrotask
  // 检查 defaultPrevented）反而看到没人 preventDefault → 跑 dismissSidePanel
  // 把背后的「聊天信息」侧栏一起关掉，dialog 自己还留在屏幕上。和 forward
  // dialog 完全对齐：挂 listener，pending 期间也消费 Esc 防 dismiss 透传，
  // 服务端那一发飞着的笔记 mutation 等落地后用户能再按 Esc 真关。
  // R11：和姊妹 desktop-chat-confirm-dialog / desktop-chat-text-edit-dialog /
  // desktop-message-forward-dialog R11 / 移动端 R3 (c422bc945) 同款 —— 调用方
  // composer / notes-workspace 用 inline arrow `onClose={() => setX(null)}`
  // 传进来，parent 每次重渲染都换 ref → effect 在 open=true 时反复拆装
  // window keydown listener。pending 期间又频繁 false→true→false 推动 deps
  // 变化。ref 镜像 onClose，effect deps 收紧到 [open, pending]。
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }
      // 走查 R148：笔记发送 dialog 内嵌搜索 TextField（line 232），CJK 用户
      // 在搜会话名时用 IME 拼"老婆 laopo"。原 handler Esc 直接 preventDefault
      // 关弹层 → 候选词没退、半截输入丢、笔记发送链路被打断。先让 IME 吃
      // Esc，候选词退后再按一次才关 dialog。
      if (event.isComposing) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (pending) {
        return;
      }
      onCloseRef.current();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, pending]);

  // 之前 sort + filter 合在一个 useMemo 里，[conversations, searchTerm] 同时
  // 是 deps：每次按键都重新 sort 一遍（O(N log N)），即使会话列表压根没动。
  // 拆成两段：sort 只在 conversations 变化时做，按键时只做 filter。
  const orderedConversations = useMemo(() => {
    return [...conversations].sort(
      (left, right) =>
        (parseTimestamp(right.lastActivityAt) ?? 0) -
        (parseTimestamp(left.lastActivityAt) ?? 0),
    );
  }, [conversations]);

  const filteredConversations = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) {
      return orderedConversations;
    }
    // R2：和 forward-dialog 同款——搜索 haystack 跟着 row 显示翻 sentinel。
    return orderedConversations.filter((conversation) =>
      getConversationDisplayTitle(conversation.title)
        .toLowerCase()
        .includes(keyword),
    );
  }, [orderedConversations, searchTerm]);

  if (!open || !note) {
    return null;
  }

  return (
    // 走查新一轮 R12：和姊妹 forward dialog 同款 portal-shield。note-send
    // 在桌面端 composer「+ → 收藏 → 笔记 → 发送」或者 notes-workspace 右键
    // 「发送给」时打开，背后可能有「聊天信息」侧栏开着。用户在 dialog 内
    // 点搜索框 / 会话行时 workspace pointerdown capture 偷关侧栏。
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(17,24,39,0.28)] p-3 backdrop-blur-[3px] sm:p-4 lg:p-6"
      data-yj-portal-shield="desktop-note-send-dialog"
    >
      <button
        type="button"
        aria-label={t(msg`关闭发送笔记弹层`)}
        onClick={() => {
          if (!pending) {
            onClose();
          }
        }}
        // 走查电脑端单聊 R111：和姊妹 R107-R110 同款 —— 发送笔记 dialog 的
        // backdrop <button> (absolute inset-0) 视觉不可见、纯 mouse"点击背景
        // 关闭"affordance，但 DOM 顺序在 dialog 子树第一位。用户在 composer
        // 「+ → 收藏 → 笔记」/ notes-workspace 右键「发送给」打开 dialog 后
        // 按 Tab → 焦点先落到这张不可见 backdrop → 再按 Enter dialog 秒关，
        // 已选好的笔记 + 收件目标全丢。Esc keydown 已挂 (line 95-114)，键盘
        // 用户走 Esc 关 dialog。
        tabIndex={-1}
        className="absolute inset-0"
      />

      {/* 走查 R3：和姊妹 forward dialog 同款 a11y 修法——modal 但没挂
          role="dialog" + aria-modal + aria-labelledby/aria-describedby。单聊
          composer 「+ → 收藏 → 笔记」/ notes-workspace 右键「发送给」会弹这个
          dialog；盲人屏幕阅读器只听到「关闭发送笔记弹层 按钮」+ 搜索框 + 会话行，
          不知道是「发送笔记」对话框。补语义。 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="relative flex h-[min(760px,84vh)] w-full max-w-[1040px] min-w-0 overflow-hidden rounded-[22px] border border-[color:var(--border-faint)] bg-white/96 shadow-[var(--shadow-overlay)]"
      >
        <section className="flex w-[344px] shrink-0 flex-col border-r border-[color:var(--border-faint)] bg-[rgba(247,250,250,0.88)]">
          <div className="border-b border-[color:var(--border-faint)] bg-white/78 px-5 py-5 backdrop-blur-xl">
            <div
              id={titleId}
              className="text-[18px] font-medium text-[color:var(--text-primary)]"
            >
              {t(msg`发送笔记`)}
            </div>
            <div
              id={descId}
              className="mt-1 text-[12px] leading-6 text-[color:var(--text-muted)]"
            >
              {t(msg`把这条收藏笔记发到最近会话。`)}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
            <DesktopNotePreviewCard note={note} />
          </div>
        </section>

        <section className="flex min-w-0 flex-1 flex-col bg-[rgba(255,255,255,0.62)]">
          <div className="flex items-start justify-between gap-4 border-b border-[color:var(--border-faint)] bg-white/78 px-6 py-4 backdrop-blur-xl">
            <div className="min-w-0">
              <div className="text-[11px] tracking-[0.12em] text-[color:var(--text-dim)]">
                {t(msg`最近会话`)}
              </div>
              <div className="mt-2 text-[15px] font-medium text-[color:var(--text-primary)]">
                {t(msg`选择要接收笔记的聊天`)}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
              aria-label={t(msg`关闭`)}
            >
              <X size={16} />
            </button>
          </div>

          <div className="border-b border-[color:var(--border-faint)] bg-white/72 px-6 py-4">
            <label className="relative block">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-dim)]"
              />
              <TextField
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder={t(msg`搜索最近会话`)}
                // 走查新一轮 R25：和姊妹 chat-history R24 / chat-files
                // / forward-dialog / create-group / contacts add-friend
                // 同款 a11y 修法——父 <label> 只包了 Search 图标 + TextField，
                // 无文本子节点，等于 input 没有 accessible name。SR focus
                // 进来只听到「编辑栏 搜索最近会话 空」（部分 SR 实现读
                // placeholder、部分不读），盲人用户得自己摸 dialog 顶部
                // 标题猜 scope，与 R23/R24 修法一致补 aria-label。
                aria-label={t(msg`搜索最近会话`)}
                disabled={pending}
                className="h-10 rounded-[10px] border-[color:var(--border-faint)] bg-white pl-10 shadow-none"
              />
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-6 py-6">
            {loading ? <LoadingBlock label={t(msg`正在读取最近会话...`)} /> : null}
            {/* R48 续：笔记发送弹层 error 同款，conversations 读取失败时
                盲人用户在空白面板下没反馈。挂 role="alert"。 */}
            {error ? <ErrorBlock role="alert" message={error} /> : null}
            {!loading && !error && !conversations.length ? (
              <EmptyState
                title={t(msg`还没有可发送的最近会话`)}
                description={t(msg`先去消息列表里开几个聊天，再回来发送笔记。`)}
              />
            ) : null}
            {!loading &&
            !error &&
            conversations.length > 0 &&
            !filteredConversations.length ? (
              <div className="rounded-[12px] border border-dashed border-[color:var(--border-faint)] bg-white/84 px-4 py-5 text-sm text-[color:var(--text-secondary)]">
                {t(msg`没有匹配的最近会话。`)}
              </div>
            ) : null}

            <div className="space-y-2">
              {filteredConversations.map((conversation) => {
                const isGroup = isPersistedGroupConversation(conversation);
                const displayTitle = getConversationDisplayTitle(
                  conversation.title,
                );
                return (
                  <button
                    key={conversation.id}
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      if (sendSubmittingRef.current || pending) {
                        return;
                      }
                      sendSubmittingRef.current = true;
                      onSend(conversation);
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-[14px] border border-[color:var(--border-faint)] bg-white px-4 py-3 text-left transition hover:bg-[color:var(--surface-console)] hover:shadow-[var(--shadow-soft)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {isGroup ? (
                        <GroupAvatarChip
                          name={displayTitle}
                          members={conversation.participants}
                          size="wechat"
                        />
                      ) : (
                        <AvatarChip
                          name={displayTitle}
                          src={conversation.avatar}
                          size="wechat"
                        />
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
                          {displayTitle}
                        </div>
                        <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                          {getConversationThreadLabel(conversation)} ·{" "}
                          {t(msg`最近活跃`)}{" "}
                          {formatMessageTimestamp(conversation.lastActivityAt)}
                        </div>
                      </div>
                    </div>
                    <span className="shrink-0 rounded-[8px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 py-1 text-xs text-[color:var(--text-secondary)]">
                      {pending ? t(msg`发送中`) : t(msg`发送`)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-[color:var(--border-faint)] bg-white/78 px-6 py-4 text-[12px] text-[color:var(--text-muted)] backdrop-blur-xl">
            <div>{t(msg`发送后会在目标会话里显示成一张可打开的笔记卡片。`)}</div>
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={pending}
              className="rounded-[10px] border-[color:var(--border-faint)] bg-white px-6 shadow-none hover:bg-[color:var(--surface-console)]"
            >
              {t(msg`取消`)}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}

function DesktopNotePreviewCard({ note }: { note: DesktopNoteSendDialogNote }) {
  const t = translateRuntimeMessage;
  const previewImage = note.assets.find((asset) => asset.kind === "image");
  const fileCount = note.assets.filter((asset) => asset.kind === "file").length;
  const imageCount = note.assets.filter(
    (asset) => asset.kind === "image",
  ).length;

  return (
    <div className="overflow-hidden rounded-[20px] border border-[color:var(--border-faint)] bg-white shadow-[var(--shadow-soft)]">
      {previewImage?.url ? (
        <div className="h-[184px] overflow-hidden bg-[rgba(15,23,42,0.05)]">
          {/* 走查 R131：和 R130 (NoteViewerOverlay 内嵌 <img>) 一脉。本 preview
              卡渲在「发送给好友 / 群聊」dialog 顶部，用户打开 dialog 时第一眼
              就盯着这张封面缩略图，下意识用鼠标按住拖向背后某个会话行试图
              "拖到对话上发送"。原生 <img draggable> 默认 true → 触发浏览器
              ghost-image 拖拽 + dragend 落到外部 drop target 时被 IM
              workspace 的全局 dragover 接住，要么 fileDrop 走附件路径
              误传图片、要么直接被 OS 接管打开图片预览页。dialog 内点击
              会话行才是合法路径，封面图不需要可拖。 */}
          <img
            // 2026-05-21 修：和 mobile-notes-page / NoteViewerOverlay 同款 — 公网
            // 隧道下 /api/chat/attachments/<file> 必须经 /cloud/world-api + ?token=。
            src={resolveAppMediaUrl(previewImage.url)}
            alt={note.title}
            decoding="async"
            loading="lazy"
            draggable={false}
            className="h-full w-full object-cover"
          />
        </div>
      ) : (
        <div className="flex h-[184px] items-end bg-[linear-gradient(160deg,#f3f6f5_0%,#dde6e3_100%)] px-5 py-5">
          <div className="rounded-[16px] border border-[rgba(15,23,42,0.08)] bg-white/88 px-4 py-3 text-[11px] tracking-[0.16em] text-[color:var(--text-muted)] shadow-[var(--shadow-soft)]">
            {t(msg`收藏笔记`)}
          </div>
        </div>
      )}

      <div className="space-y-4 px-5 py-5">
        <div>
          <div className="line-clamp-2 text-[17px] font-medium leading-7 text-[color:var(--text-primary)]">
            {note.title}
          </div>
          <div className="mt-2 text-[12px] text-[color:var(--text-muted)]">
            {t(msg`更新于 ${formatMessageTimestamp(note.updatedAt)}`)}
          </div>
        </div>

        <div className="line-clamp-5 text-[13px] leading-7 text-[color:var(--text-secondary)]">
          {note.excerpt || t(msg`这条笔记还没有正文摘要。`)}
        </div>

        {note.tags.length ? (
          <div className="flex flex-wrap gap-2">
            {note.tags.slice(0, 6).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-[color-mix(in_srgb,var(--brand-primary)_8%,transparent)] px-3 py-1 text-[11px] text-[color:var(--brand-primary)]"
              >
                #{tag}
              </span>
            ))}
          </div>
        ) : null}

        <div className="flex items-center gap-2 text-[11px] tracking-[0.12em] text-[color:var(--text-dim)]">
          {imageCount ? <span>{t(msg`${imageCount} 张图片`)}</span> : null}
          {fileCount ? <span>{t(msg`${fileCount} 个文件`)}</span> : null}
          {!imageCount && !fileCount ? <span>{t(msg`纯文本笔记`)}</span> : null}
        </div>
      </div>
    </div>
  );
}
