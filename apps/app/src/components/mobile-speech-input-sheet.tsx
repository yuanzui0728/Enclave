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
  onClose: () => void;
  onCancel: () => void;
  onCommit: () => void;
  canCommit: boolean;
};

function resolveStatusTitle(
  status: SpeechInputStatus,
  holding: boolean,
  cancelIntent: boolean,
) {
  if (holding) {
    return cancelIntent ? "松开手指，取消转写" : "松开手指，转成文字";
  }

  switch (status) {
    case "requesting-permission":
      return "正在请求麦克风权限...";
    case "listening":
      return "继续按住说话";
    case "processing":
      return "正在转写语音...";
    case "ready":
      return "识别完成";
    case "error":
      return "语音输入暂时不可用";
    default:
      return "按住说话";
  }
}

function resolveStatusHint(
  status: SpeechInputStatus,
  holding: boolean,
  cancelIntent: boolean,
) {
  if (holding) {
    return cancelIntent
      ? "向下移回按钮区域，可以继续保留本次语音。"
      : "上滑取消，松开后只会转成文字，不会直接发送。";
  }

  switch (status) {
    case "requesting-permission":
      return "第一次使用时，浏览器可能会弹出麦克风授权。";
    case "listening":
      return "继续按住说话，松开后结束本次输入。";
    case "processing":
      return "录音已经结束，正在把语音整理成文字。";
    case "ready":
      return "确认后插入输入框，你还可以继续修改。";
    case "error":
      return "可以关闭后重试，或直接切回键盘输入。";
    default:
      return "识别结果会先停留在这里，等待你决定是否插入。";
  }
}

export function MobileSpeechInputSheet({
  open,
  status,
  text,
  error,
  holding,
  cancelIntent,
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
  const title = resolveStatusTitle(status, holding, cancelIntent);
  const hint = resolveStatusHint(status, holding, cancelIntent);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/22 backdrop-blur-[1.5px]">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="关闭语音输入面板"
        onClick={onClose}
        disabled={holding}
      />
      <div className="relative w-full max-w-sm px-5 pb-[calc(env(safe-area-inset-bottom,0px)+18px)]">
        <div className="rounded-[28px] bg-[rgba(28,28,30,0.94)] px-5 pb-5 pt-6 text-white shadow-[0_24px_60px_rgba(15,23,42,0.28)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[17px] font-medium tracking-[0.01em]">
                {title}
              </div>
              <div className="mt-1 text-[12px] leading-5 text-white/65">
                {hint}
              </div>
            </div>
            <button
              type="button"
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/8 text-white/72 transition",
                holding ? "opacity-0" : "opacity-100",
              )}
            onClick={onClose}
            aria-label="关闭"
          >
            <X size={16} />
          </button>
          </div>

          <div className="mt-5 flex items-center justify-center">
            <div
              className={cn(
                "flex h-24 w-24 items-center justify-center rounded-full border text-white transition",
                holding && cancelIntent
                  ? "border-[#ff7875]/40 bg-[#ff4d4f]"
                  : listening || holding
                    ? "border-[#07c160]/35 bg-[#07c160]"
                    : processing
                      ? "border-white/16 bg-white/14"
                      : "border-white/12 bg-white/10",
              )}
            >
              {processing ? (
                <WandSparkles size={32} />
              ) : listening || holding ? (
                cancelIntent ? (
                  <X size={34} />
                ) : (
                  <Mic size={34} />
                )
              ) : status === "ready" ? (
                <Square size={28} fill="currentColor" />
              ) : (
                <Mic size={34} />
              )}
            </div>
          </div>

          <div
            className={cn(
              "mt-5 min-h-[112px] rounded-[22px] border px-4 py-3 text-[15px] leading-7",
              text
                ? "border-white/14 bg-white/10 text-white/92"
                : "border-white/10 bg-white/[0.06] text-white/40",
            )}
          >
            {text || "识别结果会显示在这里。"}
          </div>

          {error ? (
            <div className="mt-3 rounded-[16px] border border-[#ff7875]/25 bg-[#ff4d4f]/12 px-3 py-2 text-[12px] leading-5 text-[#ffd7d5]">
              {error}
            </div>
          ) : null}

          {!holding ? (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="flex h-11 items-center justify-center rounded-[16px] border border-white/12 bg-white/8 text-[14px] font-medium text-white/78 transition active:bg-white/12"
              >
                取消
              </button>
              <button
                type="button"
                onClick={onCommit}
                disabled={!canCommit || processing}
                className="flex h-11 items-center justify-center rounded-[16px] bg-[#07c160] text-[14px] font-medium text-white transition disabled:opacity-45"
              >
                <span className="inline-flex items-center gap-1.5">
                  <WandSparkles size={15} />
                  插入输入框
                </span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
