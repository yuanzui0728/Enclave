import { Link } from "@tanstack/react-router";
import { ArrowLeft, Ellipsis, Phone, Search, Users, Video } from "lucide-react";
import { Button, ErrorBlock, InlineNotice, LoadingBlock } from "@yinjie/ui";
import { AvatarChip } from "../../components/avatar-chip";
import { ChatComposer } from "../../components/chat-composer";
import { ChatMessageList } from "../../components/chat-message-list";
import { EmptyState } from "../../components/empty-state";
import { useConversationThread } from "./use-conversation-thread";

type ConversationThreadPanelProps = {
  conversationId: string;
  variant?: "mobile" | "desktop";
  onBack?: () => void;
};

export function ConversationThreadPanel({
  conversationId,
  variant = "mobile",
  onBack,
}: ConversationThreadPanelProps) {
  const {
    conversationTitle,
    conversationType,
    messagesQuery,
    participants,
    renderedMessages,
    scrollAnchorRef,
    sendMutation,
    setSocketError,
    setText,
    socketError,
    text,
    typingCharacterId,
  } = useConversationThread(conversationId);
  const isDesktop = variant === "desktop";
  const subtitle =
    conversationType === "group"
      ? `${participants.length || 0}人群聊`
      : typingCharacterId
        ? "对方正在输入..."
        : "连接顺畅";

  return (
    <div className={`flex h-full min-h-0 flex-col ${isDesktop ? "bg-[linear-gradient(180deg,rgba(245,245,245,0.98),rgba(242,242,242,0.98))]" : "bg-[linear-gradient(180deg,#fffdf7,#fff9ee)]"}`}>
      <header
        className={
          isDesktop
            ? "flex items-center gap-3 border-b border-[rgba(15,23,42,0.06)] bg-[rgba(249,249,249,0.96)] px-5 py-4"
            : "flex items-center gap-2 border-b border-white/80 bg-[linear-gradient(180deg,rgba(255,254,250,0.92),rgba(255,248,238,0.95))] px-3 py-2.5"
        }
      >
        {!isDesktop && onBack ? (
          <Button
            onClick={onBack}
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full border border-white/70 bg-white/82 text-[color:var(--text-primary)] shadow-[var(--shadow-soft)] hover:bg-white"
            aria-label="返回"
          >
            <ArrowLeft size={18} />
          </Button>
        ) : null}
        {!isDesktop ? <AvatarChip name={conversationTitle} size="wechat" /> : null}
        <div className="min-w-0 flex-1">
          <div className={isDesktop ? "truncate text-[17px] font-medium text-[color:var(--text-primary)]" : "truncate text-[16px] font-medium text-[color:var(--text-primary)]"}>
            {conversationTitle}
          </div>
          <div className={isDesktop ? "mt-1 flex items-center gap-2 text-[11px] text-[color:var(--text-muted)]" : "mt-0.5 flex items-center gap-1.5 text-[11px] text-[color:var(--text-muted)]"}>
            {conversationType === "group" ? <Users size={12} /> : null}
            <span>{subtitle}</span>
          </div>
        </div>
        {isDesktop ? (
          <div className="hidden items-center gap-1.5 xl:flex">
            <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--text-secondary)] transition hover:bg-white" aria-label="搜索">
              <Search size={16} />
            </button>
            <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--text-secondary)] transition hover:bg-white" aria-label="语音通话">
              <Phone size={16} />
            </button>
            <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--text-secondary)] transition hover:bg-white" aria-label="视频通话">
              <Video size={16} />
            </button>
            <Link
              to="/tabs/contacts"
              className="flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--text-secondary)] transition hover:bg-white"
              aria-label="通讯录"
            >
              <Users size={16} />
            </Link>
            <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--text-secondary)] transition hover:bg-white" aria-label="更多">
              <Ellipsis size={16} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--text-primary)] hover:bg-white/72" aria-label="语音通话">
              <Phone size={18} />
            </button>
            <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--text-primary)] hover:bg-white/72" aria-label="视频通话">
              <Video size={18} />
            </button>
            <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--text-primary)] hover:bg-white/72" aria-label="更多操作">
              <Ellipsis size={18} />
            </button>
          </div>
        )}
      </header>

      <div
        ref={scrollAnchorRef}
        className={isDesktop ? "flex-1 space-y-4 overflow-auto bg-[rgba(245,245,245,0.96)] px-8 py-6" : "flex-1 overflow-auto px-3 py-4"}
      >
        {messagesQuery.isLoading ? <LoadingBlock label="正在读取会话..." /> : null}
        {messagesQuery.isError && messagesQuery.error instanceof Error ? <ErrorBlock message={messagesQuery.error.message} /> : null}
        {socketError ? <ErrorBlock message={socketError} /> : null}
        {sendMutation.isError && sendMutation.error instanceof Error ? <ErrorBlock message={sendMutation.error.message} /> : null}

        <ChatMessageList
          messages={renderedMessages}
          groupMode={conversationType === "group"}
          variant={isDesktop ? "desktop" : "mobile"}
          emptyState={
            !messagesQuery.isLoading && !messagesQuery.isError ? (
              <EmptyState
                title="还没有消息"
                description="先发一句开场白，把这段对话真正聊起来。"
              />
            ) : null
          }
        />

        {typingCharacterId && !isDesktop ? (
          <InlineNotice tone="muted" className="mt-3 border-white/70 bg-white/82 text-[color:var(--text-muted)]">
            对方正在输入...
          </InlineNotice>
        ) : null}
      </div>

      <ChatComposer
        value={text}
        placeholder="输入消息"
        variant={isDesktop ? "desktop" : "mobile"}
        pending={sendMutation.isPending}
        error={sendMutation.error instanceof Error ? sendMutation.error.message : null}
        onChange={(value) => {
          if (socketError) {
            setSocketError(null);
          }
          setText(value);
        }}
        onSubmit={() => void sendMutation.mutateAsync()}
      />
    </div>
  );
}
