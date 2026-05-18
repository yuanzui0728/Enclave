import { useCallback, useEffect, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import { Copy, Sparkles, X } from "lucide-react";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { Button, InlineNotice } from "@yinjie/ui";

import { writeClipboardText } from "../runtime/native-clipboard";
import { registerAndroidBackInterceptor } from "../runtime/android-back-button";

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  return writeClipboardText(text);
}

type FeatureComingSoonDialogProps = {
  open: boolean;
  title: string;
  description: string;
  wechatId: string;
  onClose: () => void;
};

export function FeatureComingSoonDialog({
  open,
  title,
  description,
  wechatId,
  onClose,
}: FeatureComingSoonDialogProps) {
  const t = useRuntimeTranslator();
  const wechatRef = useRef<HTMLSpanElement | null>(null);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "danger";
    message: string;
  } | null>(null);

  // 复位 feedback：覆盖两种边界
  //   - open=true → false：正常关闭，清掉提示，避免下次开还残留
  //   - open=false → true：上一次 handleCopy 的 await 在弹窗关掉之后才
  //     resolve 把 feedback 重新设回 success；如果不在 open 时再清一次，
  //     再次打开会看到一条幽灵的"已复制"。
  useEffect(() => {
    setFeedback(null);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // 原生壳硬件 Back：弹窗打开时拦掉，关弹窗不退页。和 desktop Escape 对齐。
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

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 2200);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const handleCopy = useCallback(async () => {
    const ok = await copyTextToClipboard(wechatId);
    setFeedback({
      tone: ok ? "success" : "danger",
      message: ok
        ? t(msg`已复制微信号，去微信粘贴添加好友吧～`)
        : t(msg`复制失败，请长按微信号手动复制。`),
    });
  }, [t, wechatId]);

  // 让用户长按选中微信号也很方便：弹窗一打开就把整段号码选中，这样
  // 移动端长按 / 桌面端 Ctrl+C 都能直接复制，不依赖 clipboard API。
  const selectWechatId = useCallback(() => {
    const node = wechatRef.current;
    if (!node || typeof window === "undefined") return;
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(node);
    selection.removeAllRanges();
    selection.addRange(range);
  }, []);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-[rgba(17,24,39,0.45)] p-4 backdrop-blur-[3px] sm:items-center">
      <button
        type="button"
        aria-label={t(msg`关闭弹窗`)}
        onClick={onClose}
        className="absolute inset-0"
      />

      <div className="relative w-full max-w-[380px] overflow-hidden rounded-[24px] border border-[color:var(--border-faint)] bg-white shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
        <button
          type="button"
          aria-label={t(msg`关闭`)}
          onClick={onClose}
          className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--text-muted)] transition-colors hover:bg-black/[0.04]"
        >
          <X size={16} />
        </button>

        <div className="px-6 pt-7 pb-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgba(139,92,246,0.12)] text-[#7c3aed]">
            <Sparkles size={22} />
          </div>
          <h2 className="mt-3 text-[16px] font-semibold text-[color:var(--text-primary)]">
            {title}
          </h2>
          <p className="mt-2 text-[13px] leading-6 text-[color:var(--text-secondary)]">
            {description}
          </p>
        </div>

        <div className="px-6 pt-3">
          <div className="rounded-[14px] border border-[color:var(--border-faint)] bg-[#f6f7f7] px-3 py-2.5">
            <div className="text-[11px] text-[color:var(--text-muted)]">
              {t(msg`微信号（点一下选中，也可直接复制）`)}
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span
                ref={wechatRef}
                role="button"
                tabIndex={0}
                onClick={selectWechatId}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    selectWechatId();
                  }
                }}
                className="min-w-0 flex-1 cursor-text select-all truncate font-mono text-[15px] font-semibold tracking-wide text-[color:var(--text-primary)]"
              >
                {wechatId}
              </span>
              <Button
                type="button"
                variant="primary"
                className="shrink-0 rounded-[10px] bg-[#07c160] px-3 py-1.5 text-[12px] text-white shadow-none hover:bg-[#06ad56]"
                onClick={() => void handleCopy()}
              >
                <Copy size={12} className="mr-1" />
                {t(msg`一键复制`)}
              </Button>
            </div>
          </div>
          <p className="mt-2 text-[11px] leading-5 text-[color:var(--text-muted)]">
            {t(
              msg`加好友时备注「拉群」，运营会拉你进体验群，第一时间通知功能上线～`,
            )}
          </p>
        </div>

        {feedback ? (
          <div className="px-6 pt-2">
            <InlineNotice tone={feedback.tone}>{feedback.message}</InlineNotice>
          </div>
        ) : null}

        <div className="mt-4 border-t border-[color:var(--border-faint)] px-4 py-3">
          <Button
            type="button"
            variant="primary"
            onClick={onClose}
            className="w-full rounded-[12px] bg-[color:var(--brand-primary)] py-2 text-white shadow-none hover:opacity-95"
          >
            {t(msg`我知道了`)}
          </Button>
        </div>
      </div>
    </div>
  );
}
