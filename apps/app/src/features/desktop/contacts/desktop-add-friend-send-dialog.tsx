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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(17,24,39,0.18)] p-6 backdrop-blur-[2px]">
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

      <div className="relative w-full max-w-[460px] overflow-hidden rounded-[10px] border border-[rgba(15,23,42,0.10)] bg-white shadow-[var(--shadow-overlay)]">
        <div className="border-b border-[rgba(15,23,42,0.06)] bg-[#f7f7f7] px-6 py-4">
          <div className="text-center text-[17px] font-medium text-[color:var(--text-primary)]">
            发送添加朋友申请
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="absolute right-4 top-3.5 flex h-8 w-8 items-center justify-center rounded-[8px] text-[color:var(--text-secondary)] transition hover:bg-white hover:text-[color:var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5">
          <div className="flex items-center gap-3 rounded-[8px] bg-[#f7f7f7] px-4 py-3">
            <AvatarChip name={character.name} src={character.avatar} size="wechat" />
            <div className="min-w-0">
              <div className="truncate text-[15px] font-medium text-[color:var(--text-primary)]">
                {character.name}
              </div>
              <div className="mt-1 text-[12px] text-[color:var(--text-muted)]">
                {identifier}
              </div>
            </div>
          </div>

          <div className="mt-4 text-[13px] leading-6 text-[color:var(--text-muted)]">
            你需要发送验证申请，等待对方通过。
          </div>

          <div className="mt-4">
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
              className="min-h-[128px] w-full resize-none rounded-[8px] border border-[rgba(15,23,42,0.10)] bg-white px-4 py-3 text-[14px] leading-7 text-[color:var(--text-primary)] outline-none transition-[border-color,box-shadow] placeholder:text-[color:var(--text-dim)] focus:border-[rgba(7,193,96,0.42)] focus:shadow-[0_0_0_3px_rgba(7,193,96,0.10)]"
            />
            <div className="mt-2 flex items-center justify-between text-[11px] text-[color:var(--text-dim)]">
              <span>支持按 `Ctrl/Cmd + Enter` 直接发送</span>
              <span>{greeting.length}/60</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-[rgba(15,23,42,0.06)] bg-[#f7f7f7] px-6 py-3.5">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={pending}
            className="rounded-[8px] border-[rgba(15,23,42,0.10)] bg-white px-5 shadow-none hover:bg-[color:var(--surface-console)]"
          >
            取消
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={pending || !greeting.trim()}
            onClick={() => void onSubmit(greeting.trim())}
            className="rounded-[8px] bg-[#07c160] px-5 text-white shadow-none hover:bg-[#06ad56]"
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
