import { Link } from "@tanstack/react-router";
import { ArrowLeft, Users } from "lucide-react";
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header
        className={
          isDesktop
            ? "flex items-center gap-3 border-b border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(9,14,23,0.94),rgba(12,20,32,0.9))] px-6 py-5"
            : "flex items-center gap-3 border-b border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(7,12,20,0.3),rgba(7,12,20,0.5))] px-5 py-4 backdrop-blur-xl"
        }
      >
        {!isDesktop && onBack ? (
          <Button onClick={onBack} variant="ghost" size="icon" className="text-[color:var(--text-secondary)]">
            <ArrowLeft size={18} />
          </Button>
        ) : null}
        <AvatarChip name={conversationTitle} />
        <div className="min-w-0 flex-1">
          <div className={isDesktop ? "truncate text-base font-semibold text-white" : "truncate text-sm font-medium text-white"}>
            {conversationTitle}
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-[color:var(--text-muted)]">
            {conversationType === "group" ? <Users size={12} /> : null}
            <span>{conversationType === "group" ? "Group chat" : "Direct chat"}</span>
            {participants.length > 0 ? <span>{participants.length} participants</span> : null}
          </div>
        </div>
        {isDesktop ? (
          <div className="hidden items-center gap-2 xl:flex">
            <Link to="/tabs/contacts" className="text-xs text-[color:var(--brand-secondary)]">
              Contacts
            </Link>
          </div>
        ) : (
          <Link to="/tabs/contacts" className="text-xs text-[color:var(--brand-secondary)]">
            Contacts
          </Link>
        )}
      </header>

      <div
        ref={scrollAnchorRef}
        className={isDesktop ? "flex-1 space-y-4 overflow-auto px-6 py-6" : "flex-1 space-y-4 overflow-auto px-5 py-5"}
      >
        {messagesQuery.isLoading ? <LoadingBlock label="Loading conversation..." /> : null}
        {messagesQuery.isError && messagesQuery.error instanceof Error ? <ErrorBlock message={messagesQuery.error.message} /> : null}
        {socketError ? <ErrorBlock message={socketError} /> : null}
        {sendMutation.isError && sendMutation.error instanceof Error ? <ErrorBlock message={sendMutation.error.message} /> : null}

        <ChatMessageList
          messages={renderedMessages}
          groupMode={conversationType === "group"}
          emptyState={
            !messagesQuery.isLoading && !messagesQuery.isError ? (
              <EmptyState
                title="No messages yet"
                description="Say something first and this conversation will start moving."
              />
            ) : null
          }
        />

        {typingCharacterId ? <InlineNotice tone="muted">Someone is typing...</InlineNotice> : null}
      </div>

      <ChatComposer
        value={text}
        placeholder="Send a message..."
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
