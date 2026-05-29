import { useState, type ReactNode } from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { ArrowLeft, Copy, Share2 } from "lucide-react";
import { AppPage, Button, InlineNotice, cn } from "@yinjie/ui";

const t = translateRuntimeMessage;
import {
  shareWithNativeShell,
} from "../runtime/mobile-bridge";
import { writeClipboardText } from "../runtime/native-clipboard";
import { isNativeMobileShareSurface } from "../runtime/mobile-share-surface";
import { buildPublicShareUrl } from "../lib/share-url";
import { TabPageTopBar } from "./tab-page-top-bar";

type MobileDiscoverToolShellProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  heroBadge?: ReactNode;
  heroTitle: ReactNode;
  heroDescription?: ReactNode;
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
  heroBadge,
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
  const resolvedHeroBadge = heroBadge ?? t(msg`发现工具`);
  const [shareNotice, setShareNotice] = useState<{
    tone: "success" | "info";
    message: string;
    actionLabel?: string;
    onAction?: () => void;
  } | null>(null);

  async function handleShare() {
    if (!shareTitle || !shareSummary) {
      return;
    }

    const toolPath =
      typeof window === "undefined"
        ? ""
        : `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const toolUrl = toolPath ? buildPublicShareUrl(toolPath) : undefined;
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
      setShareNotice({
        tone: "info",
        message: nativeMobileShareSupported
          ? t(msg`当前设备暂时无法打开系统分享，请稍后重试。`)
          : t(msg`当前环境暂不支持复制工具摘要。`),
        actionLabel: nativeMobileShareSupported ? t(msg`重试分享`) : t(msg`重试复制`),
        onAction: () => {
          void handleShare();
        },
      });
      return;
    }

    try {
      if (!(await writeClipboardText(shareText))) {
        throw new Error("clipboard copy failed"); // i18n-ignore-line: 内部技术错误，非用户展示文案
      }
      setShareNotice({
        tone: "success",
        message: nativeMobileShareSupported
          ? t(msg`系统分享暂时不可用，已复制工具摘要。`)
          : t(msg`工具摘要已复制。`),
      });
    } catch {
      setShareNotice({
        tone: "info",
        message: nativeMobileShareSupported
          ? t(msg`系统分享失败，请稍后重试。`)
          : t(msg`复制工具摘要失败，请稍后重试。`),
        actionLabel: nativeMobileShareSupported ? t(msg`重试分享`) : t(msg`重试复制`),
        onAction: () => {
          void handleShare();
        },
      });
    }
  }

  return (
    <AppPage className={cn("space-y-0 px-0 pb-0 pt-0", className)}>
      <TabPageTopBar
        title={title}
        subtitle={subtitle}
        titleAlign="center"
        className="mx-0 mt-0 mb-0 border-[color:var(--border-faint)] bg-[color:var(--surface-overlay)] px-3 py-2.5 sm:mx-0 sm:px-3"
        // 大视口下正文已收成 max-w-[480px] 居中列，顶部栏控件行同样限宽居中，
        // 返回/标题/分享跟正文对齐，不被甩到屏幕两边。
        innerClassName="mx-auto w-full max-w-[480px]"
        leftActions={
          <Button
            onClick={onBack}
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full border-0 bg-transparent text-[color:var(--text-primary)] hover:bg-black/5"
            aria-label={t(msg`返回`)}
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
              aria-label={nativeMobileShareSupported ? t(msg`分享工具`) : t(msg`复制工具摘要`)}
            >
              {nativeMobileShareSupported ? <Share2 size={18} /> : <Copy size={18} />}
            </Button>
          ) : undefined
        }
      />

      {/* mobile-web 在平板/横屏/触屏笔记本等大视口下被强制走移动布局（不重定向桌面），
          内容若不限宽会整页拉满 → 赛博分身立绘舞台被拉成大letterbox、按钮/分段/对话气泡
          也全宽变形。这里把工具内容收成居中的手机宽列（≤480px 视口无影响）。 */}
      <div className="mx-auto w-full max-w-[480px] space-y-2.5 px-3 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-3">
        {shareNotice ? (
          <InlineNotice
            className="rounded-[var(--radius-sm)] px-2.5 py-1.5 text-[length:var(--text-eyebrow)] leading-[1.35rem] shadow-none"
            tone={shareNotice.tone}
          >
            {shareNotice.tone === "info" ? (
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1">{shareNotice.message}</span>
                <div className="flex items-center gap-1.5">
                  {shareNotice.actionLabel && shareNotice.onAction ? (
                    <button
                      type="button"
                      onClick={shareNotice.onAction}
                      className="shrink-0 rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--text-secondary)]"
                    >
                      {shareNotice.actionLabel}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={onBack}
                    className="shrink-0 rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--text-secondary)]"
                  >
                    {t(msg`返回上一页`)}
                  </button>
                </div>
              </div>
            ) : (
              shareNotice.message
            )}
          </InlineNotice>
        ) : null}
        <section className="relative overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--brand-primary)]/12 bg-[color:var(--state-success-bg)] px-4 py-5">
          <div className="pointer-events-none absolute right-0 top-0 h-24 w-24 rounded-full bg-[color:var(--brand-primary)]/8 blur-3xl" />
          <div className="relative flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <div className="inline-flex rounded-full bg-[color:var(--brand-primary)]/12 px-3 py-1 text-[length:var(--text-eyebrow)] font-medium text-[color:var(--brand-primary)]">
                {resolvedHeroBadge}
              </div>
              <div className="mt-3 text-[length:var(--text-section)] font-semibold leading-tight text-[color:var(--text-primary)]">
                {heroTitle}
              </div>
              {heroDescription ? (
                <div className="mt-2 text-[length:var(--text-caption)] leading-6 text-[color:var(--text-muted)]">
                  {heroDescription}
                </div>
              ) : null}
            </div>
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-[color:var(--brand-primary)]/12 text-[color:var(--brand-primary)]">
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
