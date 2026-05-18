import type { KeyboardEvent, Ref } from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { Button, cn } from "@yinjie/ui";

const t = translateRuntimeMessage;

type MomentCommentComposerProps = {
  value: string;
  placeholder: string;
  pending?: boolean;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  buttonClassName?: string;
  inputRef?: Ref<HTMLTextAreaElement>;
  /**
   * 评论硬上限。默认 500 与服务端 MAX_COMMENT_TEXT_LENGTH 对齐 —— 之前桌面
   * 端 composer 没卡，用户能打 1k 字按发送→服务端 400 反弹「评论最多 500 字」，
   * 中间几百毫秒空窗用户以为是网络抽风。移动端 wechat-comment-bar 已经卡了。
   */
  maxLength?: number;
  submitLabel?: string;
  pendingLabel?: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

export function MomentCommentComposer({
  value,
  placeholder,
  pending = false,
  disabled = false,
  className,
  inputClassName,
  buttonClassName,
  inputRef,
  maxLength = 500,
  submitLabel = t(msg`发送`),
  pendingLabel = t(msg`发送中...`),
  onChange,
  onSubmit,
}: MomentCommentComposerProps) {
  const canSubmit = Boolean(value.trim()) && !pending && !disabled;

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }
    // 走查新 R3：跟 wechat-comment-bar R3 (bb9f3bda) / mobile-feed-publish R5
    // / desktop-feed-compose-panel R1 同款 IME 兜底——Android Chrome 上搜狗 /
    // 百度 输入法在 composing 期间按 Enter 选词时，nativeEvent.isComposing 不
    // 一定置 true，只有 keyCode 走 229 信号。原本只看 isComposing 漏了 keyCode
    // 这一支，中文用户敲拼音回车选词时半句被当评论提交，桌面广场 / 桌面朋友圈
    // / 移动朋友圈 comment composer 都受影响（mobile 广场 evt 走 wechat-comment-
    // bar 不走这里）。补 keyCode=229 双判定。
    if (
      event.nativeEvent.isComposing ||
      event.nativeEvent.keyCode === 229
    ) {
      return;
    }

    event.preventDefault();
    if (canSubmit) {
      onSubmit();
    }
  }

  return (
    <div className={cn("flex min-w-0 flex-1 items-end gap-2", className)}>
      <textarea
        ref={inputRef}
        rows={1}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label={t(msg`评论内容`)}
        disabled={disabled}
        maxLength={maxLength}
        inputMode="text"
        enterKeyHint="send"
        autoComplete="off"
        className={cn(
          "min-h-9 max-h-24 min-w-0 flex-1 resize-none rounded-[18px] border border-[color:var(--border-faint)] bg-white px-3 py-2 text-[16px] leading-5 text-[color:var(--text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] outline-none transition-[border-color,background-color,box-shadow] placeholder:text-[color:var(--text-dim)] focus:border-[color:var(--border-brand)] focus:shadow-[var(--shadow-focus)]",
          inputClassName,
        )}
      />
      <Button
        type="button"
        disabled={!canSubmit}
        onClick={onSubmit}
        variant="primary"
        size="sm"
        className={cn("h-9 shrink-0 px-3 text-[12px]", buttonClassName)}
      >
        {pending ? pendingLabel : submitLabel}
      </Button>
    </div>
  );
}
