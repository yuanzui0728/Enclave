import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Copy, Share2 } from "lucide-react";
import { AppPage, Button, InlineNotice } from "@yinjie/ui";
import { navigateBackOrFallback } from "../lib/history-back";
import {
  isNativeMobileBridgeAvailable,
  shareWithNativeShell,
} from "../runtime/mobile-bridge";
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
  const nativeMobileShareSupported = isNativeMobileBridgeAvailable();
  const [notice, setNotice] = useState<{
    tone: "success" | "info";
    message: string;
  } | null>(null);

  async function handleShareDocument() {
    const documentPath =
      typeof window === "undefined"
        ? ""
        : `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const documentUrl =
      typeof window === "undefined" || !documentPath
        ? title
        : `${window.location.origin}${documentPath}`;
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
          message: "已打开系统分享面板。",
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
          ? "当前设备暂时无法打开系统分享，请稍后重试。"
          : "当前环境暂不支持复制文档摘要。",
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(documentSummary);
      setNotice({
        tone: "success",
        message: nativeMobileShareSupported
          ? "系统分享暂时不可用，已复制文档摘要。"
          : "文档摘要已复制。",
      });
    } catch {
      setNotice({
        tone: "info",
        message: nativeMobileShareSupported
          ? "系统分享失败，请稍后重试。"
          : "复制文档摘要失败，请稍后重试。",
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
              navigateBackOrFallback(() => {
                void navigate({ to: "/profile/settings" });
              })
            }
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-full bg-transparent text-[color:var(--text-primary)] shadow-none hover:bg-black/4"
            aria-label="返回设置"
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
            aria-label={nativeMobileShareSupported ? "分享文档" : "复制文档摘要"}
          >
            {nativeMobileShareSupported ? <Share2 size={18} /> : <Copy size={18} />}
          </Button>
        }
      />

      <div className="space-y-2 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-3">
        {notice ? (
          <div className="px-4">
            <InlineNotice tone={notice.tone}>{notice.message}</InlineNotice>
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
