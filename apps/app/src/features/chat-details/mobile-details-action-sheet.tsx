import { useCallback, useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { registerAndroidBackInterceptor } from "../../runtime/android-back-button";

type MobileDetailsActionSheetAction = {
  key: string;
  label: ReactNode;
  description?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
};

type MobileDetailsActionSheetProps = {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  actions: MobileDetailsActionSheetAction[];
  cancelLabel?: ReactNode;
  onClose: () => void;
};

export function MobileDetailsActionSheet({
  open,
  title,
  description,
  actions,
  cancelLabel,
  onClose,
}: MobileDetailsActionSheetProps) {
  const t = translateRuntimeMessage;
  const titleId = useId();
  const descriptionId = useId();
  // 走查新会话 R2：和姊妹 mobile-message-action-sheet.tsx（commit 30f58a286 R2）
  // 同款修法——sheet 上每条 action 按钮在父组件那边都靠 `setXxxOpen(false)` 关
  // sheet，但 React state 要等 commit 才能让 sheet 卸载——同帧 <16ms 第二次
  // click 时 sheet 还在 DOM 里，第二次 onClick 照样跑。
  // 群聊「群管理」sheet 4 个 action（添加成员 / 移除成员 / 编辑群公告 / 查看群
  // 二维码）都是 `setOpen(false); void navigate({...})` 形态，同帧双击会推 2
  // 条相同 history 项，用户点返回要按 2 次才能退出。danger sheet 的 confirm
  // 按钮虽然父级有 dangerActionBusyRef 兜底，但加这层 internal guard 是冗余
  // 防线（不冲突）。统一在 sheet 内部任何 action 点过就 guard 住所有后续 action。
  const actionFiredRef = useRef(false);
  useEffect(() => {
    if (open) {
      actionFiredRef.current = false;
    }
  }, [open]);
  const guardAction = useCallback((handler: () => void) => {
    return () => {
      if (actionFiredRef.current) return;
      actionFiredRef.current = true;
      handler();
    };
  }, []);

  // 走查 2026-05-18 移动端群聊 R5：和姊妹 sheet mobile-message-reminder-sheet R3
  // / mobile-mention-picker-sheet R3 / group-message-context-menu R4 / mobile-
  // message-action-sheet R3 同款修法——下方 back/Esc 两个 effect 原本把 onClose
  // 列进 deps，但所有调用方（group-chat-details-page 1207/1291 / group-member-
  // picker-page 884 / chat-details-page 等）都是 inline arrow `onClose={() =>
  // setXxxOpen(false)}`，父帧 React state 任意变化（confirm按钮 hover / 父级
  // re-render）都让 effect 拆装：
  // - back 拦截：registerAndroidBackInterceptor → unregister 操作 native bridge
  //   注册表，sheet 还开着的时候每次父 re-render 就拆装一次原生注册。
  // - Esc：window.removeEventListener / addEventListener("keydown") 每次拆装。
  // 镜像 onCloseRef，deps 收紧到 [open]，sheet 开着期间只挂一次。
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // 原生壳硬件 Back 键：sheet 打开时先关 sheet，不让 BACK 同时 history.back
  // 把用户从 chat-details / group-chat-details / group-member-picker 带回上
  // 一级。和 mobile-message-action-sheet.tsx 对齐。
  useEffect(() => {
    if (!open) {
      return;
    }
    const unregister = registerAndroidBackInterceptor((event) => {
      event.preventDefault();
      onCloseRef.current();
      return true;
    });
    return unregister;
  }, [open]);

  // 走查 Round 1：sheet 打开时按 Esc 没反应——桌面 web / 模拟器 / 自动化都拍不
  // 掉。这里加一个 keydown 监听，open 才挂，避免每次渲染都注册。
  //
  // 走查移动端群聊本会话 R7：和姊妹 sheet mobile-message-action-sheet R2 /
  // mobile-mention-picker-sheet R6 / group-message-context-menu R7 一致补
  // defaultPrevented 让位——本 sheet 经常作"群管理"父 sheet 套"退出群聊确认"
  // 子 sheet 用（group-chat-details-page line 1203/1287），子 sheet 处理掉
  // ESC 后 event.defaultPrevented=true，父 sheet 这里漏检会照样 onClose 把父
  // sheet 也关掉。视觉表现是用户在确认 sheet 上按 ESC 直接连关 2 层、回到
  // details 失去"我刚要退群"的上下文。对齐 3 个姊妹 sheet 的 defaultPrevented
  // 守。
  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }
      event.preventDefault();
      onCloseRef.current();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  // Fresh 走查 R11：sheet 打开时 character-detail / chat-details / group-chat-
  // details 等父页底层全部仍可被 Tab/SR——deep probe 验证 /character/$id 上音视频
  // 通话 sheet 打开后 15 个 focusable blockedByInert=0：Profile 行 (Remark/Tags/
  // Moments/Recommend/Star/Reply with voice/Block/Delete contact) + 底部 Message
  // / 音视频通话 按钮 全部 phantom 焦点。aria-modal 不强制 trap。修法：sheet 自身
  // portal 到 body，并 effect 期间把所有 body 兄弟节点挂 inert。close 时一并恢复。
  const portalRef = useRef<HTMLDivElement | null>(null);
  if (!portalRef.current && typeof document !== 'undefined') {
    portalRef.current = document.createElement('div');
    portalRef.current.setAttribute('data-mobile-details-action-sheet', '');
  }
  useEffect(() => {
    const el = portalRef.current;
    if (!el || typeof document === 'undefined') return;
    document.body.appendChild(el);
    return () => {
      if (el.parentNode) el.parentNode.removeChild(el);
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    const root = document.body;
    const portalEl = portalRef.current;
    const toggled: Array<{ el: HTMLElement; hadInert: boolean; hadAriaHidden: string | null }> = [];
    for (const child of Array.from(root.children) as HTMLElement[]) {
      if (portalEl && (child === portalEl || child.contains(portalEl))) continue;
      // 跳过 <script> 等不需要 inert 的节点，主要锁 React root 容器
      if (child.tagName === 'SCRIPT' || child.tagName === 'NOSCRIPT') continue;
      toggled.push({
        el: child,
        hadInert: child.hasAttribute('inert'),
        hadAriaHidden: child.getAttribute('aria-hidden'),
      });
      child.setAttribute('inert', '');
      child.setAttribute('aria-hidden', 'true');
    }
    return () => {
      for (const { el, hadInert, hadAriaHidden } of toggled) {
        if (!hadInert) el.removeAttribute('inert');
        if (hadAriaHidden === null) {
          el.removeAttribute('aria-hidden');
        } else {
          el.setAttribute('aria-hidden', hadAriaHidden);
        }
      }
    };
  }, [open]);

  if (!open || !portalRef.current) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50 bg-[rgba(180,130,20,0.14)]">
      <button
        type="button"
        className="absolute inset-0"
        aria-label={t(msg`关闭操作菜单`)}
        onClick={onClose}
      />
      {/* 走查 R(re)1：sheet 没有 role="dialog" / aria-modal / aria-labelledby，
          屏幕阅读器（iOS VoiceOver / Android TalkBack）不会把它当 modal 念，
          盲人用户从 character-detail 进来后听不到「音视频通话/加入黑名单/删除联系人」
          这些 sheet 标题，只听到"按钮 取消"。和 desktop-chat-history-dialog 对齐补全。 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className="absolute inset-x-0 bottom-0 overflow-hidden rounded-t-[18px] border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] pt-1.5 shadow-[0_-14px_28px_rgba(180,130,20,0.10)]"
      >
        <div className="flex justify-center pb-1">
          <div className="h-1 w-9 rounded-full bg-[rgba(148,163,184,0.45)]" />
        </div>

        <div className="overflow-hidden rounded-[16px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)]">
          <div className="border-b border-[color:var(--border-subtle)] px-5 py-2.5 text-center">
            <div
              id={titleId}
              className="text-[14px] font-medium text-[color:var(--text-primary)]"
            >
              {title}
            </div>
            {description ? (
              <div
                id={descriptionId}
                className="mt-0.5 text-[11px] leading-[18px] text-[#8c8c8c]"
              >
                {description}
              </div>
            ) : null}
          </div>

          {actions.map((action, index) => (
            <button
              key={action.key}
              type="button"
              onClick={guardAction(action.onClick)}
              disabled={action.disabled}
              className={`flex min-h-[48px] w-full flex-col items-center justify-center px-5 py-2 text-center transition active:bg-[color:var(--surface-card-hover)] ${
                index > 0 ? "border-t border-[color:var(--border-subtle)]" : ""
              } ${action.danger ? "text-[#d74b45]" : "text-[color:var(--text-primary)]"} ${
                action.disabled ? "opacity-45" : ""
              }`}
            >
              <span className="text-[15px] leading-6">{action.label}</span>
              {action.description ? (
                <span
                  className={`mt-0.5 text-[11px] leading-[18px] ${
                    action.danger ? "text-[#e28a84]" : "text-[#8c8c8c]"
                  }`}
                >
                  {action.description}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-2 flex h-10 w-full items-center justify-center rounded-[16px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] text-[15px] font-medium text-[color:var(--text-primary)] transition active:bg-[color:var(--surface-card-hover)]"
        >
          {cancelLabel ?? t(msg`取消`)}
        </button>
      </div>
    </div>,
    portalRef.current,
  );
}
