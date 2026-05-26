import { useEffect, useId, useRef } from "react";
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

  // 走查移动端单聊新一轮 R3：和姊妹 sheet mobile-message-reminder-sheet R3 /
  // mobile-message-action-sheet R3 同款修法 —— onClose 在调用方 chat-composer
  // 是 ternary `mode==="voice" ? cancelMobileSpeech : closeMobileSpeechSheet`，
  // 其中 cancelMobileSpeech 是裸 arrow function（line 719-722，没 useCallback），
  // composer 每个 keystroke / socket tick / typing tick / setQueriesData 都重渲
  // → 每次重渲 onClose 都拿到新 reference → 下面两个 useEffect 的 deps 含 onClose
  // 时每帧都会拆装：android back interceptor 拆掉重注 + window.add/removeEvent-
  // Listener("keydown") 拆掉重挂。语音录制 sheet 在打开时父组件还在频繁重渲（
  // 真实推送 / 心跳 / typing），这层注册抖动纯白消耗。把 onClose 镜像到 ref，
  // effect 只依赖 [open] / [holding, open]，sheet 开着期间只挂一次。
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // 原生壳硬件 Back 键：sheet 打开时优先关 sheet（前提是手指没在按住录音），
  // 不让 BACK 同时 history.back 把用户从聊天页带回 chat list。和
  // mobile-message-action-sheet.tsx 对齐。
  useEffect(() => {
    if (!open || holding) {
      return;
    }
    const unregister = registerAndroidBackInterceptor((event) => {
      event.preventDefault();
      onCloseRef.current();
      return true;
    });
    return unregister;
  }, [holding, open]);

  // 新一轮 R2：和姊妹 sheet（mobile-message-action-sheet R3 / mobile-message-
  // reminder-sheet / message-quote-selection-sheet / mobile-details-action-sheet）
  // 对齐——本 sheet 只接了 Android Back，没挂 ESC。外接键盘 / Bluetooth 键盘
  // 用户 (Android Pixel + Folio / iPad Magic Keyboard / 模拟器全是这场景) 关不
  // 掉只能点 X。holding 时（用户正按住录音）不响应 ESC，跟 Android Back 同语义。
  useEffect(() => {
    if (!open || holding) {
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
  }, [holding, open]);

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
        // 走查移动端单聊新一轮 R3：和姊妹 sheet message-quote-selection-sheet
        // R118 / mobile-message-reminder-sheet R121 / mobile-message-action-sheet
        // 新一轮 R1 同款 —— backdrop <button> 视觉透明（bg-transparent）、纯
        // mouse"点击背景关闭"affordance，但 DOM 顺序排在 sheet 子树第一位。
        // 键盘 / 外接 Bluetooth 键盘用户按 Tab 进 sheet，焦点先落到这张不可见
        // backdrop → 看不到 focus 框 → 误按 Enter 把用户辛苦录到一半的语音
        // 直接 close 掉。挂 tabIndex={-1} 把 backdrop 从 Tab 序列移出；mouse
        // 点击关闭路径不受影响。
        tabIndex={-1}
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
        <div className="rounded-[24px] border border-black/8 bg-[rgba(250,245,237,0.96)] px-4 pb-4 pt-3 text-[color:var(--text-primary)] shadow-[0_20px_48px_rgba(180,130,20,0.18)] backdrop-blur-xl">
          <div className="flex justify-center pb-2.5">
            <div className="h-1 w-10 rounded-full bg-black/8" />
          </div>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div
                id={titleId}
                className="text-[15px] font-medium tracking-[0.01em] text-[color:var(--text-primary)]"
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
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-black/6 bg-[color:var(--surface-card)] text-[#7a7a7a] transition active:bg-[#f1f1f1]",
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
                    ? "border-[#f59e0b]/30 bg-[#f59e0b]"
                    : processing
                      ? "border-black/6 bg-[#f0f1f3] text-[#606266]"
                      : "border-black/6 bg-[color:var(--surface-card)] text-[#f59e0b]",
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
              "mt-4 min-h-[76px] rounded-[20px] border px-4 py-3 text-[13px] leading-6",
              text
                ? "border-black/6 bg-[color:var(--surface-card)] text-[color:var(--text-primary)]"
                : "border-black/6 bg-[rgba(255,255,255,0.72)] text-[#a3a3a3]",
            )}
          >
            {text ||
              (mode === "voice"
                ? t(msg`录音时长会显示在这里。`)
                : t(msg`识别结果会显示在这里。`))}
          </div>

          {error ? (
            <div className="mt-3 rounded-[16px] border border-[#ffb4b2] bg-[#fff3f3] px-3 py-2 text-[11px] leading-5 text-[#d74b45]">
              {error}
            </div>
          ) : null}

          {!holding ? (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="flex h-10 items-center justify-center rounded-[16px] border border-black/6 bg-[color:var(--surface-card)] text-[14px] font-medium text-[#606266] transition active:bg-[#f1f1f1]"
              >
                {t(msg`取消`)}
              </button>
              <button
                type="button"
                onClick={onCommit}
                disabled={!canCommit || processing}
                className="flex h-10 items-center justify-center rounded-full bg-[#f59e0b] text-[14px] font-medium text-[#3b2206] shadow-[0_6px_16px_rgba(245,158,11,0.18)] transition disabled:opacity-45"
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
