import { Mic, Square, WandSparkles, X } from "lucide-react";
import { cn } from "@yinjie/ui";
import type { SpeechInputStatus } from "../features/chat/speech-input-types";

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
  mode: "dictation" | "voice",
  status: SpeechInputStatus,
  holding: boolean,
  cancelIntent: boolean,
) {
  if (holding) {
    return cancelIntent
      ? "松开手指，取消发送"
      : mode === "voice"
        ? "松开手指，发送语音"
        : "松开手指，转成文字";
  }

  switch (status) {
    case "requesting-permission":
      return "正在请求麦克风权限...";
    case "listening":
      return "继续按住说话";
    case "processing":
      return mode === "voice" ? "正在整理语音..." : "正在转写语音...";
    case "ready":
      return mode === "voice" ? "语音已准备发送" : "识别完成";
    case "error":
      return mode === "voice" ? "语音发送暂时不可用" : "语音输入暂时不可用";
    default:
      return "按住说话";
  }
}

function resolveStatusHint(
  mode: "dictation" | "voice",
  status: SpeechInputStatus,
  holding: boolean,
  cancelIntent: boolean,
) {
  if (holding) {
    return cancelIntent
      ? "向下移回按钮区域，可以继续保留本次语音。"
      : mode === "voice"
        ? "上滑取消，松开后会直接发送这条语音。"
        : "上滑取消，松开后只会转成文字，不会直接发送。";
  }

  switch (status) {
    case "requesting-permission":
      return "第一次使用时，系统可能会弹出麦克风授权。";
    case "listening":
      return "继续按住说话，松开后结束本次输入。";
    case "processing":
      return mode === "voice"
        ? "录音已经结束，正在整理语音文件。"
        : "录音已经结束，正在把语音整理成文字。";
    case "ready":
      return mode === "voice"
        ? "确认后会直接发到当前会话。"
        : "确认后插入输入框，你还可以继续修改。";
    case "error":
      return "可以关闭后重试，或直接切回键盘输入。";
    default:
      return mode === "voice"
        ? "按住录一条语音，松开后就能直接发送。"
        : "识别结果会先停留在这里，等待你决定是否插入。";
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
  if (!open) {
    return null;
  }

  const listening = status === "listening";
  const processing =
    status === "processing" || status === "requesting-permission";
  const title = resolveStatusTitle(mode, status, holding, cancelIntent);
  const hint = resolveStatusHint(mode, status, holding, cancelIntent);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-[calc(env(safe-area-inset-bottom,0px)+88px)] pointer-events-none">
      <button
        type="button"
        className="pointer-events-auto absolute inset-0 bg-transparent"
        aria-label="关闭语音输入面板"
        onClick={onClose}
        disabled={holding}
      />
      <div className="pointer-events-auto relative w-full max-w-[19.5rem]">
        <div className="rounded-[24px] border border-black/8 bg-[rgba(247,247,247,0.96)] px-4 pb-4 pt-3 text-[#111827] shadow-[0_20px_48px_rgba(15,23,42,0.18)] backdrop-blur-xl">
          <div className="flex justify-center pb-2.5">
            <div className="h-1 w-10 rounded-full bg-black/8" />
          </div>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[15px] font-medium tracking-[0.01em] text-[#111827]">
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
              aria-label="关闭"
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
                ? "录音时长会显示在这里。"
                : "识别结果会显示在这里。")}
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
                取消
              </button>
              <button
                type="button"
                onClick={onCommit}
                disabled={!canCommit || processing}
                className="flex h-10 items-center justify-center rounded-[14px] bg-[#07c160] text-[14px] font-medium text-white shadow-[0_6px_16px_rgba(7,193,96,0.18)] transition disabled:opacity-45"
              >
                <span className="inline-flex items-center gap-1.5">
                  <WandSparkles size={15} />
                  {mode === "voice" ? "立即发送" : "插入输入框"}
                </span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
