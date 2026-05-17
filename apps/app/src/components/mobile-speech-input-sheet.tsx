import { useEffect, useId } from "react";
import { Mic, Square, WandSparkles, X } from "lucide-react";
import { msg } from "@lingui/macro";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { cn } from "@yinjie/ui";
import type { SpeechInputStatus } from "../features/chat/speech-input-types";
import { registerAndroidBackInterceptor } from "../runtime/android-back-button";

type Translator = ReturnType<typeof useRuntimeTranslator>;

type MobileSpeechInputSheetProps = {
  open: boolean;
  status: SpeechInputStatus;
  text: string;
  error?: string | null;
  holding: boolean;
  cancelIntent: boolean;
  mode?: "dictation" | "voice";
  onClose: () => void;
  onCancel: () => void;
  onCommit: () => void;
  canCommit: boolean;
};

function resolveStatusTitle(
  t: Translator,
  mode: "dictation" | "voice",
  status: SpeechInputStatus,
  holding: boolean,
  cancelIntent: boolean,
) {
  if (holding) {
    return cancelIntent
      ? t(msg`松开手指，取消发送`)
      : mode === "voice"
        ? t(msg`松开手指，发送语音`)
        : t(msg`松开手指，转成文字`);
  }

  switch (status) {
    case "requesting-permission":
      return t(msg`正在请求麦克风权限...`);
    case "listening":
      return t(msg`继续按住说话`);
    case "processing":
      return mode === "voice"
        ? t(msg`正在整理语音...`)
        : t(msg`正在转写语音...`);
    case "ready":
      return mode === "voice" ? t(msg`语音已准备发送`) : t(msg`识别完成`);
    case "error":
      return mode === "voice"
        ? t(msg`语音发送暂时不可用`)
        : t(msg`语音输入暂时不可用`);
    default:
      return t(msg`按住说话`);
  }
}

function resolveStatusHint(
  t: Translator,
  mode: "dictation" | "voice",
  status: SpeechInputStatus,
  holding: boolean,
  cancelIntent: boolean,
) {
  if (holding) {
    return cancelIntent
      ? t(msg`向下移回按钮区域，可以继续保留本次语音。`)
      : mode === "voice"
        ? t(msg`上滑取消，松开后会直接发送这条语音。`)
        : t(msg`上滑取消，松开后只会转成文字，不会直接发送。`);
  }

  switch (status) {
    case "requesting-permission":
      return t(msg`第一次使用时，系统可能会弹出麦克风授权。`);
    case "listening":
      return t(msg`继续按住说话，松开后结束本次输入。`);
    case "processing":
      return mode === "voice"
        ? t(msg`录音已经结束，正在整理语音文件。`)
        : t(msg`录音已经结束，正在把语音整理成文字。`);
    case "ready":
      return mode === "voice"
        ? t(msg`确认后会直接发到当前会话。`)
        : t(msg`确认后插入输入框，你还可以继续修改。`);
    case "error":
      return t(msg`可以关闭后重试，或直接切回键盘输入。`);
    default:
      return mode === "voice"
        ? t(msg`按住录一条语音，松开后就能直接发送。`)
        : t(msg`识别结果会先停留在这里，等待你决定是否插入。`);
  }
}

export function MobileSpeechInputSheet({
  open,
  status,
  text,
  error,
  holding,
  cancelIntent,
  mode = "dictation",
  onClose,
  onCancel,
  onCommit,
  canCommit,
}: MobileSpeechInputSheetProps) {
  const t = useRuntimeTranslator();
  const titleId = useId();

  // 原生壳硬件 Back 键：sheet 打开时优先关 sheet（前提是手指没在按住录音），
  // 不让 BACK 同时 history.back 把用户从聊天页带回 chat list。和
  // mobile-message-action-sheet.tsx 对齐。
  useEffect(() => {
    if (!open || holding) {
      return;
    }
    const unregister = registerAndroidBackInterceptor((event) => {
      event.preventDefault();
      onClose();
      return true;
    });
    return unregister;
  }, [holding, onClose, open]);

  if (!open) {
    return null;
  }

  const listening = status === "listening";
  const processing =
    status === "processing" || status === "requesting-permission";
  const title = resolveStatusTitle(t, mode, status, holding, cancelIntent);
  const hint = resolveStatusHint(t, mode, status, holding, cancelIntent);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-[calc(env(safe-area-inset-bottom,0px)+88px)] pointer-events-none">
      <button
        type="button"
        className="pointer-events-auto absolute inset-0 bg-transparent"
        aria-label={t(msg`关闭语音输入面板`)}
        onClick={onClose}
        disabled={holding}
      />
      {/* 走查新一轮 R4：和姊妹 sheet mobile-message-action-sheet.tsx
          / mobile-message-reminder-sheet.tsx / message-quote-selection-sheet.tsx
          同款 a11y 缺漏——按住底部 mic 按钮打开的语音输入 sheet 没挂
          role="dialog" + aria-modal + aria-labelledby。盲人用户按住录音
          后屏幕阅读器（iOS VoiceOver / Android TalkBack）只能念到 status
          icon 旁的状态行，听不到 sheet 整体作为 modal 的语义；title 也
          没接 aria-labelledby，新进焦点的时候 SR 不会念出 sheet 标题。
          补 dialog 语义，title 文本节点接 id。 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="pointer-events-auto relative w-full max-w-[19.5rem]"
      >
        <div className="rounded-[24px] border border-black/8 bg-[rgba(247,247,247,0.96)] px-4 pb-4 pt-3 text-[#111827] shadow-[0_20px_48px_rgba(15,23,42,0.18)] backdrop-blur-xl">
          <div className="flex justify-center pb-2.5">
            <div className="h-1 w-10 rounded-full bg-black/8" />
          </div>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div
                id={titleId}
                className="text-[15px] font-medium tracking-[0.01em] text-[#111827]"
              >
                {title}
              </div>
              <div className="mt-1 text-[11px] leading-5 text-[#7a7a7a]">
                {hint}
              </div>
            </div>
            <button
              type="button"
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-black/6 bg-white text-[#7a7a7a] transition active:bg-[#f1f1f1]",
                holding ? "pointer-events-none opacity-0" : "opacity-100",
              )}
              onClick={onClose}
              disabled={holding}
              aria-label={t(msg`关闭`)}
            >
              <X size={16} />
            </button>
          </div>

          <div className="mt-5 flex items-center justify-center">
            <div
              className={cn(
                "flex h-[76px] w-[76px] items-center justify-center rounded-full border text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.32)] transition",
                holding && cancelIntent
                  ? "border-[#ff7875]/36 bg-[#ef4444]"
                  : listening || holding
                    ? "border-[#07c160]/30 bg-[#07c160]"
                    : processing
                      ? "border-black/6 bg-[#f0f1f3] text-[#606266]"
                      : "border-black/6 bg-white text-[#07c160]",
              )}
            >
              {processing ? (
                <WandSparkles size={28} />
              ) : listening || holding ? (
                cancelIntent ? (
                  <X size={30} />
                ) : (
                  <Mic size={30} />
                )
              ) : status === "ready" ? (
                <Square size={24} fill="currentColor" />
              ) : (
                <Mic size={30} />
              )}
            </div>
          </div>

          <div
            className={cn(
              "mt-4 min-h-[76px] rounded-[18px] border px-4 py-3 text-[13px] leading-6",
              text
                ? "border-black/6 bg-white text-[#111827]"
                : "border-black/6 bg-[rgba(255,255,255,0.72)] text-[#a3a3a3]",
            )}
          >
            {text ||
              (mode === "voice"
                ? t(msg`录音时长会显示在这里。`)
                : t(msg`识别结果会显示在这里。`))}
          </div>

          {error ? (
            <div className="mt-3 rounded-[14px] border border-[#ffb4b2] bg-[#fff3f3] px-3 py-2 text-[11px] leading-5 text-[#d74b45]">
              {error}
            </div>
          ) : null}

          {!holding ? (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="flex h-10 items-center justify-center rounded-[14px] border border-black/6 bg-white text-[14px] font-medium text-[#606266] transition active:bg-[#f1f1f1]"
              >
                {t(msg`取消`)}
              </button>
              <button
                type="button"
                onClick={onCommit}
                disabled={!canCommit || processing}
                className="flex h-10 items-center justify-center rounded-[14px] bg-[#07c160] text-[14px] font-medium text-white shadow-[0_6px_16px_rgba(7,193,96,0.18)] transition disabled:opacity-45"
              >
                <span className="inline-flex items-center gap-1.5">
                  <WandSparkles size={15} />
                  {mode === "voice" ? t(msg`立即发送`) : t(msg`插入输入框`)}
                </span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
