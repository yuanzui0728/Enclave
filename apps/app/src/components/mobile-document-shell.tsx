import { useEffect, useState } from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Copy, Share2 } from "lucide-react";
import { AppPage, Button, InlineNotice } from "@yinjie/ui";

const t = translateRuntimeMessage;
import { navigateBackOrFallback } from "../lib/history-back";
import { buildPublicShareUrl } from "../lib/share-url";
import {
  shareWithNativeShell,
} from "../runtime/mobile-bridge";
import { writeClipboardText } from "../runtime/native-clipboard";
import { isNativeMobileShareSurface } from "../runtime/mobile-share-surface";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { TabPageTopBar } from "./tab-page-top-bar";

type MobileDocumentShellProps = {
  title: string;
  eyebrow: string;
  summary: string;
  sections: Array<{
    title: string;
    paragraphs: string[];
  }>;
};

export function MobileDocumentShell({
  title,
  eyebrow,
  summary,
  sections,
}: MobileDocumentShellProps) {
  const navigate = useNavigate();
  const isDesktopLayout = useDesktopLayout();
  const nativeMobileShareSupported = isNativeMobileShareSurface();
  const [notice, setNotice] = useState<{
    tone: "success" | "info";
    message: string;
    actionLabel?: string;
    onAction?: () => void;
  } | null>(null);

  // 走查 R2：success notice 之前没有自动消失，「已打开系统分享面板。」/
  // 「文档摘要已复制。」一旦出现就钉在页面上直到下次 setNotice 才换。其它
  // profile/me 子页（profile-info-page 的复制 toast / mobile-favorites-page
  // 的 setNotice）都做 1.6~2.4s 自动消失，这里跟齐。
  // info（失败 + 重试按钮）一支挂着不动是有意的，用户需要点击 actionLabel 重试 /
  // 「返回上一页」自行收掉；不参与自动消失。
  useEffect(() => {
    if (!notice || notice.tone !== "success") return;
    const timer = window.setTimeout(() => setNotice(null), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function handleShareDocument() {
    const documentPath =
      typeof window === "undefined"
        ? ""
        : `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const documentUrl = documentPath ? buildPublicShareUrl(documentPath) : title;
    const documentSummary = [title, summary, documentUrl].join("\n\n");

    if (nativeMobileShareSupported) {
      const shared = await shareWithNativeShell({
        title,
        text: documentSummary,
        url: typeof window === "undefined" || !documentPath ? undefined : documentUrl,
      });

      if (shared) {
        setNotice({
          tone: "success",
          message: t(msg`已打开系统分享面板。`),
        });
        return;
      }
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.clipboard ||
      typeof navigator.clipboard.writeText !== "function"
    ) {
      setNotice({
        tone: "info",
        message: nativeMobileShareSupported
          ? t(msg`当前设备暂时无法打开系统分享，请稍后重试。`)
          : t(msg`当前环境暂不支持复制文档摘要。`),
        actionLabel: nativeMobileShareSupported ? t(msg`重试分享`) : t(msg`重试复制`),
        onAction: () => {
          void handleShareDocument();
        },
      });
      return;
    }

    try {
      if (!(await writeClipboardText(documentSummary))) {
        throw new Error("clipboard copy failed");
      }
      setNotice({
        tone: "success",
        message: nativeMobileShareSupported
          ? t(msg`系统分享暂时不可用，已复制文档摘要。`)
          : t(msg`文档摘要已复制。`),
      });
    } catch {
      setNotice({
        tone: "info",
        message: nativeMobileShareSupported
          ? t(msg`系统分享失败，请稍后重试。`)
          : t(msg`复制文档摘要失败，请稍后重试。`),
        actionLabel: nativeMobileShareSupported ? t(msg`重试分享`) : t(msg`重试复制`),
        onAction: () => {
          void handleShareDocument();
        },
      });
    }
  }

  return (
    <AppPage className="space-y-0 bg-[#f5f5f5] px-0 py-0">
      <TabPageTopBar
        title={title}
        titleAlign="center"
        leftActions={
          <Button
            onClick={() =>
              navigateBackOrFallback(
                () => {
                  void navigate({
                    to: isDesktopLayout ? "/desktop/settings" : "/tabs/profile",
                  });
                },
                isDesktopLayout ? "/desktop/settings" : "/tabs/profile",
              )
            }
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-full bg-transparent text-[color:var(--text-primary)] shadow-none hover:bg-black/4"
            aria-label={isDesktopLayout ? t(msg`返回设置`) : t(msg`返回`)}
          >
            <ArrowLeft size={18} />
          </Button>
        }
        rightActions={
          <Button
            type="button"
            onClick={() => void handleShareDocument()}
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-full bg-transparent text-[color:var(--text-primary)] shadow-none hover:bg-black/4"
            aria-label={nativeMobileShareSupported ? t(msg`分享文档`) : t(msg`复制文档摘要`)}
          >
            {nativeMobileShareSupported ? <Share2 size={18} /> : <Copy size={18} />}
          </Button>
        }
      />

      <div className="space-y-2 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-3">
        {notice ? (
          <div className="px-4">
            <InlineNotice tone={notice.tone}>
              {notice.tone === "info" ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 flex-1">{notice.message}</span>
                  <div className="flex items-center gap-1.5">
                    {notice.actionLabel && notice.onAction ? (
                      <button
                        type="button"
                        onClick={notice.onAction}
                        className="shrink-0 rounded-full border border-[rgba(15,23,42,0.08)] bg-white px-2 py-0.5 text-[10px] font-medium text-[color:var(--text-secondary)]"
                      >
                        {notice.actionLabel}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() =>
                        navigateBackOrFallback(
                          () => {
                            void navigate({
                              to: isDesktopLayout
                                ? "/desktop/settings"
                                : "/tabs/profile",
                            });
                          },
                          isDesktopLayout
                            ? "/desktop/settings"
                            : "/tabs/profile",
                        )
                      }
                      className="shrink-0 rounded-full border border-[rgba(15,23,42,0.08)] bg-white px-2 py-0.5 text-[10px] font-medium text-[color:var(--text-secondary)]"
                    >
                      {t(msg`返回上一页`)}
                    </button>
                  </div>
                </div>
              ) : (
                notice.message
              )}
            </InlineNotice>
          </div>
        ) : null}
        <section className="border-y border-[color:var(--border-faint)] bg-white px-4 py-4">
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#15803d]">
            {eyebrow}
          </div>
          <div className="mt-2 text-[16px] font-medium text-[color:var(--text-primary)]">
            {title}
          </div>
          <p className="mt-2 text-[13px] leading-6 text-[color:var(--text-secondary)]">
            {summary}
          </p>
        </section>

        {sections.map((section) => (
          <section
            key={section.title}
            className="border-y border-[color:var(--border-faint)] bg-white px-4 py-4"
          >
            <div className="text-[15px] font-medium text-[color:var(--text-primary)]">
              {section.title}
            </div>
            <div className="mt-3 space-y-3">
              {section.paragraphs.map((paragraph) => (
                <p
                  key={paragraph}
                  className="text-[14px] leading-7 text-[color:var(--text-secondary)]"
                >
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </AppPage>
  );
}
