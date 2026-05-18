import { useEffect, useId, useRef } from "react";
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
  const titleId = useId();
  const descId = useId();
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
      if (event.key !== "Escape") {
        return;
      }

      // 走查电脑端群聊 R5：原版 pending 时直接 early return 让 Esc 透传——
      // workspace queueMicrotask 看到 defaultPrevented=false 跑
      // dismissSidePanel 把"聊天信息"侧栏偷关掉，本 dialog 因为 pending 不
      // 会真关，用户看到的是"按 Esc 没关弹窗倒把侧栏弄没了"。pending 期间
      // 仍消费掉 Esc 防 dismiss，mutation 落地后用户可以再按 Esc 真关。
      event.preventDefault();
      event.stopPropagation();
      if (pending) {
        return;
      }
      // 弹窗是 modal 层，Esc 关掉自己就够了；不 stopPropagation 的话
      // workspace 那条 dismissSidePanel 的 window keydown 会接着跑，
      // 一下 Esc 既把确认弹窗关了又把背后的详情侧栏一起关了。
      onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open, pending]);

  if (!open) {
    return null;
  }

  return (
    // 走查新一轮 R12：和 R10/R11 一脉相承的 portal-shield 问题。workspace
    // 在 rightPanelMode=details 时挂的 onPointerDownCapture / document
    // pointerdown(capture) 兜底会在「点击不落在 thread/header/sidePanel/
    // shield 区域」时 dismissSidePanel。本 confirm dialog inline 渲染在
    // workspace 根下，没有 shield —— 用户从「聊天信息」侧栏点「删除聊天/
    // 清空记录/投诉/加入黑名单」打开本 dialog 后，点取消/确认按钮 / 点 X /
    // 点 backdrop，pointerdown capture 都会先把侧栏偷关掉。对「清空/投诉/
    // 加入黑名单」尤其坑：操作完不删除会话，用户期望回到详情侧栏继续，
    // 结果发现侧栏没了得手动重开。Esc 路径上 R2 时已经 stopPropagation
    // 解决过同款问题；这里给 pointerdown 路径加 shield。
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(17,24,39,0.28)] p-6 backdrop-blur-[3px]"
      data-yj-portal-shield="desktop-chat-confirm-dialog"
    >
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

      {/* 走查 R2：和姊妹 feature-unavailable-dialog / mobile-message-reminder-sheet
          等修过的 a11y 同款缺漏——modal 但没挂 role="dialog" + aria-modal +
          aria-labelledby / aria-describedby。单聊「聊天信息」→「删除聊天 / 清空
          聊天记录 / 加入黑名单 / 提交投诉」都会弹这个 dialog；workspace 右键
          会话「删除聊天 / 清空记录 / 删除并退出」也走这个。盲人用户屏幕阅读器
          打开时只听到 confirm / cancel button label，听不到 title / description。
          补语义。 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="relative w-full max-w-[520px] overflow-hidden rounded-[20px] border border-[color:var(--border-faint)] bg-white/96 shadow-[var(--shadow-overlay)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[color:var(--border-faint)] bg-white/78 px-6 py-4 backdrop-blur-xl">
          <div className="min-w-0">
            <div
              id={titleId}
              className="text-[18px] font-medium text-[color:var(--text-primary)]"
            >
              {title}
            </div>
            <div
              id={descId}
              className="mt-2 text-[13px] leading-7 text-[color:var(--text-muted)]"
            >
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
