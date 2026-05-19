import { useEffect, useId, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import { X } from "lucide-react";
import type { Character } from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
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
  const t = useRuntimeTranslator();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [greeting, setGreeting] = useState("");
  const titleId = useId();

  useEffect(() => {
    if (!open || !character) {
      return;
    }

    setGreeting(buildDefaultGreeting(ownerName, t));
  }, [character, open, ownerName, t]);

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
        // 走查电脑端群聊新会话 R111：和姊妹 R109/R110 同款 Esc race —— 本
        // dialog 从群成员头像 popover「添加朋友」打开，未挂 role="dialog"
        // 时 workspace dismissSidePanel microtask 命中不到，Esc 关 dialog
        // 时连带把「聊天信息」侧栏一起关掉。下方 panel 已补 role="dialog"
        // 作 a11y 兜底；这里改 capture + stopImmediatePropagation 二保险，
        // workspace bubble Esc handler 拿不到这次 keydown，dismiss microtask
        // 根本不会被 schedule。
        event.preventDefault();
        event.stopImmediatePropagation();
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

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [greeting, onClose, onSubmit, open, pending]);

  if (!open || !character) {
    return null;
  }

  return (
    // 走查电脑端群聊新会话 R111：和姊妹一批 dialog（R107-R113 desktop 单聊
    // backdrop / R112 create-group / R101-R103 群成员 picker）同款 a11y +
    // backdrop 焦点缺漏 —— 本 dialog 从群成员头像 popover 「添加朋友」打开，
    // 但 panel 既没挂 role="dialog" + aria-modal + aria-labelledby（盲人 SR
    // 听不到「发送添加朋友申请」title），backdrop <button> 也没 tabIndex={-1}
    // （键盘用户 Tab 进 dialog 焦点先落到这张不可见 backdrop → Enter 秒关，
    // 草稿验证信息一并丢）。一次性补齐双 a11y。
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(17,24,39,0.18)] p-6 backdrop-blur-[2px]">
      <button
        type="button"
        aria-label={t(msg`关闭发送好友申请弹层`)}
        onClick={() => {
          if (!pending) {
            onClose();
          }
        }}
        tabIndex={-1}
        className="absolute inset-0"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-[460px] overflow-hidden rounded-[10px] border border-[rgba(15,23,42,0.10)] bg-white shadow-[var(--shadow-overlay)]"
      >
        <div className="border-b border-[rgba(15,23,42,0.06)] bg-[#f7f7f7] px-6 py-4">
          <div
            id={titleId}
            className="text-center text-[17px] font-medium text-[color:var(--text-primary)]"
          >
            {t(msg`发送添加朋友申请`)}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="absolute right-4 top-3.5 flex h-8 w-8 items-center justify-center rounded-[8px] text-[color:var(--text-secondary)] transition hover:bg-white hover:text-[color:var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
            aria-label={t(msg`关闭`)}
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
            {t(msg`你需要发送验证申请，等待对方通过。`)}
          </div>

          <div className="mt-4">
            <div className="mb-2 text-[13px] font-medium text-[color:var(--text-primary)]">
              {t(msg`验证信息`)}
            </div>
            <textarea
              ref={textareaRef}
              value={greeting}
              maxLength={60}
              onChange={(event) => setGreeting(event.target.value)}
              placeholder={t(msg`请输入验证信息`)}
              rows={4}
              className="min-h-[128px] w-full resize-none rounded-[8px] border border-[rgba(15,23,42,0.10)] bg-white px-4 py-3 text-[14px] leading-7 text-[color:var(--text-primary)] outline-none transition-[border-color,box-shadow] placeholder:text-[color:var(--text-dim)] focus:border-[rgba(7,193,96,0.42)] focus:shadow-[0_0_0_3px_rgba(7,193,96,0.10)]"
            />
            <div className="mt-2 flex items-center justify-between text-[11px] text-[color:var(--text-dim)]">
              <span>{t(msg`支持按 \`Ctrl/Cmd + Enter\` 直接发送`)}</span>
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
            {t(msg`取消`)}
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={pending || !greeting.trim()}
            onClick={() => void onSubmit(greeting.trim())}
            className="rounded-[8px] bg-[#07c160] px-5 text-white shadow-none hover:bg-[#06ad56]"
          >
            {pending ? t(msg`发送中...`) : t(msg`发送`)}
          </Button>
        </div>
      </div>
    </div>
  );
}

function buildDefaultGreeting(
  ownerName: string,
  t: ReturnType<typeof useRuntimeTranslator>,
) {
  const normalizedOwnerName = ownerName.trim() || t(msg`我`);
  return t(msg`你好，我是${normalizedOwnerName}，想把你添加到通讯录里。`);
}
