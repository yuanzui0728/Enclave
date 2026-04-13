import { useState, type ReactNode } from "react";
import { ArrowLeft, Copy, Share2 } from "lucide-react";
import { AppPage, Button, InlineNotice, cn } from "@yinjie/ui";
import {
  shareWithNativeShell,
} from "../runtime/mobile-bridge";
import { isNativeMobileShareSurface } from "../runtime/mobile-share-surface";
import { TabPageTopBar } from "./tab-page-top-bar";

type MobileDiscoverToolShellProps = {
  title: string;
  subtitle?: string;
  heroBadge?: string;
  heroTitle: string;
  heroDescription: string;
  heroVisual: ReactNode;
  heroAction?: ReactNode;
  notice?: ReactNode;
  children?: ReactNode;
  onBack: () => void;
  className?: string;
  shareTitle?: string;
  shareSummary?: string;
};

export function MobileDiscoverToolShell({
  title,
  subtitle,
  heroBadge = "发现工具",
  heroTitle,
  heroDescription,
  heroVisual,
  heroAction,
  notice,
  children,
  onBack,
  className,
  shareTitle,
  shareSummary,
}: MobileDiscoverToolShellProps) {
  const nativeMobileShareSupported = isNativeMobileShareSurface();
  const [shareNotice, setShareNotice] = useState<{
    tone: "success" | "info";
    message: string;
  } | null>(null);

  async function handleShare() {
    if (!shareTitle || !shareSummary) {
      return;
    }

    const toolPath =
      typeof window === "undefined"
        ? ""
        : `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const toolUrl =
      typeof window === "undefined" || !toolPath
        ? undefined
        : `${window.location.origin}${toolPath}`;
    const shareText = toolUrl
      ? [shareTitle, shareSummary, toolUrl].join("\n\n")
      : [shareTitle, shareSummary].join("\n\n");

    if (nativeMobileShareSupported) {
      const shared = await shareWithNativeShell({
        title: shareTitle,
        text: shareText,
        url: toolUrl,
      });

      if (shared) {
        setShareNotice({
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
      setShareNotice({
        tone: "info",
        message: nativeMobileShareSupported
          ? "当前设备暂时无法打开系统分享，请稍后重试。"
          : "当前环境暂不支持复制工具摘要。",
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(shareText);
      setShareNotice({
        tone: "success",
        message: nativeMobileShareSupported
          ? "系统分享暂时不可用，已复制工具摘要。"
          : "工具摘要已复制。",
      });
    } catch {
      setShareNotice({
        tone: "info",
        message: nativeMobileShareSupported
          ? "系统分享失败，请稍后重试。"
          : "复制工具摘要失败，请稍后重试。",
      });
    }
  }

  return (
    <AppPage className={cn("space-y-0 px-0 pb-0 pt-0", className)}>
      <TabPageTopBar
        title={title}
        subtitle={subtitle}
        titleAlign="center"
        className="mx-0 mt-0 mb-0 border-black/6 bg-[rgba(247,247,247,0.92)] px-3 py-2.5 sm:mx-0 sm:px-3"
        leftActions={
          <Button
            onClick={onBack}
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full border-0 bg-transparent text-[color:var(--text-primary)] hover:bg-black/5"
          >
            <ArrowLeft size={18} />
          </Button>
        }
        rightActions={
          shareTitle && shareSummary ? (
            <Button
              type="button"
              onClick={() => void handleShare()}
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full border-0 bg-transparent text-[color:var(--text-primary)] hover:bg-black/5"
              aria-label={nativeMobileShareSupported ? "分享工具" : "复制工具摘要"}
            >
              {nativeMobileShareSupported ? <Share2 size={18} /> : <Copy size={18} />}
            </Button>
          ) : undefined
        }
      />

      <div className="space-y-3 px-3 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-3">
        {shareNotice ? (
          <InlineNotice tone={shareNotice.tone}>{shareNotice.message}</InlineNotice>
        ) : null}
        <section className="relative overflow-hidden rounded-[20px] border border-[rgba(7,193,96,0.12)] bg-[linear-gradient(180deg,rgba(248,255,250,0.98),rgba(255,255,255,0.98))] px-4 py-5">
          <div className="pointer-events-none absolute right-0 top-0 h-24 w-24 rounded-full bg-[rgba(7,193,96,0.08)] blur-3xl" />
          <div className="relative flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <div className="inline-flex rounded-full bg-[rgba(7,193,96,0.12)] px-3 py-1 text-[11px] font-medium text-[#07c160]">
                {heroBadge}
              </div>
              <div className="mt-3 text-[22px] font-semibold leading-tight text-[#111827]">
                {heroTitle}
              </div>
              <div className="mt-2 text-[13px] leading-6 text-[#6b7280]">
                {heroDescription}
              </div>
            </div>
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[20px] bg-[rgba(7,193,96,0.12)] text-[#07c160]">
              {heroVisual}
            </div>
          </div>

          {heroAction ? <div className="relative mt-4">{heroAction}</div> : null}
        </section>

        {notice}
        {children}
      </div>
    </AppPage>
  );
}
