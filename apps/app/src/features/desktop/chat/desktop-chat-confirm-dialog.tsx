import { useEffect, useRef } from "react";
import { msg } from "@lingui/macro";
import { X } from "lucide-react";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { Button } from "@yinjie/ui";

type DesktopChatConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  pendingLabel?: string;
  danger?: boolean;
  pending?: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function DesktopChatConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  pendingLabel,
  danger = false,
  pending = false,
  onClose,
  onConfirm,
}: DesktopChatConfirmDialogProps) {
  const t = useRuntimeTranslator();
  const resolvedConfirmLabel = confirmLabel ?? t(msg`确认`);
  const resolvedPendingLabel = pendingLabel ?? t(msg`处理中...`);
  // 走查新一轮 R4：确认按钮只靠 disabled={pending} 兜双触发，pending 是父组件
  // mutation.isPending 经 React commit 才更新 DOM。同帧连点「删除聊天 / 清空记录 /
  // 删除并退出 / 加入黑名单」按钮 2 次都能同时通过 disabled=false → parent
  // onConfirm 触发 mutate 2 次：
  // · hide / delete / clear / leave 都走 HTTP DELETE/POST，幂等 server 接 2 次浪费
  //   RTT；非幂等的 leave-group 第二次会拿到「不在群里」error 反过来覆盖第一次
  //   成功的 notice，用户以为操作没成。
  // 加 sync ref 锁，pending 翻回 false 由 useEffect 复位。
  const confirmSubmittingRef = useRef(false);
  useEffect(() => {
    if (!pending) {
      confirmSubmittingRef.current = false;
    }
  }, [pending]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || pending) {
        return;
      }

      // 弹窗是 modal 层，Esc 关掉自己就够了；不 stopPropagation 的话
      // workspace 那条 dismissSidePanel 的 window keydown 会接着跑，
      // 一下 Esc 既把确认弹窗关了又把背后的详情侧栏一起关了。
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open, pending]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(17,24,39,0.28)] p-6 backdrop-blur-[3px]">
      <button
        type="button"
        aria-label={t(msg`关闭 ${title} 弹层`)}
        onClick={() => {
          if (!pending) {
            onClose();
          }
        }}
        className="absolute inset-0"
      />

      <div className="relative w-full max-w-[520px] overflow-hidden rounded-[20px] border border-[color:var(--border-faint)] bg-white/96 shadow-[var(--shadow-overlay)]">
        <div className="flex items-start justify-between gap-4 border-b border-[color:var(--border-faint)] bg-white/78 px-6 py-4 backdrop-blur-xl">
          <div className="min-w-0">
            <div className="text-[18px] font-medium text-[color:var(--text-primary)]">
              {title}
            </div>
            <div className="mt-2 text-[13px] leading-7 text-[color:var(--text-muted)]">
              {description}
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

        <div className="flex items-center justify-end gap-3 border-t border-[color:var(--border-faint)] bg-white/78 px-6 py-4 backdrop-blur-xl">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={pending}
            className="rounded-[10px] border-[color:var(--border-faint)] bg-white px-6 shadow-none hover:bg-[color:var(--surface-console)]"
          >
            {t(msg`取消`)}
          </Button>
          <Button
            type="button"
            variant={danger ? "danger" : "primary"}
            onClick={() => {
              if (confirmSubmittingRef.current || pending) {
                return;
              }
              confirmSubmittingRef.current = true;
              onConfirm();
            }}
            disabled={pending}
            className={
              danger
                ? "rounded-[10px] bg-[#e14c45] px-6 text-white hover:bg-[#cf433d]"
                : "rounded-[10px] bg-[color:var(--brand-primary)] px-6 text-white hover:opacity-95"
            }
          >
            {pending ? resolvedPendingLabel : resolvedConfirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
