import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { Character } from "@yinjie/contracts";
import { Button } from "@yinjie/ui";
import { AvatarChip } from "../../../components/avatar-chip";

type DesktopAddFriendSendDialogProps = {
  open: boolean;
  character: Character | null;
  identifier: string;
  ownerName: string;
  pending?: boolean;
  onClose: () => void;
  onSubmit: (greeting: string) => Promise<void> | void;
};

export function DesktopAddFriendSendDialog({
  open,
  character,
  identifier,
  ownerName,
  pending = false,
  onClose,
  onSubmit,
}: DesktopAddFriendSendDialogProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [greeting, setGreeting] = useState("");

  useEffect(() => {
    if (!open || !character) {
      return;
    }

    setGreeting(buildDefaultGreeting(ownerName));
  }, [character, open, ownerName]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const timer = window.setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(
        textareaRef.current.value.length,
        textareaRef.current.value.length,
      );
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) {
        event.preventDefault();
        onClose();
        return;
      }

      if (
        event.key === "Enter" &&
        (event.metaKey || event.ctrlKey) &&
        !pending
      ) {
        event.preventDefault();
        const nextGreeting = greeting.trim();
        if (!nextGreeting) {
          textareaRef.current?.focus();
          return;
        }
        void onSubmit(nextGreeting);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [greeting, onClose, onSubmit, open, pending]);

  if (!open || !character) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(17,24,39,0.28)] p-6 backdrop-blur-[3px]">
      <button
        type="button"
        aria-label="关闭发送好友申请弹层"
        onClick={() => {
          if (!pending) {
            onClose();
          }
        }}
        className="absolute inset-0"
      />

      <div className="relative w-full max-w-[560px] overflow-hidden rounded-[24px] border border-[color:var(--border-faint)] bg-white/96 shadow-[var(--shadow-overlay)]">
        <div className="flex items-start justify-between gap-4 border-b border-[color:var(--border-faint)] bg-[rgba(255,255,255,0.84)] px-6 py-5 backdrop-blur-xl">
          <div className="min-w-0">
            <div className="text-[20px] font-medium text-[color:var(--text-primary)]">
              发送添加申请
            </div>
            <div className="mt-2 text-[13px] leading-7 text-[color:var(--text-muted)]">
              发送验证信息后，对方通过即可成为你的朋友。
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-5 px-6 py-6">
          <div className="flex items-center gap-4 rounded-[18px] border border-[color:var(--border-faint)] bg-[rgba(247,250,250,0.88)] px-4 py-4">
            <AvatarChip name={character.name} src={character.avatar} size="wechat" />
            <div className="min-w-0">
              <div className="truncate text-[16px] font-medium text-[color:var(--text-primary)]">
                {character.name}
              </div>
              <div className="mt-1 text-[12px] text-[color:var(--text-muted)]">
                {identifier}
              </div>
            </div>
          </div>

          <div>
            <div className="mb-2 text-[13px] font-medium text-[color:var(--text-primary)]">
              验证信息
            </div>
            <textarea
              ref={textareaRef}
              value={greeting}
              maxLength={60}
              onChange={(event) => setGreeting(event.target.value)}
              placeholder="请输入验证信息"
              rows={4}
              className="min-h-[132px] w-full resize-none rounded-[18px] border border-[color:var(--border-faint)] bg-[rgba(247,250,250,0.92)] px-4 py-3.5 text-[14px] leading-7 text-[color:var(--text-primary)] outline-none transition-[border-color,background-color] placeholder:text-[color:var(--text-dim)] hover:bg-white focus:border-[color:var(--border-brand)] focus:bg-white"
            />
            <div className="mt-2 flex items-center justify-between text-[11px] text-[color:var(--text-dim)]">
              <span>支持按 `Ctrl/Cmd + Enter` 直接发送</span>
              <span>{greeting.length}/60</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-[color:var(--border-faint)] bg-[rgba(255,255,255,0.84)] px-6 py-4 backdrop-blur-xl">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={pending}
            className="rounded-[12px] border-[color:var(--border-faint)] bg-white px-6 shadow-none hover:bg-[color:var(--surface-console)]"
          >
            取消
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={pending || !greeting.trim()}
            onClick={() => void onSubmit(greeting.trim())}
            className="rounded-[12px] bg-[#07c160] px-6 text-white shadow-none hover:bg-[#06ad56]"
          >
            {pending ? "发送中..." : "发送"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function buildDefaultGreeting(ownerName: string) {
  const normalizedOwnerName = ownerName.trim() || "我";
  return `你好，我是${normalizedOwnerName}，想把你添加到通讯录里。`;
}
