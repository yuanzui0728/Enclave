import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { msg } from "@lingui/macro";
import { X } from "lucide-react";
import { Button, TextAreaField, TextField } from "@yinjie/ui";
import { translateRuntimeMessage } from "@yinjie/i18n";

type DesktopChatTextEditDialogProps = {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  placeholder?: string;
  initialValue: string;
  submitLabel?: ReactNode;
  closeLabel?: string;
  multiline?: boolean;
  emptyAllowed?: boolean;
  pending?: boolean;
  onClose: () => void;
  onConfirm: (value: string) => void;
};

export function DesktopChatTextEditDialog({
  open,
  title,
  description,
  placeholder,
  initialValue,
  submitLabel,
  closeLabel,
  multiline = false,
  emptyAllowed = false,
  pending = false,
  onClose,
  onConfirm,
}: DesktopChatTextEditDialogProps) {
  const t = translateRuntimeMessage;
  const [draft, setDraft] = useState(initialValue);
  const titleId = useId();
  const descId = useId();

  // 走查电脑端群聊 R4：原版 useEffect deps=[initialValue, open]，凡 parent
  // 重传 initialValue（即便没改 open=true 状态）都会 setDraft(initialValue)
  // 覆盖用户当前正在编辑的内容。GroupChatDetailsPanel 里 initialValue 计算式
  // 是 `group?.name ?? conversation.title` / `group?.announcement ?? ""` /
  // `ownerMember?.memberName ?? ""`—— group/membersQuery 60s 轮询完成 +
  // socket conversation_updated 触发 invalidate 都让 parent 用最新数据重渲，
  // initialValue 跟着换引用 / 字符串值。极端时序：用户开「群聊名称」编辑，
  // 刚打"新群名 v2"还没确认，后台 groupQuery 拉到一份 canonical group.name
  // → parent 重传 initialValue=group.name → 本 effect 跑 setDraft(group.name)
  // → 用户的草稿被清掉。
  //
  // 改成"用户改过没"作 gate：用户敲过键盘后 hasUserEditedRef=true，后续
  // initialValue 变化跳过 setDraft；用户没碰过时 initialValue 变化允许 sync
  // （兜底 panel 打开瞬间数据还没回来 initialValue=""，等 600ms RTT 拉到
  // "Andy" 时仍能填上）。close 时 ref 回 false，下次重开重新 seed。
  const hasUserEditedRef = useRef(false);
  useEffect(() => {
    if (!open) {
      hasUserEditedRef.current = false;
      return;
    }

    if (hasUserEditedRef.current) {
      return;
    }
    setDraft(initialValue);
  }, [initialValue, open]);
  const handleDraftChange = (value: string) => {
    hasUserEditedRef.current = true;
    setDraft(value);
  };

  // R11：和姊妹 desktop-chat-confirm-dialog R11 / 移动端 R3 (c422bc945) 同款
  // —— inline arrow onClose 让 effect 在 parent 每次重渲染时拆装 keydown
  // listener。本 dialog 是「聊天信息」改备注 / 标签时的编辑器，details panel
  // 内 conversationsQuery / characterQuery / friendsQuery 都 15s staleTime
  // refetch，弹层显示期间至少跑 3 份 polling → 每帧 onClose 引用换 → 拆装
  // listener。ref 镜像 onClose，deps 收紧到 [open, pending]。
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
      // 走查 R148：本 dialog 是改备注 / 群名称 / 群公告 / 群昵称的编辑器，
      // 内嵌 TextField/TextAreaField，正是 IME composition 的高发区——用户
      // 拼"新备 bei"还在候选词阶段按 Esc 想退候选 → 抢 Esc 关 dialog，半截
      // 中文草稿丢失。先让 IME 吃 Esc，候选词退后再按一次才关弹层。和
      // desktop-channels-workspace L633 / desktop-feed-compose-panel L89 同
      // 款修法。
      if (event.isComposing) {
        return;
      }

      // 走查电脑端群聊 R5：原版 pending 时直接 early return 让 Esc 透传——
      // workspace queueMicrotask 兜底看到 event.defaultPrevented=false 仍
      // 跑 dismissSidePanel，把背后的"聊天信息"侧栏偷关掉，而本 dialog 因为
      // pending 不会真关，用户看到的是"按 Esc 没关弹窗倒把侧栏弄没了"。
      // pending 期间仍 preventDefault + stopPropagation 把 Esc 消费掉，让
      // workspace 不去 dismiss；mutation 落地后用户可以再按 Esc 真关。
      event.preventDefault();
      event.stopPropagation();
      if (pending) {
        return;
      }
      // 与 desktop-chat-confirm-dialog 同：Esc 关弹窗就够了，再让它冒泡到
      // workspace 的 dismissSidePanel 会同时关掉背后的详情侧栏。
      onCloseRef.current();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, pending]);

  // 走查桌面端群聊 R2：和 DesktopChatConfirmDialog R4 同款问题——「保存」按钮
  // / Enter 提交都只靠 `disabled={confirmDisabled}`，confirmDisabled 含
  // `pending`，pending 是 parent useMutation.isPending React state，要等 commit
  // 才进 DOM。同帧双击 / 双 Enter 都看到 false → parent updateGroupMutation /
  // updateNicknameMutation.mutate() 飞 2 次。updateGroup PATCH 服务端虽幂等
  // 不会改坏数据但浪费公网 RTT；onConfirm 闭包里同时 invalidate 多份 cache，
  // 第二次 invalidate 撞上正在跑的第一次会强行打断、再触发一次额外 GET。
  // 加 sync ref 锁同帧；pending 翻 false（success/error）后 useEffect 复位。
  const submittingRef = useRef(false);
  useEffect(() => {
    if (!pending) {
      submittingRef.current = false;
    }
  }, [pending]);

  if (!open) {
    return null;
  }

  const normalizedDraft = draft.trim();
  const normalizedInitialValue = initialValue.trim();
  const confirmDisabled =
    pending ||
    (!emptyAllowed && normalizedDraft.length === 0) ||
    normalizedDraft === normalizedInitialValue;
  const handleConfirm = () => {
    if (confirmDisabled || submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    onConfirm(normalizedDraft);
  };
  const effectiveSubmitLabel = submitLabel ?? t(msg`保存`);
  const effectiveCloseLabel = closeLabel ?? t(msg`关闭弹层`);

  return (
    // 走查新一轮 R12：和 confirm-dialog 同款 portal-shield。本 text-edit
    // dialog 多数情况下是从「聊天信息」侧栏点群名称 / 我的群昵称 / 群公告
    // 弹出。用户在 dialog 里点取消 / 确认 / X / backdrop 时，workspace
    // pointerdown capture 兜底会偷把背后的侧栏关掉。Esc 路径已经在
    // R2 里 stopPropagation 解决；这里给 pointer 路径加 shield。
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(17,24,39,0.28)] p-6 backdrop-blur-[3px]"
      data-yj-portal-shield="desktop-chat-text-edit-dialog"
    >
      <button
        type="button"
        aria-label={effectiveCloseLabel}
        onClick={() => {
          if (!pending) {
            onClose();
          }
        }}
        // 走查电脑端单聊 R109：和姊妹 R107/R108 同款 —— backdrop <button>
        // (absolute inset-0) 视觉不可见、纯 mouse"点击背景关闭"affordance，
        // 但 DOM 顺序在 dialog 子树第一位。用户从「聊天信息」侧栏改备注 / 标签
        // 打开 dialog 后按 Tab → 焦点先落到这张不可见 backdrop → 再按 Enter
        // dialog 秒关 / 用户半途打的备注被丢。Esc keydown 已挂，键盘用户走 Esc。
        tabIndex={-1}
        className="absolute inset-0"
      />

      {/* 走查 R2：和姊妹 feature-unavailable-dialog / mobile-message-reminder-sheet
          等修过的 a11y 缺漏同款——这是个 modal（backdrop 关闭 / 屏幕居中 /
          Esc 关），但 panel 既没挂 role="dialog" + aria-modal，也没挂
          aria-labelledby / aria-describedby。单聊「聊天信息」改备注/标签时
          会弹这个 dialog，盲人用户屏幕阅读器只听到「关闭提示 按钮」+ 输入框，
          听不到 title 「设置备注」/ description「备注名会优先显示在聊天信息
          和通讯录里」。补 dialog 语义；title/description 通过 useId 挂出
          稳定 id，打开瞬间 SR 把两段都念出来。 */}
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className="relative w-full max-w-[560px] overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)]/96 shadow-[var(--shadow-overlay)]"
        onSubmit={(event) => {
          event.preventDefault();
          handleConfirm();
        }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[color:var(--border-faint)] bg-[color:var(--surface-card)]/78 px-6 py-4 backdrop-blur-xl">
          <div className="min-w-0">
            <div
              id={titleId}
              className="text-[18px] font-medium text-[color:var(--text-primary)]"
            >
              {title}
            </div>
            {description ? (
              <div
                id={descId}
                className="mt-1 text-[length:var(--text-caption)] leading-6 text-[color:var(--text-muted)]"
              >
                {description}
              </div>
            ) : null}
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

        <div className="space-y-4 bg-[rgba(255,255,255,0.62)] px-6 py-6">
          {multiline ? (
            <TextAreaField
              autoFocus
              value={draft}
              onChange={(event) => handleDraftChange(event.target.value)}
              placeholder={placeholder}
              // 走查 R76：原版只挂 placeholder，SR (NVDA/JAWS) 多数实现在
              // 用户开始打字后就不再朗读 placeholder。本 dialog 是单聊「聊天
              // 信息」改备注/标签/群公告/群昵称的入口，盲人用户 focus 进
              // 输入框时只听到「编辑栏」+ dialog 顶部 aria-labelledby title
              // （比如"设置备注"），但 dialog 还有 description 副标，且
              // input 自身没 label 时 SR 朗读不稳定。aria-labelledby 引到
              // dialog title 节点 id，复用已存在的 stable id。
              aria-labelledby={titleId}
              rows={6}
              disabled={pending}
              className="min-h-[180px] resize-none rounded-[var(--radius-sm)] border-[color:var(--border-faint)] bg-[color:var(--surface-card)] shadow-none"
            />
          ) : (
            <TextField
              autoFocus
              value={draft}
              onChange={(event) => handleDraftChange(event.target.value)}
              placeholder={placeholder}
              aria-labelledby={titleId}
              disabled={pending}
              className="rounded-[10px] border-[color:var(--border-faint)] bg-[color:var(--surface-card)] shadow-none"
            />
          )}

          <div className="flex items-center justify-between gap-3 text-[length:var(--text-caption)] text-[color:var(--text-muted)]">
            <span>
              {emptyAllowed ? t(msg`可留空保存`) : t(msg`内容不能为空`)}
            </span>
            <span>{t(msg`${normalizedDraft.length} 字`)}</span>
          </div>

          <div className="flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={pending}
              className="rounded-[10px] border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-6 shadow-none hover:bg-[color:var(--surface-console)]"
            >
              {t(msg`取消`)}
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={confirmDisabled}
              className="rounded-[10px] bg-[color:var(--brand-primary)] px-6 text-[color:var(--text-on-brand)] hover:opacity-95"
            >
              {pending ? t(msg`正在保存...`) : effectiveSubmitLabel}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
