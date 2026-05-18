import { useEffect, useId } from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { AvatarChip } from "../../components/avatar-chip";
import { registerAndroidBackInterceptor } from "../../runtime/android-back-button";

const t = translateRuntimeMessage;

type MentionCandidate = {
  id: string;
  name: string;
  subtitle?: string;
  avatar?: string | null;
};

type MobileMentionPickerSheetProps = {
  open: boolean;
  candidates: MentionCandidate[];
  keyboardInset?: number;
  onClose: () => void;
  onSelect: (candidate: MentionCandidate) => void;
};

export function MobileMentionPickerSheet({
  open,
  candidates,
  keyboardInset = 0,
  onClose,
  onSelect,
}: MobileMentionPickerSheetProps) {
  const headingId = useId();
  // 原生壳硬件 Back 键：sheet 打开时优先关 sheet，不让 BACK 同时 history.back
  // 把用户从群聊页带回 chat list。和 mobile-message-action-sheet.tsx 对齐。
  useEffect(() => {
    if (!open) {
      return;
    }
    const unregister = registerAndroidBackInterceptor((event) => {
      event.preventDefault();
      onClose();
      return true;
    });
    return unregister;
  }, [open, onClose]);

  // 走查 R6：和姊妹 sheet mobile-message-action-sheet 走查 R2 /
  // mobile-message-reminder-sheet / message-quote-selection-sheet 同款 ESC
  // 兜底——群聊里打 @ 弹出 mention picker 时，桌面 web / 外接键盘用户拍 ESC
  // 没反应，只能点 backdrop / 取消按钮。defaultPrevented 时让位（嵌套子模态
  // 自己的 ESC 语义不被偷掉）。
  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-[rgba(15,23,42,0.14)]">
      <button
        type="button"
        className="absolute inset-0"
        // 走查新一轮 R3：原文案"关闭选择提醒成员面板"和下方标题"选择要提醒的人"
        // 不一致——盲人用户先听到 backdrop 的"选择提醒成员"，进 sheet 又听"要
        // 提醒的人"，两个用词指向同一动作但语感冲突。统一成"提醒群成员"。
        aria-label={t(msg`关闭提醒群成员面板`)}
        onClick={onClose}
      />
      {/* 走查新一轮 R3：和 mobile-details-action-sheet R(re)1 / mobile-message-
          action-sheet 新一轮 R2 同款 a11y 问题——没挂 role="dialog" + aria-modal
          + aria-labelledby，VoiceOver/TalkBack 把这条 bottom sheet 当普通滚动
          列表念，盲人群聊里打 @ 后听不到"提醒群成员 / 选择要提醒的人"提示，
          直接念到第一个候选。补 dialog 语义 + headingId 关联。*/}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="absolute inset-x-0 overflow-hidden rounded-t-[20px] border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] pt-2 shadow-[0_-14px_28px_rgba(15,23,42,0.10)]"
        style={{ bottom: keyboardInset > 0 ? `${keyboardInset}px` : 0 }}
      >
        <div className="flex justify-center pb-1.5">
          <div className="h-1 w-10 rounded-full bg-[rgba(148,163,184,0.45)]" />
        </div>
        <div className="px-4 pb-2">
          <div className="text-[10px] uppercase tracking-[0.1em] text-[color:var(--text-dim)]">
            {t(msg`群成员`)}
          </div>
          <div
            id={headingId}
            className="mt-1 text-[13px] font-medium text-[#111827]"
          >
            {t(msg`选择要提醒的人`)}
          </div>
        </div>
        <div className="mx-3 max-h-[46vh] overflow-auto rounded-[14px] border border-[color:var(--border-subtle)] bg-white">
          {candidates.map((candidate, index) => (
            <button
              key={candidate.id}
              type="button"
              onClick={() => onSelect(candidate)}
              className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition active:bg-[color:var(--surface-card-hover)] ${
                index > 0
                  ? "border-t border-[color:var(--border-subtle)]"
                  : ""
              }`}
            >
              <AvatarChip
                name={candidate.name}
                src={candidate.avatar}
                size="wechat"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] text-[#111827]">
                  {candidate.name}
                </div>
                {candidate.subtitle ? (
                  <div className="mt-0.5 truncate text-[10px] text-[#8c8c8c]">
                    {candidate.subtitle}
                  </div>
                ) : null}
              </div>
            </button>
          ))}
        </div>
        <div className="px-3 pt-2.5">
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-full items-center justify-center rounded-[14px] border border-[color:var(--border-subtle)] bg-white text-[15px] font-medium text-[#111827] transition active:bg-[color:var(--surface-card-hover)]"
          >
            {t(msg`取消`)}
          </button>
        </div>
      </div>
    </div>
  );
}
