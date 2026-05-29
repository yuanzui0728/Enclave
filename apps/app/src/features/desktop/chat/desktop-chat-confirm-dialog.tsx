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

  // 走查新一轮 R5（移动端我-tab 端到端 2026-05-22）：本 dialog 全站作为 confirm
  // modal（profile-page 退出登录 / 单聊「删除聊天 / 清空记录 / 加入黑名单」/
  // workspace 右键菜单 …）使用，已挂 role="dialog" + aria-modal/labelledby/
  // describedby，但 **缺 focus management**：
  // 1) open 翻 true 时焦点仍停在点击按钮（背景里），SR 不读 dialog title/desc，
  //    键盘用户按 Tab 还会先跳到背景的 settings 按钮再进 dialog；
  // 2) ESC / 取消关闭后焦点掉到 document.body，键盘用户上下文丢失，需要重新
  //    Tab 找到刚才那个触发按钮才能继续。
  // 标准 WAI-ARIA dialog pattern：open=true → focus dialog 本身（tabIndex=-1
  // 让 .focus() 成功 + 加 aria-modal 隔离），同步保存 previousActiveElement；
  // open=false 时把焦点还原回打开按钮。
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) {
      return;
    }
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    // 焦点定到「取消」按钮上（不是 dialog div / confirm 按钮）：
    // 1) 是 danger / destructive 操作时（退出登录 / 删除聊天 / 加入黑名单），
    //    SR 用户初始焦点在「取消」上 → Enter 默认 = 取消，安全（避免 Enter
    //    误触发"确认"丢数据）；
    // 2) 也是 W3C ARIA Authoring Practices 1.2 dialog pattern 推荐：
    //    "place focus on the dialog's primary safe action"。
    // 用 setTimeout(0) 让 .focus() 排在事件循环下一个 tick，避开 click→pointerup
    // 序列里 chromium 把 focus 还原回触发按钮的兜底逻辑（实测裸 .focus() 同步
    // 调用 / requestAnimationFrame 都被压回去）。
    const timer = window.setTimeout(() => {
      cancelButtonRef.current?.focus();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      // dialog 关闭（open→false）或 unmount 时把焦点还原回打开按钮 ——
      // 键盘用户能继续上下文 navigate。previousFocus 元素可能已经 unmount
      // （e.g. 触发按钮所在的 Suspense 边界跳了），try/catch 兜 detached 节点
      // .focus() 在某些浏览器抛 InvalidStateError 的情况。
      const prev = previousFocusRef.current;
      previousFocusRef.current = null;
      if (prev && prev.isConnected) {
        try {
          prev.focus();
        } catch {
          /* noop */
        }
      }
    };
  }, [open]);

  // R11：和姊妹移动端 R3 (c422bc945 — strong-reminder host / 3 sheet onClose
  // 每帧拆装) 同款 perf 问题。原版 deps=[onClose, open, pending]，调用方
  // workspace / details-panel 几乎全是 inline arrow `onClose={() => setX(null)}`
  // —— parent 每次重渲染（60s 轮询 / 搜索框打字 / socket 推消息 / reminders
  // tick）都换 onClose ref → 本 effect 在 open=true 时拆 + 装 window keydown
  // listener 一次，open=false 时 early-return 但仍跑一遍 deps 比对。改用 ref
  // 镜像 onClose，effect deps 收紧到 [open, pending] —— 用户在确认弹层期间
  // workspace 后台轮询不再无效拆装事件 listener。
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      // 走查 R148：window keydown 全局监听，dialog 弹起前用户若在背后的
      // 搜索 / 备注 / 笔记 input 里用中/日/韩 IME 拼"删 yu"待选词，Esc 在
      // IME 协议里是"取消候选词"的标准键。这里抢 Esc 关 dialog → 候选词
      // 没被 IME 消费、用户的草稿被丢一截。和 desktop-channels-workspace
      // L633 / desktop-feed-compose-panel L89 同款修法：isComposing=true 时
      // 让 IME 自己吃这下 Esc，候选词退掉后用户再按一次（isComposing=false）
      // 才走 dialog 关闭。
      if (event.isComposing) {
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
      onCloseRef.current();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, pending]);

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
        // 走查电脑端单聊 R107：本 backdrop 是 absolute inset-0 全屏覆盖、纯
        // mouse"点击背景关闭"affordance，视觉上不可见。原本没挂 tabIndex
        // → 它是本 dialog 子树里的第一个 focusable button，用户从「聊天信息」
        // 侧栏点「删除聊天 / 清空记录 / 加入黑名单 / 提交投诉」打开 dialog
        // 后按 Tab，焦点直接落到这张不可见的 backdrop 上 → 用户看不到任何
        // focus ring 也找不到光标，再按 Enter 就被意外触发 onClose 关掉了
        // dialog。键盘用户已经有 Esc keydown 路径关 dialog，无需 Tab 可达
        // 这条 backdrop。tabIndex={-1} 把它从 Tab 序列移出去；mouse 点击
        // 路径 (onClick) 不受影响。
        tabIndex={-1}
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
        className="relative w-full max-w-[520px] overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border-faint)] bg-[color:var(--surface-primary)] shadow-[var(--shadow-overlay)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[color:var(--border-faint)] bg-[color:var(--surface-primary)] px-6 py-4 backdrop-blur-xl">
          <div className="min-w-0">
            <div
              id={titleId}
              className="text-[18px] font-medium text-[color:var(--text-primary)]"
            >
              {title}
            </div>
            <div
              id={descId}
              className="mt-2 text-[length:var(--text-caption)] leading-7 text-[color:var(--text-muted)]"
            >
              {description}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
            aria-label={t(msg`关闭`)}
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-[color:var(--border-faint)] bg-[color:var(--surface-primary)] px-6 py-4 backdrop-blur-xl">
          <Button
            ref={cancelButtonRef}
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={pending}
            className="rounded-[10px] border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-6 shadow-none hover:bg-[color:var(--surface-console)]"
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
                ? "rounded-[10px] bg-[color:var(--state-danger-solid)] px-6 text-[color:var(--text-on-brand)] hover:bg-[color:var(--state-danger-solid)]"
                : "rounded-[10px] bg-[color:var(--brand-primary)] px-6 text-[color:var(--text-on-brand)] hover:opacity-95"
            }
          >
            {pending ? resolvedPendingLabel : resolvedConfirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
