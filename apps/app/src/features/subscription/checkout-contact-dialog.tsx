import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { Button, InlineNotice } from "@yinjie/ui";
import { registerAndroidBackInterceptor } from "../../runtime/android-back-button";

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to legacy path
    }
  }
  if (typeof document === "undefined") return false;
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

const EMAIL_REGEX = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const WECHAT_REGEX = /(?:微信号|微信|wechat|WeChat|WECHAT)\s*[:：]?\s*([A-Za-z][A-Za-z0-9_-]{4,29})/g; // i18n-ignore-line

type ContactItem = {
  label: string;
  value: string;
  successMessage: string;
};

function extractContacts(
  text: string,
  t: ReturnType<typeof useRuntimeTranslator>,
): ContactItem[] {
  const items: ContactItem[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(WECHAT_REGEX)) {
    const value = match[1];
    if (!value || seen.has(`wechat:${value}`)) continue;
    seen.add(`wechat:${value}`);
    items.push({
      label: t(msg`微信号`),
      value,
      successMessage: t(msg`已复制微信号`),
    });
  }

  for (const match of text.matchAll(EMAIL_REGEX)) {
    const value = match[0];
    if (!value || seen.has(`email:${value}`)) continue;
    seen.add(`email:${value}`);
    items.push({
      label: t(msg`邮箱`),
      value,
      successMessage: t(msg`已复制邮箱`),
    });
  }

  return items;
}

type CheckoutContactDialogProps = {
  open: boolean;
  hint: string;
  contact: string;
  planName?: string;
  onClose: () => void;
};

export function CheckoutContactDialog({
  open,
  hint,
  contact,
  planName,
  onClose,
}: CheckoutContactDialogProps) {
  const t = useRuntimeTranslator();
  const titleId = useId();
  const descId = useId();
  const [feedback, setFeedback] = useState<{
    tone: "success" | "danger";
    message: string;
  } | null>(null);

  const combinedText = useMemo(
    () => [hint, contact].filter(Boolean).join(" ").trim(),
    [hint, contact],
  );

  const contacts = useMemo(
    () => extractContacts(`${hint} ${contact}`, t),
    [hint, contact, t],
  );

  // 新走查 R5：onClose 是父组件传 inline arrow（profile-subscription-page line
  // 748-750），父级任何 re-render（profileQuery refetch / token refresh / checkout
  // 后再 invalidate）都换 onClose 身份，下面 Esc effect 把 keydown listener 拆装
  // 一遍。镜像 ref 把 deps 收紧到 [open]，dialog 开着期间只挂一次。
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) {
      setFeedback(null);
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // 新走查 R5：原本 Esc 不看 isComposing，CJK 用户在背后的 input（hint 中如果
      // 含「微信号 / 邮箱」要用户复制时其实不会有 input，但 dialog 关闭后用户
      // 可能立即去打字）按 Esc 想关 IME 候选词，window 全局 keydown 一接就把
      // dialog 关掉、候选词没退掉。和 desktop-chat-confirm-dialog.tsx L79-81 同款
      // 修法。
      if (event.isComposing) return;
      event.preventDefault();
      onCloseRef.current();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  // 新走查 R5：Android 硬件 Back 没接拦截器——dialog 打开期间用户按 Back 直接
  // history.back 离开 /profile/subscription 退回 /tabs/profile，dialog 跟着 unmount，
  // 用户期望「Back 收 dialog 留在订阅页」反而退一格。和 WeChatActionBubble /
  // MobileDetailsActionSheet / WeChatCommentBar / AvatarConfirmDialog 同款补全。
  useEffect(() => {
    if (!open) return;
    return registerAndroidBackInterceptor((event) => {
      event.preventDefault();
      onCloseRef.current();
      return true;
    });
  }, [open]);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 2400);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const handleCopy = useCallback(
    async (text: string, successMessage: string) => {
      const ok = await copyTextToClipboard(text);
      setFeedback({
        tone: ok ? "success" : "danger",
        message: ok ? successMessage : t(msg`复制失败，请手动选中复制。`),
      });
    },
    [t],
  );

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-[rgba(17,24,39,0.45)] p-4 backdrop-blur-[3px] sm:items-center">
      <button
        type="button"
        aria-label={t(msg`关闭弹窗`)}
        onClick={onClose}
        // 新走查 R5：backdrop 是不可见 affordance，键盘 Tab 时会落到这张 button
        // 上拿到 invisible focus，按 Enter 关掉 dialog；Esc 路径已经支持关闭，
        // 不需要 Tab 可达此 backdrop。和 desktop-chat-confirm-dialog R107 同款。
        tabIndex={-1}
        className="absolute inset-0"
      />

      {/* 新走查 R5：补 a11y——dialog 之前裸 div，SR 用户在 plan checkout 成功后
          只能听到 button label「复制 / 复制全部 / 我知道了」，听不到 title /
          hint / 联系方式。和 desktop-chat-confirm-dialog / mobile-details-action-sheet
          同款 role="dialog" + aria-modal + aria-labelledby + aria-describedby。 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={hint ? descId : undefined}
        className="relative w-full max-w-[400px] overflow-hidden rounded-[24px] border border-[color:var(--border-faint)] bg-white shadow-[0_24px_80px_rgba(0,0,0,0.18)]"
      >
        <div className="px-6 pt-6 pb-2">
          <div className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
            {t(msg`联系开通`)}
          </div>
          <h2
            id={titleId}
            className="mt-2 text-[18px] font-semibold text-[color:var(--text-primary)]"
          >
            {planName
              ? t(msg`开通 ${planName}`)
              : t(msg`联系运营开通会员`)}
          </h2>
          {hint ? (
            <p
              id={descId}
              className="mt-3 text-[13px] leading-6 text-[color:var(--text-secondary)]"
            >
              {hint}
            </p>
          ) : null}
        </div>

        {contacts.length ? (
          <div className="px-6 pt-3 pb-2 space-y-2">
            {contacts.map((item) => (
              <div
                key={`${item.label}:${item.value}`}
                className="flex items-center justify-between gap-3 rounded-[14px] bg-[#f6f7f7] px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] text-[color:var(--text-muted)]">
                    {item.label}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[13px] font-medium text-[color:var(--text-primary)]">
                    {item.value}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="shrink-0 rounded-[10px] border-[color:var(--border-faint)] bg-white px-3 py-1.5 text-[12px] shadow-none"
                  onClick={() => void handleCopy(item.value, item.successMessage)}
                >
                  {t(msg`复制`)}
                </Button>
              </div>
            ))}
          </div>
        ) : contact ? (
          <div className="px-6 pt-3 pb-2">
            <div className="rounded-[14px] bg-[#f6f7f7] px-3 py-2 text-[13px] leading-6 break-all text-[color:var(--text-secondary)]">
              {contact}
            </div>
          </div>
        ) : null}

        {feedback ? (
          <div className="px-6 pt-2">
            <InlineNotice tone={feedback.tone}>{feedback.message}</InlineNotice>
          </div>
        ) : null}

        <div className="mt-4 flex gap-3 border-t border-[color:var(--border-faint)] px-4 py-3">
          {combinedText ? (
            <Button
              type="button"
              variant="secondary"
              className="flex-1 rounded-[12px] border-[color:var(--border-faint)] bg-[#f5f5f5] py-2 shadow-none"
              onClick={() =>
                void handleCopy(combinedText, t(msg`已复制全部信息。`))
              }
            >
              {t(msg`复制全部`)}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="primary"
            className="flex-1 rounded-[12px] bg-[#07c160] py-2 text-white shadow-none hover:bg-[#06ad56]"
            onClick={onClose}
          >
            {t(msg`我知道了`)}
          </Button>
        </div>
      </div>
    </div>
  );
}
